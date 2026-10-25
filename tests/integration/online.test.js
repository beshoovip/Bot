import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldHarness, advance, place, uid, C2S, S2C, FakeConn } from '../helpers/harness.js';
import { BALANCE } from '../../shared/data/balance.js';
import { ConnectionLimiter } from '../../server/src/security/rateLimiter.js';
import { RATE_LIMITS } from '../../shared/protocol.js';

let h;
let game;
before(async () => {
  h = createWorldHarness();
  game = await h.newGame();
});
after(() => h.close());

test('عميلان منفصلان يتصلان بنفس العالم ويرى كلٌّ منهما الآخر', async () => {
  const a = await h.spawn(game, 'trader', 'تاجر_أ');
  const b = await h.spawn(game, 'hunter', 'صياد_ب');
  place(a.p, 10, 20);
  place(b.p, 14, 20);
  await advance(game, 0.5);
  const sa = a.conn.last(S2C.SNAPSHOT);
  const sb = b.conn.last(S2C.SNAPSHOT);
  assert.ok(sa.players.some((p) => p.id === b.p.id && p.name === 'صياد_ب'), 'A يرى B');
  assert.ok(sb.players.some((p) => p.id === a.p.id && p.name === 'تاجر_أ'), 'B يرى A');
  assert.equal(a.conn.last(S2C.JOINED).self.profession, 'trader');
});

test('الحركة يتحكم بها الخادم: اتجاه فقط، بسرعة ثابتة، والعميل لا يستطيع إرسال موقع', async () => {
  const a = await h.spawn(game, 'trader');
  place(a.p, 10, 25);
  const x0 = a.p.x;
  assert.equal((await a.conn.send(C2S.INPUT, { seq: 1, dir: 0 })).ok, true);
  await advance(game, 1, 0.05);
  const moved = Math.hypot(a.p.x - x0, a.p.y - 25);
  assert.ok(Math.abs(moved - BALANCE.playerSpeed) < 0.3, `moved=${moved}`);
  // محاولة غش: إرسال موقع مباشر
  const r = await a.conn.send(C2S.INPUT, { seq: 2, dir: 0, x: 90, y: 25 });
  assert.equal(r.error, 'INVALID');
  // محاولات غش بقيم غير صالحة
  for (const bad of [{ seq: 3, dir: 99 }, { seq: 'x', dir: 1 }, { seq: 4, dir: 1.5 }, null, 'str']) {
    assert.equal((await a.conn.send(C2S.INPUT, bad)).error, 'INVALID');
  }
  assert.ok(a.p.x < 20);
  // رسالة قديمة (seq أقل) لا تغيّر الاتجاه
  await a.conn.send(C2S.INPUT, { seq: 10, dir: 4 });
  await a.conn.send(C2S.INPUT, { seq: 5, dir: 0 });
  assert.equal(a.p.dir, 4);
});

test('الحركة تحترم الجدران: لا يخرج من المدينة عبر الجدار', async () => {
  const a = await h.spawn(game, 'hunter');
  place(a.p, 10.5, 2.5);
  await a.conn.send(C2S.INPUT, { seq: 1, dir: 6 }); // شمال
  await advance(game, 3, 0.05);
  assert.ok(a.p.y >= 1.3 - 1e-6, `y=${a.p.y}`);
});

test('انقطاع الاتصال: يبقى اللاعب فترة سماح ثم يُحفظ ويُزال؛ وإعادة الاتصال قبل ذلك تستعيد نفس الكيان', async () => {
  const a = await h.spawn(game, 'trader');
  const b = await h.spawn(game, 'hunter');
  place(a.p, 10, 20);
  place(b.p, 12, 20);
  await advance(game, 0.3);
  assert.ok(b.conn.last(S2C.SNAPSHOT).players.some((p) => p.id === a.p.id));
  game.disconnect(a.conn);
  assert.equal(game.players.get(a.p.id).connected, false);
  await advance(game, BALANCE.disconnectGraceSec - 4);
  // إعادة اتصال داخل فترة السماح
  const conn2 = new FakeConn(game, a.acct.userId);
  assert.equal((await conn2.send(C2S.JOIN, { characterId: a.acct.characterId })).ok, true);
  assert.equal(game.players.get(a.p.id), a.p, 'نفس الكيان');
  assert.equal(game.players.get(a.p.id).connected, true);
  await advance(game, BALANCE.disconnectGraceSec + 2);
  assert.ok(game.players.has(a.p.id), 'لم يُزل لأنه أعاد الاتصال');
  // انقطاع ثانٍ وبقاء أطول من السماح
  game.disconnect(conn2);
  await advance(game, BALANCE.disconnectGraceSec + 2);
  assert.ok(!game.players.has(a.p.id), 'أُزيل بعد السماح');
  assert.ok(!b.conn.last(S2C.SNAPSHOT).players.some((p) => p.id === a.p.id), 'اختفى من لقطة الآخرين');
  // الحفظ: الموضع الأخير محفوظ في قاعدة البيانات
  const rec = await h.repo.loadCharacter(a.p.id);
  assert.ok(Math.abs(rec.x - 10) < 0.5 && Math.abs(rec.y - 20) < 0.5);
});

test('دخول من جهاز آخر يفصل الاتصال الأول', async () => {
  const a = await h.spawn(game, 'thief');
  const conn2 = new FakeConn(game, a.acct.userId);
  assert.equal((await conn2.send(C2S.JOIN, { characterId: a.acct.characterId })).ok, true);
  assert.equal(a.conn.closed, true);
  assert.ok(a.conn.errors().includes('DUPLICATE'));
  assert.equal(game.players.get(a.p.id).conn, conn2);
  // الاتصال القديم لم يعد يتحكم
  assert.equal((await a.conn.send(C2S.INPUT, { seq: 1, dir: 0 })).error, 'NOT_IN_WORLD');
});

test('لا يمكن الانضمام بشخصية حساب آخر، ولا بدون مصادقة', async () => {
  const a = await h.makeCharacter('trader');
  const other = await h.makeCharacter('hunter');
  const conn = new FakeConn(game, other.userId);
  assert.equal((await conn.send(C2S.JOIN, { characterId: a.characterId })).error, 'UNAUTHORIZED');
  const anon = new FakeConn(game, null);
  assert.equal((await anon.send(C2S.JOIN, { characterId: a.characterId })).error, 'UNAUTHORIZED');
  assert.equal((await conn.send(C2S.ATTACK, { targetType: 'monster', targetId: 1 })).error, 'NOT_IN_WORLD');
});

test('تحديد المعدل ورفض المدخلات: إغراق الهجوم يُرفض بـ RATE_LIMIT', async () => {
  const a = await h.spawn(game, 'hunter');
  const results = [];
  for (let i = 0; i < 40; i++) results.push((await a.conn.send(C2S.ATTACK, { targetType: 'monster', targetId: 999999 })).error);
  assert.ok(results.includes('RATE_LIMIT'), 'يجب تفعيل تحديد المعدل');
  assert.ok(results.filter((x) => x === 'RATE_LIMIT').length >= 25);
  assert.equal((await a.conn.send('hack:event', {})).error, 'INVALID');
  assert.equal((await a.conn.send('__proto__', {})).error, 'INVALID');
  const fresh = await h.spawn(game, 'hunter');
  assert.equal((await fresh.conn.send(C2S.ATTACK, { targetType: 'dragon', targetId: 1 })).error, 'INVALID');
  assert.equal((await fresh.conn.send(C2S.ATTACK, { targetType: 'monster', targetId: -5 })).error, 'INVALID');
});

test('الدردشة العامة: بث لجميع المتصلين مع تنظيف النص وحفظها في القاعدة وتحديد المعدل', async () => {
  const a = await h.spawn(game, 'trader', 'متحدث');
  const b = await h.spawn(game, 'thief', 'مستمع');
  assert.equal((await a.conn.send(C2S.CHAT, { text: '  مرحبا\u0000   بالجميع ‮ ' })).ok, true);
  const got = b.conn.last(S2C.CHAT);
  assert.equal(got.text, 'مرحبا بالجميع');
  assert.equal(got.name, 'متحدث');
  assert.equal((await a.conn.send(C2S.CHAT, { text: '   ' })).error, 'INVALID');
  assert.equal((await a.conn.send(C2S.CHAT, { text: 'x'.repeat(401) })).error, 'INVALID');
  let limited = false;
  for (let i = 0; i < 12; i++) if ((await a.conn.send(C2S.CHAT, { text: `spam ${i}` })).error === 'RATE_LIMIT') limited = true;
  assert.ok(limited, 'الدردشة محدودة المعدل');
  await game.idle();
  const saved = (await h.tdb.db.query("SELECT body FROM chat_messages WHERE author_name = 'متحدث'")).rows.map((r) => r.body);
  assert.ok(saved.includes('مرحبا بالجميع'));
});

test('أسعار المتاجر يحددها الخادم: شراء/بيع، منع الرصيد السالب، منع تكرار المعاملة', async () => {
  const a = await h.spawn(game, 'trader');
  place(a.p, 15.5, 17.5); // قرب سوق مدينة الفجر
  const npc = 'dawn_market';
  const idem = uid('buy');
  const r1 = await a.conn.send(C2S.BUY, { npcId: npc, itemId: 'wheat', qty: 5, idem });
  assert.equal(r1.ok, true);
  assert.equal(r1.unit, 7); // سعر الفجر 8، خصم المستوى 1 = 0.5% → floor(7.96)=7
  assert.equal(a.p.gold, 100 - r1.spent);
  const goldAfter = a.p.gold;
  const r2 = await a.conn.send(C2S.BUY, { npcId: npc, itemId: 'wheat', qty: 5, idem }); // نفس idem
  assert.equal(r2.duplicate, true);
  assert.equal(a.p.gold, goldAfter, 'لا خصم مزدوج');
  assert.equal(a.p.items.get('wheat').qty, 5);
  // رصيد غير كافٍ
  const r3 = await a.conn.send(C2S.BUY, { npcId: npc, itemId: 'gems', qty: 99, idem: uid('buy') });
  assert.equal(r3.error, 'INSUFFICIENT_GOLD');
  assert.equal(a.p.gold, goldAfter);
  // سلعة لا تُباع في هذا المتجر + بعيد عن NPC + NPC غير موجود
  assert.equal((await a.conn.send(C2S.BUY, { npcId: npc, itemId: 'iron_sword', qty: 1, idem: uid('buy') })).error, 'NOT_SOLD_HERE');
  place(a.p, 5, 25);
  assert.equal((await a.conn.send(C2S.BUY, { npcId: npc, itemId: 'wheat', qty: 1, idem: uid('buy') })).error, 'NOT_NEAR_NPC');
  assert.equal((await a.conn.send(C2S.BUY, { npcId: 'ghost', itemId: 'wheat', qty: 1, idem: uid('buy') })).error, 'NOT_FOUND');
  place(a.p, 15.5, 17.5);
  // بيع
  const s = await a.conn.send(C2S.SELL, { npcId: npc, itemId: 'wheat', qty: 2, idem: uid('sell') });
  assert.equal(s.ok, true);
  assert.equal((await a.conn.send(C2S.SELL, { npcId: npc, itemId: 'wheat', qty: 50, idem: uid('sell') })).error, 'INSUFFICIENT_ITEMS');
  // الدفتر متطابق مع الرصيد
  const led = await h.tdb.db.query('SELECT COALESCE(sum(gold_delta),0) AS s FROM transactions WHERE character_id = $1', [a.p.id]);
  assert.equal(led.rows[0].s, (await h.repo.getGold(a.p.id)));
});

test('الشفاء عند الكاهن: يخصم الذهب مرة واحدة حتى مع تكرار الطلب', async () => {
  const a = await h.spawn(game, 'trader');
  place(a.p, 7.5, 32.5);
  a.p.hp = 10;
  const idem = uid('heal');
  const r = await a.conn.send(C2S.HEAL, { npcId: 'dawn_healer', idem });
  assert.equal(r.ok, true);
  assert.equal(a.p.hp, a.p.maxHp);
  assert.equal(a.p.gold, 100 - 3);
  a.p.hp = 10;
  const r2 = await a.conn.send(C2S.HEAL, { npcId: 'dawn_healer', idem });
  assert.equal(r2.duplicate, true);
  assert.equal(a.p.hp, 10, 'التكرار لا يشفي ولا يخصم');
  assert.equal(a.p.gold, 97);
});

test('التجهيز: قيود المستوى والمهنة، ويؤثر على الهجوم', async () => {
  const a = await h.spawn(game, 'thief');
  place(a.p, 5.5, 16.5);
  const atk0 = a.p.atk;
  await h.repo.grant(a.p.id, 1000, {}, 'test', uid('g'));
  await game.refreshPlayer(a.p);
  assert.equal((await a.conn.send(C2S.BUY, { npcId: 'dawn_smith', itemId: 'shadow_dagger', qty: 1, idem: uid('b') })).error, 'LEVEL_TOO_LOW');
  assert.equal((await a.conn.send(C2S.BUY, { npcId: 'dawn_smith', itemId: 'iron_sword', qty: 1, idem: uid('b') })).error, 'LEVEL_TOO_LOW');
  a.p.level = 6; // رفع مستوى مباشر في الاختبار
  a.p.recompute();
  assert.equal((await a.conn.send(C2S.BUY, { npcId: 'dawn_smith', itemId: 'shadow_dagger', qty: 1, idem: uid('b') })).ok, true);
  assert.equal((await a.conn.send(C2S.BUY, { npcId: 'dawn_smith', itemId: 'chain_vest', qty: 1, idem: uid('b') })).ok, true);
  assert.equal((await a.conn.send(C2S.EQUIP, { itemId: 'shadow_dagger', equip: true })).ok, true);
  assert.equal(a.p.weaponId, 'shadow_dagger');
  assert.ok(a.p.atk >= atk0 + 8 - 1);
  // سيف حديدي مخصص لمهنة أخرى
  await h.repo.grant(a.p.id, 0, { iron_sword: 1 }, 'test', uid('g'));
  await game.refreshPlayer(a.p);
  assert.equal((await a.conn.send(C2S.EQUIP, { itemId: 'iron_sword', equip: true })).error, 'WRONG_PROFESSION');
  assert.equal((await a.conn.send(C2S.EQUIP, { itemId: 'chain_vest', equip: true })).ok, true);
  assert.equal(a.p.armorId, 'chain_vest');
});
