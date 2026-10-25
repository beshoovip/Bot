// التقدم والإحصاءات المشتقة (دوال نقية).

import { BALANCE } from './data/balance.js';
import { PROFESSIONS } from './data/professions.js';
import { ITEMS } from './data/items.js';

export const MAX_TRADER_DISCOUNT = 0.1;

export function xpToNext(level) {
  return Math.floor(60 * Math.pow(level, 1.6));
}

// يضيف خبرة ويعيد المستوى الجديد وعدد المستويات المكتسبة.
export function applyXp(level, xp, gain) {
  let lv = level;
  let cur = xp + Math.max(0, Math.floor(gain));
  let gained = 0;
  while (lv < BALANCE.maxLevel && cur >= xpToNext(lv)) {
    cur -= xpToNext(lv);
    lv += 1;
    gained += 1;
  }
  if (lv >= BALANCE.maxLevel) cur = Math.min(cur, xpToNext(BALANCE.maxLevel) - 1);
  return { level: lv, xp: cur, levelsGained: gained };
}

export function baseStats(professionId, level) {
  const p = PROFESSIONS[professionId];
  if (!p) throw new Error(`unknown profession: ${professionId}`);
  const l = level - 1;
  return {
    maxHp: Math.round(p.base.hp + p.growth.hp * l),
    atk: Math.round(p.base.atk + p.growth.atk * l),
    def: Math.round(p.base.def + p.growth.def * l),
  };
}

/**
 * @param {string} professionId
 * @param {number} level
 * @param {{weaponId?:string|null, armorId?:string|null}} equipment
 */
export function computeStats(professionId, level, equipment = {}) {
  const b = baseStats(professionId, level);
  const w = equipment.weaponId ? ITEMS[equipment.weaponId] : null;
  const a = equipment.armorId ? ITEMS[equipment.armorId] : null;
  return {
    maxHp: b.maxHp,
    atk: b.atk + (w?.atk ?? 0),
    def: b.def + (a?.def ?? 0),
  };
}

// خصم التاجر عند الشراء: 0.5% لكل مستوى حتى 10% (يجب أن يبقى 1 - الخصم > sellSpread).
export function traderDiscount(professionId, level) {
  if (professionId !== 'trader') return 0;
  return Math.min(MAX_TRADER_DISCOUNT, 0.005 * level);
}

// هل يمكن لهذه المهنة والمستوى تجهيز هذا العنصر؟
export function canEquip(professionId, level, item) {
  if (!item || (item.kind !== 'weapon' && item.kind !== 'armor')) return { ok: false, error: 'UNKNOWN_ITEM' };
  if (level < (item.minLevel ?? 1)) return { ok: false, error: 'LEVEL_TOO_LOW' };
  if (item.kind === 'weapon' && PROFESSIONS[professionId]?.weaponClass !== item.weaponClass) {
    return { ok: false, error: 'WRONG_PROFESSION' };
  }
  return { ok: true };
}
