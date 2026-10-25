import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDamage, inRange } from '../../server/src/game/combat/combat.js';
import { canAttackPlayer, canAttackCaravan, pvpKillReward } from '../../server/src/game/professions/relations.js';
import { getDefaultWorld } from '../../shared/maps/world.js';
import { BALANCE } from '../../shared/data/balance.js';

const world = getDefaultWorld();
const mk = (id, profession, o = {}) => ({ id, profession, x: 45, y: 25, dead: false, hostileUntil: 0, repBlack: 0, level: 5, bountyLockedUntil: 0, ...o });
const mid = (rng = () => 0.5) => rng;

test('حساب الضرر: يزداد مع الهجوم ويتناقص مع الدفاع ولا يقل عن 1', () => {
  const r = () => 0.5; // تقلب 1.0
  assert.equal(computeDamage(10, 0, { rng: r }), 10);
  assert.equal(computeDamage(10, 30, { rng: r }), 5);
  assert.ok(computeDamage(20, 5, { rng: r }) > computeDamage(10, 5, { rng: r }));
  assert.ok(computeDamage(10, 5, { rng: r }) > computeDamage(10, 15, { rng: r }));
  assert.equal(computeDamage(1, 1000, { rng: r }), 1);
  assert.equal(computeDamage(0, 0, { rng: r }), 1);
  assert.equal(computeDamage(10, 0, { mul: 2, rng: r }), 20);
  assert.equal(computeDamage(10, 0, { takenMul: 1.2, rng: r }), 12);
});

test('حساب الضرر: التقلب ضمن ±10% وقيم غير صالحة ترمي خطأ', () => {
  assert.equal(computeDamage(100, 0, { rng: () => 0 }), 90);
  assert.equal(computeDamage(100, 0, { rng: () => 0.999999 }), 110);
  assert.throws(() => computeDamage(-1, 0));
  assert.throws(() => computeDamage(10, NaN));
});

test('المدى مع هامش التسامح', () => {
  assert.equal(inRange({ x: 0, y: 0 }, { x: 2, y: 0 }, 1.8), true);
  assert.equal(inRange({ x: 0, y: 0 }, { x: 3, y: 0 }, 1.8), false);
});

test('الصياد: يهاجم لصًّا معاديًا أو مطلوبًا فقط، ولا يهاجم الأبرياء', () => {
  const h = mk(1, 'hunter');
  assert.equal(canAttackPlayer(h, mk(2, 'thief'), 0, world).error, 'INNOCENT_TARGET'); // لص بريء (لم يعتدِ)
  assert.equal(canAttackPlayer(h, mk(2, 'thief', { hostileUntil: 100 }), 10, world).ok, true);
  assert.equal(canAttackPlayer(h, mk(2, 'thief', { repBlack: BALANCE.wantedRep }), 10, world).ok, true);
  assert.equal(canAttackPlayer(h, mk(2, 'thief', { hostileUntil: 5 }), 10, world).error, 'INNOCENT_TARGET'); // انتهت العلامة
  assert.equal(canAttackPlayer(h, mk(3, 'trader'), 0, world).error, 'INNOCENT_TARGET');
  assert.equal(canAttackPlayer(h, mk(4, 'hunter'), 0, world).error, 'INNOCENT_TARGET');
  assert.equal(canAttackPlayer(h, mk(3, 'trader', { hostileUntil: 100 }), 10, world).error, 'INNOCENT_TARGET'); // العداء يخص اللصوص
});

test('التاجر: يرد فقط على المعتدي المعادي', () => {
  const t = mk(1, 'trader');
  assert.equal(canAttackPlayer(t, mk(2, 'thief'), 0, world).error, 'INNOCENT_TARGET');
  assert.equal(canAttackPlayer(t, mk(2, 'thief', { hostileUntil: 50 }), 0, world).ok, true);
  assert.equal(canAttackPlayer(t, mk(3, 'hunter'), 0, world).error, 'INNOCENT_TARGET');
});

test('اللص: يبدأ العدوان على غير اللصوص (فيُعلَّم)، ولا يهاجم لصًّا آخر', () => {
  const th = mk(1, 'thief');
  const r1 = canAttackPlayer(th, mk(2, 'trader'), 0, world);
  assert.deepEqual(r1, { ok: true, aggression: true });
  assert.equal(canAttackPlayer(th, mk(3, 'hunter'), 0, world).aggression, true);
  assert.equal(canAttackPlayer(th, mk(4, 'thief'), 0, world).error, 'FRIENDLY');
});

test('لا قتال بين اللاعبين في المدن الآمنة مهما كانت المهنة', () => {
  for (const [a, b] of [['thief', 'trader'], ['hunter', 'thief'], ['trader', 'thief']]) {
    const att = mk(1, a, { x: 5 });
    const tgt = mk(2, b, { x: 6, hostileUntil: 999, repBlack: 100 });
    assert.equal(canAttackPlayer(att, tgt, 0, world).error, 'SAFE_ZONE', `${a}→${b}`);
    // المهاجم في الخارج والهدف في المدينة، والعكس
    assert.equal(canAttackPlayer(mk(1, a, { x: 45 }), tgt, 0, world).error, 'SAFE_ZONE');
    assert.equal(canAttackPlayer(att, mk(2, b, { x: 45, hostileUntil: 999 }), 0, world).error, 'SAFE_ZONE');
  }
});

test('الميت لا يهاجم ولا يُهاجَم، ولا هجوم على النفس', () => {
  assert.equal(canAttackPlayer(mk(1, 'thief', { dead: true }), mk(2, 'trader'), 0, world).error, 'DEAD');
  assert.equal(canAttackPlayer(mk(1, 'thief'), mk(2, 'trader', { dead: true }), 0, world).error, 'INVALID');
  const a = mk(1, 'thief');
  assert.equal(canAttackPlayer(a, a, 0, world).error, 'INVALID');
});

test('هجوم القوافل: للص فقط، خارج المدن، على قافلة نشطة ليست ملكه', () => {
  const car = { status: 'traveling', ownerId: 9, x: 45, y: 25 };
  assert.equal(canAttackCaravan(mk(1, 'thief'), car, world).ok, true);
  assert.equal(canAttackCaravan(mk(1, 'hunter'), car, world).error, 'WRONG_PROFESSION');
  assert.equal(canAttackCaravan(mk(1, 'trader'), car, world).error, 'WRONG_PROFESSION');
  assert.equal(canAttackCaravan(mk(1, 'thief'), { ...car, x: 10 }, world).error, 'SAFE_ZONE');
  assert.equal(canAttackCaravan(mk(1, 'thief', { x: 10 }), car, world).error, 'SAFE_ZONE');
  assert.equal(canAttackCaravan(mk(1, 'thief'), { ...car, status: 'preparing' }, world).error, 'CARAVAN_NOT_ACTIVE');
  assert.equal(canAttackCaravan(mk(1, 'thief'), { ...car, status: 'arrived' }, world).error, 'CARAVAN_NOT_ACTIVE');
  assert.equal(canAttackCaravan(mk(9, 'thief'), car, world).error, 'INVALID');
});

test('مكافآت القتل: مكافأة الصياد للصوص المستحقين فقط وبقفل ضد التكرار', () => {
  const hunter = mk(1, 'hunter');
  const thief = mk(2, 'thief', { level: 10 });
  const r = pvpKillReward(hunter, thief, 100, true);
  assert.equal(r.kind, 'bounty');
  assert.equal(r.gold, BALANCE.bountyBase + 10 * BALANCE.bountyPerLevel);
  assert.equal(pvpKillReward(hunter, thief, 100, false).kind, 'none'); // لص بريء → لا مكافأة
  assert.equal(pvpKillReward(hunter, { ...thief, bountyLockedUntil: 200 }, 100, true).kind, 'none'); // تكرار قتل نفس اللص
  assert.equal(pvpKillReward(mk(3, 'trader'), thief, 100, true).gold, 0); // التاجر لا يحصل على ذهب
  assert.equal(pvpKillReward(mk(3, 'thief'), mk(4, 'trader'), 0, false).repField, 'black');
});
