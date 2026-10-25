import test from 'node:test';
import assert from 'node:assert/strict';
import { worldToScreen, screenToWorld, dirToWorldVector, dirFromScreenVector } from '../../shared/iso.js';
import { DIRS } from '../../shared/constants.js';

test('الإسقاط المائل ذهابًا وإيابًا يعيد نفس النقطة', () => {
  for (const [x, y] of [[0, 0], [10, 3], [47.5, 22.25], [95, 47]]) {
    const s = worldToScreen(x, y);
    const w = screenToWorld(s.x, s.y);
    assert.ok(Math.abs(w.x - x) < 1e-9 && Math.abs(w.y - y) < 1e-9);
  }
});

test('الإسقاط 2:1 حقيقي: خطوة على محور x تنزل نصف ما تنزله خطوتان قطريتان', () => {
  const a = worldToScreen(1, 0); // يمين-أسفل
  assert.deepEqual(a, { x: 32, y: 16 });
  const b = worldToScreen(0, 1); // يسار-أسفل
  assert.deepEqual(b, { x: -32, y: 16 });
  const c = worldToScreen(1, 1); // أسفل مباشرة
  assert.deepEqual(c, { x: 0, y: 32 });
});

test('كل اتجاه شاشة يتحول لمتجه عالمي وحدوي ويعود لنفس الاتجاه على الشاشة', () => {
  for (let d = 0; d < 8; d++) {
    const v = dirToWorldVector(d);
    assert.ok(Math.abs(Math.hypot(v.x, v.y) - 1) < 1e-9);
    const s = worldToScreen(v.x, v.y);
    // اتجاه الشاشة الناتج يجب أن يوازي DIRS[d]
    const cross = s.x * DIRS[d].sy - s.y * DIRS[d].sx;
    const dot = s.x * DIRS[d].sx + s.y * DIRS[d].sy;
    assert.ok(Math.abs(cross) < 1e-9 && dot > 0, `dir ${d}`);
  }
});

test('شرق على الشاشة يتحرك أفقيًا فقط وشمال يتحرك رأسيًا فقط', () => {
  const e = worldToScreen(dirToWorldVector(0).x, dirToWorldVector(0).y);
  assert.ok(Math.abs(e.y) < 1e-9 && e.x > 0);
  const n = worldToScreen(dirToWorldVector(6).x, dirToWorldVector(6).y);
  assert.ok(Math.abs(n.x) < 1e-9 && n.y < 0);
});

test('اتجاه غير صالح يعطي سكونًا', () => {
  assert.deepEqual(dirToWorldVector(-1), { x: 0, y: 0 });
  assert.deepEqual(dirToWorldVector(8), { x: 0, y: 0 });
  assert.deepEqual(dirToWorldVector(1.5), { x: 0, y: 0 });
});

test('dirFromScreenVector يقرّب لأقرب اتجاه من 8 ويحترم المنطقة الميتة', () => {
  assert.equal(dirFromScreenVector(1, 0), 0);
  assert.equal(dirFromScreenVector(1, 1), 1);
  assert.equal(dirFromScreenVector(0, 1), 2);
  assert.equal(dirFromScreenVector(-1, 1), 3);
  assert.equal(dirFromScreenVector(-1, 0), 4);
  assert.equal(dirFromScreenVector(-1, -1), 5);
  assert.equal(dirFromScreenVector(0, -1), 6);
  assert.equal(dirFromScreenVector(1, -1), 7);
  assert.equal(dirFromScreenVector(1, -0.2), 0);
  assert.equal(dirFromScreenVector(0.05, 0.05), -1);
});
