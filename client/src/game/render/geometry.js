// هندسة العرض المائل (نقية بلا Canvas/Phaser): تقسيم العالم لقطع، حدود الشاشة، قوائم العوائق المجمّعة، والعمق.

import { TILE_W, TILE_H, GROUND, OBSTACLE } from '../../../../shared/constants.js';
import { worldToScreen } from '../../../../shared/iso.js';

export const CHUNK = 16;
const HW = TILE_W / 2;
const HH = TILE_H / 2;

export const PALETTE = Object.freeze({
  [GROUND.GRASS]: ['#4f8f45', '#58994d', '#4a883f'],
  [GROUND.ROAD]: ['#b59a6a', '#bda274', '#ad9262'],
  [GROUND.CITY]: ['#a9a39a', '#b3ada3', '#9f998f'],
  [GROUND.WATER]: ['#2f6fb5', '#3a7cc4', '#2a66a8'],
  [GROUND.SAND]: ['#d7c78d', '#dfcf96', '#cfbf84'],
  [GROUND.DARK]: ['#3d6b3a', '#437440', '#386535'],
  [GROUND.BRIDGE]: ['#8a6a3f', '#94734a', '#80613a'],
});

export function chunkGrid(world) {
  return { cols: Math.ceil(world.width / CHUNK), rows: Math.ceil(world.height / CHUNK) };
}

/** مستطيل الشاشة الذي تغطيه قطعة (يشمل كل البلاطات المائلة فيها). */
export function chunkBounds(world, cx, cy) {
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(world.width, x0 + CHUNK);
  const y1 = Math.min(world.height, y0 + CHUNK);
  const minX = (x0 - y1) * HW;
  const maxX = (x1 - y0) * HW;
  const minY = (x0 + y0) * HH;
  const maxY = (x1 + y1) * HH;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, x0, y0, x1, y1 };
}

export function worldBounds(world) {
  const minX = (0 - world.height) * HW;
  const maxX = world.width * HW;
  return { x: minX, y: 0, w: maxX - minX, h: (world.width + world.height) * HH };
}

/** رؤوس معين البلاطة (top, right, bottom, left) بإحداثيات الشاشة. */
export function tileDiamond(tx, ty) {
  return [worldToScreen(tx, ty), worldToScreen(tx + 1, ty), worldToScreen(tx + 1, ty + 1), worldToScreen(tx, ty + 1)];
}

/** القطع التي تتقاطع مع مستطيل الكاميرا (للتجزئة/الإخفاء). */
export function visibleChunks(world, view) {
  const { cols, rows } = chunkGrid(world);
  const out = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const b = chunkBounds(world, cx, cy);
      if (b.x < view.x + view.w && b.x + b.w > view.x && b.y < view.y + view.h && b.y + b.h > view.y) out.push({ cx, cy });
    }
  }
  return out;
}

/**
 * عوائق العالم كقائمة عناصر قابلة للرسم: الأشجار والصخور والجدران لكل بلاطة، والمباني كصناديق مجمّعة.
 * depth = مجموع إحداثيات الزاوية الأمامية (الأقرب للكاميرا) → رسم بترتيب العمق صحيح.
 */
export function buildScenery(world) {
  const items = [];
  const inBuilding = new Uint8Array(world.width * world.height);
  for (const b of world.buildings) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) inBuilding[y * world.width + x] = 1;
    const H = 64 + Math.min(b.w, b.h) * 6;
    items.push({ kind: 'building', id: b.id, tx: b.x, ty: b.y, w: b.w, h: b.h, height: H, depth: b.x + b.w + b.y + b.h - 0.01, bounds: boxBounds(b.x, b.y, b.w, b.h, H) });
  }
  const kinds = { [OBSTACLE.TREE]: 'tree', [OBSTACLE.ROCK]: 'rock', [OBSTACLE.WALL]: 'wall' };
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const o = world.obstacle[y * world.width + x];
      if (!o || inBuilding[y * world.width + x]) continue;
      const kind = kinds[o];
      if (!kind) continue;
      const height = kind === 'wall' ? 44 : kind === 'tree' ? 78 : 22;
      items.push({ kind, id: `${kind}_${x}_${y}`, tx: x, ty: y, w: 1, h: 1, height, depth: x + 1 + y + 1 - 0.01, bounds: boxBounds(x, y, 1, 1, kind === 'tree' ? 0 : height) });
    }
  }
  return items;
}

/** مستطيل الشاشة لصندوق ارتفاعه H فوق مستطيل أرضي w×h. للأشجار (H=0) نضيف مساحة للتاج. */
export function boxBounds(tx, ty, w, h, H) {
  const left = worldToScreen(tx, ty + h);
  const right = worldToScreen(tx + w, ty);
  const top = worldToScreen(tx, ty);
  const bottom = worldToScreen(tx + w, ty + h);
  const extraTop = H === 0 ? 80 : H;
  return { x: left.x, y: top.y - extraTop, w: right.x - left.x, h: bottom.y - (top.y - extraTop) };
}

/** هل البلاطتان متجاورتان بصريًا بلا فجوات؟ (للاختبار) */
export function tilesShareEdge(a, b) {
  const [da, db] = [tileDiamond(a.tx, a.ty), tileDiamond(b.tx, b.ty)];
  return da.some((p) => db.some((q) => p.x === q.x && p.y === q.y));
}
