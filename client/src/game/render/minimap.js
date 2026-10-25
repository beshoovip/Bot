// خريطة مصغرة/كبيرة بمنظور علوي (بكسل لكل بلاطة) على Canvas2D. تُرسم الأرضية مرة وتُخزَّن.

import { GROUND, OBSTACLE } from '../../../../shared/constants.js';

const COLORS = {
  [GROUND.GRASS]: [79, 143, 69], [GROUND.ROAD]: [200, 175, 120], [GROUND.CITY]: [170, 165, 155], [GROUND.WATER]: [47, 111, 181],
  [GROUND.SAND]: [215, 199, 141], [GROUND.DARK]: [61, 107, 58], [GROUND.BRIDGE]: [138, 106, 63],
};

export function renderBaseMap(doc, world) {
  const c = doc.createElement('canvas');
  c.width = world.width;
  c.height = world.height;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(world.width, world.height);
  for (let i = 0; i < world.width * world.height; i++) {
    let col = COLORS[world.ground[i]] ?? [0, 0, 0];
    const o = world.obstacle[i];
    if (o === OBSTACLE.TREE) col = [34, 88, 36];
    else if (o === OBSTACLE.WALL) col = [110, 105, 98];
    else if (o === OBSTACLE.BUILDING) col = [150, 80, 60];
    else if (o === OBSTACLE.ROCK) col = [130, 130, 135];
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** يرسم الخريطة مع علامات. viewport اختياري (للخريطة المصغرة: نافذة حول اللاعب). */
export function drawMap(ctx, base, world, state, { viewport = null, labels = false } = {}) {
  const { width: W, height: H } = ctx.canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  const vp = viewport ?? { x: 0, y: 0, w: world.width, h: world.height };
  const sx = W / vp.w;
  const sy = H / vp.h;
  ctx.drawImage(base, vp.x, vp.y, vp.w, vp.h, 0, 0, W, H);
  const P = (x, y) => [(x - vp.x) * sx, (y - vp.y) * sy];
  // مناطق الخطر
  if (labels) {
    ctx.font = `${Math.max(11, W / 60)}px sans-serif`;
    ctx.textAlign = 'center';
    for (const z of world.zones) {
      const [x] = P((z.x0 + z.x1 + 1) / 2, 0);
      ctx.fillStyle = z.safe ? 'rgba(255,255,255,0.9)' : `rgba(255,${200 - z.danger * 55},${200 - z.danger * 55},0.95)`;
      ctx.fillText(z.nameAr, x, 16);
    }
  }
  for (const s of world.stations) dot(ctx, ...P(s.x, s.y), 4, '#ffd54a');
  for (const n of world.npcs) dot(ctx, ...P(n.x, n.y), 2.5, '#ffffff');
  for (const m of state.entities.values()) {
    const [x, y] = P(m.x, m.y);
    if (m.type === 'monster') dot(ctx, x, y, 2.5, '#e53935');
    else if (m.type === 'caravan') dot(ctx, x, y, 4, '#ffb300', true);
    else if (m.type === 'player') dot(ctx, x, y, 3, m.data.hostile ? '#ff5252' : '#4fc3f7');
  }
  const [mx, my] = P(state.me.x, state.me.y);
  dot(ctx, mx, my, 4.5, '#00e676', true);
}

function dot(ctx, x, y, r, color, ring = false) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (ring) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
