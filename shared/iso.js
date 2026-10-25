// الإسقاط المائل (Isometric 2:1).
// إحداثيات العالم (x,y) بوحدة البلاطة. x يزيد نحو أسفل-يمين الشاشة، y نحو أسفل-يسار الشاشة.

import { TILE_W, TILE_H, DIRS } from './constants.js';

const HW = TILE_W / 2;
const HH = TILE_H / 2;

export function worldToScreen(wx, wy) {
  return { x: (wx - wy) * HW, y: (wx + wy) * HH };
}

export function screenToWorld(sx, sy) {
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
}

// متجه سرعة وحدوي في فضاء العالم يقابل اتجاه الشاشة المحدد (0..7). -1 = ساكن.
const WORLD_DIRS = DIRS.map((d) => {
  const w = screenToWorld(d.sx, d.sy);
  const len = Math.hypot(w.x, w.y);
  return Object.freeze({ x: w.x / len, y: w.y / len });
});

export function dirToWorldVector(dir) {
  if (!Number.isInteger(dir) || dir < 0 || dir > 7) return { x: 0, y: 0 };
  return WORLD_DIRS[dir];
}

// أقرب اتجاه من 8 لمتجه على الشاشة؛ يعيد -1 داخل المنطقة الميتة.
export function dirFromScreenVector(dx, dy, deadzone = 0.25) {
  if (Math.hypot(dx, dy) < deadzone) return -1;
  const step = Math.PI / 4;
  const idx = Math.round(Math.atan2(dy, dx) / step);
  return ((idx % 8) + 8) % 8;
}

// عمق الرسم: الأكبر x+y يُرسم فوق.
export function depthOf(wx, wy) {
  return wx + wy;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
