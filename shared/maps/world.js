// مترجم العالم: يحوّل WORLD_DEF إلى شبكتي أرضية/عوائق + استعلامات. حتمي بالكامل (نفس الناتج على العميل والخادم).

import { GROUND, OBSTACLE } from '../constants.js';
import { hash2 } from '../rng.js';
import { WORLD_DEF } from './world-data.js';

export function compileWorld(def = WORLD_DEF) {
  const W = def.width;
  const H = def.height;
  const ground = new Uint8Array(W * H);
  const obstacle = new Uint8Array(W * H);
  const roadMask = new Uint8Array(W * H);
  const reserved = new Uint8Array(W * H); // بلاطات يُمنع وضع أشجار عليها
  const at = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

  // 1) الأرضية حسب المنطقة
  const zones = def.zones.map((z) => ({ ...z }));
  const zoneIndexForX = (x) => {
    for (let i = 0; i < zones.length; i++) if (x >= zones[i].x0 && x <= zones[i].x1) return i;
    return -1;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const zi = zoneIndexForX(x);
      ground[at(x, y)] = GROUND[zones[zi].ground];
    }
  }

  // 2) النهر والبرك
  const { waterX, sandX } = def.river;
  for (let y = 0; y < H; y++) {
    for (let x = waterX[0]; x <= waterX[1]; x++) ground[at(x, y)] = GROUND.WATER;
    ground[at(sandX[0], y)] = GROUND.SAND;
    ground[at(sandX[1], y)] = GROUND.SAND;
  }
  for (const p of def.ponds) {
    for (let y = Math.floor(p.y - p.r - 2); y <= Math.ceil(p.y + p.r + 2); y++) {
      for (let x = Math.floor(p.x - p.r - 2); x <= Math.ceil(p.x + p.r + 2); x++) {
        if (!inb(x, y)) continue;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        if (d <= p.r) ground[at(x, y)] = GROUND.WATER;
        else if (d <= p.r + 1.2 && ground[at(x, y)] !== GROUND.WATER) ground[at(x, y)] = GROUND.SAND;
      }
    }
  }

  // 3) الطرق (تتحول إلى جسر فوق الماء)
  function stampPolyline(points, radius, mirror) {
    const px = (x) => (mirror ? W - x : x);
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = [px(points[i][0]), points[i][1]];
      const [bx, by] = [px(points[i + 1][0]), points[i + 1][1]];
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / 0.25));
      for (let s = 0; s <= steps; s++) {
        const cx = ax + ((bx - ax) * s) / steps;
        const cy = ay + ((by - ay) * s) / steps;
        for (let ty = Math.floor(cy - radius - 1); ty <= Math.ceil(cy + radius + 1); ty++) {
          for (let tx = Math.floor(cx - radius - 1); tx <= Math.ceil(cx + radius + 1); tx++) {
            if (!inb(tx, ty)) continue;
            if (Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= radius) {
              const k = at(tx, ty);
              ground[k] = ground[k] === GROUND.WATER || ground[k] === GROUND.BRIDGE ? GROUND.BRIDGE : GROUND.ROAD;
              roadMask[k] = 1;
            }
          }
        }
      }
    }
  }
  for (const r of def.roads) stampPolyline(r.points, r.radius, false);

  // 4) المدن: جدران، مبان، أحجار، طرق داخلية، NPC
  const tpl = def.cityTemplate;
  const npcs = [];
  const stations = [];
  const spawns = [];
  const buildings = [];
  for (const [cityId, city] of Object.entries(def.cities)) {
    const m = city.mirror;
    const tx = (x, w = 1) => (m ? W - x - w : x);
    const cx = (x) => (m ? W - x : x);
    for (const r of tpl.roads) stampPolyline(r.points, r.radius, m);

    const inGate = (y) => tpl.gates.some(([a, b]) => y >= a && y <= b);
    for (let y = 0; y < H; y++) {
      obstacle[at(tx(tpl.wallOuterX), y)] = OBSTACLE.WALL;
      if (!inGate(y)) obstacle[at(tx(tpl.wallInnerX), y)] = OBSTACLE.WALL;
    }
    const x0 = m ? tx(tpl.wallInnerX) : tpl.wallOuterX;
    const x1 = m ? tx(tpl.wallOuterX) : tpl.wallInnerX;
    for (const y of tpl.wallRows) for (let x = x0; x <= x1; x++) obstacle[at(x, y)] = OBSTACLE.WALL;

    for (const b of tpl.buildings) {
      const bx = tx(b.x, b.w);
      buildings.push({ id: `${city.key}_${b.id}`, cityId, x: bx, y: b.y, w: b.w, h: b.h });
      for (let y = b.y; y < b.y + b.h; y++) for (let x = bx; x < bx + b.w; x++) obstacle[at(x, y)] = OBSTACLE.BUILDING;
    }
    for (const p of tpl.props) obstacle[at(tx(p.x), p.y)] = OBSTACLE.ROCK;

    for (const n of tpl.npcs) {
      const x = tx(n.x);
      npcs.push({ id: `${city.key}_${n.key}`, type: n.type, nameAr: city.names[n.key], cityId, x: x + 0.5, y: n.y + 0.5 });
      reserved[at(x, n.y)] = 1;
    }
    stations.push({ id: `${city.key}_station`, cityId, x: cx(tpl.station.x), y: tpl.station.y });
    spawns.push({ id: `spawn_${city.key}`, cityId, x: cx(tpl.spawn.x), y: tpl.spawn.y });
  }

  // 5) الأشجار (فقط خارج المدن، بعيدًا عن الطرق بمسافتين على الأقل)
  const nearRoad = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!roadMask[at(x, y)]) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inb(x + dx, y + dy)) nearRoad[at(x + dx, y + dy)] = 1;
    }
  }
  const inAmbush = (x, y) => def.ambush.some((a) => Math.hypot(x + 0.5 - a.x, y + 0.5 - a.y) <= a.r);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = at(x, y);
      const z = zones[zoneIndexForX(x)];
      if (z.safe || obstacle[k] || reserved[k] || nearRoad[k]) continue;
      const g = ground[k];
      if (g !== GROUND.GRASS && g !== GROUND.DARK) continue;
      let density = z.treeDensity;
      if (y <= 1 || y >= H - 2) density = 0.85;
      else if (inAmbush(x, y)) density = 0.5;
      if (hash2(x, y, def.seed) < density) obstacle[k] = OBSTACLE.TREE;
    }
  }

  // 6) المسارات (الاتجاه المعاكس يُشتق تلقائيًا)
  const routes = {};
  const addRoute = (from, to, points) => {
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    routes[`${from}>${to}`] = { id: `${from}>${to}`, from, to, points, cum, length: cum[cum.length - 1] };
  };
  for (const r of def.routes) {
    addRoute(r.from, r.to, r.points);
    addRoute(r.to, r.from, [...r.points].reverse());
  }

  const world = {
    width: W,
    height: H,
    seed: def.seed,
    ground,
    obstacle,
    zones,
    npcs,
    buildings,
    stations,
    spawns,
    routes,
    monsterSpawns: def.monsterSpawns,
    ambush: def.ambush,
    ponds: def.ponds,
    river: def.river,
  };
  return world;
}

export function tileIndex(world, tx, ty) {
  return ty * world.width + tx;
}

export function isWalkable(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) return false;
  const k = ty * world.width + tx;
  return world.ground[k] !== GROUND.WATER && world.obstacle[k] === OBSTACLE.NONE;
}

export function zoneAt(world, x) {
  const tx = Math.floor(x);
  for (const z of world.zones) if (tx >= z.x0 && tx <= z.x1) return z;
  return x < 0 ? world.zones[0] : world.zones[world.zones.length - 1];
}

export function isSafeAt(world, x) {
  return zoneAt(world, x).safe;
}

export function nearestSpawn(world, x, y) {
  let best = world.spawns[0];
  let bd = Infinity;
  for (const s of world.spawns) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

export function npcById(world, id) {
  return world.npcs.find((n) => n.id === id) ?? null;
}

export function stationForCity(world, cityId) {
  return world.stations.find((s) => s.cityId === cityId) ?? null;
}

export function routeFor(world, from, to) {
  return world.routes[`${from}>${to}`] ?? null;
}

/** النقطة على المسار بعد قطع مسافة dist. */
export function pointOnRoute(route, dist) {
  const d = Math.max(0, Math.min(dist, route.length));
  let i = 1;
  while (i < route.cum.length - 1 && route.cum[i] < d) i++;
  const seg = route.cum[i] - route.cum[i - 1] || 1;
  const t = (d - route.cum[i - 1]) / seg;
  const [ax, ay] = route.points[i - 1];
  const [bx, by] = route.points[i];
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

/** بلاطة صالحة للمشي قرب نقطة (للظهور وإعادة الظهور). */
export function findWalkableNear(world, x, y, radius, rng, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (isWalkable(world, Math.floor(px), Math.floor(py))) return { x: px, y: py };
  }
  if (isWalkable(world, Math.floor(x), Math.floor(y))) return { x, y };
  return null;
}

let cachedWorld = null;
/** النسخة الافتراضية المترجمة (تُخزَّن مؤقتًا). */
export function getDefaultWorld() {
  if (!cachedWorld) cachedWorld = compileWorld(WORLD_DEF);
  return cachedWorld;
}
