import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/testDb.js';
import { createRepo } from '../../server/src/database/repo.js';
import { createAuthService } from '../../server/src/auth/authService.js';
import { createApiHandlers } from '../../server/src/auth/apiHandlers.js';
import { loadConfig } from '../../server/src/config/env.js';
import { ConnectionLimiter, KeyedLimiter, TokenBucket } from '../../server/src/security/rateLimiter.js';

let tdb;
let api;
before(() => {
  tdb = createTestDatabase('api');
  const repo = createRepo(tdb.db);
  const config = loadConfig({ AUTH_RATE_MAX: '6' });
  const auth = createAuthService({ repo, config, hashParams: { n: 1024, r: 8, p: 1 } });
  api = createApiHandlers({ auth, config, db: tdb.db, game: null });
});
after(() => tdb?.drop());

test('REST: تسجيل → دخول → إنشاء شخصية → قائمة الشخصيات، مع رموز حالة HTTP الصحيحة', async () => {
  const reg = await api.register({ body: { username: 'Hero_1', password: 'secret-pass-1' }, ip: '1.1.1.1' });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);
  assert.equal((await api.register({ body: { username: 'hero_1', password: 'secret-pass-1' }, ip: '1.1.1.2' })).status, 409);
  assert.equal((await api.register({ body: { username: 'x', password: '1' }, ip: '1.1.1.3' })).status, 400);
  assert.equal((await api.register({ body: null, ip: '1.1.1.3' })).status, 400);
  const login = await api.login({ body: { username: 'hero_1', password: 'secret-pass-1' }, ip: '1.1.1.1' });
  assert.equal(login.status, 200);
  assert.equal((await api.login({ body: { username: 'hero_1', password: 'bad' }, ip: '1.1.1.1' })).status, 401);
  const token = login.body.token;
  assert.equal((await api.listCharacters({ token: '' })).status, 401);
  assert.equal((await api.createCharacter({ token: 'nope', body: { name: 'abc', profession: 'thief' } })).status, 401);
  const c = await api.createCharacter({ token, body: { name: 'البطل_1', profession: 'hunter' } });
  assert.equal(c.status, 201);
  assert.equal((await api.createCharacter({ token, body: { name: 'البطل_1', profession: 'hunter' } })).status, 409);
  assert.equal((await api.createCharacter({ token, body: { name: 'valid', profession: 'wizard' } })).status, 400);
  const list = await api.listCharacters({ token });
  assert.equal(list.body.characters.length, 1);
  assert.equal(list.body.characters[0].profession, 'hunter');
  // لا تظهر كلمة المرور/التجزئة في أي استجابة
  assert.ok(!JSON.stringify([reg, login, c, list]).match(/scrypt|password_hash|secret-pass/));
  await api.logout({ token });
  assert.equal((await api.listCharacters({ token })).status, 401);
});

test('REST: تحديد معدل محاولات الدخول لكل IP (منع التخمين)', async () => {
  let blocked = 0;
  for (let i = 0; i < 12; i++) {
    const r = await api.login({ body: { username: 'hero_1', password: `wrong${i}` }, ip: '9.9.9.9' });
    if (r.status === 429) blocked++;
  }
  assert.ok(blocked >= 5, `blocked=${blocked}`);
  // IP آخر غير متأثر
  assert.equal((await api.login({ body: { username: 'hero_1', password: 'secret-pass-1' }, ip: '8.8.8.8' })).status, 200);
});

test('REST: فحص الصحة يفحص قاعدة البيانات', async () => {
  const h = await api.health();
  assert.equal(h.status, 200);
  assert.equal(h.body.db, true);
  const bad = createApiHandlers({ auth: null, config: loadConfig({}), db: { query: async () => { throw new Error('down'); } }, game: null });
  assert.equal((await bad.health()).status, 503);
});

test('محددات المعدل: دلو الرموز يتجدد مع الزمن، والنافذة الثابتة تُعاد', () => {
  let now = 0;
  const b = new TokenBucket(3, 1, () => now);
  assert.deepEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false]);
  now = 1000;
  assert.equal(b.take(), true);
  assert.equal(b.take(), false);
  now = 100000;
  assert.deepEqual([b.take(), b.take(), b.take(), b.take()], [true, true, true, false]); // لا يتجاوز burst
  const k = new KeyedLimiter(2, 1000, () => now);
  assert.deepEqual([k.allow('a'), k.allow('a'), k.allow('a'), k.allow('b')], [true, true, false, true]);
  now += 1500;
  assert.equal(k.allow('a'), true);
  const c = new ConnectionLimiter({ ping: { burst: 1, perSec: 0 } }, () => now);
  assert.deepEqual([c.allow('ping'), c.allow('ping'), c.allow('unknown')], [true, false, false]);
  assert.equal(c.violations, 1);
});

test('إعدادات الإنتاج تُرفض إن نقصت (DATABASE_URL وCORS_ORIGINS) وتُقرأ من البيئة فقط', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' }), /CORS_ORIGINS/);
  const c = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', CORS_ORIGINS: 'https://localhost, capacitor://localhost', PORT: '8080' });
  assert.deepEqual(c.corsOrigins, ['https://localhost', 'capacitor://localhost']);
  assert.equal(c.port, 8080);
  assert.equal(c.databaseSsl, true);
  assert.throws(() => loadConfig({ PORT: 'abc' }), /Invalid env PORT/);
});
