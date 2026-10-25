import test from 'node:test';
import assert from 'node:assert/strict';
import { buyPrice, sellPrice, cargoValueAt, caravanReward, CITY_GOOD_PRICES, healCost } from '../../shared/economy.js';
import { GOOD_IDS, ITEMS } from '../../shared/data/items.js';
import { BALANCE } from '../../shared/data/balance.js';
import { xpToNext, applyXp, computeStats, baseStats, canEquip, traderDiscount } from '../../shared/progression.js';
import { PROFESSIONS } from '../../shared/data/professions.js';
import { SKILLS, MAX_SKILL_LEVEL } from '../../shared/data/skills.js';
import { MONSTERS } from '../../shared/data/monsters.js';

test('كل بضاعة لها سعر في المدينتين', () => {
  for (const g of GOOD_IDS) {
    for (const c of ['dawn_city', 'dusk_city']) assert.ok(CITY_GOOD_PRICES[c][g] > 0, `${g}@${c}`);
  }
});

test('اقتصاد القوافل: لكل بضاعة اتجاه واحد مربح بعد الرسوم والفارق وخصم التاجر', () => {
  const profitable = {};
  for (const g of GOOD_IDS) {
    for (const [from, to] of [['dawn_city', 'dusk_city'], ['dusk_city', 'dawn_city']]) {
      const cost = buyPrice({ cityId: from, shopType: 'market', itemId: g, professionId: 'trader', level: 1 });
      const reward = caravanReward(to, { [g]: 1 }).total;
      const feePerUnit = BALANCE.caravanFee / BALANCE.caravanCapacity;
      if (reward - cost - feePerUnit > 0) (profitable[g] ??= []).push(`${from}>${to}`);
    }
  }
  for (const g of GOOD_IDS) assert.equal(profitable[g]?.length, 1, `${g}: ${JSON.stringify(profitable[g])}`);
});

test('رحلة مثالية بكامل السعة مربحة وليست مفرطة الربح', () => {
  const qty = BALANCE.caravanCapacity;
  const cost = buyPrice({ cityId: 'dawn_city', shopType: 'market', itemId: 'wheat', professionId: 'trader', level: 1 }) * qty + BALANCE.caravanFee;
  const reward = caravanReward('dusk_city', { wheat: qty }).total;
  assert.ok(reward > cost);
  assert.ok(reward / cost < 3, `هامش الربح مفرط ${reward / cost}`);
});

test('سعر البيع دائمًا أقل من سعر الشراء (لا ربح من التدوير)', () => {
  for (const g of GOOD_IDS) {
    for (const c of ['dawn_city', 'dusk_city']) {
      for (const prof of ['trader', 'thief', 'hunter']) {
        const b = buyPrice({ cityId: c, shopType: 'market', itemId: g, professionId: prof, level: 1 });
        const s = sellPrice({ cityId: c, shopType: 'market', itemId: g, professionId: prof });
        assert.ok(s < b, `${g}@${c} ${prof}: بيع ${s} ≥ شراء ${b}`);
      }
    }
  }
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    if (it.kind === 'weapon' || it.kind === 'armor') {
      const b = buyPrice({ cityId: 'dawn_city', shopType: 'smith', itemId: id, professionId: 'trader', level: 30 });
      const s = sellPrice({ cityId: 'dawn_city', shopType: 'smith', itemId: id, professionId: 'trader' });
      assert.ok(s < b);
    }
  }
});

test('لا مراجحة حتى مع أقصى خصم للتاجر (شراء ثم بيع في نفس المتجر خسارة دائمًا)', () => {
  for (const [shopType, kinds] of [['market', ['good']], ['smith', ['weapon', 'armor']], ['healer', ['consumable']]]) {
    for (const c of ['dawn_city', 'dusk_city']) {
      for (const id of Object.keys(ITEMS)) {
        if (!kinds.includes(ITEMS[id].kind)) continue;
        const b = buyPrice({ cityId: c, shopType, itemId: id, professionId: 'trader', level: 30 });
        const s = sellPrice({ cityId: c, shopType, itemId: id, professionId: 'trader' });
        assert.ok(b != null && s != null && s < b, `${shopType}/${c}/${id}: شراء ${b} بيع ${s}`);
      }
    }
  }
});

test('اللص يبيع البضائع بسعر السوق السوداء الأقل', () => {
  const t = sellPrice({ cityId: 'dusk_city', shopType: 'market', itemId: 'wheat', professionId: 'trader' });
  const th = sellPrice({ cityId: 'dusk_city', shopType: 'market', itemId: 'wheat', professionId: 'thief' });
  assert.ok(th < t);
});

test('المتاجر تقبل أنواعًا محددة فقط', () => {
  assert.equal(buyPrice({ cityId: 'dawn_city', shopType: 'market', itemId: 'iron_sword', professionId: 'trader', level: 1 }), null);
  assert.equal(buyPrice({ cityId: 'dawn_city', shopType: 'smith', itemId: 'wheat', professionId: 'trader', level: 1 }), null);
  assert.equal(buyPrice({ cityId: 'dawn_city', shopType: 'market', itemId: 'pelt', professionId: 'trader', level: 1 }), null); // الغنائم تُباع فقط
  assert.ok(sellPrice({ cityId: 'dawn_city', shopType: 'market', itemId: 'pelt', professionId: 'hunter' }) > 0);
  assert.equal(sellPrice({ cityId: 'dawn_city', shopType: 'healer', itemId: 'wheat', professionId: 'trader' }), null);
  assert.equal(buyPrice({ cityId: 'dawn_city', shopType: 'market', itemId: 'nonexistent', professionId: 'trader', level: 1 }), null);
});

test('خصم التاجر محدود', () => {
  assert.equal(traderDiscount('hunter', 30), 0);
  assert.equal(traderDiscount('trader', 1), 0.005);
  assert.equal(traderDiscount('trader', 30), 0.1);
  assert.equal(traderDiscount('trader', 99), 0.1);
});

test('قيمة الحمولة تتجاهل ما ليس بضاعة تجارية', () => {
  assert.equal(cargoValueAt('dusk_city', { wheat: 10, pelt: 5 }), Math.floor(15 * BALANCE.sellSpread) * 10);
  assert.equal(healCost(5), 15);
});

test('منحنى الخبرة والمستويات', () => {
  assert.equal(xpToNext(1), 60);
  assert.ok(xpToNext(10) > xpToNext(9));
  let r = applyXp(1, 0, 59);
  assert.deepEqual(r, { level: 1, xp: 59, levelsGained: 0 });
  r = applyXp(1, 59, 1);
  assert.deepEqual(r, { level: 2, xp: 0, levelsGained: 1 });
  r = applyXp(1, 0, 100000000);
  assert.equal(r.level, BALANCE.maxLevel);
  assert.ok(r.xp < xpToNext(BALANCE.maxLevel));
  assert.equal(applyXp(5, 0, -50).xp, 0);
});

test('الإحصاءات المشتقة تشمل المعدات وتنمو مع المستوى', () => {
  const b1 = baseStats('thief', 1);
  const b10 = baseStats('thief', 10);
  assert.ok(b10.maxHp > b1.maxHp && b10.atk > b1.atk && b10.def >= b1.def);
  const s = computeStats('hunter', 5, { weaponId: 'hunter_bow', armorId: 'chain_vest' });
  assert.equal(s.atk, baseStats('hunter', 5).atk + 8);
  assert.equal(s.def, baseStats('hunter', 5).def + 7);
});

test('قواعد التجهيز: مستوى ومهنة', () => {
  assert.equal(canEquip('trader', 1, ITEMS.rusty_sword).ok, true);
  assert.equal(canEquip('trader', 1, ITEMS.iron_sword).error, 'LEVEL_TOO_LOW');
  assert.equal(canEquip('trader', 30, ITEMS.dagger).error, 'WRONG_PROFESSION');
  assert.equal(canEquip('hunter', 1, ITEMS.short_bow).ok, true);
  assert.equal(canEquip('hunter', 1, ITEMS.leather_vest).ok, true);
  assert.equal(canEquip('hunter', 1, ITEMS.wheat).error, 'UNKNOWN_ITEM');
});

test('لا مهنة بأفضلية مطلقة: كل مهنة تتفوق في بُعد وتتأخر في آخر', () => {
  const at = (p) => baseStats(p, 10);
  const stats = { trader: at('trader'), thief: at('thief'), hunter: at('hunter') };
  // التاجر الأعلى صحة، اللص الأعلى هجومًا والأقل صحة ودفاعًا، الصياد الأطول مدى
  assert.ok(stats.trader.maxHp > stats.hunter.maxHp && stats.hunter.maxHp > stats.thief.maxHp);
  assert.ok(stats.thief.atk > stats.hunter.atk && stats.hunter.atk > stats.trader.atk);
  assert.ok(stats.thief.def < stats.trader.def && stats.thief.def < stats.hunter.def);
  assert.ok(PROFESSIONS.hunter.attack.range > PROFESSIONS.thief.attack.range);
  assert.ok(PROFESSIONS.thief.attack.cooldown < PROFESSIONS.trader.attack.cooldown);
});

test('المهارات والوحوش: بيانات مكتملة ومتسقة', () => {
  for (const p of Object.values(PROFESSIONS)) {
    assert.equal(p.skills.length, 2);
    for (const sk of p.skills) assert.equal(SKILLS[sk].profession, p.id);
    for (const itemId of Object.keys(p.startItems)) assert.ok(ITEMS[itemId], itemId);
  }
  for (const sk of Object.values(SKILLS)) {
    for (let lv = 1; lv <= MAX_SKILL_LEVEL; lv++) {
      assert.ok(sk.cooldown(lv) > 0);
      assert.ok(Object.keys(sk.params(lv)).length > 0);
    }
    assert.ok(sk.cooldown(3) < sk.cooldown(1) || Object.values(sk.params(3)).some((v, i) => v > Object.values(sk.params(1))[i]));
  }
  for (const m of Object.values(MONSTERS)) {
    assert.ok(m.gold[0] <= m.gold[1]);
    for (const l of m.loot) assert.ok(ITEMS[l.itemId] && l.chance > 0 && l.chance <= 1, `${m.code}:${l.itemId}`);
  }
});
