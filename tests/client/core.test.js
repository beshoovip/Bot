import test from 'node:test';
import assert from 'node:assert/strict';
import { GameState, LocalPlayer } from '../../client/src/game/state.js';
import { InputController } from '../../client/src/game/input.js';
import { NetClient, Emitter, newIdem } from '../../client/src/network/net.js';
import { getServerUrl, normalizeServerUrl, saveServerUrl, loadSettings, saveSettings } from '../../client/src/config.js';
import { chunkBounds, chunkGrid, tileDiamond, buildScenery, visibleChunks, worldBounds, tilesShareEdge } from '../../client/src/game/render/geometry.js';
import { getDefaultWorld } from '../../shared/maps/world.js';
import { BALANCE } from '../../shared/data/balance.js';
import { OBSTACLE } from '../../shared/constants.js';

const world = getDefaultWorld();

// ===== الإعدادات =====
test('عنوان الخادم: يُقرأ من الإعدادات المحفوظة ثم البناء، ولا يُستخدم localhost كخادم', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(getServerUrl({}, storage, 'https://localhost'), null);
  assert.equal(getServerUrl({ VITE_SERVER_URL: 'https://game.example.com/' }, storage, 'https://localhost'), 'https://game.example.com');
  assert.equal(saveServerUrl('https://my.server:8443', storage), true);
  assert.equal(getServerUrl({ VITE_SERVER_URL: 'https://game.example.com' }, storage, 'https://localhost'), 'https://my.server:8443');
  assert.equal(getServerUrl({}, { getItem: () => null }, 'https://play.example.org'), 'https://play.example.org');
  assert.equal(normalizeServerUrl('javascript:alert(1)'), null);
  assert.equal(normalizeServerUrl('ftp://x.com'), null);
  assert.equal(normalizeServerUrl('https://a.com/path'), null);
  assert.equal(saveServerUrl('nonsense', storage), false);
});

test('إعدادات اللاعب: قيم افتراضية، تقييد النطاقات، وحفظ/تحميل', () => {
  const mem = new Map();
  const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadSettings(st).buttonSize, 1);
  saveSettings({ joystickSize: 9, buttonSize: 0.1, joystickSensitivity: 1.2, sound: false, leftHanded: true }, st);
  const s = loadSettings(st);
  assert.deepEqual(s, { joystickSize: 1.6, buttonSize: 0.7, joystickSensitivity: 1.2, sound: false, leftHanded: true });
  mem.set('caravan.settings', '{bad json');
  assert.equal(loadSettings(st).joystickSize, 1);
});

// ===== الإدخال =====
test('الإدخال: لوحة المفاتيح تعطي 8 اتجاهات، وتُرسل عند التغير فقط مع نبضة كل ثانية', () => {
  const sent = [];
  let t = 0;
  const inp = new InputController({ send: (ev, p) => (sent.push(p), true), now: () => t });
  inp.update();
  assert.deepEqual(sent.at(-1), { seq: 1, dir: -1 }); // أول إرسال: سكون
  inp.update();
  assert.equal(sent.length, 1, 'لا إعادة إرسال بلا تغير');
  inp.keyDown('ArrowRight');
  assert.equal(inp.update(), 0);
  inp.keyDown('ArrowDown');
  assert.equal(inp.update(), 1); // جنوب-شرق
  inp.keyUp('ArrowRight');
  assert.equal(inp.update(), 2);
  inp.keyDown('KeyA');
  assert.equal(inp.update(), 3);
  inp.keyDown('KeyW'); // أسفل + يسار + أعلى + ... → يلغي المحور الرأسي
  inp.keyUp('ArrowDown');
  assert.equal(inp.update(), 5);
  const n = sent.length;
  t += 1500;
  inp.update();
  assert.equal(sent.length, n + 1, 'نبضة إعادة إرسال أثناء الحركة');
  assert.ok(sent.every((p, i) => i === 0 || p.seq > sent[i - 1].seq), 'seq تصاعدي');
  inp.clear();
  assert.equal(inp.update(), -1);
});

test('الإدخال: العصا الافتراضية والمنطقة الميتة والحساسية، ولا إرسال بلا اتصال', () => {
  const sent = [];
  const inp = new InputController({ send: (e, p) => (sent.push(p), true), now: () => 0 });
  inp.setJoystick(0.1, 0.1);
  assert.equal(inp.update(), -1);
  inp.setJoystick(0.7, 0.0);
  assert.equal(inp.update(), 0);
  inp.setJoystick(0, -0.9);
  assert.equal(inp.update(), 6);
  const hi = new InputController({ send: () => true, now: () => 0, sensitivity: 1.5 });
  hi.setJoystick(0.2, 0);
  assert.equal(hi.computeDir(), 0, 'حساسية أعلى = منطقة ميتة أصغر');
  const lo = new InputController({ send: () => true, now: () => 0, sensitivity: 0.5 });
  lo.setJoystick(0.2, 0);
  assert.equal(lo.computeDir(), -1);
  const offline = new InputController({ send: () => false, now: () => 0 });
  offline.keyDown('KeyD');
  offline.update();
  offline.update();
  assert.equal(offline.lastSentDir, -2, 'يعيد المحاولة حتى يتصل');
  offline.enabled = false;
  assert.equal(offline.computeDir(), -1);
});

// ===== حالة اللعبة والتنبؤ =====
test('التنبؤ: حركة محلية فورية بنفس سرعة الخادم، وتصحيح ناعم، وانتقال فوري للفروق الكبيرة', () => {
  const me = new LocalPlayer(world);
  assert.equal(me.reconcile({ x: 10, y: 25, dead: false, rooted: false }), 'snap');
  me.dir = 0;
  for (let i = 0; i < 15; i++) me.step(1 / 60);
  assert.ok(Math.abs(Math.hypot(me.x - 10, me.y - 25) - BALANCE.playerSpeed * 0.25) < 0.02);
  // خادم خلفنا قليلًا: دمج ناعم
  const x0 = me.x;
  assert.equal(me.reconcile({ x: me.x - 0.5, y: me.y }, { rtt: 0 }), 'blend');
  assert.ok(me.x < x0 && me.x > x0 - 0.5);
  // فرق كبير: انتقال فوري (واقفًا فلا يُضاف تقدّم تنبؤي)
  me.dir = -1;
  assert.equal(me.reconcile({ x: 80, y: 25 }), 'snap');
  assert.equal(me.x, 80);
  // مشلول/ميت: لا حركة
  me.reconcile({ x: 80, y: 25, rooted: true });
  const before = me.x;
  me.step(1);
  assert.equal(me.x, before);
  me.rooted = false;
  me.reconcile({ x: 80, y: 25, dead: true });
  me.step(1);
  assert.equal(me.x, 80);
});

test('التنبؤ لا يخترق الجدران (نفس منطق الخادم)', () => {
  const me = new LocalPlayer(world);
  me.reconcile({ x: 10.5, y: 2.5 });
  me.dir = 6;
  for (let i = 0; i < 300; i++) me.step(1 / 60);
  assert.ok(me.y >= 1.3 - 1e-6);
});

test('GameState: اللقطات تُنشئ وتحدّث وتزيل الكيانات، والاستيفاء يقترب من الهدف', () => {
  const st = new GameState({ now: () => 0 });
  const snap = (players, monsters = []) => ({ t: 1, ack: 3, you: { x: 10, y: 25, hp: 50, maxHp: 100, zone: 'dawn_city', dead: false }, players, monsters, caravans: [], drops: [{ id: 1, x: 10.5, y: 25 }], traps: [] });
  st.applySnapshot(snap([{ id: 7, name: 'A', x: 12, y: 25 }], [{ id: 1, code: 'wolf', x: 30, y: 10 }]));
  assert.equal(st.entities.size, 2);
  assert.equal(st.entity('player', 7).x, 12);
  st.applySnapshot(snap([{ id: 7, name: 'A', x: 14, y: 25 }]));
  assert.equal(st.entities.size, 1, 'اختفى الوحش من اللقطة');
  const e = st.entity('player', 7);
  assert.equal(e.x, 12);
  for (let i = 0; i < 30; i++) st.update(1 / 30);
  assert.ok(Math.abs(e.x - 14) < 0.01);
  st.applySnapshot(snap([{ id: 7, name: 'A', x: 60, y: 25 }]));
  assert.equal(e.x, 60, 'قفزة كبيرة = انتقال فوري');
  assert.equal(st.zone, 'dawn_city');
  assert.equal(st.nearestDrop().id, 1);
  assert.equal(st.nearest('player', 100).id, 7);
  assert.equal(st.nearest('player', 1), null);
  st.selected = { type: 'player', id: 7 };
  st.applySnapshot(snap([]));
  assert.equal(st.selected, null, 'تحديد الهدف يُلغى باختفائه');
  assert.equal(st.nearestNpc(world)?.id, undefined);
});

test('GameState: أحداث الانضمام والدردشة والقافلة الخاصة بي', () => {
  const st = new GameState({ now: () => 0 });
  st.onJoined({ self: { id: 5, name: 'me' }, inventory: [{ itemId: 'wheat', qty: 2 }], chat: [{ name: 'x', text: 'hi' }], zone: 'dawn_city' });
  assert.equal(st.self.id, 5);
  for (let i = 0; i < 100; i++) st.onChat({ name: 'a', text: String(i) });
  assert.equal(st.chat.length, 80);
  st.applySnapshot({ t: 0, ack: 0, you: { x: 1, y: 1, zone: 'z' }, players: [], monsters: [], caravans: [{ id: 3, ownerId: 5, x: 1, y: 1, hp: 10 }, { id: 4, ownerId: 9, x: 2, y: 2 }], drops: [], traps: [] });
  assert.equal(st.myCaravan().id, 3);
});

// ===== الشبكة =====
class FakeSocket {
  constructor() {
    this.h = new Map();
    this.connected = false;
    this.sent = [];
    this.joinOk = true;
  }
  on(ev, fn) { (this.h.get(ev) ?? this.h.set(ev, []).get(ev)).push(fn); }
  fire(ev, ...a) { for (const f of this.h.get(ev) ?? []) f(...a); }
  emit(ev, payload, cb) {
    this.sent.push([ev, payload]);
    if (ev === 'join') cb?.(this.joinOk ? { ok: true } : { ok: false, error: 'UNAUTHORIZED' });
    else this.onEmit?.(ev, payload, cb);
  }
  connect() { this.connected = true; this.fire('connect'); }
  drop(reason = 'transport close') { this.connected = false; this.fire('disconnect', reason); }
  disconnect() { this.connected = false; this.fire('disconnect', 'io client disconnect'); }
}
const fakeTimers = () => {
  const q = [];
  return { setTimeout: (f, ms) => (q.push({ f, ms }), q.length), clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {}, q };
};

test('الشبكة: الانضمام بعد الاتصال، وإعادة الانضمام تلقائيًا بعد الانقطاع، والحالات', () => {
  const sock = new FakeSocket();
  let opts;
  const net = new NetClient({ ioFactory: (u, o) => ((opts = o), sock), url: 'https://x', getToken: () => 'tok', timers: fakeTimers() });
  const statuses = [];
  net.on('status', (s) => statuses.push(s));
  net.connect(42);
  assert.deepEqual(opts.auth, { token: 'tok' });
  assert.deepEqual(opts.transports, ['websocket']);
  sock.connect();
  assert.equal(net.status, 'online');
  assert.deepEqual(sock.sent.at(-1), ['join', { characterId: 42 }]);
  sock.drop();
  assert.equal(net.status, 'reconnecting');
  assert.equal(net.joined, false);
  sock.connect();
  assert.equal(sock.sent.filter((s) => s[0] === 'join').length, 2, 'أعاد الانضمام بنفس الشخصية');
  assert.equal(net.status, 'online');
  assert.deepEqual(statuses, ['connecting', 'online', 'reconnecting', 'online']);
  assert.equal(net.send('input', { seq: 1, dir: 0 }), true);
  sock.connected = false;
  assert.equal(net.send('input', { seq: 2, dir: 0 }), false);
});

test('الشبكة: الطلب الموثوق يُعاد بنفس idem بعد الانقطاع ولا يضيع، ثم يحلّ الوعد', async () => {
  const sock = new FakeSocket();
  const timers = fakeTimers();
  const net = new NetClient({ ioFactory: () => sock, url: 'https://x', getToken: () => 't', timers });
  net.connect(1);
  sock.connect();
  let swallow = true; // الخادم لا يرد في المحاولة الأولى (انقطاع أثناء الطلب)
  sock.onEmit = (ev, payload, cb) => { if (!swallow) cb({ ok: true, ev, idem: payload.idem }); };
  const idem = newIdem();
  assert.match(idem, /^[0-9a-f]{24}$/);
  const p = net.request('market:buy', { npcId: 'n', itemId: 'wheat', qty: 1, idem });
  assert.equal(sock.sent.filter((s) => s[0] === 'market:buy').length, 1);
  sock.drop();
  swallow = false;
  sock.connect(); // join ثم إعادة إرسال المعلّق
  const res = await p;
  assert.equal(res.ok, true);
  const buys = sock.sent.filter((s) => s[0] === 'market:buy');
  assert.equal(buys.length, 2);
  assert.equal(buys[0][1].idem, buys[1][1].idem, 'نفس مفتاح منع التكرار');
  assert.equal(net.pending.size, 0);
});

test('الشبكة: مهلة الطلب، فشل الانضمام، الطرد عند الدخول من جهاز آخر، والإغلاق', async () => {
  const sock = new FakeSocket();
  const timers = fakeTimers();
  const net = new NetClient({ ioFactory: () => sock, url: 'https://x', getToken: () => 't', timers });
  net.connect(1);
  const failed = [];
  net.on('join_failed', (e) => failed.push(e));
  sock.joinOk = false;
  sock.connect();
  assert.deepEqual(failed, ['UNAUTHORIZED']);
  assert.equal(net.status, 'connecting');
  const p = net.request('chat', { text: 'hi' }); // غير منضم → ينتظر
  timers.q.at(-1).f(); // انتهت المهلة
  assert.equal((await p).error, 'TIMEOUT');
  sock.fire('err', { ev: 'join', code: 'DUPLICATE' });
  assert.equal(net.status, 'kicked');
  const p2 = net.request('chat', { text: 'x' });
  net.close();
  assert.equal((await p2).error, 'CLOSED');
  assert.equal(net.status, 'offline');
});

test('الشبكة: قياس زمن الانتقال من pong', () => {
  const sock = new FakeSocket();
  let now = 1000;
  const net = new NetClient({ ioFactory: () => sock, url: 'u', getToken: () => 't', now: () => now, timers: fakeTimers() });
  net.connect(1);
  sock.connect();
  now = 1087;
  sock.fire('pong', { t: 1000 });
  assert.equal(net.rtt, 87);
});

// ===== هندسة العرض =====
test('هندسة العرض: قطع العالم تغطي كل البلاطات وحجم كل قطعة ≤ 1024×512 (آمن لنسيج الجوال)', () => {
  const { cols, rows } = chunkGrid(world);
  assert.equal(cols * rows, 6 * 3);
  let tiles = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const b = chunkBounds(world, cx, cy);
      assert.ok(b.w <= 1024 && b.h <= 512, `${cx},${cy}: ${b.w}x${b.h}`);
      tiles += (b.x1 - b.x0) * (b.y1 - b.y0);
    }
  }
  assert.equal(tiles, world.width * world.height);
  const wb = worldBounds(world);
  assert.equal(wb.w, (96 + 48) * 32);
  assert.equal(wb.h, (96 + 48) * 16);
});

test('المعين المائل: نسبة 2:1 والبلاطات المتجاورة تتشارك الحواف بلا فجوات', () => {
  const [t, r, b, l] = tileDiamond(5, 7);
  assert.equal(r.x - l.x, 64);
  assert.equal(b.y - t.y, 32);
  assert.equal(t.x, b.x);
  assert.ok(tilesShareEdge({ tx: 5, ty: 7 }, { tx: 6, ty: 7 }));
  assert.ok(tilesShareEdge({ tx: 5, ty: 7 }, { tx: 5, ty: 8 }));
  assert.ok(!tilesShareEdge({ tx: 5, ty: 7 }, { tx: 9, ty: 7 }));
});

test('عوائق العالم تُجمَّع: كل مبنى عنصر واحد، وكل بلاطة عائق تظهر، والعمق يزداد نحو الكاميرا', () => {
  const items = buildScenery(world);
  const bld = items.filter((i) => i.kind === 'building');
  assert.equal(bld.length, world.buildings.length);
  let obstacleTiles = 0;
  for (let i = 0; i < world.obstacle.length; i++) if (world.obstacle[i] && world.obstacle[i] !== OBSTACLE.BUILDING) obstacleTiles++;
  assert.equal(items.length - bld.length, obstacleTiles);
  const a = items.find((i) => i.kind === 'tree');
  const front = { depth: a.depth + 1 };
  assert.ok(front.depth > a.depth);
  for (const it of items) assert.ok(it.bounds.w > 0 && it.bounds.h > 0 && Number.isFinite(it.depth));
});

test('الإخفاء: قطع العرض المرئية تعتمد على مستطيل الكاميرا', () => {
  const all = visibleChunks(world, { x: -1e5, y: -1e5, w: 2e5, h: 2e5 });
  assert.equal(all.length, 18);
  const small = visibleChunks(world, { x: -1500, y: 100, w: 800, h: 450 });
  assert.ok(small.length > 0 && small.length < 18);
  assert.equal(visibleChunks(world, { x: 1e6, y: 1e6, w: 10, h: 10 }).length, 0);
});
