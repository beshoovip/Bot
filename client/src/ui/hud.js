// واجهة اللعب: HUD، عصا التحكم، أزرار الإجراءات، اللوحات (حقيبة/مهارات/مهام/خريطة/دردشة/إعدادات) وحوارات الشخصيات.
// لا تعتمد على Phaser. تتصل بالعالم عبر { state, world, net, input } وتُحدَّث بـ hud.update() كل إطار (خفيف) و refresh*() عند الأحداث.

import { h, clear, fmt } from './dom.js';
import { AR, PROFESSION_AR, CITY_AR, STATUS_AR, DANGER_AR, tError, tNotice } from '../i18n/ar.js';
import { ITEMS, getItem } from '../../../shared/data/items.js';
import { SKILLS, MAX_SKILL_LEVEL } from '../../../shared/data/skills.js';
import { PROFESSIONS } from '../../../shared/data/professions.js';
import { QUESTS } from '../../../shared/data/quests.js';
import { caravanReward, cargoUnits } from '../../../shared/economy.js';
import { C2S } from '../../../shared/protocol.js';
import { BALANCE } from '../../../shared/data/balance.js';
import { newIdem } from '../network/net.js';
import { renderBaseMap, drawMap } from '../game/render/minimap.js';

const itemName = (id) => getItem(id)?.nameAr ?? id;
const zoneOf = (world, id) => world.zones.find((z) => z.id === id);

export function createHud(root, { state, world, net, input, settings, onSettings, onLogout, sfx = () => {} }) {
  const el = {};
  const hud = h('div', { class: 'hud', dir: 'rtl' });
  root.append(hud);

  // ---------- أعلى اليمين/اليسار ----------
  el.name = h('b', { class: 'pname' });
  el.hpFill = h('i');
  el.xpFill = h('i');
  el.hpText = h('span', { class: 'bartext' });
  el.gold = h('span', { class: 'gold' });
  el.zone = h('span', { class: 'zone' });
  el.flags = h('span', { class: 'flags' });
  hud.append(
    h('div', { class: 'status' },
      el.name,
      h('div', { class: 'bar hp' }, el.hpFill, el.hpText),
      h('div', { class: 'bar xp' }, el.xpFill),
      h('div', { class: 'line' }, el.gold, el.zone, el.flags)));

  el.mini = h('canvas', { class: 'minimap', width: 128, height: 128, 'aria-label': AR.map, onclick: () => togglePanel('map') });
  el.net = h('span', { class: 'net' });
  const menuBtn = (id, icon, label) => h('button', { class: 'ibtn', 'data-panel': id, 'aria-label': label, title: label, onclick: () => togglePanel(id), text: icon });
  hud.append(h('div', { class: 'topright' }, el.mini, h('div', { class: 'menu' }, menuBtn('bag', '🎒', AR.bag), menuBtn('skills', '✦', AR.skills), menuBtn('quests', '📜', AR.quests), menuBtn('chat', '💬', AR.chat), menuBtn('settings', '⚙', AR.settings)), el.net));

  // ---------- قافلة ----------
  el.caravan = h('div', { class: 'caravanbar', hidden: true });
  hud.append(el.caravan);

  // ---------- أزرار ----------
  el.btnAttack = h('button', { class: 'abtn big', id: 'btn-attack', 'aria-label': AR.attack, text: '⚔' });
  el.btnSkill1 = h('button', { class: 'abtn', id: 'btn-skill1' });
  el.btnSkill2 = h('button', { class: 'abtn', id: 'btn-skill2' });
  el.btnTalk = h('button', { class: 'abtn ctx', id: 'btn-talk', hidden: true, text: '💬', 'aria-label': AR.talk });
  el.btnLoot = h('button', { class: 'abtn ctx', id: 'btn-loot', hidden: true, text: '💰', 'aria-label': AR.loot });
  el.btnPotion = h('button', { class: 'abtn', id: 'btn-potion', text: '🧪', 'aria-label': AR.usePotion });
  const press = (b, fn) => {
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  };
  press(el.btnAttack, () => doAttack());
  press(el.btnSkill1, () => doSkill(0));
  press(el.btnSkill2, () => doSkill(1));
  press(el.btnTalk, () => doTalk());
  press(el.btnLoot, () => doLoot());
  press(el.btnPotion, () => net.send(C2S.USE, { itemId: bestPotion() }));
  el.actions = h('div', { class: 'actions' }, el.btnTalk, el.btnLoot, el.btnPotion, el.btnSkill1, el.btnSkill2, el.btnAttack);
  hud.append(el.actions);

  // ---------- عصا التحكم ----------
  el.stick = h('div', { class: 'stick', id: 'stick' }, h('div', { class: 'knob' }));
  hud.append(el.stick);
  setupJoystick();

  // ---------- طبقات ----------
  el.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  el.panel = h('div', { class: 'panel', hidden: true, role: 'dialog' });
  el.dialog = h('div', { class: 'panel dialog', hidden: true, role: 'dialog' });
  el.death = h('div', { class: 'overlay death', hidden: true }, h('h1', { text: AR.dead }), (el.respawn = h('p')));
  el.conn = h('div', { class: 'overlay conn', hidden: true }, (el.connText = h('h2')), (el.connBtn = h('button', { class: 'btn', text: AR.retry, hidden: true })));
  hud.append(el.toasts, el.panel, el.dialog, el.death, el.conn);

  let openPanel = null;
  let chatUnread = 0;

  // ---------- أفعال ----------
  function bestPotion() {
    return ['big_health_potion', 'health_potion'].find((id) => state.inventory.some((i) => i.itemId === id && i.qty > 0)) ?? 'health_potion';
  }
  function target() {
    const s = state.selected && state.entity(state.selected.type, state.selected.id);
    if (s) return { targetType: s.type, targetId: s.id };
    const prof = state.self?.profession;
    const m = state.nearest('monster', 8);
    if (m) return { targetType: 'monster', targetId: m.id };
    if (prof === 'thief') {
      const c = state.nearest('caravan', 6, (e) => e.data.ownerId !== state.self.id);
      if (c) return { targetType: 'caravan', targetId: c.id };
    }
    const p = state.nearest('player', 8, (e) => e.data.hostile || e.data.wanted);
    if (p) return { targetType: 'player', targetId: p.id };
    return null;
  }
  async function result(p) {
    const r = await p;
    if (r && r.ok === false) toast(tError(r.error), 'bad');
    return r;
  }
  function doAttack() {
    const t = target();
    if (!t) return toast('لا يوجد هدف قريب');
    net.send(C2S.ATTACK, t, (r) => r && r.ok === false && toast(tError(r.error), 'bad'));
  }
  function doSkill(i) {
    const id = PROFESSIONS[state.self.profession].skills[i];
    const def = SKILLS[id];
    const msg = { skillId: id };
    if (def.target === 'own_caravan') {
      const c = state.myCaravan();
      if (!c) return toast('لا توجد قافلة نشطة');
      Object.assign(msg, { targetType: 'caravan', targetId: c.id });
    } else if (def.target === 'ground') {
      Object.assign(msg, { x: +state.me.x.toFixed(2), y: +state.me.y.toFixed(2) });
    } else {
      const t = target();
      if (!t) return toast('لا يوجد هدف قريب');
      Object.assign(msg, t);
    }
    net.send(C2S.SKILL, msg, (r) => r && r.ok === false && toast(tError(r.error), 'bad'));
  }
  function doTalk() {
    const n = state.nearestNpc(world);
    if (n) net.send(C2S.INTERACT, { npcId: n.id }, (r) => r && r.ok === false && toast(tError(r.error), 'bad'));
  }
  function doLoot() {
    const d = state.nearestDrop();
    if (d) net.send(C2S.PICKUP, { dropId: d.id }, (r) => r && r.ok === false && toast(tError(r.error), 'bad'));
  }

  function setupJoystick() {
    let id = null;
    const knob = el.stick.firstChild;
    const move = (e) => {
      const r = el.stick.getBoundingClientRect();
      const R = r.width / 2;
      let dx = (e.clientX - (r.left + R)) / R;
      let dy = (e.clientY - (r.top + R)) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
      input.setJoystick(dx, dy);
    };
    const end = (e) => {
      if (id !== null && e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      input.setJoystick(0, 0);
    };
    el.stick.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { el.stick.setPointerCapture?.(e.pointerId); } catch { /* مؤشر اصطناعي/منتهٍ */ } move(e); });
    el.stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    el.stick.addEventListener('pointerup', end);
    el.stick.addEventListener('pointercancel', end);
  }

  // ---------- إشعارات ----------
  function toast(text, kind = '') {
    const t = h('div', { class: `toast ${kind}`, text });
    el.toasts.append(t);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- لوحات ----------
  function togglePanel(id) {
    if (openPanel === id) return closePanel();
    openPanel = id;
    el.panel.hidden = false;
    renderPanel();
    if (id === 'chat') { chatUnread = 0; updateBadges(); }
  }
  function closePanel() {
    openPanel = null;
    el.panel.hidden = true;
    clear(el.panel);
  }
  const head = (title) => h('div', { class: 'phead' }, h('h2', { text: title }), h('button', { class: 'ibtn', 'aria-label': AR.close, onclick: closePanel, text: '✕' }));

  function renderPanel() {
    if (!openPanel) return;
    const fn = { bag: panelBag, skills: panelSkills, quests: panelQuests, map: panelMap, chat: panelChat, settings: panelSettings }[openPanel];
    clear(el.panel);
    el.panel.className = `panel p-${openPanel}`;
    fn();
  }

  function panelBag() {
    const s = state.self;
    const rows = state.inventory.map((i) => {
      const it = getItem(i.itemId);
      const acts = [];
      if (it?.kind === 'weapon' || it?.kind === 'armor') acts.push(h('button', { class: 'btn small', onclick: () => result(net.request(C2S.EQUIP, { itemId: i.itemId, equip: !i.equipped })), text: i.equipped ? AR.unequip : AR.equip }));
      if (it?.kind === 'consumable') acts.push(h('button', { class: 'btn small', onclick: () => result(net.request(C2S.USE, { itemId: i.itemId })), text: AR.use }));
      const stat = it?.atk ? `⚔ +${it.atk}` : it?.def ? `🛡 +${it.def}` : it?.heal ? `+${it.heal} ${AR.hp}` : '';
      return h('li', { class: i.equipped ? 'eq' : '' }, h('span', { class: 'iname', text: itemName(i.itemId) }), h('small', { text: stat }), h('span', { class: 'qty', text: `×${fmt(i.qty)}` }), i.equipped ? h('em', { text: AR.equipped }) : null, ...acts);
    });
    el.panel.append(head(AR.bag), h('div', { class: 'sub', text: `${AR.gold}: ${fmt(s.gold)} · ⚔ ${s.atk} · 🛡 ${s.def}` }), rows.length ? h('ul', { class: 'list' }, rows) : h('p', { class: 'muted', text: AR.emptyBag }));
  }

  function panelSkills() {
    const s = state.self;
    const ids = PROFESSIONS[s.profession].skills;
    const rows = ids.map((id) => {
      const d = SKILLS[id];
      const lv = s.skills?.[id] ?? 1;
      const cd = s.cooldowns?.[id] ?? 0;
      return h('li', {},
        h('div', {}, h('b', { text: d.nameAr }), h('small', { text: ` ${AR.level} ${lv}/${MAX_SKILL_LEVEL}` }), h('p', { class: 'muted', text: d.descAr }), cd > 0 ? h('small', { text: `${AR.cooldown}: ${cd}${AR.seconds}` }) : null),
        h('button', { class: 'btn small', disabled: s.skillPoints < 1 || lv >= MAX_SKILL_LEVEL, onclick: () => result(net.request(C2S.SKILL_UPGRADE, { skillId: id })), text: AR.upgrade }));
    });
    el.panel.append(head(AR.skills), h('div', { class: 'sub', text: `${AR.skillPoints}: ${s.skillPoints}` }), h('ul', { class: 'list' }, rows));
  }

  function panelQuests() {
    const s = state.self;
    const entries = Object.entries(s.quests ?? {});
    const rows = entries.map(([code, q]) => {
      const def = QUESTS[code];
      if (!def) return null;
      const near = state.nearestNpc(world);
      return h('li', {}, h('div', {}, h('b', { text: def.titleAr }), h('p', { class: 'muted', text: def.descAr }), h('small', { text: `${AR.progress}: ${q.progress}/${def.target} · ${AR.reward}: ${fmt(def.rewardGold)} ${AR.gold} + ${fmt(def.rewardXp)} ${AR.xp}` })),
        q.status === 'completed' ? h('button', { class: 'btn small primary', onclick: () => { const n = world.npcs.find((x) => x.type === 'quests' && Math.hypot(x.x - state.me.x, x.y - state.me.y) <= BALANCE.interactRange); if (!n) return toast('اذهب إلى لوحة المهام في المدينة'); result(net.request(C2S.QUEST_CLAIM, { npcId: n.id, code })); }, text: AR.claim }) : q.status === 'claimed' ? h('em', { text: AR.done }) : null);
    }).filter(Boolean);
    el.panel.append(head(AR.quests), rows.length ? h('ul', { class: 'list' }, rows) : h('p', { class: 'muted', text: AR.noQuests }));
  }

  let baseMap = null;
  function panelMap() {
    baseMap ??= renderBaseMap(document, world);
    const c = h('canvas', { class: 'bigmap', width: 768, height: 384 });
    el.panel.append(head(AR.fullMap), c);
    el.bigMap = c;
    drawMap(c.getContext('2d'), baseMap, world, state, { labels: true });
  }

  function panelChat() {
    const log = h('div', { class: 'chatlog' });
    const fill = () => {
      clear(log);
      for (const m of state.chat.slice(-40)) log.append(h('div', { class: 'cmsg' }, h('b', { text: `${m.name ?? '?'}: ` }), h('span', { text: m.text })));
      log.scrollTop = log.scrollHeight;
    };
    fill();
    el.chatFill = fill;
    const inp = h('input', { maxlength: BALANCE.chatMaxLen, placeholder: AR.chatPlaceholder, 'aria-label': AR.chat });
    const send = () => {
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      net.send(C2S.CHAT, { text }, (r) => r && r.ok === false && toast(tError(r.error), 'bad'));
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') send(); });
    el.panel.append(head(AR.chat), log, h('div', { class: 'row' }, inp, h('button', { class: 'btn small primary', onclick: send, text: AR.send })));
  }

  function panelSettings() {
    const slider = (key, label, min, max, step) => {
      const out = h('span', { text: settings[key] });
      const inp = h('input', { type: 'range', min, max, step, value: settings[key], 'aria-label': label, oninput: () => { settings[key] = +inp.value; out.textContent = inp.value; onSettings(settings); applySettings(); } });
      return h('label', { class: 'setting' }, h('span', { text: label }), inp, out);
    };
    const check = (key, label) => h('label', { class: 'setting' }, h('span', { text: label }), h('input', { type: 'checkbox', checked: settings[key], onchange: (e) => { settings[key] = e.target.checked; onSettings(settings); applySettings(); } }));
    el.panel.append(head(AR.settings),
      slider('joystickSize', AR.joystickSize, 0.7, 1.6, 0.1), slider('buttonSize', AR.buttonSize, 0.7, 1.6, 0.1), slider('joystickSensitivity', AR.sensitivity, 0.5, 1.5, 0.1),
      check('sound', AR.sound), check('leftHanded', AR.leftHanded),
      h('p', { class: 'muted', text: `${AR.ping}: ${net.rtt ? Math.round(net.rtt) + 'ms' : '—'}` }),
      h('button', { class: 'btn', onclick: onLogout, text: AR.logout }));
  }

  function applySettings() {
    hud.style.setProperty('--stick', `${settings.joystickSize}`);
    hud.style.setProperty('--btn', `${settings.buttonSize}`);
    hud.classList.toggle('lefty', !!settings.leftHanded);
    input.sensitivity = settings.joystickSensitivity;
  }
  applySettings();

  // ---------- حوار الشخصيات ----------
  function closeDialog() { el.dialog.hidden = true; clear(el.dialog); state.npc = null; }
  const reopen = (info) => net.send(C2S.INTERACT, { npcId: info.npcId });

  function showNpc(info) {
    state.npc = info;
    clear(el.dialog);
    el.dialog.hidden = false;
    const tab = h('div', { class: 'dbody' });
    el.dialog.append(h('div', { class: 'phead' }, h('h2', { text: `${info.name}` }), h('button', { class: 'ibtn', 'aria-label': AR.close, onclick: closeDialog, text: '✕' })), h('div', { class: 'sub', text: `${AR.gold}: ${fmt(state.self.gold)}` }), tab);
    const trade = async (ev, itemId, qty) => {
      const r = await result(net.request(ev, { npcId: info.npcId, itemId, qty, idem: newIdem() }));
      if (r?.ok) { sfx('coin'); reopen(info); }
    };
    const goodRow = (g, buyable = true) => h('li', {}, h('span', { class: 'iname', text: itemName(g.itemId) }),
      g.minLevel > 1 ? h('small', { text: `${AR.level} ${g.minLevel}` }) : null,
      h('span', { class: 'price', text: `${fmt(g.buy)} ${AR.gold}` }),
      h('button', { class: 'btn small', disabled: !buyable || g.usable === false || state.self.gold < g.buy, onclick: () => trade(C2S.BUY, g.itemId, 1), text: AR.buy }));
    const sellRow = (g) => h('li', {}, h('span', { class: 'iname', text: itemName(g.itemId) }), h('span', { class: 'qty', text: `×${g.qty}` }), h('span', { class: 'price', text: `${fmt(g.sell)} ${AR.gold}` }),
      h('button', { class: 'btn small', onclick: () => trade(C2S.SELL, g.itemId, 1), text: AR.sell }), g.qty > 1 ? h('button', { class: 'btn small', onclick: () => trade(C2S.SELL, g.itemId, g.qty), text: `${AR.sell} ×${g.qty}` }) : null);
    if (info.type === 'market' || info.type === 'smith') {
      tab.append(h('h3', { text: AR.buy }), h('ul', { class: 'list' }, (info.goods ?? []).map((g) => goodRow(g))), h('h3', { text: AR.sell }), (info.sellable?.length ? h('ul', { class: 'list' }, info.sellable.map(sellRow)) : h('p', { class: 'muted', text: AR.emptyBag })));
    } else if (info.type === 'healer') {
      tab.append(h('button', { class: 'btn primary', disabled: state.self.gold < info.healCost, onclick: async () => { const r = await result(net.request(C2S.HEAL, { npcId: info.npcId, idem: newIdem() })); if (r?.ok) reopen(info); }, text: `${AR.heal} — ${fmt(info.healCost)} ${AR.gold}` }), h('h3', { text: AR.buy }), h('ul', { class: 'list' }, (info.goods ?? []).map((g) => goodRow(g))));
    } else if (info.type === 'quests') {
      tab.append(h('ul', { class: 'list' }, (info.quests ?? []).map((q) => h('li', {}, h('div', {}, h('b', { text: q.title }), h('p', { class: 'muted', text: q.desc }), h('small', { text: `${AR.reward}: ${fmt(q.rewardGold)} ${AR.gold} + ${fmt(q.rewardXp)} ${AR.xp} · ${q.progress ?? 0}/${q.target}` })),
        q.status === 'completed' ? h('button', { class: 'btn small primary', onclick: async () => { const r = await result(net.request(C2S.QUEST_CLAIM, { npcId: info.npcId, code: q.code })); if (r?.ok) reopen(info); }, text: AR.claim }) : h('em', { text: q.status === 'claimed' ? AR.done : q.status === 'active' ? AR.progress : AR.accept })))));
    } else if (info.type === 'caravan') {
      showCaravanDialog(tab, info);
    }
  }

  function showCaravanDialog(tab, info) {
    if (!info.canLaunch) return tab.append(h('p', { text: AR.onlyTraders }));
    const mine = state.myCaravan();
    if (mine) return tab.append(h('p', { text: `${AR.yourCaravan}: ${STATUS_AR[mine.status] ?? mine.status}` }));
    const goods = state.inventory.filter((i) => getItem(i.itemId)?.kind === 'good');
    const cargo = {};
    let dest = info.destinations[0];
    const sum = h('div', { class: 'sum' });
    const btn = h('button', { class: 'btn primary', id: 'launch-btn' });
    const dsel = h('select', { 'aria-label': AR.destination, onchange: () => { dest = dsel.value; upd(); } }, info.destinations.map((d) => h('option', { value: d, text: CITY_AR[d] ?? d })));
    const upd = () => {
      const units = cargoUnits(cargo);
      const reward = units ? caravanReward(dest, cargo).total : 0;
      sum.textContent = `${AR.capacity}: ${units}/${info.capacity} · ${AR.fee}: ${fmt(info.fee)} · ${AR.expectedReward}: ${fmt(reward)}`;
      btn.disabled = units === 0 || units > info.capacity || state.self.gold < info.fee;
      btn.textContent = `${AR.launchCaravan} — ${fmt(info.fee)} ${AR.gold}`;
    };
    const rows = goods.map((g) => {
      const out = h('span', { class: 'qty', text: '0' });
      const set = (n) => { cargo[g.itemId] = Math.max(0, Math.min(g.qty, n)); if (!cargo[g.itemId]) delete cargo[g.itemId]; out.textContent = String(cargo[g.itemId] ?? 0); upd(); };
      return h('li', {}, h('span', { class: 'iname', text: `${itemName(g.itemId)} (${g.qty})` }), h('button', { class: 'btn small', onclick: () => set((cargo[g.itemId] ?? 0) - 1), text: '−' }), out, h('button', { class: 'btn small', onclick: () => set((cargo[g.itemId] ?? 0) + 1), text: '+' }), h('button', { class: 'btn small', onclick: () => set(g.qty), text: 'الكل' }));
    });
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const r = await result(net.request(C2S.LAUNCH, { npcId: info.npcId, destCity: dest, cargo: { ...cargo }, idem: newIdem() }, 12000));
      if (r?.ok) { toast('انطلقت القافلة!', 'good'); closeDialog(); } else upd();
    });
    tab.append(h('label', { class: 'setting' }, h('span', { text: AR.destination }), dsel), h('h3', { text: AR.cargo }), rows.length ? h('ul', { class: 'list' }, rows) : h('p', { class: 'muted', text: 'اشترِ بضائع من السوق أولًا' }), sum, btn);
    upd();
  }

  // ---------- تحديث ----------
  function updateBadges() {
    el.mini.parentElement.querySelector('[data-panel="chat"]').dataset.badge = chatUnread ? String(chatUnread) : '';
  }

  let lastMini = 0;
  function update(now = performance.now()) {
    const s = state.self;
    if (!s) return;
    const you = state.you ?? s;
    el.name.textContent = `${s.name} · ${PROFESSION_AR[s.profession] ?? ''} · ${AR.level} ${s.level}`;
    const hp = you.hp ?? s.hp;
    const maxHp = you.maxHp ?? s.maxHp;
    el.hpFill.style.width = `${Math.max(0, Math.min(100, (hp / maxHp) * 100))}%`;
    el.hpText.textContent = `${hp}/${maxHp}`;
    el.xpFill.style.width = `${Math.min(100, (s.xp / s.xpNext) * 100)}%`;
    el.gold.textContent = `💰 ${fmt(s.gold)}`;
    const z = zoneOf(world, state.zone);
    el.zone.textContent = z ? `${z.nameAr} · ${z.safe ? AR.safe : `${AR.danger}: ${DANGER_AR[z.danger]}`}` : '';
    el.flags.textContent = [s.hostile ? `⚠ ${AR.hostile}` : '', s.repBlack >= BALANCE.wantedRep ? `☠ ${AR.wanted}` : ''].filter(Boolean).join(' ');
    el.flags.className = `flags${s.hostile ? ' hot' : ''}`;
    const [a, b] = PROFESSIONS[s.profession].skills;
    for (const [btn, id] of [[el.btnSkill1, a], [el.btnSkill2, b]]) {
      const cd = s.cooldowns?.[id] ?? 0;
      btn.textContent = cd > 0 ? String(Math.ceil(cd)) : SKILLS[id].nameAr.split(' ')[0];
      btn.setAttribute('aria-label', SKILLS[id].nameAr);
      btn.classList.toggle('cd', cd > 0);
    }
    el.btnTalk.hidden = !state.nearestNpc(world);
    el.btnLoot.hidden = !state.nearestDrop();
    // قافلة
    const c = state.myCaravan();
    el.caravan.hidden = !c;
    if (c) el.caravan.textContent = `🐪 ${STATUS_AR[c.status] ?? c.status} → ${CITY_AR[c.dest] ?? c.dest} · ${Math.round((c.progress ?? 0) * 100)}% · ${AR.hp} ${c.hp}/${c.maxHp}`;
    el.caravan.classList.toggle('alert', c?.status === 'under_attack');
    // موت
    const dead = !!(you.dead ?? s.dead);
    el.death.hidden = !dead;
    if (dead) el.respawn.textContent = `${AR.respawnIn} ${s.respawnIn}${AR.seconds}`;
    // اتصال
    const st = net.status;
    el.conn.hidden = st === 'online';
    el.connText.textContent = st === 'kicked' ? AR.kicked : st === 'offline' ? AR.offline : st === 'reconnecting' ? AR.reconnecting : AR.connecting;
    el.connBtn.hidden = st !== 'kicked' && st !== 'offline';
    el.net.textContent = net.rtt ? `${Math.round(net.rtt)}ms` : '';
    if (now - lastMini > 200) {
      lastMini = now;
      drawMini();
      if (openPanel === 'map' && el.bigMap) drawMap(el.bigMap.getContext('2d'), baseMap, world, state, { labels: true });
    }
  }

  function drawMini() {
    baseMap ??= renderBaseMap(document, world);
    const W = 36;
    const vp = { x: Math.max(0, Math.min(world.width - W, state.me.x - W / 2)), y: Math.max(0, Math.min(world.height - W, state.me.y - W / 2)), w: W, h: W };
    drawMap(el.mini.getContext('2d'), baseMap, world, state, { viewport: vp });
  }

  // ---------- أحداث ----------
  net.on('npc', (info) => showNpc(info));
  net.on('self', (s) => { state.onSelf(s); if (openPanel && openPanel !== 'chat' && openPanel !== 'map' && openPanel !== 'settings') renderPanel(); });
  net.on('inventory', (inv) => { state.onInventory(inv); if (openPanel === 'bag') renderPanel(); });
  net.on('chat', (m) => { state.onChat(m); if (openPanel === 'chat') el.chatFill?.(); else { chatUnread++; updateBadges(); } });
  net.on('event', (e) => {
    if (e.type === 'notice') toast(tNotice(e.code), 'good');
    else if (e.type === 'levelup') { toast(`ارتقيت إلى المستوى ${e.level}! 🎉`, 'good'); sfx('level'); }
    else if (e.type === 'xp') toast(`+${e.amount} ${AR.xp}`);
    else if (e.type === 'loot') toast(`+${e.gold} ${AR.gold}`, 'good');
    else if (e.type === 'damage' && e.targetType === 'player' && e.targetId === state.self?.id) sfx('hurt');
    else if (e.type === 'respawn' && e.targetId === state.self?.id) toast('عدت للحياة في المدينة');
  });
  net.on('err', (e) => { if (e.code !== 'DUPLICATE') toast(tError(e.code), 'bad'); });

  return { update, toast, showNpc, closeDialog, togglePanel, closePanel, doAttack, doSkill, doTalk, doLoot, el, applySettings, get openPanel() { return openPanel; }, onRetry: (fn) => el.connBtn.addEventListener('click', fn) };
}
