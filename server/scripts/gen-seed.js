// يولّد database/seeds/001_catalog.sql من بيانات shared/data (مصدر الحقيقة الوحيد).
// التشغيل: npm run gen:seed
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ITEMS } from '../../shared/data/items.js';
import { MONSTERS } from '../../shared/data/monsters.js';
import { QUESTS } from '../../shared/data/quests.js';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v) => (v == null ? 'NULL' : String(v));

const lines = [];
lines.push('-- ملف مولَّد تلقائيًا من shared/data عبر: npm run gen:seed — لا تعدّله يدويًا.');
lines.push('-- آمن للتكرار (upsert).');
lines.push('BEGIN;');

lines.push('\n-- العناصر');
for (const it of Object.values(ITEMS)) {
  lines.push(
    `INSERT INTO items (id, kind, name_ar, name_en, slot, weapon_class, atk, def, heal, base_price, min_level) VALUES (` +
      [q(it.id), `${q(it.kind)}::item_kind`, q(it.nameAr), q(it.nameEn), it.slot ? q(it.slot) : 'NULL', it.weaponClass ? q(it.weaponClass) : 'NULL', n(it.atk ?? 0), n(it.def ?? 0), n(it.heal ?? 0), n(it.basePrice), n(it.minLevel ?? 1)].join(', ') +
      `) ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, slot = EXCLUDED.slot, weapon_class = EXCLUDED.weapon_class, atk = EXCLUDED.atk, def = EXCLUDED.def, heal = EXCLUDED.heal, base_price = EXCLUDED.base_price, min_level = EXCLUDED.min_level;`,
  );
}

lines.push('\n-- الوحوش');
for (const m of Object.values(MONSTERS)) {
  lines.push(
    `INSERT INTO monsters (code, name_ar, level, max_hp, atk, def, xp, gold_min, gold_max, aggro_range, leash_range, speed, attack_range, attack_cooldown, respawn_sec, loot) VALUES (` +
      [q(m.code), q(m.nameAr), n(m.level), n(m.maxHp), n(m.atk), n(m.def), n(m.xp), n(m.gold[0]), n(m.gold[1]), n(m.aggro), n(m.leash), n(m.speed), n(m.attackRange), n(m.attackCooldown), n(m.respawnSec), `${q(JSON.stringify(m.loot))}::jsonb`].join(', ') +
      `) ON CONFLICT (code) DO UPDATE SET name_ar = EXCLUDED.name_ar, level = EXCLUDED.level, max_hp = EXCLUDED.max_hp, atk = EXCLUDED.atk, def = EXCLUDED.def, xp = EXCLUDED.xp, gold_min = EXCLUDED.gold_min, gold_max = EXCLUDED.gold_max, aggro_range = EXCLUDED.aggro_range, leash_range = EXCLUDED.leash_range, speed = EXCLUDED.speed, attack_range = EXCLUDED.attack_range, attack_cooldown = EXCLUDED.attack_cooldown, respawn_sec = EXCLUDED.respawn_sec, loot = EXCLUDED.loot;`,
  );
}

lines.push('\n-- المهام');
for (const qu of Object.values(QUESTS)) {
  lines.push(
    `INSERT INTO quests (code, title_ar, desc_ar, profession, objective, target, reward_gold, reward_xp, min_level) VALUES (` +
      [q(qu.code), q(qu.titleAr), q(qu.descAr), qu.profession ? `${q(qu.profession)}::profession` : 'NULL', q(qu.objective), n(qu.target), n(qu.rewardGold), n(qu.rewardXp), n(qu.minLevel)].join(', ') +
      `) ON CONFLICT (code) DO UPDATE SET title_ar = EXCLUDED.title_ar, desc_ar = EXCLUDED.desc_ar, profession = EXCLUDED.profession, objective = EXCLUDED.objective, target = EXCLUDED.target, reward_gold = EXCLUDED.reward_gold, reward_xp = EXCLUDED.reward_xp, min_level = EXCLUDED.min_level;`,
  );
}

lines.push('\nCOMMIT;\n');

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database/seeds/001_catalog.sql');
writeFileSync(out, lines.join('\n'), 'utf8');
console.log(`wrote ${out}`);
