// المحرك المركزي. مستقل عن Socket.IO: يتعامل مع "اتصال" مجرد { id, userId, emit(event, payload), close(), limiter, player }.
// الخادم هو الحَكَم الوحيد: الموضع، الضرر، الذهب، الغنائم، المكافآت. العميل يرسل نوايا فقط (اتجاه، هدف، شراء...).

import { randomBytes } from 'node:crypto';
import { ERR, TICK_RATE, SNAPSHOT_EVERY_TICKS, INTEREST_RADIUS } from '../../../shared/constants.js';
import { BALANCE } from '../../../shared/data/balance.js';
import { PROFESSIONS } from '../../../shared/data/professions.js';
import { SKILLS } from '../../../shared/data/skills.js';
import { MONSTERS } from '../../../shared/data/monsters.js';
import { QUESTS } from '../../../shared/data/quests.js';
import { C2S, S2C, SCHEMAS } from '../../../shared/protocol.js';
import { validatePayload, sanitizeChat } from '../../../shared/validate.js';
import { getDefaultWorld, isSafeAt, nearestSpawn, zoneAt, npcById } from '../../../shared/maps/world.js';
import { stepMovement, isPositionValid } from '../../../shared/movement.js';
import { applyXp } from '../../../shared/progression.js';
import { mulberry32 } from '../../../shared/rng.js';
import { Player } from './players/Player.js';
import { MonsterManager } from './monsters/MonsterManager.js';
import { CaravanManager } from './caravans/CaravanManager.js';
import { computeDamage, inRange, dist } from './combat/combat.js';
import { canAttackPlayer, canAttackCaravan, pvpKillReward, isHostile, isWanted } from './professions/relations.js';
import * as trade from './economy/trade.js';

const fail = (error) => ({ ok: false, error });

export class GameServer {
  /**
   * @param {{repo:object, log:object, rng?:()=>number, world?:object}} deps
   */
  constructor({ repo, log, rng = mulberry32(Date.now() & 0xffffffff), world = getDefaultWorld() }) {
    this.repo = repo;
    this.log = log;
    this.rng = rng;
    this.world = world;
    this.t = 0; // زمن اللعبة بالثواني (يتقدم عبر tick)
    this.tickCount = 0;
    this.bootId = randomBytes(4).toString('hex');
    this.seq = 0;
    this.players = new Map();
    this.drops = new Map();
    this.traps = [];
    this.nextDropId = 1;
    this.nextTrapId = 1;
    this.chatLog = [];
    this.monsters = new MonsterManager(this);
    this.caravans = new CaravanManager(this);
    this.timer = null;
    this.stopped = false;
    this.pending = new Set();
    this.handlers = {
      [C2S.INPUT]: (p, v) => this.#input(p, v),
      [C2S.ATTACK]: (p, v) => this.#basicAttack(p, v),
      [C2S.SKILL]: (p, v) => this.#skill(p, v),
      [C2S.SKILL_UPGRADE]: (p, v) => this.#skillUpgrade(p, v),
      [C2S.INTERACT]: (p, v) => this.#interact(p, v),
      [C2S.BUY]: (p, v) => trade.buy(this, p, v),
      [C2S.SELL]: (p, v) => trade.sell(this, p, v),
      [C2S.HEAL]: (p, v) => trade.heal(this, p, v),
      [C2S.LAUNCH]: (p, v) => this.#launch(p, v),
      [C2S.ESCORT]: (p, v) => this.#escort(p, v),
      [C2S.PICKUP]: (p, v) => this.#pickup(p, v),
      [C2S.CHAT]: (p, v) => this.#chat(p, v),
      [C2S.EQUIP]: (p, v) => trade.equip(this, p, v),
      [C2S.USE]: (p, v) => trade.useItem(this, p, v),
      [C2S.QUEST_CLAIM]: (p, v) => trade.claimQuest(this, p, v),
      [C2S.PING]: (p, v) => {
        p.conn.emit(S2C.PONG, { t: v.t, server: Date.now() });
        return { ok: true };
      },
    };
  }

  // ===== دورة الحياة =====
  async init() {
    this.monsters.init();
    const n = await this.caravans.init();
    this.chatLog = await this.repo.recentChat(30).catch(() => []);
    this.log.info('game initialised', { monsters: this.monsters.monsters.size, caravans: n, boot: this.bootId });
  }

  start() {
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      try {
        this.tick(dt);
      } catch (e) {
        this.log.error('tick failed', e);
      }
    }, 1000 / TICK_RATE);
    this.timer.unref?.();
  }

  /** إيقاف آمن: يحفظ كل اللاعبين والقوافل وينتظر العمليات المعلّقة. */
  async shutdown() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.allSettled([...this.pending]);
    await Promise.allSettled([...this.players.values()].map((p) => this.savePlayer(p)));
    await this.caravans.saveAll();
    for (const p of this.players.values()) p.conn?.close?.();
    this.players.clear();
  }

  #bg(promise, what) {
    const p = Promise.resolve(promise).catch((e) => this.log.error(`background task failed: ${what}`, e));
    this.pending.add(p);
    p.finally(() => this.pending.delete(p));
    return p;
  }

  /** حفظ اللاعب بالتسلسل: عمليات الحفظ المتزامنة لنفس الشخصية لا تتجاوز بعضها، وتُقرأ الحالة لحظة التنفيذ. */
  savePlayer(p) {
    const run = () => this.repo.saveCharacter(p.persistRecord());
    p.saveChain = (p.saveChain ?? Promise.resolve()).then(run, run);
    return p.saveChain;
  }

  /** يتتبّع وعدًا خلفيًا كي ينتظره الإغلاق الآمن (تسوية قافلة، مكافآت...). */
  track(promise, what) {
    return this.#bg(promise, what);
  }

  /** ينتظر انتهاء المهام الخلفية الحالية (للاختبارات وللإيقاف). */
  async idle() {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  // ===== الاتصال =====
  async handle(conn, event, payload, ack) {
    const reply = (res) => {
      if (!res.ok) conn.emit(S2C.ERROR, { ev: event, code: res.error });
      if (typeof ack === 'function') ack(res);
      return res;
    };
    if (this.stopped) return reply(fail(ERR.BUSY));
    try {
      const schema = Object.prototype.hasOwnProperty.call(SCHEMAS, event) ? SCHEMAS[event] : null;
      if (!schema) return reply(fail(ERR.INVALID));
      if (!conn.limiter.allow(event)) {
        if (conn.limiter.violations > 300) conn.close?.();
        return reply(fail(ERR.RATE_LIMIT));
      }
      const v = validatePayload(schema, payload);
      if (!v.ok) return reply(fail(ERR.INVALID));
      if (event === C2S.JOIN) return reply(await this.#join(conn, v.value));
      const player = conn.player;
      if (!player || this.players.get(player.id) !== player) return reply(fail(ERR.NOT_IN_WORLD));
      return reply(await this.handlers[event](player, v.value));
    } catch (e) {
      this.log.error('handler failed', { event, err: e.message, stack: e.stack });
      return reply(fail(ERR.INVALID));
    }
  }

  async #join(conn, { characterId }) {
    if (!conn.userId) return fail(ERR.UNAUTHORIZED);
    if (conn.player) return fail(ERR.DUPLICATE);
    const rec = await this.repo.loadCharacter(characterId);
    if (!rec || rec.userId !== conn.userId) return fail(ERR.UNAUTHORIZED);
    let player = this.players.get(rec.id);
    if (player) {
      // إعادة اتصال أو دخول من جهاز آخر: نفصل الاتصال القديم ونعيد ربط نفس الكيان
      const old = player.conn;
      if (old && old !== conn) {
        old.emit(S2C.ERROR, { ev: C2S.JOIN, code: ERR.DUPLICATE });
        old.player = null;
        old.close?.();
      }
      player.conn = conn;
      player.connected = true;
      player.disconnectedAt = 0;
    } else {
      player = new Player(rec, conn, this.t);
      if (!isPositionValid(this.world, player.x, player.y)) {
        const s = nearestSpawn(this.world, player.x, player.y);
        player.x = s.x;
        player.y = s.y;
      }
      this.players.set(player.id, player);
    }
    conn.player = player;
    conn.emit(S2C.JOINED, {
      self: player.selfState(this.t),
      inventory: player.inventoryState(),
      chat: this.chatLog.slice(-20),
      tickRate: TICK_RATE,
      zone: zoneAt(this.world, player.x).id,
      serverTime: Date.now(),
    });
    this.#sendSnapshot(player);
    return { ok: true, characterId: player.id };
  }

  /** يُستدعى عند انقطاع الاتصال. اللاعب يبقى في العالم لفترة سماح (يمنع الهروب من القتال بالانقطاع). */
  disconnect(conn) {
    const p = conn.player;
    conn.player = null;
    if (!p || p.conn !== conn) return;
    p.connected = false;
    p.disconnectedAt = this.t;
    p.dir = -1;
  }

  async #removePlayer(p) {
    this.players.delete(p.id);
    try {
      await this.savePlayer(p);
    } catch (e) {
      this.log.error('save on leave failed', e);
    }
  }

  // ===== أدوات الإرسال =====
  emitTo(playerId, event) {
    const p = this.players.get(playerId);
    if (p?.connected) p.conn.emit(S2C.EVENT, event);
  }
  emitNear(x, y, event) {
    for (const p of this.players.values()) if (p.connected && Math.hypot(p.x - x, p.y - y) <= INTEREST_RADIUS) p.conn.emit(S2C.EVENT, event);
  }
  notify(p, code, params = {}) {
    if (p.connected) p.conn.emit(S2C.EVENT, { type: 'notice', code, ...params });
  }
  sendSelf(p) {
    if (p.connected) p.conn.emit(S2C.SELF, p.selfState(this.t));
  }
  sendInventory(p) {
    if (p.connected) p.conn.emit(S2C.INVENTORY, p.inventoryState());
  }

  /** يعيد تحميل الذهب والسمعة والعناصر من قاعدة البيانات (مصدر الحقيقة) بعد أي عملية اقتصادية. */
  async refreshPlayer(p) {
    const rec = await this.repo.loadCharacter(p.id);
    if (!rec) return;
    p.gold = rec.gold;
    p.repTrade = rec.repTrade;
    p.repBlack = rec.repBlack;
    p.setItems(rec.items);
    p.recompute();
    this.sendInventory(p);
    this.sendSelf(p);
  }

  // ===== الخبرة والمهام =====
  awardXp(p, amount) {
    const amt = Math.max(0, Math.floor(amount));
    if (!amt) return;
    const levels = p.addXp(amt);
    this.emitTo(p.id, { type: 'xp', amount: amt });
    if (levels > 0) {
      this.emitTo(p.id, { type: 'levelup', level: p.level });
      this.#bg(this.savePlayer(p), 'save levelup');
    }
    this.sendSelf(p);
  }

  async grantXpToId(charId, amount) {
    const online = this.players.get(charId);
    if (online) return this.awardXp(online, amount);
    const rec = await this.repo.loadCharacter(charId);
    if (!rec) return;
    const r = applyXp(rec.level, rec.xp, amount);
    const sp = rec.skillPoints + r.levelsGained;
    const p = new Player({ ...rec, level: r.level, xp: r.xp, skillPoints: sp }, null, this.t);
    await this.repo.saveCharacter({ ...p.persistRecord(), hp: r.levelsGained ? p.maxHp : rec.hp, x: rec.x, y: rec.y });
  }

  questEvent(p, objective, amount = 1) {
    for (const q of Object.values(QUESTS)) {
      if (q.objective !== objective || (q.profession && q.profession !== p.profession) || p.level < q.minLevel) continue;
      const cur = p.quests.get(q.code);
      if (cur && cur.status !== 'active') continue;
      this.#bg(
        this.repo.upsertQuestProgress(p.id, q.code, amount, q.target).then((row) => {
          if (!row) return;
          p.quests.set(q.code, { progress: row.progress, status: row.status });
          this.sendSelf(p);
          if (row.status === 'completed') this.notify(p, 'quest_completed', { quest: q.code });
        }),
        'quest progress',
      );
    }
  }

  markHostile(thief) {
    thief.hostileUntil = this.t + BALANCE.hostileFlagSec;
    thief.revealedUntil = this.t + BALANCE.revealAfterActionSec;
  }

  // ===== الحركة =====
  #input(p, { seq, dir }) {
    if (seq < p.seq) return { ok: true }; // رسالة قديمة/معاد ترتيبها
    p.seq = seq;
    p.dir = p.dead ? -1 : dir;
    return { ok: true };
  }

  // ===== الضرر والموت =====
  damagePlayer(target, amount, source) {
    if (target.dead) return false;
    target.hp = Math.max(0, target.hp - amount);
    target.dirty = true;
    this.emitNear(target.x, target.y, { type: 'damage', targetType: 'player', targetId: target.id, amount, src: source.type, srcId: source.id });
    if (target.hp > 0) return false;
    this.#killPlayer(target);
    return true;
  }

  #killPlayer(p) {
    p.dead = true;
    p.hp = 0;
    p.deadUntil = this.t + BALANCE.respawnSec;
    p.dir = -1;
    p.hostileUntil = 0;
    p.markedUntil = 0;
    p.rootedUntil = 0;
    const wasThief = p.profession === 'thief';
    this.emitNear(p.x, p.y, { type: 'death', targetType: 'player', targetId: p.id });
    this.#bg(
      (async () => {
        await this.repo.penalty(p.id, BALANCE.deathGoldPct, null, 'death_penalty', `death:${this.bootId}:${++this.seq}`);
        if (wasThief) await this.repo.addRep(p.id, 'black', -BALANCE.thiefDeathBlackRepLoss);
        await this.refreshPlayer(p);
        await this.savePlayer(p);
      })(),
      'death penalty',
    );
    this.sendSelf(p);
  }

  #respawn(p) {
    const s = nearestSpawn(this.world, p.x, p.y);
    p.x = s.x;
    p.y = s.y;
    p.hp = Math.max(1, Math.ceil(p.maxHp * BALANCE.respawnHpPct));
    p.dead = false;
    p.deadUntil = 0;
    p.dirty = true;
    this.emitNear(p.x, p.y, { type: 'respawn', targetId: p.id, cityId: s.cityId });
    this.#bg(this.savePlayer(p), 'save respawn');
    this.sendSelf(p);
  }

  // ===== القتال =====
  #resolveTarget(type, id) {
    if (type === 'monster') return this.monsters.get(id);
    if (type === 'player') return this.players.get(id) ?? null;
    if (type === 'caravan') return this.caravans.get(id);
    return null;
  }

  #basicAttack(p, { targetType, targetId }) {
    if (p.dead) return fail(ERR.DEAD);
    if (this.t < p.atkReadyAt) return fail(ERR.COOLDOWN);
    const def = p.attackDef;
    const res = this.#attackCore(p, targetType, targetId, { mul: 1, range: def.range });
    if (res.ok) p.atkReadyAt = this.t + def.cooldown;
    return res;
  }

  /** ينفّذ هجومًا بعد التحقق الكامل من القواعد. يعيد { ok, damage, killed } أو خطأ. */
  #attackCore(p, targetType, targetId, { mul, range }) {
    const target = this.#resolveTarget(targetType, targetId);
    if (!target) return fail(ERR.NOT_FOUND);
    if (!inRange(p, target, range + (targetType === 'monster' ? BALANCE.monsterRadius : 0))) return fail(ERR.OUT_OF_RANGE);
    let rel = { ok: true, aggression: false };
    let wasValidBounty = false;
    if (targetType === 'player') {
      rel = canAttackPlayer(p, target, this.t, this.world);
      if (!rel.ok) return rel;
      wasValidBounty = isHostile(target, this.t) || isWanted(target);
    } else if (targetType === 'caravan') {
      rel = canAttackCaravan(p, target, this.world);
      if (!rel.ok) return rel;
    }
    if (rel.aggression) this.markHostile(p);
    else if (p.profession === 'thief') p.revealedUntil = Math.max(p.revealedUntil, this.t + BALANCE.revealAfterActionSec);

    let killed = false;
    let damage;
    if (targetType === 'monster') {
      damage = computeDamage(p.atk, target.def.def, { mul, rng: this.rng });
      this.emitNear(target.x, target.y, { type: 'damage', targetType: 'monster', targetId: target.id, amount: damage, srcId: p.id });
      killed = this.monsters.damage(target, damage, p);
    } else if (targetType === 'player') {
      const takenMul = target.markedUntil > this.t ? target.markedMul : 1;
      damage = computeDamage(p.atk, target.def, { mul, takenMul, rng: this.rng });
      killed = this.damagePlayer(target, damage, { type: 'player', id: p.id });
      if (killed) this.#pvpKill(p, target, wasValidBounty);
    } else {
      damage = computeDamage(p.atk, this.caravans.effectiveDef(target), { mul, rng: this.rng });
      this.emitNear(target.x, target.y, { type: 'damage', targetType: 'caravan', targetId: target.id, amount: damage, srcId: p.id });
      killed = this.caravans.damage(target, damage, p);
    }
    return { ok: true, damage, killed };
  }

  #pvpKill(killer, victim, wasValidBounty) {
    const rw = pvpKillReward(killer, victim, this.t, wasValidBounty);
    // القفل يُضبط بعد تقييم المكافأة: نفس اللص لا يعطي مكافأة ثانية خلال 120 ثانية (يمنع تدوير الصيد بين حسابين)
    if (victim.profession === 'thief') victim.bountyLockedUntil = this.t + 120;
    if (rw.kind === 'none') return;
    this.#bg(
      (async () => {
        if (rw.gold > 0) {
          const r = await this.repo.grant(killer.id, rw.gold, {}, 'bounty', `bounty:${this.bootId}:${++this.seq}`);
          if (!r.ok) return;
        }
        if (rw.repField) await this.repo.addRep(killer.id, rw.repField, rw.rep);
        await this.refreshPlayer(killer);
        this.awardXp(killer, rw.xp);
        if (rw.kind === 'bounty') this.questEvent(killer, 'bounty', 1);
        this.notify(killer, 'kill_reward', { kind: rw.kind, gold: rw.gold, victim: victim.name });
      })(),
      'pvp reward',
    );
  }

  onMonsterKilled(m) {
    const total = [...m.damagers.values()].reduce((a, b) => a + b, 0) || 1;
    let topId = 0;
    let top = -1;
    for (const [pid, dmg] of m.damagers) {
      if (dmg > top) {
        top = dmg;
        topId = pid;
      }
    }
    this.emitNear(m.x, m.y, { type: 'death', targetType: 'monster', targetId: m.id });
    for (const [pid, dmg] of m.damagers) {
      const pl = this.players.get(pid);
      if (!pl || pl.dead) continue;
      const diff = pl.level - m.def.level;
      const levelMul = diff >= 10 ? 0.1 : diff >= 5 ? 0.5 : 1;
      this.awardXp(pl, Math.max(1, Math.floor(m.def.xp * (dmg / total) * levelMul)));
      this.questEvent(pl, `kill:${m.code}`, 1);
    }
    const killer = this.players.get(topId);
    if (!killer) return;
    const [gmin, gmax] = m.def.gold;
    const gold = gmin + Math.floor(this.rng() * (gmax - gmin + 1));
    if (gold > 0) {
      this.#bg(
        this.repo.grant(killer.id, gold, {}, 'monster_gold', `mk:${this.bootId}:${++this.seq}`).then((r) => {
          if (r.ok) {
            killer.gold = r.gold;
            this.sendSelf(killer);
            this.emitTo(killer.id, { type: 'loot', gold });
          }
        }),
        'monster gold',
      );
    }
    const items = {};
    for (const l of m.def.loot) {
      if (this.rng() < l.chance) items[l.itemId] = (items[l.itemId] ?? 0) + l.qty[0] + Math.floor(this.rng() * (l.qty[1] - l.qty[0] + 1));
    }
    if (Object.keys(items).length) {
      const id = this.nextDropId++;
      this.drops.set(id, { id, x: m.x, y: m.y, items, ownerId: killer.id, ownerUntil: this.t + BALANCE.dropOwnerLockSec, expiresAt: this.t + BALANCE.dropTtl });
    }
  }

  async #pickup(p, { dropId }) {
    if (p.dead) return fail(ERR.DEAD);
    const d = this.drops.get(dropId);
    if (!d) return fail(ERR.NOT_FOUND);
    if (dist(p, d) > BALANCE.pickupRange) return fail(ERR.OUT_OF_RANGE);
    if (d.ownerId !== p.id && d.ownerUntil > this.t) return fail(ERR.UNAUTHORIZED);
    this.drops.delete(dropId); // الإزالة قبل await تمنع التقاطًا مزدوجًا
    const r = await this.repo.grant(p.id, 0, d.items, 'loot_pickup', `drop:${this.bootId}:${dropId}`);
    if (!r.ok) {
      if (r.error === ERR.INVENTORY_FULL) this.drops.set(dropId, d);
      return fail(r.error);
    }
    await this.refreshPlayer(p);
    return { ok: true, items: d.items };
  }

  // ===== المهارات =====
  async #skill(p, { skillId, targetType, targetId, x, y }) {
    const def = SKILLS[skillId];
    const lv = p.skillLevel(skillId);
    if (!def || def.profession !== p.profession || lv < 1) return fail(ERR.WRONG_PROFESSION);
    if (p.dead) return fail(ERR.DEAD);
    if ((p.skillReadyAt.get(skillId) ?? 0) > this.t) return fail(ERR.COOLDOWN);
    const params = def.params(lv);
    let res;
    switch (skillId) {
      case 'caravan_shield':
      case 'field_repair': {
        const c = this.caravans.ofOwner(p.id);
        if (!c || (c.status !== 'traveling' && c.status !== 'under_attack' && c.status !== 'preparing')) return fail(ERR.CARAVAN_NOT_ACTIVE);
        if (dist(p, c) > def.range) return fail(ERR.OUT_OF_RANGE);
        if (skillId === 'caravan_shield') this.caravans.shield(c, params.durationSec);
        else this.caravans.repair(c, params.healPct);
        res = { ok: true };
        break;
      }
      case 'plunder': {
        if (targetType !== 'caravan' || targetId == null) return fail(ERR.INVALID);
        const c = this.caravans.get(targetId);
        if (!c) return fail(ERR.NOT_FOUND);
        if (dist(p, c) > def.range + 0.6) return fail(ERR.OUT_OF_RANGE);
        const rel = canAttackCaravan(p, c, this.world);
        if (!rel.ok) return rel;
        res = await this.caravans.plunder(p, c, params.pctMul);
        break;
      }
      case 'snare_trap': {
        const tx = x ?? p.x;
        const ty = y ?? p.y;
        if (isSafeAt(this.world, p.x) || isSafeAt(this.world, tx)) return fail(ERR.SAFE_ZONE);
        if (!isPositionValid(this.world, tx, ty) || Math.hypot(tx - p.x, ty - p.y) > def.range + 0.6) return fail(ERR.OUT_OF_RANGE);
        const mine = this.traps.filter((tr) => tr.ownerId === p.id);
        if (mine.length >= params.maxTraps) return fail(ERR.TRAP_LIMIT);
        this.traps.push({ id: this.nextTrapId++, ownerId: p.id, x: tx, y: ty, expiresAt: this.t + params.lifetimeSec, rootSec: params.rootSec, radius: params.radius });
        p.revealedUntil = Math.max(p.revealedUntil, this.t + BALANCE.revealAfterActionSec);
        res = { ok: true };
        break;
      }
      case 'power_shot':
        if (targetType == null || targetId == null) return fail(ERR.INVALID);
        res = this.#attackCore(p, targetType, targetId, { mul: params.dmgMul, range: def.range });
        break;
      case 'mark_target': {
        if (targetType !== 'player' || targetId == null) return fail(ERR.INVALID);
        const tgt = this.players.get(targetId);
        if (!tgt) return fail(ERR.NOT_FOUND);
        if (!inRange(p, tgt, def.range)) return fail(ERR.OUT_OF_RANGE);
        const rel = canAttackPlayer(p, tgt, this.t, this.world); // لا يوسَم إلا من يحق للصياد مهاجمته
        if (!rel.ok) return rel;
        tgt.markedUntil = this.t + params.durationSec;
        tgt.markedMul = params.dmgTakenMul;
        tgt.revealedUntil = Math.max(tgt.revealedUntil, tgt.markedUntil);
        res = { ok: true };
        break;
      }
      default:
        return fail(ERR.INVALID);
    }
    if (res.ok) {
      p.skillReadyAt.set(skillId, this.t + def.cooldown(lv));
      this.sendSelf(p);
    }
    return res;
  }

  #skillUpgrade(p, { skillId }) {
    const r = p.upgradeSkill(skillId);
    if (r === 'UNKNOWN') return fail(ERR.WRONG_PROFESSION);
    if (r === 'MAX') return fail(ERR.MAX_SKILL_LEVEL);
    if (r === 'NO_POINTS') return fail(ERR.NO_SKILL_POINTS);
    this.#bg(this.savePlayer(p), 'save skill upgrade');
    this.sendSelf(p);
    return { ok: true, level: p.skillLevel(skillId) };
  }

  #tickTraps() {
    this.traps = this.traps.filter((tr) => {
      if (tr.expiresAt <= this.t) return false;
      for (const v of this.players.values()) {
        if (v.dead || v.id === tr.ownerId || v.profession === 'thief' || isSafeAt(this.world, v.x)) continue;
        if (Math.hypot(v.x - tr.x, v.y - tr.y) <= tr.radius) {
          v.rootedUntil = this.t + tr.rootSec;
          const owner = this.players.get(tr.ownerId);
          if (owner && !isHostile(v, this.t)) this.markHostile(owner);
          this.emitNear(tr.x, tr.y, { type: 'trap', targetId: v.id, sec: tr.rootSec });
          return false;
        }
      }
      return true;
    });
  }

  // ===== NPC والقوافل =====
  #interact(p, { npcId }) {
    const r = trade.requireNpc(this, p, npcId, null);
    if (r.error) return fail(r.error);
    p.conn.emit(S2C.NPC, trade.npcInfo(this, p, r.npc));
    return { ok: true };
  }

  async #launch(p, { npcId, destCity, cargo, idem }) {
    const r = trade.requireNpc(this, p, npcId, ['caravan']);
    if (r.error) return fail(r.error);
    if (p.busy) return fail(ERR.BUSY);
    p.busy = true;
    try {
      return await this.caravans.launch(p, r.npc, destCity, cargo, idem);
    } finally {
      p.busy = false;
    }
  }

  #escort(p, { caravanId }) {
    if (p.profession !== 'hunter') return fail(ERR.WRONG_PROFESSION);
    if (p.dead) return fail(ERR.DEAD);
    const c = this.caravans.get(caravanId);
    if (!c) return fail(ERR.CARAVAN_NOT_ACTIVE);
    if (c.ownerId === p.id) return fail(ERR.INVALID);
    if (dist(p, c) > BALANCE.escortRange) return fail(ERR.OUT_OF_RANGE);
    if (c.escorts.has(p.id)) return { ok: true, duplicate: true };
    if (c.escorts.size >= BALANCE.escortMaxPerCaravan) return fail(ERR.BUSY);
    c.escorts.add(p.id);
    return { ok: true };
  }

  // ===== الدردشة =====
  #chat(p, { text }) {
    const clean = sanitizeChat(text, BALANCE.chatMaxLen);
    if (!clean) return fail(ERR.INVALID);
    const msg = { name: p.name, text: clean, prof: p.profession, t: Date.now() };
    this.chatLog.push(msg);
    if (this.chatLog.length > 100) this.chatLog.shift();
    for (const o of this.players.values()) if (o.connected) o.conn.emit(S2C.CHAT, msg);
    this.#bg(this.repo.saveChat(p.id, p.name, clean), 'save chat');
    return { ok: true };
  }

  // ===== المحاكاة =====
  tick(dt) {
    this.t += dt;
    this.tickCount++;
    const { world } = this;
    for (const p of this.players.values()) {
      if (p.dead) {
        if (this.t >= p.deadUntil) this.#respawn(p);
        continue;
      }
      if (p.dir >= 0 && p.rootedUntil <= this.t) {
        const r = stepMovement(world, p, p.dir, BALANCE.playerSpeed, dt);
        if (r.moved) {
          p.x = r.x;
          p.y = r.y;
          p.dirty = true;
        }
      }
      if (p.hp < p.maxHp && isSafeAt(world, p.x)) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.02 * dt);
      if (!p.connected && this.t - p.disconnectedAt >= BALANCE.disconnectGraceSec) this.#bg(this.#removePlayer(p), 'remove player');
      else if (p.dirty && !p.saving && this.t - p.lastSaveAt >= BALANCE.autosaveSec) {
        p.saving = true;
        p.lastSaveAt = this.t;
        p.dirty = false;
        this.#bg(this.savePlayer(p).finally(() => (p.saving = false)), 'autosave');
      }
    }
    this.monsters.tick(dt);
    this.caravans.tick(dt);
    this.#tickTraps();
    for (const [id, d] of this.drops) if (d.expiresAt <= this.t) this.drops.delete(id);
    if (this.tickCount % SNAPSHOT_EVERY_TICKS === 0) for (const p of this.players.values()) if (p.connected) this.#sendSnapshot(p);
  }

  /** هل يستطيع المشاهد رؤية هذا اللاعب؟ اللصوص متخفّون إلا ضمن نطاق قريب أو بعد الفعل/الوسم. */
  canSee(viewer, other) {
    if (viewer === other || other.profession !== 'thief') return true;
    if (viewer.profession === 'thief') return true;
    if (other.revealedUntil > this.t || other.markedUntil > this.t || other.hostileUntil > this.t) return true;
    const d = dist(viewer, other);
    if (d <= BALANCE.thiefStealthRadius) return true;
    return viewer.profession === 'hunter' && d <= BALANCE.hunterDetectRadius;
  }

  #sendSnapshot(p) {
    const R = INTEREST_RADIUS;
    const near = (o) => Math.abs(o.x - p.x) <= R && Math.abs(o.y - p.y) <= R && Math.hypot(o.x - p.x, o.y - p.y) <= R;
    const players = [];
    for (const o of this.players.values()) if (o !== p && near(o) && this.canSee(p, o)) players.push(o.publicState(this.t));
    const monsters = [];
    for (const m of this.monsters.monsters.values()) if (!m.dead && near(m)) monsters.push(this.monsters.publicState(m));
    const caravans = [];
    for (const c of this.caravans.caravans.values()) if (near(c) || c.ownerId === p.id) caravans.push(this.caravans.publicState(c, p, this.t));
    const drops = [];
    for (const d of this.drops.values()) if (near(d)) drops.push({ id: d.id, x: +d.x.toFixed(2), y: +d.y.toFixed(2), items: d.items, mine: d.ownerId === p.id || d.ownerUntil <= this.t });
    const traps = p.profession === 'thief' ? this.traps.filter((tr) => tr.ownerId === p.id).map((tr) => ({ id: tr.id, x: tr.x, y: tr.y })) : [];
    p.conn.emit(S2C.SNAPSHOT, {
      t: +this.t.toFixed(2),
      ack: p.seq,
      you: { x: +p.x.toFixed(3), y: +p.y.toFixed(3), hp: Math.round(p.hp), maxHp: p.maxHp, dead: p.dead, zone: zoneAt(this.world, p.x).id, rooted: p.rootedUntil > this.t },
      players,
      monsters,
      caravans,
      drops,
      traps,
    });
  }

  get onlineCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }
}

// يُستخدم في الاختبارات للتحقق من وجود NPC
export { npcById, PROFESSIONS, MONSTERS };
