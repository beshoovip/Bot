// طبقة Phaser الرقيقة: ترسم العالم المائل وتزامن الكيانات. كل منطق اللعبة في state/input/net/hud (مختبَرة بمعزل).
// تنبيه: هذه الطبقة تحتاج Phaser حقيقيًا وجهازًا/متصفحًا؛ لم تُشغَّل في بيئة التطوير التي بُنيت فيها (انظر TESTING.md).

import Phaser from 'phaser';
import { worldToScreen, screenToWorld } from '../../../../shared/iso.js';
import { chunkGrid, chunkBounds, buildScenery, worldBounds } from '../render/geometry.js';
import { paintChunk, paintScenery } from '../render/isoPainter.js';
import { PROFESSIONS } from '../../../../shared/data/professions.js';
import { getMonster } from '../../../../shared/data/monsters.js';
import { BALANCE } from '../../../../shared/data/balance.js';

const PROF_COLOR = (id) => Phaser.Display.Color.HexStringToColor(PROFESSIONS[id]?.color ?? '#cccccc').color;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  init(data) {
    this.ctx = data; // { state, world, input, net, hud }
    this.views = new Map();
  }

  create() {
    const { world, state } = this.ctx;
    const doc = this.game.canvas.ownerDocument;
    // الأرضية: قطع 16×16 مخبوزة (أقصى 1024×512 لكل نسيج؛ آمن على الجوال)
    const { cols, rows } = chunkGrid(world);
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const b = chunkBounds(world, cx, cy);
        const cv = doc.createElement('canvas');
        cv.width = Math.ceil(b.w);
        cv.height = Math.ceil(b.h);
        paintChunk(cv.getContext('2d'), world, cx, cy);
        const key = `chunk_${cx}_${cy}`;
        this.textures.addCanvas(key, cv);
        this.add.image(b.x, b.y, key).setOrigin(0, 0).setDepth(-1e6);
      }
    }
    // العوائق: صورة لكل عنصر بعمق = x+y (الأقرب للكاميرا أعلى)
    for (const it of buildScenery(world)) {
      const cv = doc.createElement('canvas');
      cv.width = Math.ceil(it.bounds.w);
      cv.height = Math.ceil(it.bounds.h);
      paintScenery(cv.getContext('2d'), it);
      this.textures.addCanvas(it.id, cv);
      this.add.image(it.bounds.x, it.bounds.y, it.id).setOrigin(0, 0).setDepth(it.depth);
    }
    this.#drawNpcs(world);

    const wb = worldBounds(world);
    this.cameras.main.setBounds(wb.x - 200, wb.y - 200, wb.w + 400, wb.h + 400);
    this.cameras.main.setBackgroundColor('#14110d');
    this.#fitZoom();
    this.scale.on('resize', () => this.#fitZoom());

    this.me = this.#makeView('player', { id: 'me', name: state.self.name, profession: state.self.profession, hp: 1, maxHp: 1 }, true);
    this.cameras.main.startFollow(this.me.root, true, 0.12, 0.12);

    // لمس العالم لاختيار هدف (الواجهة DOM فوق Canvas فلا تتداخل)
    this.input.on('pointerdown', (p) => {
      const w = screenToWorld(p.worldX, p.worldY);
      const hit = state.nearestTo?.(w.x, w.y, 1.2);
      state.selected = hit ? { type: hit.type, id: hit.id } : null;
    });

    // لوحة المفاتيح للاختبار على المتصفح
    const kd = (e) => { if (e.target.tagName !== 'INPUT') { this.ctx.input.keyDown(e.code); if (e.code === 'Space') this.ctx.hud.doAttack(); if (e.code === 'KeyE') this.ctx.hud.doTalk(); if (e.code === 'KeyF') this.ctx.hud.doLoot(); if (e.code === 'Digit1') this.ctx.hud.doSkill(0); if (e.code === 'Digit2') this.ctx.hud.doSkill(1); } };
    const ku = (e) => this.ctx.input.keyUp(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); });

    // الأحداث البصرية العابرة
    this.ctx.net.on('event', (e) => this.#onEvent(e));
  }

  #fitZoom() {
    // عرض مستقر على الشاشات المختلفة: ~14 بلاطة عرضًا
    const z = Math.max(0.5, Math.min(1.6, this.scale.width / (64 * 14)));
    this.cameras.main.setZoom(z);
  }

  #drawNpcs(world) {
    for (const n of world.npcs) {
      const p = worldToScreen(n.x, n.y);
      const g = this.add.graphics().setDepth(n.x + n.y);
      const col = { market: 0xd9a441, smith: 0x9aa0a6, healer: 0x5ac8a0, quests: 0xe8d36a, caravan: 0xc27a3a }[n.type] ?? 0xffffff;
      g.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 26, 12);
      g.fillStyle(col, 1).fillRoundedRect(p.x - 8, p.y - 34, 16, 32, 5);
      g.fillStyle(0xf1d3b0, 1).fillCircle(p.x, p.y - 40, 8);
      this.add.text(p.x, p.y - 58, n.nameAr, { fontFamily: 'sans-serif', fontSize: '13px', color: '#ffe9b0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(n.x + n.y + 0.1);
    }
  }

  #makeView(type, d, isMe = false) {
    const root = this.add.container(0, 0);
    const body = this.add.graphics();
    const label = this.add.text(0, -66, '', { fontFamily: 'sans-serif', fontSize: '12px', color: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const hp = this.add.graphics();
    const ring = this.add.graphics();
    root.add([ring, body, hp, label]);
    const v = { type, root, body, label, hp, ring, last: '' };
    return v;
  }

  #paint(v, d, type, selected) {
    const sig = `${type}|${d.profession}|${d.code}|${d.status}|${d.hostile}|${d.wanted}|${d.dead}|${selected}`;
    const body = v.body;
    if (v.last !== sig) {
      v.last = sig;
      body.clear();
      body.fillStyle(0x000000, 0.25).fillEllipse(0, 2, 28, 13);
      if (type === 'player') {
        body.fillStyle(PROF_COLOR(d.profession), 1).fillRoundedRect(-8, -34, 16, 32, 5);
        body.fillStyle(0xf1d3b0, 1).fillCircle(0, -40, 8);
        if (d.dead) body.fillStyle(0x000000, 0.5).fillRect(-10, -30, 20, 6);
      } else if (type === 'monster') {
        const m = getMonster(d.code);
        const c = { wolf: 0x8a8a92, boar: 0x7a4a2a, dust_scorpion: 0xc9a14a }[d.code] ?? 0xb04040;
        body.fillStyle(c, 1).fillEllipse(0, -14, 34 + (m?.level ?? 1), 22).fillStyle(0x220000, 1).fillCircle(8, -18, 2.5).fillCircle(-2, -18, 2.5);
      } else if (type === 'caravan') {
        body.fillStyle(0x7a5230, 1).fillRect(-24, -26, 48, 22).fillStyle(0xe8d9a8, 1).fillRect(-20, -42, 40, 18).fillStyle(0x2a1a0a, 1).fillCircle(-16, -2, 6).fillCircle(16, -2, 6);
        if (d.status === 'under_attack') body.lineStyle(3, 0xff4030, 1).strokeRect(-26, -44, 52, 44);
      }
      v.ring.clear();
      if (selected) v.ring.lineStyle(2, 0xffe060, 1).strokeEllipse(0, 2, 40, 18);
      else if (d.hostile || d.wanted) v.ring.lineStyle(2, 0xff4030, 1).strokeEllipse(0, 2, 40, 18);
    }
    const label = type === 'player' ? `${d.name}${d.level ? ` (${d.level})` : ''}` : type === 'monster' ? `${getMonster(d.code)?.nameAr ?? ''} (${getMonster(d.code)?.level ?? ''})` : `قافلة ${d.owner ?? ''}`;
    v.label.setText(label);
    v.label.setColor(d.hostile ? '#ff8a7a' : d.wanted ? '#ffb070' : '#ffffff');
    const frac = Math.max(0, Math.min(1, (d.hp ?? 1) / (d.maxHp ?? 1)));
    v.hp.clear();
    if (d.maxHp > 1 && frac < 1) v.hp.fillStyle(0x000000, 0.7).fillRect(-18, -58, 36, 5).fillStyle(frac > 0.5 ? 0x5ac86a : frac > 0.25 ? 0xe0b040 : 0xe05040, 1).fillRect(-17, -57, 34 * frac, 3);
  }

  #place(v, x, y) {
    const p = worldToScreen(x, y);
    v.root.setPosition(p.x, p.y);
    v.root.setDepth(x + y);
  }

  #onEvent(e) {
    if (e.type !== 'damage') return;
    const { state } = this.ctx;
    const target = e.targetType === 'player' && e.targetId === state.self?.id ? { x: state.me.x, y: state.me.y } : state.entity(e.targetType, e.targetId);
    if (!target) return;
    const p = worldToScreen(target.x, target.y);
    const t = this.add.text(p.x, p.y - 70, String(e.amount), { fontFamily: 'sans-serif', fontSize: '18px', fontStyle: 'bold', color: e.targetType === 'monster' ? '#ffe070' : '#ff6a5a', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(1e5);
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  update(_, deltaMs) {
    const { state, input, hud } = this.ctx;
    const dt = Math.min(0.1, deltaMs / 1000);
    input.update();
    state.me.dir = input.dir;
    state.me.step(dt);
    state.update(dt);
    // اللاعب المحلي
    this.#paint(this.me, { ...state.self, hp: state.you?.hp ?? state.self.hp, maxHp: state.you?.maxHp ?? state.self.maxHp, dead: state.you?.dead, hostile: state.self.hostile }, 'player', false);
    this.#place(this.me, state.me.x, state.me.y);
    // الكيانات الأخرى
    const seen = new Set();
    for (const [key, e] of state.entities) {
      seen.add(key);
      let v = this.views.get(key);
      if (!v) { v = this.#makeView(e.type, e.data); this.views.set(key, v); }
      const sel = state.selected && state.selected.type === e.type && state.selected.id === e.id;
      this.#paint(v, e.data, e.type, !!sel);
      this.#place(v, e.x, e.y);
    }
    for (const [key, v] of this.views) if (!seen.has(key)) { v.root.destroy(); this.views.delete(key); }
    // الغنائم
    this.dropGfx ??= this.add.graphics();
    this.dropGfx.clear().setDepth(1e4);
    for (const d of state.drops) { const p = worldToScreen(d.x, d.y); this.dropGfx.fillStyle(0xffd24a, 1).fillCircle(p.x, p.y - 6, 6).lineStyle(2, 0x7a5a00, 1).strokeCircle(p.x, p.y - 6, 6); }
    this.dropGfx.fillStyle(0x8a4fd0, 0.9);
    for (const t of state.traps) { const p = worldToScreen(t.x, t.y); this.dropGfx.fillTriangle(p.x - 8, p.y, p.x + 8, p.y, p.x, p.y - 10); }
    hud.update();
  }
}

export { BALANCE };
