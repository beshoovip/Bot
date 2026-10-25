// حركة مشتركة (العميل للتنبؤ والخادم للحقيقة). السرعة تحددها دومًا الجهة المنفِّذة، لا الرسالة.

import { ENTITY_RADIUS } from './constants.js';
import { dirToWorldVector } from './iso.js';
import { isWalkable } from './maps/world.js';

function blockedAt(world, x, y, r) {
  return (
    !isWalkable(world, Math.floor(x - r), Math.floor(y - r)) ||
    !isWalkable(world, Math.floor(x + r), Math.floor(y - r)) ||
    !isWalkable(world, Math.floor(x - r), Math.floor(y + r)) ||
    !isWalkable(world, Math.floor(x + r), Math.floor(y + r))
  );
}

/** حركة بمتجه عالمي (vx,vy) بوحدة بلاطة/ثانية مع انزلاق على العوائق. */
export function stepVector(world, pos, vx, vy, dt, radius = ENTITY_RADIUS) {
  let x = pos.x;
  let y = pos.y;
  const nx = x + vx * dt;
  if (!blockedAt(world, nx, y, radius)) x = nx;
  const ny = y + vy * dt;
  if (!blockedAt(world, x, ny, radius)) y = ny;
  return { x, y, moved: x !== pos.x || y !== pos.y };
}

/** حركة باتجاه شاشة (0..7 أو -1). */
export function stepMovement(world, pos, dir, speed, dt, radius = ENTITY_RADIUS) {
  const v = dirToWorldVector(dir);
  if (v.x === 0 && v.y === 0) return { x: pos.x, y: pos.y, moved: false };
  return stepVector(world, pos, v.x * speed, v.y * speed, dt, radius);
}

export function isPositionValid(world, x, y, radius = ENTITY_RADIUS) {
  return !blockedAt(world, x, y, radius) && x >= 0 && y >= 0 && x < world.width && y < world.height;
}
