import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/testDb.js';
import { createRepo } from '../../server/src/database/repo.js';
import { createAuthService } from '../../server/src/auth/authService.js';
import { hashPassword, verifyPassword, hashToken } from '../../server/src/security/passwords.js';
import { loadConfig } from '../../server/src/config/env.js';

let tdb;
let auth;
let repo;
const fast = { n: 1024, r: 8, p: 1 }; // معاملات أخف للاختبار فقط

before(() => {
  tdb = createTestDatabase('auth');
  repo = createRepo(tdb.db);
  auth = createAuthService({ repo, config: loadConfig({}), hashParams: fast });
});
after(() => tdb?.drop());

test('تجزئة كلمة المرور: ليست نصًا صريحًا، فريدة بالملح، وتتحقق بشكل صحيح', async () => {
  const h1 = await hashPassword('correct horse', fast);
  const h2 = await hashPassword('correct horse', fast);
  assert.ok(!h1.includes('correct horse'));
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword('correct horse', h1), true);
  assert.equal(await verifyPassword('wrong horse', h1), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
  assert.equal(await verifyPassword('x', null), false);
});

test('إنشاء حساب وتسجيل الدخول وتوثيق الجلسة', async () => {
  const r = await auth.register('Player_One', 'password123');
  assert.equal(r.ok, true);
  assert.equal(r.username, 'player_one');
  // كلمة المرور محفوظة مجزأة، والرمز الخام غير محفوظ
  const stored = (await tdb.db.query('SELECT password_hash FROM users WHERE username = $1', ['player_one'])).rows[0].password_hash;
  assert.ok(stored.startsWith('scrypt$') && !stored.includes('password123'));
  const sess = (await tdb.db.query('SELECT token_hash FROM sessions')).rows.map((x) => x.token_hash);
  assert.ok(!sess.includes(r.token) && sess.includes(hashToken(r.token)));

  const me = await auth.authenticate(r.token);
  assert.equal(me.userId, r.userId);

  const l = await auth.login('player_one', 'password123');
  assert.equal(l.ok, true);
  assert.notEqual(l.token, r.token);
  assert.equal((await auth.authenticate(l.token)).username, 'player_one');
});

test('رفض: اسم مكرر، بيانات خاطئة، رمز مزيف، مدخلات غير صالحة', async () => {
  assert.equal((await auth.register('player_one', 'password123')).error, 'USERNAME_TAKEN');
  assert.equal((await auth.register('PLAYER_ONE', 'otherpass123')).error, 'USERNAME_TAKEN');
  assert.equal((await auth.register('ab', 'password123')).error, 'INVALID');
  assert.equal((await auth.register('valid_name', 'short')).error, 'INVALID');
  assert.equal((await auth.login('player_one', 'wrongpass')).error, 'BAD_CREDENTIALS');
  assert.equal((await auth.login('no_such_user', 'password123')).error, 'BAD_CREDENTIALS');
  assert.equal((await auth.login("x'; DROP TABLE users;--", 'password123')).error, 'BAD_CREDENTIALS');
  assert.equal(await auth.authenticate('forged-token-forged-token-forged'), null);
  assert.equal(await auth.authenticate(undefined), null);
  assert.equal((await tdb.db.query('SELECT count(*)::int AS n FROM users')).rows[0].n, 1, 'جدول المستخدمين سليم');
});

test('تسجيل الخروج يلغي الجلسة، والجلسة المنتهية مرفوضة', async () => {
  const l = await auth.login('player_one', 'password123');
  await auth.logout(l.token);
  assert.equal(await auth.authenticate(l.token), null);
  const l2 = await auth.login('player_one', 'password123');
  await tdb.db.query("UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1 RETURNING id", [hashToken(l2.token)]);
  assert.equal(await auth.authenticate(l2.token), null);
});

test('إنشاء شخصية واختيار المهنة: العناصر والإحصاءات والذهب الابتدائي من الخادم', async () => {
  const u = (await auth.login('player_one', 'password123')).userId;
  const r = await auth.createCharacter(u, 'سالم_التاجر', 'trader');
  assert.equal(r.ok, true);
  const c = await repo.loadCharacter(r.characterId);
  assert.equal(c.profession, 'trader');
  assert.equal(c.gold, 100);
  assert.equal(c.level, 1);
  assert.equal(c.hp, c.maxHp);
  assert.equal(c.maxHp, 110);
  assert.deepEqual(c.items.map((i) => i.itemId).sort(), ['health_potion', 'leather_vest', 'rusty_sword']);
  assert.deepEqual(c.skills, { caravan_shield: 1, field_repair: 1 });
  assert.equal((await auth.createCharacter(u, 'ظل_اللص', 'thief')).ok, true);
  assert.equal((await repo.loadCharacter((await auth.listCharacters(u))[1].id)).profession, 'thief');
});

test('قيود الشخصيات: مهنة غير معروفة، اسم سيئ، اسم مكرر، حد 3 شخصيات', async () => {
  const u = (await auth.login('player_one', 'password123')).userId;
  assert.equal((await auth.createCharacter(u, 'valid_name', 'wizard')).error, 'INVALID');
  assert.equal((await auth.createCharacter(u, 'valid_name', '__proto__')).error, 'INVALID');
  assert.equal((await auth.createCharacter(u, '<b>x</b>', 'hunter')).error, 'INVALID');
  assert.equal((await auth.createCharacter(u, 'سالم_التاجر', 'hunter')).error, 'NAME_TAKEN');
  assert.equal((await auth.createCharacter(u, 'SALIM_x', 'hunter')).ok, true);
  assert.equal((await auth.createCharacter(u, 'fourth_one', 'hunter')).error, 'TOO_MANY_CHARACTERS');
  assert.equal((await auth.listCharacters(u)).length, 3);
});
