import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldHarness, advance, advanceUntil, place, uid, launchWheatCaravan, C2S, S2C } from '../helpers/harness.js';
import { BALANCE } from '../../shared/data/balance.js';
import { caravanReward } from '../../shared/economy.js';

let h;
let game;
before(async () => {
  h = createWorldHarness({ seed: 11, relaxed: true, noMonsters: true });
  game = await h.newGame();
});
after(() => h.close());

const dbCaravan = async (id) => (await h.tdb.db.query('SELECT status, reward_paid, hp, progress FROM caravans WHERE id = $1', [id])).rows[0];
const near = (p, c, dx = 1.2) => place(p, c.x + dx, c.y);

test('تاجر يشتري بضاعة ويطلق قافلة: تُخصم الرسوم وتُربط الحمولة بالقافلة وتُحفظ في القاعدة', async () => {
  const t = await h.spawn(game, 'trader');
  const goldBefore = t.p.gold;
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  assert.equal(c.status, 'preparing');
  assert.deepEqual(c.cargo, { wheat: 24 });
  assert.equal(t.p.items.get('wheat'), undefined, 'خرجت الحمولة من مخزون التاجر');
  const row = await dbCaravan(id);
  assert.equal(row.status, 'preparing');
  const cargo = (await h.tdb.db.query('SELECT item_id, qty FROM caravan_cargo WHERE caravan_id = $1', [id])).rows;
  assert.deepEqual(cargo, [{ item_id: 'wheat', qty: 24 }]);
  assert.equal(t.p.gold, goldBefore + 600 - 24 * 7 - BALANCE.caravanFee);
  // لقطة التاجر تتضمن قافلته وتفاصيل الحمولة (للمالك)
  await advance(game, 0.3);
  const snap = t.conn.last(S2C.SNAPSHOT).caravans.find((x) => x.id === id);
  assert.equal(snap.units, 24);
  assert.equal(snap.dest, 'dusk_city');
});

test('قافلة نشطة واحدة لكل تاجر، وتكرار طلب الإطلاق بنفس المفتاح لا يخصم مرتين', async () => {
  const t = await h.spawn(game, 'trader');
  await h.repo.grant(t.p.id, 600, {}, 'fund', uid('f'));
  await game.refreshPlayer(t.p);
  place(t.p, 15.5, 17.5);
  await t.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 40, idem: uid('b') });
  place(t.p, 19.5, 22.5);
  const idem = uid('launch');
  const a = await t.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 10 }, idem });
  assert.equal(a.ok, true);
  const gold = t.p.gold;
  const dup = await t.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 10 }, idem });
  assert.equal(dup.error, 'ACTIVE_CARAVAN_EXISTS'); // الفحص السريع في الذاكرة
  const other = await t.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 10 }, idem: uid('launch') });
  assert.equal(other.error, 'ACTIVE_CARAVAN_EXISTS');
  assert.equal(t.p.gold, gold);
  assert.equal((await h.tdb.db.query('SELECT count(*)::int n FROM caravans WHERE owner_id = $1', [t.p.id])).rows[0].n, 1);
});

test('قيود الإطلاق: مهنة، حمولة، سعة، وجهة، بعد عن المشرف', async () => {
  const thief = await h.spawn(game, 'thief');
  place(thief.p, 19.5, 22.5);
  const base = { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 1 }, idem: uid('l') };
  assert.equal((await thief.conn.send(C2S.LAUNCH, base)).error, 'WRONG_PROFESSION');
  const t = await h.spawn(game, 'trader');
  await h.repo.grant(t.p.id, 900, {}, 'fund', uid('f'));
  await game.refreshPlayer(t.p);
  place(t.p, 15.5, 17.5);
  await t.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 30, idem: uid('b') });
  place(t.p, 19.5, 22.5);
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, cargo: { wheat: 25 }, idem: uid('l') })).error, 'CARGO_TOO_LARGE');
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, cargo: { wheat: 31 }, idem: uid('l') })).error, 'INSUFFICIENT_ITEMS');
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, cargo: { iron_sword: 1 }, idem: uid('l') })).error, 'UNKNOWN_ITEM');
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, destCity: 'dawn_city', idem: uid('l') })).error, 'INVALID');
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, destCity: 'atlantis', idem: uid('l') })).error, 'INVALID');
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, cargo: {}, idem: uid('l') })).error, 'INVALID');
  place(t.p, 5, 5);
  assert.equal((await t.conn.send(C2S.LAUNCH, { ...base, idem: uid('l') })).error, 'NOT_NEAR_NPC');
  const poor = await h.spawn(game, 'trader');
  place(poor.p, 15.5, 17.5);
  await poor.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 13, idem: uid('b') }); // يستهلك الذهب
  place(poor.p, 19.5, 22.5);
  assert.equal((await poor.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 13 }, idem: uid('l') })).error, 'INSUFFICIENT_GOLD');
});

test('القافلة أبطأ من اللاعب، تتحرك على المسار، ثم تصل وتُصرف المكافأة مرة واحدة فقط', async () => {
  const t = await h.spawn(game, 'trader');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  assert.ok(BALANCE.caravanSpeed < BALANCE.playerSpeed);
  await advance(game, BALANCE.caravanPrepareSec + 1);
  assert.equal(c.status, 'traveling');
  const p0 = c.progress;
  await advance(game, 5);
  assert.ok(Math.abs(c.progress - p0 - 5 * BALANCE.caravanSpeed) < 0.2, 'سرعة ثابتة');
  const goldBefore = await h.repo.getGold(t.p.id);
  const xpBefore = t.p.xp + (t.p.level - 1) * 1000;
  const expected = caravanReward('dusk_city', { wheat: 24 }).total;
  const done = await advanceUntil(game, () => !game.caravans.caravans.has(id), 200);
  assert.ok(done, 'وصلت القافلة');
  const row = await dbCaravan(id);
  assert.equal(row.status, 'arrived');
  assert.equal(row.reward_paid, true);
  assert.equal(await h.repo.getGold(t.p.id), goldBefore + expected, 'المكافأة = قيمة البضاعة + الربح');
  assert.equal(t.p.gold, goldBefore + expected, 'ذاكرة الخادم متزامنة');
  const txs = (await h.tdb.db.query("SELECT count(*)::int n FROM transactions WHERE caravan_id = $1 AND kind = 'caravan_reward'", [id])).rows[0].n;
  assert.equal(txs, 1);
  assert.ok(t.p.repTrade >= BALANCE.arrivalRepTrade);
  assert.ok(t.p.xp + (t.p.level - 1) * 1000 > xpBefore, 'اكتسب خبرة');
  assert.equal(t.p.quests.get('q_first_delivery')?.status, 'completed');
  assert.equal(t.conn.gameEvents('caravan').some((e) => e.code === 'arrived'), true);
  // بعد الوصول يمكن إطلاق قافلة جديدة
  place(t.p, 15.5, 17.5);
  await t.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 5, idem: uid('b') });
  place(t.p, 19.5, 22.5);
  assert.equal((await t.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 5 }, idem: uid('l') })).ok, true);
  // مسار الربح: لا يمكن صرف المكافأة ثانية عبر القاعدة
  const again = await h.repo.settleCaravan(id, 9999, 5, null);
  assert.equal(again.error, 'CARAVAN_NOT_ACTIVE');
  assert.equal(await h.repo.getGold(t.p.id) < goldBefore + expected + 9999, true);
});

test('منع سرقة القافلة داخل المدينة الآمنة: النهب والهجوم يُرفضان عند المحطة', async () => {
  const t = await h.spawn(game, 'trader');
  const th = await h.spawn(game, 'thief');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  await advance(game, BALANCE.caravanPrepareSec + 1);
  assert.ok(c.x < 21, 'ما زالت داخل المدينة');
  near(th.p, c);
  const r = await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id });
  assert.equal(r.error, 'SAFE_ZONE');
  const a = await th.conn.send(C2S.ATTACK, { targetType: 'caravan', targetId: id });
  assert.equal(a.error, 'SAFE_ZONE');
  assert.deepEqual(c.cargo, { wheat: 24 });
  assert.equal(c.hp, c.maxHp);
  // اللص في مدينة والقافلة خارجها: مرفوض أيضًا
  await advanceUntil(game, () => c.x > 30, 120);
  place(th.p, 10, 25);
  assert.equal((await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id })).error, 'OUT_OF_RANGE');
});

test('نهب القافلة: ينقل جزءًا من الحمولة للص بذرّية، مع cooldown وحد أقصى 60%، ومكافأة أقل للتاجر', async () => {
  const t = await h.spawn(game, 'trader');
  const th = await h.spawn(game, 'thief');
  const hunter = await h.spawn(game, 'hunter');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  await advanceUntil(game, () => c.x > 30 && c.x < 60, 200);
  near(th.p, c);
  near(hunter.p, c, -1);
  near(t.p, c, 0.5);
  // مهنة خاطئة
  assert.equal((await hunter.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id })).error, 'WRONG_PROFESSION');
  assert.equal((await t.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id })).error, 'WRONG_PROFESSION');
  // نهب ناجح
  const rep0 = th.p.repBlack;
  const r1 = await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id });
  assert.equal(r1.ok, true);
  assert.equal(r1.items.wheat, Math.floor(24 * BALANCE.plunderPct));
  assert.equal(c.cargo.wheat, 24 - r1.items.wheat);
  assert.equal(th.p.items.get('wheat').qty, r1.items.wheat);
  assert.equal((await h.tdb.db.query('SELECT qty FROM caravan_cargo WHERE caravan_id = $1', [id])).rows[0].qty, c.cargo.wheat);
  assert.equal(th.p.repBlack, rep0 + BALANCE.plunderRepBlack);
  assert.equal(c.status, 'under_attack');
  assert.ok(th.p.hostileUntil > game.t, 'اللص معادٍ الآن');
  assert.ok(t.conn.gameEvents('caravan').some((e) => e.code === 'plundered'), 'المالك يُبلَّغ');
  // cooldown
  assert.equal((await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id })).error, 'COOLDOWN');
  // استمرار النهب حتى الحد الأقصى
  let total = r1.units;
  for (let i = 0; i < 12; i++) {
    await advance(game, 10.5);
    near(th.p, c);
    const r = await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id });
    if (!r.ok) {
      assert.ok(['CARGO_EMPTY', 'SAFE_ZONE'].includes(r.error), r.error);
      break;
    }
    total += r.units;
  }
  assert.ok(total <= Math.floor(24 * BALANCE.maxPlunderFraction), `المنهوب ${total} ≤ 60%`);
  assert.ok(total >= 6, 'نُهب جزء معتبر');
  // الوصول: مكافأة التاجر على ما تبقّى فقط
  const goldBefore = await h.repo.getGold(t.p.id);
  const remaining = { ...c.cargo };
  place(th.p, 10, 10);
  assert.ok(await advanceUntil(game, () => !game.caravans.caravans.has(id), 250));
  const expected = caravanReward('dusk_city', remaining).total;
  assert.equal((await h.repo.getGold(t.p.id)) - goldBefore, expected);
  assert.ok(expected < caravanReward('dusk_city', { wheat: 24 }).total);
  // دفتر اللص: مسجَّلة عملية النهب
  const tx = (await h.tdb.db.query("SELECT count(*)::int n FROM transactions WHERE character_id = $1 AND kind = 'plunder'", [th.p.id])).rows[0].n;
  assert.ok(tx >= 2);
});

test('درع القافلة يقلّل ما يُنهب، وإصلاح ميداني يرمّم الصحة', async () => {
  const t = await h.spawn(game, 'trader');
  const th = await h.spawn(game, 'thief');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  await advanceUntil(game, () => c.x > 30 && c.x < 60, 200);
  near(t.p, c, 0.5);
  near(th.p, c);
  assert.equal((await t.conn.send(C2S.SKILL, { skillId: 'caravan_shield' })).ok, true);
  assert.ok(c.shieldUntil > game.t);
  assert.equal((await t.conn.send(C2S.SKILL, { skillId: 'caravan_shield' })).error, 'COOLDOWN');
  const r = await th.conn.send(C2S.SKILL, { skillId: 'plunder', targetType: 'caravan', targetId: id });
  assert.equal(r.items.wheat, Math.floor(24 * BALANCE.plunderPct * BALANCE.shieldPlunderMul));
  c.hp = 40;
  assert.equal((await t.conn.send(C2S.SKILL, { skillId: 'field_repair' })).ok, true);
  assert.equal(c.hp, 40 + Math.round(c.maxHp * 0.2));
  place(t.p, 10, 10);
  await advance(game, 0.1);
  assert.equal((await t.conn.send(C2S.SKILL, { skillId: 'field_repair' })).error, 'COOLDOWN');
});

test('تدمير القافلة بالهجوم: تفشل، ويحصل اللص على نصف الحمولة، ويمكن للتاجر الإطلاق مجددًا', async () => {
  const t = await h.spawn(game, 'trader');
  const th = await h.spawn(game, 'thief');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  await advanceUntil(game, () => c.x > 30 && c.x < 60, 200);
  for (let i = 0; i < 40 && game.caravans.caravans.has(id); i++) {
    near(th.p, c, 0.8);
    await th.conn.send(C2S.ATTACK, { targetType: 'caravan', targetId: id });
    await advance(game, 0.9, 0.1);
  }
  assert.ok(!game.caravans.caravans.has(id), 'دُمّرت');
  const row = await dbCaravan(id);
  assert.equal(row.status, 'failed');
  assert.equal(row.reward_paid, false);
  assert.equal(th.p.items.get('wheat').qty, 12, 'نصف الحمولة');
  assert.ok(t.conn.gameEvents('caravan').some((e) => e.code === 'destroyed'));
  assert.equal((await h.repo.settleCaravan(id, 100, 1, null)).error, 'CARAVAN_NOT_ACTIVE', 'لا مكافأة لقافلة فاشلة');
  place(t.p, 15.5, 17.5);
  await t.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 3, idem: uid('b') });
  place(t.p, 19.5, 22.5);
  assert.equal((await t.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 3 }, idem: uid('l') })).ok, true);
});

test('الصياد: لا يستطيع مهاجمة الأبرياء، ويقضي على اللص المعادي ويأخذ المكافأة مرة واحدة (قفل ضد التكرار)', async () => {
  const hunter = await h.spawn(game, 'hunter');
  const trader = await h.spawn(game, 'trader');
  const th = await h.spawn(game, 'thief');
  const victim = await h.spawn(game, 'trader');
  const car = await launchWheatCaravan(h, game, victim);
  const c = game.caravans.get(car);
  await advanceUntil(game, () => c.x > 30 && c.x < 55, 200);
  place(hunter.p, c.x - 3, c.y);
  place(trader.p, c.x - 4, c.y);
  place(th.p, c.x + 1, c.y);
  // لص بريء: لم يعتدِ بعد
  assert.equal((await hunter.conn.send(C2S.ATTACK, { targetType: 'player', targetId: th.p.id })).error, 'INNOCENT_TARGET');
  assert.equal((await hunter.conn.send(C2S.ATTACK, { targetType: 'player', targetId: trader.p.id })).error, 'INNOCENT_TARGET');
  place(trader.p, th.p.x - 1, th.p.y);
  assert.equal((await trader.conn.send(C2S.ATTACK, { targetType: 'player', targetId: th.p.id })).error, 'INNOCENT_TARGET');
  place(trader.p, c.x - 4, c.y);
  place(th.p, hunter.p.x + 1, hunter.p.y);
  assert.equal((await th.conn.send(C2S.ATTACK, { targetType: 'player', targetId: hunter.p.id })).ok, true); // اللص يبدأ العدوان
  assert.equal(th.p.hostileUntil > game.t, true);
  // اللص خفي إلا عند الفعل: الآن مكشوف
  await advance(game, 0.2);
  assert.ok(hunter.conn.last(S2C.SNAPSHOT).players.some((p) => p.id === th.p.id && p.hostile));
  const gold0 = await h.repo.getGold(hunter.p.id);
  th.p.hp = 5;
  place(hunter.p, th.p.x - 3, th.p.y);
  await advance(game, 1.3);
  const r = await hunter.conn.send(C2S.ATTACK, { targetType: 'player', targetId: th.p.id });
  assert.equal(r.ok, true);
  assert.equal(r.killed, true);
  await game.idle();
  const bounty = BALANCE.bountyBase + th.p.level * BALANCE.bountyPerLevel;
  assert.equal((await h.repo.getGold(hunter.p.id)) - gold0, bounty);
  assert.ok(hunter.p.repTrade >= BALANCE.bountyRep);
  assert.equal(th.p.dead, true);
  // اللص يعود في مدينة آمنة بعد الموت
  await advance(game, BALANCE.respawnSec + 1);
  assert.equal(th.p.dead, false);
  assert.ok(th.p.x < 22 || th.p.x > 73, `عاد لنقطة آمنة x=${th.p.x}`);
  assert.ok(th.p.hp >= Math.ceil(th.p.maxHp * BALANCE.respawnHpPct) && th.p.hp < th.p.maxHp, `hp=${th.p.hp}`); // يبدأ بنصف الصحة ثم يتجدد ببطء داخل المدينة
  // لا مكافأة مضاعفة لنفس اللص خلال القفل
  place(hunter.p, c.x - 3, c.y);
  place(th.p, hunter.p.x + 1, hunter.p.y);
  hunter.p.atkReadyAt = 0;
  th.p.atkReadyAt = 0;
  await th.conn.send(C2S.ATTACK, { targetType: 'player', targetId: hunter.p.id });
  th.p.hp = 5;
  const gold1 = await h.repo.getGold(hunter.p.id);
  const r2 = await hunter.conn.send(C2S.ATTACK, { targetType: 'player', targetId: th.p.id });
  assert.equal(r2.killed, true);
  await game.idle();
  assert.equal(await h.repo.getGold(hunter.p.id), gold1, 'لا مكافأة ثانية خلال القفل');
});

test('لا قتال بين اللاعبين داخل المدن الآمنة حتى لو كان اللص معاديًا', async () => {
  const hunter = await h.spawn(game, 'hunter');
  const th = await h.spawn(game, 'thief');
  place(hunter.p, 10, 25);
  place(th.p, 12, 25);
  th.p.hostileUntil = game.t + 100;
  th.p.repBlack = 500;
  assert.equal((await hunter.conn.send(C2S.ATTACK, { targetType: 'player', targetId: th.p.id })).error, 'SAFE_ZONE');
  assert.equal((await th.conn.send(C2S.ATTACK, { targetType: 'player', targetId: hunter.p.id })).error, 'SAFE_ZONE');
  assert.equal(hunter.p.hp, hunter.p.maxHp);
  assert.equal(th.p.hp, th.p.maxHp);
});

test('مرافقة الحارس: مكافأة عند الوصول مرة واحدة للمرافق القريب فقط', async () => {
  const t = await h.spawn(game, 'trader');
  const near1 = await h.spawn(game, 'hunter');
  const far1 = await h.spawn(game, 'hunter');
  const id = await launchWheatCaravan(h, game, t);
  const c = game.caravans.get(id);
  await advance(game, BALANCE.caravanPrepareSec + 1);
  place(near1.p, c.x, c.y + 1);
  place(far1.p, c.x, c.y + 1);
  assert.equal((await near1.conn.send(C2S.ESCORT, { caravanId: id })).ok, true);
  assert.equal((await far1.conn.send(C2S.ESCORT, { caravanId: id })).ok, true);
  assert.equal((await t.conn.send(C2S.ESCORT, { caravanId: id })).error, 'WRONG_PROFESSION');
  place(far1.p, 50, 5); // ابتعد
  const g0 = await h.repo.getGold(near1.p.id);
  const g1 = await h.repo.getGold(far1.p.id);
  // المرافق يتبع القافلة
  assert.ok(await advanceUntil(game, () => {
    if (game.caravans.caravans.has(id)) place(near1.p, c.x - 1, c.y);
    return !game.caravans.caravans.has(id);
  }, 250));
  const total = caravanReward('dusk_city', { wheat: 24 }).total;
  assert.equal((await h.repo.getGold(near1.p.id)) - g0, Math.max(BALANCE.escortMin, Math.floor(total * BALANCE.escortRewardPct)));
  assert.equal(await h.repo.getGold(far1.p.id), g1, 'البعيد لا يحصل على شيء');
  assert.equal((await h.tdb.db.query("SELECT count(*)::int n FROM transactions WHERE character_id = $1 AND kind = 'escort_reward'", [near1.p.id])).rows[0].n, 1);
});
