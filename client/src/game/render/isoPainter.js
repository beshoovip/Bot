// رسم Canvas2D للعالم المائل. يعمل على أي سياق 2D: يُستخدم لخبز قطع الأرض داخل Phaser (CanvasTexture)
// وللمعاينة والاختبار البصري في المتصفح. الرسومات أصلية بالكامل (أشكال مولَّدة بالكود، بلا أصول خارجية).

import { GROUND } from '../../../../shared/constants.js';
import { hash2 } from '../../../../shared/rng.js';
import { worldToScreen } from '../../../../shared/iso.js';
import { PALETTE, tileDiamond, chunkBounds, boxBounds } from './geometry.js';

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** يرسم أرضية قطعة واحدة. (ox, oy) = موضع زاوية القطعة العلوية اليسرى في الشاشة؛ يُطرح للرسم على نسيج مستقل. */
export function paintChunk(ctx, world, cx, cy, seed = world.seed) {
  const b = chunkBounds(world, cx, cy);
  ctx.save();
  ctx.translate(-b.x, -b.y);
  for (let ty = b.y0; ty < b.y1; ty++) {
    for (let tx = b.x0; tx < b.x1; tx++) {
      const g = world.ground[ty * world.width + tx];
      const pal = PALETTE[g] ?? PALETTE[GROUND.GRASS];
      const r = hash2(tx, ty, seed);
      const d = tileDiamond(tx, ty);
      poly(ctx, d, pal[Math.floor(r * pal.length)], null);
      // لمسات: عشب/حصى/أمواج/ألواح جسر
      const c = worldToScreen(tx + 0.5, ty + 0.5);
      if (g === GROUND.GRASS || g === GROUND.DARK) {
        if (r > 0.6) {
          ctx.fillStyle = shade(pal[0], 0.82);
          ctx.fillRect(c.x - 6 + Math.floor(r * 10), c.y - 2, 2, 5);
          ctx.fillRect(c.x + 3 - Math.floor(r * 6), c.y + 2, 2, 4);
        }
      } else if (g === GROUND.WATER) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.moveTo(c.x - 8, c.y);
        ctx.lineTo(c.x - 2, c.y - 2);
        ctx.lineTo(c.x + 4, c.y);
        ctx.stroke();
      } else if (g === GROUND.CITY) {
        poly(ctx, [worldToScreen(tx + 0.08, ty + 0.08), worldToScreen(tx + 0.92, ty + 0.08), worldToScreen(tx + 0.92, ty + 0.92), worldToScreen(tx + 0.08, ty + 0.92)], null, 'rgba(0,0,0,0.12)');
      } else if (g === GROUND.BRIDGE) {
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        for (const f of [0.3, 0.6]) {
          const p1 = worldToScreen(tx + f, ty);
          const p2 = worldToScreen(tx + f, ty + 1);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } else if (g === GROUND.ROAD && r > 0.7) {
        ctx.fillStyle = shade(pal[0], 0.85);
        ctx.fillRect(c.x - 3, c.y, 3, 2);
      }
    }
  }
  ctx.restore();
  return b;
}

/** يرسم عنصر عوائق (شجرة/صخرة/جدار/مبنى) داخل مستطيله؛ الأصل (0,0) = bounds.x/y. */
export function paintScenery(ctx, item) {
  const { bounds } = item;
  ctx.save();
  ctx.translate(-bounds.x, -bounds.y);
  const r = hash2(item.tx, item.ty, 99);
  if (item.kind === 'tree') {
    const base = worldToScreen(item.tx + 0.5, item.ty + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(base.x, base.y + 2, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(base.x - 4, base.y - 30, 8, 32);
    const g = ['#2f7d32', '#3b8f3e', '#276b2a'];
    [[0, -52, 20], [-11, -42, 15], [11, -42, 15]].forEach(([dx, dy, rad], i) => {
      ctx.fillStyle = g[(i + Math.floor(r * 3)) % 3];
      ctx.beginPath();
      ctx.ellipse(base.x + dx, base.y + dy, rad, rad * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (item.kind === 'rock') {
    const base = worldToScreen(item.tx + 0.5, item.ty + 0.5);
    poly(ctx, [{ x: base.x - 16, y: base.y }, { x: base.x - 8, y: base.y - 16 }, { x: base.x + 6, y: base.y - 20 }, { x: base.x + 17, y: base.y - 4 }, { x: base.x + 6, y: base.y + 7 }, { x: base.x - 8, y: base.y + 6 }], '#8a8c92', '#5d5f66');
  } else {
    paintBox(ctx, item);
  }
  ctx.restore();
}

function paintBox(ctx, item) {
  const { tx, ty, w, h, height: H, kind } = item;
  const T = worldToScreen(tx, ty);
  const R = worldToScreen(tx + w, ty);
  const B = worldToScreen(tx + w, ty + h);
  const L = worldToScreen(tx, ty + h);
  const up = (p) => ({ x: p.x, y: p.y - H });
  const roof = kind === 'wall' ? '#8e8a82' : ['#b5523b', '#a1472f', '#c26b3b'][Math.floor(hash2(tx, ty, 7) * 3)];
  const wall = kind === 'wall' ? '#a39e94' : '#e0cfa8';
  // يسار ثم يمين ثم السطح
  poly(ctx, [L, B, up(B), up(L)], shade(wall, 0.78), 'rgba(0,0,0,0.25)');
  poly(ctx, [B, R, up(R), up(B)], shade(wall, 0.92), 'rgba(0,0,0,0.25)');
  poly(ctx, [up(T), up(R), up(B), up(L)], roof, 'rgba(0,0,0,0.3)');
  if (kind === 'building') {
    // باب ونوافذ على الواجهة اليمنى
    const f = (u, v) => ({ x: B.x + (R.x - B.x) * u, y: B.y + (R.y - B.y) * u - H * v });
    const rect = (u0, v0, u1, v1, col) => poly(ctx, [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)], col, null);
    rect(0.42, 0, 0.58, 0.45, '#5a3b22');
    for (const u of [0.12, 0.72]) rect(u, 0.5, u + 0.14, 0.78, '#3d5a80');
    const g = (u, v) => ({ x: L.x + (B.x - L.x) * u, y: L.y + (B.y - L.y) * u - H * v });
    const rect2 = (u0, v0, u1, v1, col) => poly(ctx, [g(u0, v0), g(u1, v0), g(u1, v1), g(u0, v1)], col, null);
    for (const u of [0.15, 0.5, 0.8]) rect2(u, 0.5, u + 0.12, 0.78, '#33506f');
  } else {
    // شرفات الجدار
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    const a = up(L);
    const b2 = up(B);
    ctx.moveTo(a.x, a.y + 8);
    ctx.lineTo(b2.x, b2.y + 8);
    ctx.stroke();
  }
}

/** يرسم العالم كاملًا (أرضية + عوائق مرتبة بالعمق) على سياق واحد بمقياس — للمعاينة والاختبار والخريطة الكبيرة. */
export function paintWholeWorld(ctx, world, scenery, scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  const cols = Math.ceil(world.width / 16);
  const rows = Math.ceil(world.height / 16);
  const tmp = ctx.canvas?.ownerDocument?.createElement?.('canvas');
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const b = chunkBounds(world, cx, cy);
      if (tmp) {
        tmp.width = Math.ceil(b.w);
        tmp.height = Math.ceil(b.h);
        const tctx = tmp.getContext('2d');
        tctx.clearRect(0, 0, tmp.width, tmp.height);
        paintChunk(tctx, world, cx, cy);
        ctx.drawImage(tmp, b.x, b.y);
      }
    }
  }
  const sorted = [...scenery].sort((a, b) => a.depth - b.depth);
  for (const it of sorted) {
    const c = ctx.canvas.ownerDocument.createElement('canvas');
    c.width = Math.ceil(it.bounds.w);
    c.height = Math.ceil(it.bounds.h);
    paintScenery(c.getContext('2d'), it);
    ctx.drawImage(c, it.bounds.x, it.bounds.y);
  }
  ctx.restore();
}

export { boxBounds };
