import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, validateUsername, validatePassword, validateCharacterName, sanitizeChat, normalizeUsername } from '../../shared/validate.js';
import { SCHEMAS, C2S, RATE_LIMITS } from '../../shared/protocol.js';

test('INPUT: يقبل المدخل الصحيح ويرفض الحقول الزائدة والأنواع الخاطئة', () => {
  const s = SCHEMAS[C2S.INPUT];
  assert.equal(validatePayload(s, { seq: 5, dir: 3 }).ok, true);
  assert.equal(validatePayload(s, { seq: 5, dir: -1 }).ok, true);
  assert.equal(validatePayload(s, { seq: 5, dir: 8 }).ok, false);
  assert.equal(validatePayload(s, { seq: -1, dir: 1 }).ok, false);
  assert.equal(validatePayload(s, { seq: 1.5, dir: 1 }).ok, false);
  assert.equal(validatePayload(s, { seq: '1', dir: 1 }).ok, false);
  assert.equal(validatePayload(s, { seq: 1, dir: 1, x: 999 }).ok, false); // لا يُسمح للعميل بإرسال موقع
  assert.equal(validatePayload(s, null).ok, false);
  assert.equal(validatePayload(s, [1, 2]).ok, false);
  assert.equal(validatePayload(s, 'x').ok, false);
});

test('يرفض NaN وInfinity وحقن __proto__', () => {
  const s = SCHEMAS[C2S.SKILL];
  assert.equal(validatePayload(s, { skillId: 'plunder', x: NaN, y: 1 }).ok, false);
  assert.equal(validatePayload(s, { skillId: 'plunder', x: Infinity, y: 1 }).ok, false);
  const evil = JSON.parse('{"skillId":"plunder","__proto__":{"admin":true}}');
  assert.equal(validatePayload(s, evil).ok, false);
});

test('BUY: يتطلب مفتاح idem صالحًا وكمية ضمن الحد', () => {
  const s = SCHEMAS[C2S.BUY];
  const base = { npcId: 'dawn_market', itemId: 'wheat', qty: 3, idem: 'abcdef12345' };
  assert.equal(validatePayload(s, base).ok, true);
  assert.equal(validatePayload(s, { ...base, qty: 0 }).ok, false);
  assert.equal(validatePayload(s, { ...base, qty: 100 }).ok, false);
  assert.equal(validatePayload(s, { ...base, idem: 'short' }).ok, false);
  assert.equal(validatePayload(s, { ...base, idem: 'has space in it!!' }).ok, false);
  assert.equal(validatePayload(s, { ...base, itemId: 'Wheat; DROP TABLE' }).ok, false);
});

test('LAUNCH: خريطة الحمولة صارمة', () => {
  const s = SCHEMAS[C2S.LAUNCH];
  const base = { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: 10, gems: 2 }, idem: 'idem-12345678' };
  assert.equal(validatePayload(s, base).ok, true);
  assert.equal(validatePayload(s, { ...base, cargo: {} }).ok, false);
  assert.equal(validatePayload(s, { ...base, cargo: { wheat: -5 } }).ok, false);
  assert.equal(validatePayload(s, { ...base, cargo: { wheat: 1.5 } }).ok, false);
  assert.equal(validatePayload(s, { ...base, cargo: [1] }).ok, false);
  assert.equal(validatePayload(s, { ...base, cargo: { 'BAD KEY': 1 } }).ok, false);
});

test('كل حدث في البروتوكول له مخطط وحد معدل', () => {
  for (const ev of Object.values(C2S)) {
    assert.ok(SCHEMAS[ev], `مخطط ناقص: ${ev}`);
    assert.ok(RATE_LIMITS[ev], `حد معدل ناقص: ${ev}`);
  }
});

test('أسماء الحسابات وكلمات المرور وأسماء الشخصيات', () => {
  assert.equal(normalizeUsername('  Ali_99 '), 'ali_99');
  assert.equal(validateUsername('ali_99'), true);
  assert.equal(validateUsername('al'), false);
  assert.equal(validateUsername('Ali'), false);
  assert.equal(validateUsername('a b c'), false);
  assert.equal(validatePassword('12345678'), true);
  assert.equal(validatePassword('short'), false);
  assert.equal(validatePassword('x'.repeat(129)), false);
  assert.equal(validateCharacterName('سالم_1'), true);
  assert.equal(validateCharacterName('Hero'), true);
  assert.equal(validateCharacterName('ab'), false);
  assert.equal(validateCharacterName('<script>'), false);
  assert.equal(validateCharacterName('a b c'), false);
});

test('sanitizeChat يزيل محارف التحكم ويقصّ الطول', () => {
  assert.equal(sanitizeChat('  مرحبا\u0000   بالجميع \n'), 'مرحبا بالجميع');
  assert.equal(sanitizeChat('x'.repeat(500)).length, 200);
  assert.equal(sanitizeChat(123), '');
});
