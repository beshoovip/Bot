// طبقة الوصول للبيانات. كل دالة = جملة SQL واحدة (ذرّية) أو استدعاء دالة اقتصاد ذرّية في قاعدة البيانات.
// لا يوجد هنا أي منطق لعبة؛ القواعد المالية الحرجة تعيش في database/migrations/002_economy_functions.sql.

const REP_FIELDS = Object.freeze({ trade: 'rep_trade', black: 'rep_black' });

export function createRepo(db) {
  const q = (text, params) => db.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] ?? null;
  const fn = async (text, params) => (await q(text, params)).rows[0].r;

  return {
    // ===== الحسابات والجلسات =====
    async createUser(username, passwordHash) {
      return one('INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING RETURNING id', [username, passwordHash]);
    },
    getUserByUsername: (username) => one('SELECT id, username, password_hash AS "passwordHash" FROM users WHERE username = $1', [username]),
    async touchLogin(userId) {
      await q('UPDATE users SET last_login_at = now() WHERE id = $1 RETURNING id', [userId]);
    },
    async createSession(userId, tokenHash, ttlDays) {
      await q("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval) RETURNING id", [userId, tokenHash, String(ttlDays)]);
      // تنظيف انتهازي للجلسات المنتهية لهذا المستخدم
      await q('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now() RETURNING id', [userId]);
    },
    getSession: (tokenHash) =>
      one('SELECT s.user_id AS "userId", u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [tokenHash]),
    async deleteSession(tokenHash) {
      await q('DELETE FROM sessions WHERE token_hash = $1 RETURNING id', [tokenHash]);
    },

    // ===== الشخصيات =====
    async listCharacters(userId) {
      return (
        await q(
          `SELECT c.id, c.name, c.profession, s.level, c.gold FROM characters c
             JOIN character_stats s ON s.character_id = c.id WHERE c.user_id = $1 ORDER BY c.id`,
          [userId],
        )
      ).rows;
    },
    createCharacter: ({ userId, name, profession, x, y, gold, hp, skills, items, maxChars }) =>
      fn('SELECT create_character($1, $2, $3::profession, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10) AS r', [userId, name, profession, x, y, gold, hp, JSON.stringify(skills), JSON.stringify(items), maxChars]),
    loadCharacter: (id) =>
      one(
        `SELECT c.id, c.user_id AS "userId", c.name, c.profession, c.gold, c.rep_trade AS "repTrade", c.rep_black AS "repBlack",
                c.pos_x AS x, c.pos_y AS y, s.level, s.xp, s.hp, s.max_hp AS "maxHp", s.skill_points AS "skillPoints", s.skills,
                COALESCE((SELECT json_agg(json_build_object('itemId', ci.item_id, 'qty', ci.qty, 'equipped', ci.equipped) ORDER BY ci.item_id)
                          FROM character_items ci WHERE ci.character_id = c.id), '[]'::json) AS items,
                COALESCE((SELECT json_agg(json_build_object('code', cq.quest_code, 'progress', cq.progress, 'status', cq.status))
                          FROM character_quests cq WHERE cq.character_id = c.id), '[]'::json) AS quests
           FROM characters c JOIN character_stats s ON s.character_id = c.id WHERE c.id = $1`,
        [id],
      ),
    async saveCharacter(p) {
      return fn('SELECT save_character($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) AS r', [p.id, p.x, p.y, p.level, p.xp, Math.max(0, Math.round(p.hp)), p.maxHp, p.skillPoints, JSON.stringify(p.skills)]);
    },
    async addRep(charId, field, delta) {
      const col = REP_FIELDS[field];
      if (!col) throw new Error(`bad rep field ${field}`);
      return one(`UPDATE characters SET ${col} = GREATEST(0, ${col} + $2) WHERE id = $1 RETURNING rep_trade AS "repTrade", rep_black AS "repBlack"`, [charId, delta]);
    },
    async getGold(charId) {
      return (await one('SELECT gold FROM characters WHERE id = $1', [charId]))?.gold ?? null;
    },

    // ===== الاقتصاد (دوال ذرّية في قاعدة البيانات) =====
    buy: (charId, itemId, qty, unit, ref) => fn('SELECT econ_buy($1, $2, $3, $4, $5) AS r', [charId, itemId, qty, unit, ref]),
    sell: (charId, itemId, qty, unit, ref) => fn('SELECT econ_sell($1, $2, $3, $4, $5) AS r', [charId, itemId, qty, unit, ref]),
    grant: (charId, gold, items, kind, ref) => fn('SELECT econ_grant($1, $2, $3::jsonb, $4, $5) AS r', [charId, gold, JSON.stringify(items ?? {}), kind, ref]),
    takeItems: (charId, items, kind, ref) => fn('SELECT econ_take_items($1, $2::jsonb, $3, $4) AS r', [charId, JSON.stringify(items), kind, ref]),
    penalty: (charId, pct, cap, kind, ref) => fn('SELECT econ_penalty($1, $2, $3, $4, $5) AS r', [charId, pct, cap, kind, ref]),
    charge: (charId, amount, kind, ref) => fn('SELECT econ_charge($1, $2, $3, $4) AS r', [charId, amount, kind, ref]),
    equip: (charId, itemId, equip) => fn('SELECT item_equip($1, $2, $3) AS r', [charId, itemId, equip]),
    consume: (charId, itemId) => fn('SELECT item_consume($1, $2) AS r', [charId, itemId]),

    // ===== القوافل =====
    launchCaravan: (p) =>
      fn('SELECT caravan_launch($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) AS r', [p.ownerId, p.origin, p.dest, p.fee, JSON.stringify(p.cargo), p.capacity, p.maxHp, p.initialValue, p.ref]),
    settleCaravan: (id, gold, rep, ref) => fn('SELECT caravan_settle($1, $2, $3, $4) AS r', [id, gold, rep, ref]),
    plunderCaravan: (id, thiefId, items, rep, ref) => fn('SELECT caravan_plunder($1, $2, $3::jsonb, $4, $5) AS r', [id, thiefId, JSON.stringify(items), rep, ref]),
    failCaravan: (id, reason, beneficiary, items, ref) => fn('SELECT caravan_fail($1, $2, $3, $4::jsonb, $5) AS r', [id, reason, beneficiary, JSON.stringify(items ?? {}), ref]),
    async saveCaravanState(c) {
      return one(
        `UPDATE caravans SET status = $2::caravan_status, hp = $3, progress = $4, pos_x = $5, pos_y = $6, updated_at = now()
          WHERE id = $1 AND status IN ('preparing', 'traveling', 'under_attack') RETURNING id`,
        [c.id, c.status, Math.max(0, Math.round(c.hp)), c.progress, c.x, c.y],
      );
    },
    async loadActiveCaravans() {
      return (
        await q(
          `SELECT c.id, c.owner_id AS "ownerId", c.origin_city AS "origin", c.dest_city AS "dest", c.status, c.hp, c.max_hp AS "maxHp",
                  c.capacity, c.progress, c.pos_x AS x, c.pos_y AS y, c.initial_value AS "initialValue",
                  ch.name AS "ownerName",
                  COALESCE((SELECT json_object_agg(cc.item_id, cc.qty) FROM caravan_cargo cc WHERE cc.caravan_id = c.id AND cc.qty > 0), '{}'::json) AS cargo,
                  COALESCE((SELECT sum(cc.initial_qty) FROM caravan_cargo cc WHERE cc.caravan_id = c.id), 0) AS "initialUnits"
             FROM caravans c JOIN characters ch ON ch.id = c.owner_id
            WHERE c.status IN ('preparing', 'traveling', 'under_attack') ORDER BY c.id`,
        )
      ).rows;
    },
    async caravanLedger(charId, limit = 20) {
      return (
        await q(
          `SELECT kind, gold_delta AS "goldDelta", caravan_id AS "caravanId", detail FROM transactions
            WHERE character_id = $1 AND kind LIKE 'caravan%' OR (character_id = $1 AND kind = 'plunder')
            ORDER BY id DESC LIMIT $2`,
          [charId, limit],
        )
      ).rows;
    },

    // ===== المهام =====
    async upsertQuestProgress(charId, code, delta, target) {
      return one(
        `INSERT INTO character_quests (character_id, quest_code, progress, status)
              VALUES ($1, $2, LEAST($4, $3), CASE WHEN $3 >= $4 THEN 'completed' ELSE 'active' END)
         ON CONFLICT (character_id, quest_code) DO UPDATE
              SET progress = LEAST($4, character_quests.progress + $3),
                  status = CASE WHEN character_quests.progress + $3 >= $4 THEN 'completed' ELSE character_quests.status END,
                  updated_at = now()
            WHERE character_quests.status = 'active'
        RETURNING progress, status`,
        [charId, code, delta, target],
      );
    },
    async claimQuest(charId, code) {
      return one("UPDATE character_quests SET status = 'claimed', updated_at = now() WHERE character_id = $1 AND quest_code = $2 AND status = 'completed' RETURNING quest_code", [charId, code]);
    },

    // ===== الدردشة =====
    async saveChat(charId, name, body) {
      await q("INSERT INTO chat_messages (character_id, author_name, body) VALUES ($1, $2, $3) RETURNING id", [charId, name, body]);
    },
    async recentChat(limit = 30) {
      return (await q('SELECT author_name AS name, body AS text FROM (SELECT * FROM chat_messages ORDER BY id DESC LIMIT $1) t ORDER BY id', [limit])).rows;
    },
  };
}
