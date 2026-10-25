// تعريف الوحوش. أضف وحشًا جديدًا هنا وأشر إليه في مناطق الظهور (maps/world-data.js).

export const MONSTERS = Object.freeze({
  wolf: {
    code: 'wolf', nameAr: 'ذئب', level: 2, maxHp: 45, atk: 7, def: 1, xp: 14, gold: [2, 6],
    aggro: 6, leash: 14, speed: 2.4, attackRange: 1.3, attackCooldown: 1.4, respawnSec: 25,
    loot: [{ itemId: 'pelt', chance: 0.5, qty: [1, 1] }, { itemId: 'health_potion', chance: 0.08, qty: [1, 1] }],
  },
  boar: {
    code: 'boar', nameAr: 'خنزير بري', level: 3, maxHp: 70, atk: 9, def: 3, xp: 22, gold: [4, 9],
    aggro: 4, leash: 12, speed: 2.0, attackRange: 1.3, attackCooldown: 1.6, respawnSec: 25,
    loot: [{ itemId: 'pelt', chance: 0.4, qty: [1, 2] }, { itemId: 'health_potion', chance: 0.1, qty: [1, 1] }],
  },
  dust_scorpion: {
    code: 'dust_scorpion', nameAr: 'عقرب الغبار', level: 5, maxHp: 90, atk: 14, def: 4, xp: 40, gold: [8, 16],
    aggro: 5, leash: 12, speed: 2.2, attackRange: 1.2, attackCooldown: 1.2, respawnSec: 30,
    loot: [{ itemId: 'ancient_coin', chance: 0.1, qty: [1, 1] }, { itemId: 'health_potion', chance: 0.12, qty: [1, 1] }],
  },
  skeleton_warrior: {
    code: 'skeleton_warrior', nameAr: 'هيكل محارب', level: 8, maxHp: 160, atk: 22, def: 8, xp: 85, gold: [15, 30],
    aggro: 6, leash: 14, speed: 2.0, attackRange: 1.5, attackCooldown: 1.3, respawnSec: 35,
    loot: [{ itemId: 'ancient_coin', chance: 0.2, qty: [1, 1] }, { itemId: 'big_health_potion', chance: 0.08, qty: [1, 1] }, { itemId: 'chain_vest', chance: 0.03, qty: [1, 1] }],
  },
  shadow_stalker: {
    code: 'shadow_stalker', nameAr: 'مطارد الظلال', level: 10, maxHp: 190, atk: 30, def: 8, xp: 120, gold: [25, 45],
    aggro: 8, leash: 16, speed: 3.0, attackRange: 1.4, attackCooldown: 1.0, respawnSec: 40,
    loot: [{ itemId: 'ancient_coin', chance: 0.3, qty: [1, 1] }, { itemId: 'big_health_potion', chance: 0.1, qty: [1, 1] }, { itemId: 'shadow_dagger', chance: 0.03, qty: [1, 1] }],
  },
  stone_golem: {
    code: 'stone_golem', nameAr: 'غولم الحجر', level: 12, maxHp: 600, atk: 38, def: 18, xp: 400, gold: [80, 140],
    aggro: 5, leash: 10, speed: 1.4, attackRange: 1.8, attackCooldown: 2.2, respawnSec: 120,
    loot: [{ itemId: 'ancient_coin', chance: 0.8, qty: [1, 3] }, { itemId: 'steel_sword', chance: 0.08, qty: [1, 1] }, { itemId: 'plate_vest', chance: 0.05, qty: [1, 1] }],
  },
});

export function getMonster(code) {
  return Object.prototype.hasOwnProperty.call(MONSTERS, code) ? MONSTERS[code] : null;
}
