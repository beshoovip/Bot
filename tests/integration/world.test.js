import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldHarness, advance, advanceUntil, place, uid, launchWheatCaravan, FakeConn, C2S, S2C } from '../helpers/harness.js';
import { BALANCE } from '../../shared/data/balance.js';
import { MONSTERS } from '../../shared/data/monsters.js';
import { caravanReward } from '../../shared/economy.js';

let h;
let game;
before(async () => {
  h = createWorldHarness({ seed: 5, relaxed: true });
  game = await h.newGame();
});
after(() => h.close());

const monsterOf = (code) => [...game.monsters.monsters.values()].find((m) => m.code === code && !m.dead);
const pin = (m, x, y) => {
  m.x = x;
  m.y = y;
  m.home = { x, y };
};

test('الوحوش: عدة أنواع بمستويات مختلفة موزعة على مناطق الخطر فقط', () => {
  const codes = new Set([...game.monsters.monsters.values()].map((m) => m.code));
  assert.ok(codes.size >= 5);
  for (const m of game.monsters.monsters.values()) assert.ok(m.x > 22 && m.x < 74, `وحش ${m.code} داخل مدينة`);
  assert.deepEqual([...codes].sort(), Object.keys(MONSTERS).sort());
});

test('قتل وحش: خبرة وذهب ومهمة وغنيمة قابلة للالتقاط مرة واحدة، والوحش يعاد ظهوره', async () => {
  const p = await h.spawn(game, 'thief');
  const m = monsterOf('wolf');
  pin(m, 30, 20);
  place(p.p, 30.8, 20);
  p.p.hp = p.p.maxHp = 10_000; // لا نختبر الموت هنا
  const gold0 = await h.repo.getGold(p.p.id);
  let kills = 0;
  for (let i = 0; i < 40 && !m.dead; i++) {
    const r = await p.conn.send(C2S.ATTACK, { targetType: 'monster', targetId: m.id });
    if (r.ok) assert.ok(r.damage >= 1);
    await advance(game, 0.85, 0.05);
  }
  assert.equal(m.dead, true);
  await game.idle();
  assert.ok(p.p.xp > 0 || p.p.level > 1, 'خبرة');
  assert.ok((await h.repo.getGold(p.p.id)) >= gold0 + MONSTERS.wolf.gold[0] && (await h.repo.getGold(p.p.id)) <= gold0 + MONSTERS.wolf.gold[1]);
  assert.equal(p.p.quests.get('q_wolves')?.progress, 1);
  assert.ok(p.conn.gameEvents('death').some((e) => e.targetType === 'monster'));
  // غنائم: قد لا تسقط في هذه المحاولة؛ نختبر آلية الالتقاط بإسقاط مضمون
  const id = game.nextDropId++;
  game.drops.set(id, { id, x: 30, y: 20, items: { pelt: 2, health_potion: 1 }, ownerId: p.p.id, ownerUntil: game.t + 10, expiresAt: game.t + 90 });
  const other = await h.spawn(game, 'hunter');
  place(other.p, 30, 20);
  assert.equal((await other.conn.send(C2S.PICKUP, { dropId: id })).error, 'UNAUTHORIZED', 'الغنيمة محجوزة لصاحبها');
  place(p.p, 35, 20);
  assert.equal((await p.conn.send(C2S.PICKUP, { dropId: id })).error, 'OUT_OF_RANGE');
  place(p.p, 30.5, 20);
  const [a, b] = await Promise.all([p.conn.send(C2S.PICKUP, { dropId: id }), p.conn.send(C2S.PICKUP, { dropId: id })]);
  assert.equal([a, b].filter((r) => r.ok).length, 1, 'تُلتقط مرة واحدة فقط');
  assert.equal(p.p.items.get('pelt').qty, 2);
  // إعادة الظهور
  await advance(game, MONSTERS.wolf.respawnSec + 1);
  assert.equal(m.dead, false);
  assert.equal(m.hp, m.maxHp);
});

test('سلوك الوحش: مطاردة، هجوم، ثم عودة إلى نقطة الظهور وشفاء عند ابتعاد اللاعب', async () => {
  const p = await h.spawn(game, 'trader');
  const m = monsterOf('boar');
  pin(m, 36, 12);
  place(p.p, 36 + m.def.aggro - 1, 12);
  p.p.hp = p.p.maxHp = 100_000;
  await advance(game, 0.3);
  assert.equal(m.state, 'chase');
  assert.equal(m.targetId, p.p.id);
  const d0 = Math.hypot(m.x - p.p.x, m.y - p.p.y);
  await advance(game, 2);
  assert.ok(Math.hypot(m.x - p.p.x, m.y - p.p.y) < d0, 'يقترب');
  await advance(game, 3);
  assert.ok(p.p.hp < 100_000, 'هاجم اللاعب');
  m.hp = 10;
  // اللاعب يهرب خارج مدى التحرر
  place(p.p, 36 + m.def.leash + 8, 12);
  assert.ok(await advanceUntil(game, () => m.state === 'idle' && m.hp === m.maxHp, 60, 0.25));
  assert.ok(Math.hypot(m.x - 36, m.y - 12) < 0.6, 'عاد لنقطته');
});

test('الموت والعودة: يموت اللاعب فيعود إلى المدينة الآمنة بنصف الصحة ويخسر جزءًا من الذهب فقط', async () => {
  const p = await h.spawn(game, 'hunter');
  await h.repo.grant(p.p.id, 900, {}, 'fund', uid('f')); // الرصيد 1000
  await game.refreshPlayer(p.p);
  const m = monsterOf('dust_scorpion');
  pin(m, 45, 30);
  place(p.p, 45.5, 30);
  p.p.hp = 5;
  await advanceUntil(game, () => p.p.dead, 20, 0.1);
  assert.equal(p.p.dead, true);
  assert.equal((await p.conn.send(C2S.ATTACK, { targetType: 'monster', targetId: m.id })).error, 'DEAD');
  assert.equal((await p.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 1, idem: uid('b') })).error, 'DEAD');
  await advance(game, 0.5);
  const gold = await h.repo.getGold(p.p.id);
  assert.equal(gold, 1000 - Math.floor(1000 * BALANCE.deathGoldPct));
  await advance(game, BALANCE.respawnSec + 1);
  assert.equal(p.p.dead, false);
  assert.ok(p.p.x < 22 || p.p.x > 73);
  assert.ok(p.p.hp >= Math.ceil(p.p.maxHp * BALANCE.respawnHpPct));
  assert.equal(m.state === 'chase' && m.targetId === p.p.id, false, 'الوحش تخلى عن الهدف');
  // الذهب لا يصبح سالبًا أبدًا مع فقير
  const poor = await h.spawn(game, 'trader');
  assert.equal((await h.repo.penalty(poor.p.id, 1, null, 'death_penalty', uid('d'))).gold, 0);
  assert.equal((await h.repo.penalty(poor.p.id, 0.5, null, 'death_penalty', uid('d'))).taken, 0);
});

test('التطور: مستويات، نقاط مهارة، ترقية مهارة، وزيادة الإحصاءات', async () => {
  const p = await h.spawn(game, 'hunter');
  const atk0 = p.p.atk;
  const hp0 = p.p.maxHp;
  game.awardXp(p.p, 60);
  assert.equal(p.p.level, 2);
  assert.equal(p.p.skillPoints, 1);
  assert.ok(p.p.atk > atk0 && p.p.maxHp > hp0);
  assert.equal(p.p.hp, p.p.maxHp);
  assert.ok(p.conn.gameEvents('levelup').some((e) => e.level === 2));
  assert.equal((await p.conn.send(C2S.SKILL_UPGRADE, { skillId: 'power_shot' })).level, 2);
  assert.equal((await p.conn.send(C2S.SKILL_UPGRADE, { skillId: 'power_shot' })).error, 'NO_SKILL_POINTS');
  assert.equal((await p.conn.send(C2S.SKILL_UPGRADE, { skillId: 'plunder' })).error, 'WRONG_PROFESSION');
  game.awardXp(p.p, 5_000_000);
  assert.equal(p.p.level, BALANCE.maxLevel);
  p.p.skills.power_shot = 3;
  assert.equal((await p.conn.send(C2S.SKILL_UPGRADE, { skillId: 'power_shot' })).error, 'MAX_SKILL_LEVEL');
  await game.idle();
  const rec = await h.repo.loadCharacter(p.p.id);
  assert.equal(rec.level, BALANCE.maxLevel, 'المستوى محفوظ');
});

test('مهارات الصياد والفخ: طلقة قوية بمدى أبعد، تحديد الهدف، وفخ يشل اللص ولا يعمل في المدن', async () => {
  const hunter = await h.spawn(game, 'hunter');
  const thief = await h.spawn(game, 'thief');
  const m = monsterOf('wolf');
  pin(m, 40, 30);
  place(hunter.p, 45, 30);
  hunter.p.hp = hunter.p.maxHp = 100000;
  const basic = await hunter.conn.send(C2S.ATTACK, { targetType: 'monster', targetId: m.id });
  assert.equal(basic.ok, true);
  await advance(game, 0.2);
  const shot = await hunter.conn.send(C2S.SKILL, { skillId: 'power_shot', targetType: 'monster', targetId: m.id });
  assert.equal(shot.ok, true);
  assert.ok(shot.damage > basic.damage * 1.3, 'ضرر مضاعف تقريبًا');
  assert.equal((await hunter.conn.send(C2S.SKILL, { skillId: 'power_shot', targetType: 'monster', targetId: m.id })).error, 'COOLDOWN');
  // وسم لص بريء مرفوض؛ بعد عدائه مسموح
  place(thief.p, 50, 30);
  assert.equal((await hunter.conn.send(C2S.SKILL, { skillId: 'mark_target', targetType: 'player', targetId: thief.p.id })).error, 'INNOCENT_TARGET');
  game.markHostile(thief.p);
  assert.equal((await hunter.conn.send(C2S.SKILL, { skillId: 'mark_target', targetType: 'player', targetId: thief.p.id })).ok, true);
  assert.ok(thief.p.markedUntil > game.t);
  // فخ اللص
  place(thief.p, 61, 22.2); // على الطريق الرئيسي (خالٍ من الأشجار)
  assert.equal((await thief.conn.send(C2S.SKILL, { skillId: 'snare_trap', x: 62, y: 22.2 })).ok, true);
  assert.equal(game.traps.length, 1);
  assert.equal((await thief.conn.send(C2S.SKILL, { skillId: 'snare_trap', x: 62, y: 22.2 })).error, 'COOLDOWN');
  place(hunter.p, 62, 22.2);
  await advance(game, 0.2);
  assert.ok(hunter.p.rootedUntil > game.t, 'الصياد مشلول');
  await hunter.conn.send(C2S.INPUT, { seq: 1, dir: 0 });
  const x0 = hunter.p.x;
  await advance(game, 1);
  assert.equal(hunter.p.x, x0, 'لا يتحرك وهو مشلول');
  await advance(game, 3);
  assert.ok(hunter.p.x > x0, 'يتحرك بعد زوال الشلل');
  assert.equal(game.traps.length, 0);
  // لا فخاخ في المدينة
  place(thief.p, 10, 25);
  thief.p.skillReadyAt.clear();
  assert.equal((await thief.conn.send(C2S.SKILL, { skillId: 'snare_trap', x: 10, y: 25 })).error, 'SAFE_ZONE');
});

test('التخفي: اللص مخفي عن الآخرين إلا عن قرب أو بعد الفعل، والصياد يكتشفه ضمن نطاق أكبر', async () => {
  const thief = await h.spawn(game, 'thief');
  const trader = await h.spawn(game, 'trader');
  const hunter = await h.spawn(game, 'hunter');
  place(thief.p, 60, 8);
  place(trader.p, 60 + BALANCE.thiefStealthRadius + 4, 8);
  place(hunter.p, 60 + BALANCE.thiefStealthRadius + 4, 9);
  thief.p.revealedUntil = 0;
  thief.p.hostileUntil = 0;
  await advance(game, 0.3);
  const sees = (c) => c.conn.last(S2C.SNAPSHOT).players.some((q) => q.id === thief.p.id);
  assert.equal(sees(trader), false, 'التاجر لا يراه');
  assert.equal(sees(hunter), true, 'الصياد يكتشفه ضمن نطاقه');
  place(hunter.p, 60 + BALANCE.hunterDetectRadius + 3, 9);
  await advance(game, 0.3);
  assert.equal(sees(hunter), false);
  place(trader.p, 62, 8);
  await advance(game, 0.3);
  assert.equal(sees(trader), true, 'يظهر عند الاقتراب');
  place(trader.p, 60 + BALANCE.thiefStealthRadius + 4, 8);
  game.markHostile(thief.p);
  await advance(game, 0.3);
  assert.equal(sees(trader), true, 'يظهر بعد الاعتداء');
});

test('التقدم يُحفظ بعد إعادة تشغيل الخادم: الشخصية والذهب والخبرة والموضع والعناصر', async () => {
  const g1 = await h.newGame();
  const p = await h.spawn(g1, 'trader');
  place(p.p, 15.5, 17.5);
  await p.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: 4, idem: uid('b') });
  g1.awardXp(p.p, 150);
  place(p.p, 40.25, 18.5);
  const snapshot = { gold: p.p.gold, level: p.p.level, xp: p.p.xp, wheat: p.p.items.get('wheat').qty };
  await g1.shutdown(); // إيقاف: يحفظ كل شيء
  g1.stopped = true;
  const g2 = await h.newGame(); // «إعادة التشغيل»
  assert.equal(g2.players.size, 0);
  const conn = new FakeConn(g2, p.acct.userId);
  assert.equal((await conn.send(C2S.JOIN, { characterId: p.acct.characterId })).ok, true);
  const q = conn.player;
  assert.equal(q.gold, snapshot.gold);
  assert.equal(q.level, snapshot.level);
  assert.equal(q.xp, snapshot.xp);
  assert.equal(q.items.get('wheat').qty, snapshot.wheat);
  assert.ok(Math.abs(q.x - 40.25) < 0.01 && Math.abs(q.y - 18.5) < 0.01);
  assert.ok(q.skillPoints >= 1);
  g2.disconnect(conn);
});

test('القافلة تنجو من إعادة تشغيل الخادم وتكمل رحلتها وتُصرف مكافأتها مرة واحدة', async () => {
  const g1 = await h.newGame();
  const t = await h.spawn(g1, 'trader');
  const id = await launchWheatCaravan(h, g1, t);
  const c1 = g1.caravans.get(id);
  await advanceUntil(g1, () => c1.progress > 20, 100);
  await g1.advanceSave?.();
  await g1.shutdown();
  const savedProgress = (await h.tdb.db.query('SELECT progress, status FROM caravans WHERE id = $1', [id])).rows[0];
  assert.ok(savedProgress.progress >= 15, `حُفظ التقدم ${savedProgress.progress}`);
  assert.equal(savedProgress.status, 'traveling');
  const g2 = await h.newGame();
  const c2 = g2.caravans.get(id);
  assert.ok(c2, 'استُعيدت القافلة');
  assert.deepEqual(c2.cargo, { wheat: 24 });
  assert.ok(Math.abs(c2.progress - savedProgress.progress) < 0.01);
  const gold0 = await h.repo.getGold(t.acct.characterId);
  assert.ok(await advanceUntil(g2, () => !g2.caravans.caravans.has(id), 120));
  assert.equal((await h.repo.getGold(t.acct.characterId)) - gold0, caravanReward('dusk_city', { wheat: 24 }).total);
  assert.equal((await h.tdb.db.query("SELECT count(*)::int n FROM transactions WHERE caravan_id = $1 AND kind = 'caravan_reward'", [id])).rows[0].n, 1);
});

test('نسختان من الخادم تتسابقان على تسوية القافلة نفسها: تُصرف المكافأة مرة واحدة فقط', async () => {
  const gA = await h.newGame();
  const t = await h.spawn(gA, 'trader');
  const id = await launchWheatCaravan(h, gA, t);
  await advanceUntil(gA, () => gA.caravans.get(id)?.progress > 5, 60);
  await gA.caravans.saveAll();
  const gB = await h.newGame(); // نسخة ثانية تحمّل نفس القافلة من القاعدة
  assert.ok(gB.caravans.get(id));
  const cA = gA.caravans.get(id);
  const cB = gB.caravans.get(id);
  cA.progress = cB.progress = cA.route.length - 0.1;
  const gold0 = await h.repo.getGold(t.acct.characterId);
  gA.tick(0.25);
  gB.tick(0.25);
  await Promise.all([gA.idle(), gB.idle()]);
  await advance(gA, 1);
  await advance(gB, 1);
  assert.equal((await h.repo.getGold(t.acct.characterId)) - gold0, caravanReward('dusk_city', { wheat: 24 }).total, 'دُفعت مرة واحدة');
  assert.equal((await h.tdb.db.query("SELECT count(*)::int n FROM transactions WHERE caravan_id = $1 AND kind = 'caravan_reward'", [id])).rows[0].n, 1);
  assert.equal((await h.tdb.db.query('SELECT reward_paid FROM caravans WHERE id = $1', [id])).rows[0].reward_paid, true);
});

test('المهام: يُصرف الجزاء مرة واحدة حتى مع إرسال الطلب مرتين بالتوازي', async () => {
  const p = await h.spawn(game, 'hunter');
  await h.repo.upsertQuestProgress(p.p.id, 'q_wolves', 5, 5);
  p.p.quests.set('q_wolves', { progress: 5, status: 'completed' });
  place(p.p, 15.5, 32.5);
  assert.equal((await p.conn.send(C2S.QUEST_CLAIM, { npcId: 'dawn_quests', code: 'q_boars' })).error, 'QUEST_NOT_DONE');
  const g0 = await h.repo.getGold(p.p.id);
  const [a, b] = await Promise.all([p.conn.send(C2S.QUEST_CLAIM, { npcId: 'dawn_quests', code: 'q_wolves' }), p.conn.send(C2S.QUEST_CLAIM, { npcId: 'dawn_quests', code: 'q_wolves' })]);
  const oks = [a, b].filter((r) => r.ok && !r.duplicate).length + [a, b].filter((r) => r.error === 'BUSY').length;
  assert.ok(oks >= 1);
  assert.equal((await h.repo.getGold(p.p.id)) - g0, 80);
  assert.equal((await p.conn.send(C2S.QUEST_CLAIM, { npcId: 'dawn_quests', code: 'q_wolves' })).error, 'QUEST_NOT_DONE');
  assert.equal((await h.repo.getGold(p.p.id)) - g0, 80);
});
