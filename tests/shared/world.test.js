import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultWorld, compileWorld, isWalkable, zoneAt, isSafeAt, pointOnRoute, routeFor, nearestSpawn, findWalkableNear } from '../../shared/maps/world.js';
import { GROUND } from '../../shared/constants.js';
import { mulberry32 } from '../../shared/rng.js';
import { MONSTERS } from '../../shared/data/monsters.js';

const world = getDefaultWorld();

function bfs(from, to) {
  const W = world.width;
  const seen = new Uint8Array(W * world.height);
  const q = [[from.x, from.y]];
  seen[from.y * W + from.x] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    if (x === to.x && y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(world, nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1;
      q.push([nx, ny]);
    }
  }
  return false;
}

test('الخريطة حتمية: ترجمتان بنفس التعريف تعطيان نفس الشبكة', () => {
  const a = compileWorld();
  const b = compileWorld();
  assert.deepEqual(Buffer.from(a.ground), Buffer.from(b.ground));
  assert.deepEqual(Buffer.from(a.obstacle), Buffer.from(b.obstacle));
});

test('العالم يحتوي مدينتين آمنتين ومنطقة خطرة في المنتصف بثلاث مناطق فرعية', () => {
  const ids = world.zones.map((z) => z.id);
  assert.deepEqual(ids, ['dawn_city', 'wind_plains', 'wolf_valley', 'shadow_pass', 'dusk_city']);
  assert.equal(world.zones[0].safe, true);
  assert.equal(world.zones[4].safe, true);
  assert.ok(world.zones.slice(1, 4).every((z) => !z.safe && z.danger > 0));
  // اليسار آمن، الوسط خطر، اليمين آمن
  assert.equal(isSafeAt(world, 5), true);
  assert.equal(isSafeAt(world, 48), false);
  assert.equal(isSafeAt(world, 90), true);
  assert.equal(zoneAt(world, 60.2).id, 'shadow_pass');
});

test('طريق متصل بين نقطتي ظهور المدينتين على بلاطات صالحة للمشي', () => {
  const l = nearestSpawn(world, 0, 25);
  const r = nearestSpawn(world, 95, 25);
  assert.notEqual(l.id, r.id);
  const a = { x: Math.floor(l.x), y: Math.floor(l.y) };
  const b = { x: Math.floor(r.x), y: Math.floor(r.y) };
  assert.ok(isWalkable(world, a.x, a.y) && isWalkable(world, b.x, b.y));
  assert.ok(bfs(a, b), 'لا يوجد طريق مشي بين المدينتين');
});

test('كل NPC ومحطة قوافل ونقطة ظهور على بلاطة صالحة ومتصلة بنقطة الظهور', () => {
  const origin = { x: Math.floor(world.spawns[0].x), y: Math.floor(world.spawns[0].y) };
  for (const n of world.npcs) {
    assert.ok(isWalkable(world, Math.floor(n.x), Math.floor(n.y)), `NPC ${n.id}`);
    assert.ok(bfs(origin, { x: Math.floor(n.x), y: Math.floor(n.y) }), `NPC ${n.id} غير قابل للوصول`);
  }
  for (const s of [...world.stations, ...world.spawns]) assert.ok(isWalkable(world, Math.floor(s.x), Math.floor(s.y)), s.id);
  assert.equal(world.npcs.length, 10);
  assert.equal(world.stations.length, 2);
});

test('كل مدينة فيها سوق وحداد وكاهن ومهام ومشرف قوافل', () => {
  for (const key of ['dawn', 'dusk']) {
    for (const type of ['market', 'smith', 'healer', 'quests', 'caravan']) {
      assert.ok(world.npcs.some((n) => n.id === `${key}_${type === 'quests' ? 'quests' : type}` && n.type === type), `${key}_${type}`);
    }
  }
});

test('مسار القافلة ينطلق من محطة وينتهي عند محطة المدينة الأخرى ويقع على بلاطات طريق أو جسر', () => {
  const route = routeFor(world, 'dawn_city', 'dusk_city');
  const back = routeFor(world, 'dusk_city', 'dawn_city');
  assert.ok(route && back);
  assert.ok(Math.abs(route.length - back.length) < 1e-9);
  assert.ok(route.length > 50 && route.length < 90, `طول المسار ${route.length}`);
  const dawn = world.stations.find((s) => s.cityId === 'dawn_city');
  const dusk = world.stations.find((s) => s.cityId === 'dusk_city');
  const start = pointOnRoute(route, 0);
  const end = pointOnRoute(route, route.length);
  assert.ok(Math.hypot(start.x - dawn.x, start.y - dawn.y) < 0.01);
  assert.ok(Math.hypot(end.x - dusk.x, end.y - dusk.y) < 0.01);
  for (let d = 0; d <= route.length; d += 0.5) {
    const p = pointOnRoute(route, d);
    const g = world.ground[Math.floor(p.y) * world.width + Math.floor(p.x)];
    assert.ok([GROUND.ROAD, GROUND.BRIDGE, GROUND.CITY].includes(g), `نقطة المسار (${p.x.toFixed(1)},${p.y.toFixed(1)}) ليست على طريق`);
    assert.ok(isWalkable(world, Math.floor(p.x), Math.floor(p.y)));
  }
});

test('المسار يعبر النهر عبر جسر (لا ماء في الطريق)', () => {
  const bridges = [];
  for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) if (world.ground[y * world.width + x] === GROUND.BRIDGE) bridges.push([x, y]);
  assert.ok(bridges.length >= 6, 'يجب أن توجد جسور');
});

test('مدينتان آمنتان محاطتان بجدران ببوابات قابلة للمرور', () => {
  assert.ok(!isWalkable(world, 21, 20)); // جدار
  assert.ok(isWalkable(world, 21, 24)); // بوابة رئيسية
  assert.ok(isWalkable(world, 21, 25));
  assert.ok(!isWalkable(world, 74, 20));
  assert.ok(isWalkable(world, 74, 24));
});

test('مناطق ظهور الوحوش تشير لوحوش معرّفة وتقع على مواضع صالحة', () => {
  const rng = mulberry32(1);
  for (const s of world.monsterSpawns) {
    assert.ok(MONSTERS[s.monster], `وحش غير معرّف ${s.monster}`);
    assert.ok(!zoneAt(world, s.x).safe, `منطقة ظهور داخل مدينة: ${s.id}`);
    const p = findWalkableNear(world, s.x, s.y, s.r, rng);
    assert.ok(p, `لا يوجد موضع ظهور صالح لـ ${s.id}`);
  }
});

test('أماكن الكمائن داخل المنطقة الخطرة وبقربها طريق', () => {
  assert.equal(world.ambush.length, 3);
  for (const a of world.ambush) {
    assert.ok(!isSafeAt(world, a.x));
    let nearRoad = false;
    for (let y = Math.floor(a.y - a.r - 6); y <= a.y + a.r + 6 && !nearRoad; y++) {
      for (let x = Math.floor(a.x - a.r - 6); x <= a.x + a.r + 6; x++) {
        const g = world.ground[y * world.width + x];
        if (g === GROUND.ROAD || g === GROUND.BRIDGE) { nearRoad = true; break; }
      }
    }
    assert.ok(nearRoad, `الكمين ${a.id} بعيد عن الطرق`);
  }
});

test('الأشجار لا تسد الطرق ولا توجد داخل المدن', () => {
  let trees = 0;
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const k = y * world.width + x;
      if (world.obstacle[k] === 1) {
        trees++;
        assert.ok(world.ground[k] !== GROUND.ROAD && world.ground[k] !== GROUND.BRIDGE);
        assert.ok(!zoneAt(world, x).safe);
      }
    }
  }
  assert.ok(trees > 100, `عدد الأشجار ${trees}`);
});
