import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(import.meta.dirname, '../..');
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' };
let srv, br, page, base;
const errors = [];
before(async () => {
  srv = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', MIME[path.extname(f)] ?? 'text/plain');
    fs.createReadStream(f).pipe(r);
  }).listen(0);
  base = `http://localhost:${srv.address().port}`;
  br = await chromium.launch();
  page = await br.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${base}/tests/ui/harness.html`);
  await page.waitForFunction('window.READY', null, { timeout: 15000 });
});
after(async () => { await br?.close(); srv?.close(); });

test('HUD يعرض الحالة بالعربية ولا ينفّذ HTML من الأسماء/الدردشة (XSS)', async () => {
  assert.match(await page.textContent('.pname'), /تاجر/);
  assert.equal(await page.evaluate('window.XSS'), undefined);
  assert.equal(await page.evaluate('document.querySelector(".pname img")'), null, 'الاسم نص وليس عنصرًا');
  await page.click('[data-panel="chat"]');
  assert.equal(await page.evaluate('window.XSS2'), undefined);
  assert.match(await page.textContent('.chatlog'), /<script>/);
  await page.click('.phead .ibtn');
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl');
  assert.match(await page.textContent('.zone'), /مدينة الفجر · آمنة/);
});

test('الخريطة المصغرة ترسم الأرضية فعليًا (ليست سوداء) وعلامة اللاعب', async () => {
  await page.waitForTimeout(300);
  await page.evaluate('T.hud.update()');
  const px = await page.evaluate(() => {
    const c = document.querySelector('.minimap');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return colors.size;
  });
  assert.ok(px >= 3, `ألوان مميزة: ${px}`);
});

test('العصا الافتراضية تُرسل اتجاهات عند اللمس وتتوقف عند الرفع', async () => {
  const box = await page.locator('#stick').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.evaluate(([x, y]) => {
    const s = document.getElementById('stick');
    const ev = (t, dx, dy) => s.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: x + dx, clientY: y + dy, bubbles: true }));
    window.__ev = ev; ev('pointerdown', 60, 0);
  }, [cx, cy]);
  assert.equal(await page.evaluate('T.input.update()'), 0);
  await page.evaluate('window.__ev("pointermove", 0, 60)');
  assert.equal(await page.evaluate('T.input.update()'), 2);
  await page.evaluate('window.__ev("pointermove", -60, -60)');
  assert.equal(await page.evaluate('T.input.update()'), 5);
  await page.evaluate('window.__ev("pointerup", 0, 0)');
  assert.equal(await page.evaluate('T.input.update()'), -1);
});

test('الأزرار: الحديث والالتقاط يظهران قرب الشخصية/الغنيمة، والتحدث يرسل interact', async () => {
  assert.equal(await page.isVisible('#btn-talk'), true);
  assert.equal(await page.isVisible('#btn-loot'), true);
  await page.evaluate('T.sent.length = 0');
  await page.dispatchEvent('#btn-talk', 'pointerdown');
  const sent = await page.evaluate('T.sent');
  assert.equal(sent[0][0], 'interact');
  assert.match(sent[0][1].npcId, /^dawn_/);
  await page.dispatchEvent('#btn-loot', 'pointerdown');
  assert.deepEqual((await page.evaluate('T.sent')).at(-1), ['loot:pickup', { dropId: 9 }]);
  await page.evaluate('T.state.me.x = 40; T.state.me.y = 10; T.hud.update()');
  assert.equal(await page.isVisible('#btn-talk'), false);
  await page.evaluate('T.state.me.x = 19.5; T.state.me.y = 23; T.hud.update()');
});

test('الهجوم بلا هدف لا يرسل شيئًا، ومع وحش قريب يرسل attack بالهدف الصحيح', async () => {
  await page.evaluate('T.sent.length = 0');
  await page.dispatchEvent('#btn-attack', 'pointerdown');
  assert.equal(await page.evaluate('T.sent.filter(s=>s[0]==="attack").length'), 0);
  await page.evaluate(`T.state.applySnapshot({t:2,ack:0,you:{x:19.5,y:23,hp:80,maxHp:110,dead:false,zone:'dawn_city'},players:[],monsters:[{id:77,code:'wolf',x:21,y:23,hp:30,maxHp:45}],caravans:[],drops:[],traps:[]})`);
  await page.dispatchEvent('#btn-attack', 'pointerdown');
  assert.deepEqual((await page.evaluate('T.sent')).at(-1), ['attack', { targetType: 'monster', targetId: 77 }]);
});

test('السوق: عرض البضائع والشراء بمفتاح idem ثابت، والبيع، وتعطيل الشراء عند نقص الذهب', async () => {
  await page.evaluate(`T.net.emit('npc', {npcId:'dawn_market',type:'market',name:'تاجر السوق',cityId:'dawn_city',goods:[{itemId:'wheat',buy:10,sell:8},{itemId:'gems',buy:900,sell:700}],sellable:[{itemId:'wheat',qty:5,sell:8}]})`);
  assert.match(await page.textContent('.dialog'), /قمح/);
  const buys = page.locator('.dialog .list').first().locator('button');
  assert.equal(await buys.nth(1).isDisabled(), true, 'الأحجار 900 > 500 ذهب');
  await page.evaluate('T.requests.length = 0');
  await buys.nth(0).click();
  const r = await page.evaluate('T.requests');
  assert.equal(r[0][0], 'market:buy');
  assert.deepEqual({ ...r[0][1], idem: 'x' }, { npcId: 'dawn_market', itemId: 'wheat', qty: 1, idem: 'x' });
  assert.match(r[0][1].idem, /^[0-9a-f]{24}$/);
  await page.locator('.dialog .list').nth(1).locator('button').first().click();
  assert.equal((await page.evaluate('T.requests')).at(-1)[0], 'market:sell');
});

test('القافلة: اختيار الحمولة يحسب العائد، والإطلاق يرسل cargo ووجهة ومفتاح idem', async () => {
  await page.evaluate(`T.net.emit('npc', {npcId:'dawn_caravan',type:'caravan',name:'مشرف القوافل',cityId:'dawn_city',fee:40,capacity:24,destinations:['dusk_city'],canLaunch:true,goods:['wheat'],prices:{}})`);
  assert.equal(await page.isDisabled('#launch-btn'), true, 'لا حمولة بعد');
  await page.locator('.dialog .list li button', { hasText: 'الكل' }).click();
  assert.equal(await page.isDisabled('#launch-btn'), false);
  assert.match(await page.textContent('.dialog .sum'), /5\/24/);
  await page.evaluate('T.requests.length = 0');
  await page.click('#launch-btn');
  const [ev, p] = (await page.evaluate('T.requests'))[0];
  assert.equal(ev, 'caravan:launch');
  assert.equal(p.destCity, 'dusk_city');
  assert.deepEqual(p.cargo, { wheat: 5 });
  assert.match(p.idem, /^[0-9a-f]{24}$/);
});

test('غير التاجر لا يستطيع إطلاق قافلة (رسالة واضحة)', async () => {
  await page.evaluate(`T.net.emit('npc', {npcId:'dawn_caravan',type:'caravan',name:'م',cityId:'dawn_city',fee:40,capacity:24,destinations:['dusk_city'],canLaunch:false})`);
  assert.match(await page.textContent('.dialog'), /للتجار فقط/);
  await page.evaluate('T.hud.closeDialog()');
});

test('لوحات الحقيبة والمهارات والمهام والخريطة والإعدادات تعمل', async () => {
  await page.click('[data-panel="bag"]');
  assert.match(await page.textContent('.panel'), /سيف صدئ/);
  assert.match(await page.textContent('.panel li.eq'), /مُجهَّز/);
  await page.evaluate('T.requests.length = 0');
  await page.locator('.panel li', { hasText: 'جرعة شفاء' }).locator('button').click();
  assert.deepEqual((await page.evaluate('T.requests'))[0], ['item:use', { itemId: 'health_potion' }]);
  await page.click('[data-panel="skills"]');
  assert.match(await page.textContent('.panel'), /درع القافلة/);
  await page.locator('.panel li button').first().click();
  assert.equal((await page.evaluate('T.requests')).at(-1)[0], 'skill:upgrade');
  await page.click('[data-panel="quests"]');
  assert.match(await page.textContent('.panel'), /أول رحلة/);
  await page.click('.minimap');
  assert.equal(await page.isVisible('.bigmap'), true);
  await page.click('[data-panel="settings"]');
  await page.locator('.setting input[type=checkbox]').last().check();
  assert.equal(await page.evaluate('T.saved.leftHanded'), true);
  assert.equal(await page.evaluate('document.querySelector(".hud").classList.contains("lefty")'), true);
  await page.click('.phead .ibtn');
});

test('الموت والانقطاع: تظهر الطبقات، وتُخفى عند العودة', async () => {
  await page.evaluate('T.state.self.dead = true; T.state.self.respawnIn = 7; T.state.you.dead = true; T.hud.update()');
  assert.equal(await page.isVisible('.death'), true);
  assert.match(await page.textContent('.death p'), /7/);
  await page.evaluate('T.state.self.dead = false; T.state.you.dead = false; T.net.status = "reconnecting"; T.hud.update()');
  assert.equal(await page.isVisible('.death'), false);
  assert.match(await page.textContent('.conn h2'), /انقطع الاتصال/);
  await page.evaluate('T.net.status = "online"; T.hud.update()');
  assert.equal(await page.isVisible('.conn'), false);
});

test('قافلتي تظهر في الشريط مع حالتها، والإنذار عند الهجوم', async () => {
  await page.evaluate(`T.state.applySnapshot({t:3,ack:0,you:{x:19.5,y:23,hp:80,maxHp:110,dead:false,zone:'dawn_city'},players:[],monsters:[],caravans:[{id:4,ownerId:1,x:30,y:20,hp:50,maxHp:100,status:'under_attack',dest:'dusk_city',progress:0.4}],drops:[],traps:[]}); T.hud.update()`);
  assert.match(await page.textContent('.caravanbar'), /تحت الهجوم.*40%/);
  assert.equal(await page.evaluate('document.querySelector(".caravanbar").classList.contains("alert")'), true);
});

test('لا أخطاء في وحدة التحكم أثناء كل ما سبق', () => {
  assert.deepEqual(errors, []);
});

test('شاشات الدخول: تسجيل ← إنشاء شخصية بمهنة ← قائمة ← دخول، مع أخطاء عربية', async () => {
  const out = await page.evaluate(async () => {
    const calls = [];
    const fake = {
      login: async (u, p) => (calls.push(['login', u]), p === 'bad' ? { ok: false, error: 'BAD_CREDENTIALS' } : { ok: true, token: 't' }),
      register: async (u) => (calls.push(['register', u]), { ok: true, token: 't' }),
      characters: async () => ({ ok: true, characters: window.__chars ?? [] }),
      createCharacter: async (n, p) => (calls.push(['create', n, p]), (window.__chars = [{ id: 7, name: n, profession: p, level: 1 }]), { ok: true }),
      logout: async () => ({ ok: true }),
    };
    const root = document.createElement('div');
    document.body.append(root);
    let entered = null; let url = null;
    const sc = T.createScreens(root, { api: fake, getServerUrl: () => url, setServerUrl: (u) => (url = u), onEnter: (c) => (entered = c), session: {} });
    sc.showLogin();
    const q = (s) => root.querySelector(s);
    const tick = () => new Promise((r) => setTimeout(r, 30));
    // خادم غير مضبوط: القسم مفتوح
    const serverOpen = q('details').open;
    q('details input').value = 'javascript:alert(1)';
    q('details .btn').click();
    const badUrlMsg = q('.msg').textContent;
    q('details input').value = 'https://game.example.com/';
    q('details .btn').click();
    await tick();
    q('[name=username]').value = 'hero';
    q('[name=password]').value = 'bad';
    [...root.querySelectorAll('.btn')].find((b) => b.textContent === 'دخول').click();
    await tick();
    const loginErr = q('.msg').textContent;
    q('[name=password]').value = 'good-password';
    [...root.querySelectorAll('.btn')].find((b) => b.textContent === 'دخول').click();
    await tick();
    const emptyList = root.textContent.includes('لا توجد شخصيات');
    [...root.querySelectorAll('.btn')].find((b) => b.textContent === 'شخصية جديدة').click();
    q('input[aria-label="اسم الشخصية"]').value = 'الصياد_1';
    q('[data-prof="hunter"]').click();
    [...root.querySelectorAll('.btn')].find((b) => b.textContent === 'إنشاء').click();
    await tick(); await tick();
    q('.char').click();
    return { serverOpen, badUrlMsg, url, loginErr, emptyList, calls, entered };
  });
  assert.equal(out.serverOpen, true);
  assert.match(out.badUrlMsg, /غير صالح/);
  assert.equal(out.url, 'https://game.example.com/');
  assert.equal(out.loginErr, 'بيانات الدخول غير صحيحة');
  assert.equal(out.emptyList, true);
  assert.deepEqual(out.calls.at(-1), ['create', 'الصياد_1', 'hunter']);
  assert.equal(out.entered.id, 7);
});
