import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultWorld, isWalkable } from '../../shared/maps/world.js';
import { stepMovement, stepVector, isPositionValid } from '../../shared/movement.js';
import { BALANCE } from '../../shared/data/balance.js';
import { TICK_DT } from '../../shared/constants.js';
import { worldToScreen } from '../../shared/iso.js';

const world = getDefaultWorld();

test('الحركة تتقدم بسرعة ثابتة تحددها الجهة المنفذة', () => {
  let p = { x: 11.5, y: 28.5 };
  const start = { ...p };
  for (let i = 0; i < 20; i++) p = stepMovement(world, p, 0, BALANCE.playerSpeed, TICK_DT);
  const moved = Math.hypot(p.x - start.x, p.y - start.y);
  assert.ok(Math.abs(moved - BALANCE.playerSpeed) < 1e-6, `moved ${moved}`);
});

test('اتجاه الشرق يتحرك أفقيًا على الشاشة', () => {
  let p = { x: 11.5, y: 20.5 };
  const s0 = worldToScreen(p.x, p.y);
  p = stepMovement(world, p, 0, BALANCE.playerSpeed, 0.25);
  const s1 = worldToScreen(p.x, p.y);
  assert.ok(Math.abs(s1.y - s0.y) < 1e-6 && s1.x > s0.x);
});

test('لا يخترق الجدران والمباني (المدينة)', () => {
  // من الشارع باتجاه جدار المدينة الشمالي (y=0 جدار)
  let p = { x: 11.5, y: 3.5 };
  for (let i = 0; i < 400; i++) {
    p = stepVector(world, p, 0, -4, TICK_DT);
    assert.ok(isPositionValid(world, p.x, p.y), `خرج لموضع غير صالح ${p.x},${p.y}`);
  }
  assert.ok(p.y >= 1.3 - 1e-9, `اخترق الجدار y=${p.y}`);
});

test('لا يدخل الماء ويبقى ضمن حدود الخريطة', () => {
  let p = { x: 50.5, y: 28.5 };
  for (let i = 0; i < 600; i++) {
    p = stepVector(world, p, 4, 0, TICK_DT);
    assert.ok(isWalkable(world, Math.floor(p.x), Math.floor(p.y)));
  }
  assert.ok(p.x < 52, `عبر النهر دون جسر x=${p.x}`);
  let q = { x: 5.5, y: 5.5 };
  for (let i = 0; i < 1000; i++) q = stepVector(world, q, -10, -10, TICK_DT);
  assert.ok(q.x >= 0 && q.y >= 0);
});

test('يعبر النهر عبر الجسر على الطريق الرئيسي', () => {
  let p = { x: 48.5, y: 24.5 };
  for (let i = 0; i < 80; i++) p = stepVector(world, p, 4, 0, TICK_DT);
  assert.ok(p.x > 54, `لم يعبر الجسر x=${p.x}`);
});

test('الانزلاق على العوائق: الحركة القطرية على جدار تنزلق بدل التوقف', () => {
  let p = { x: 11.5, y: 3.5 };
  for (let i = 0; i < 60; i++) p = stepVector(world, p, 3, -3, TICK_DT);
  assert.ok(p.x > 12, 'يجب أن ينزلق على طول الجدار');
});

test('اتجاه غير صالح لا يحرّك', () => {
  const p = { x: 11.5, y: 28.5 };
  const r = stepMovement(world, p, -1, 4, 1);
  assert.equal(r.moved, false);
  assert.equal(r.x, p.x);
});
