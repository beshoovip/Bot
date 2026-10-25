// حالة العميل: كيانات العالم مع الاستيفاء، واللاعب المحلي مع التنبؤ. بلا اعتماد على Phaser أو DOM.

import { BALANCE } from '../../../shared/data/balance.js';
import { stepMovement } from '../../../shared/movement.js';
import { getDefaultWorld } from '../../../shared/maps/world.js';

const SMOOTH = 12; // معدل الاستيفاء للكيانات الأخرى

export class LocalPlayer {
  constructor(world = getDefaultWorld()) {
    this.world = world;
    this.x = 0;
    this.y = 0;
    this.dir = -1;
    this.rooted = false;
    this.dead = false;
    this.ready = false;
  }

  /** حركة تنبؤية فورية بنفس دالة الخادم. */
  step(dt) {
    if (!this.ready || this.dead || this.rooted || this.dir < 0) return;
    const r = stepMovement(this.world, this, this.dir, BALANCE.playerSpeed, dt);
    this.x = r.x;
    this.y = r.y;
  }

  /**
   * تصحيح نحو موضع الخادم بعد تقدير زمن الانتقال: موضع الخادم + حركة (عمر اللقطة + نصف RTT).
   * فروق كبيرة (انتقال/إعادة ظهور/ارتداد) تُطبّق فورًا؛ الصغيرة تُدمج بسلاسة.
   */
  reconcile(server, { ageSec = 0, rtt = 100, dt = 1 / 60 } = {}) {
    this.dead = !!server.dead;
    this.rooted = !!server.rooted;
    let target = { x: server.x, y: server.y };
    if (!this.dead && !this.rooted && this.dir >= 0) {
      const lead = Math.min(0.4, ageSec + rtt / 2000);
      const r = stepMovement(this.world, target, this.dir, BALANCE.playerSpeed, lead);
      target = { x: r.x, y: r.y };
    }
    const err = Math.hypot(target.x - this.x, target.y - this.y);
    if (!this.ready || err > 2.5 || this.dead) {
      this.x = target.x;
      this.y = target.y;
      this.ready = true;
      return 'snap';
    }
    const k = 1 - Math.exp(-dt * 8);
    this.x += (target.x - this.x) * k;
    this.y += (target.y - this.y) * k;
    return 'blend';
  }
}

export class GameState {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.me = new LocalPlayer();
    this.rtt = 100; // يُحدَّث من NetClient.rtt
    this.self = null; // الحالة الكاملة من الخادم (ذهب، خبرة، مهارات...)
    this.inventory = [];
    this.npc = null;
    this.chat = [];
    this.zone = null;
    this.you = null; // آخر you من اللقطة (hp, zone...)
    this.entities = new Map(); // "type:id" → {type,id,data,x,y,tx,ty}
    this.drops = [];
    this.traps = [];
    this.lastSnapshotAt = 0;
    this.serverT = 0;
    this.ack = 0;
    this.selected = null; // {type,id}
  }

  onJoined(msg) {
    this.self = msg.self;
    this.inventory = msg.inventory;
    this.chat = [...(msg.chat ?? [])];
    this.zone = msg.zone;
  }
  onSelf(s) {
    this.self = s;
  }
  onInventory(inv) {
    this.inventory = inv;
  }
  onChat(m) {
    this.chat.push(m);
    if (this.chat.length > 80) this.chat.shift();
  }

  applySnapshot(snap) {
    const t = this.now();
    const ageSec = this.lastSnapshotAt ? 0 : 0;
    this.lastSnapshotAt = t;
    this.serverT = snap.t;
    this.ack = snap.ack;
    this.you = snap.you;
    this.zone = snap.you.zone;
    this.me.reconcile(snap.you, { ageSec, rtt: this.rtt ?? 100 });
    const seen = new Set();
    const put = (type, list) => {
      for (const d of list) {
        const key = `${type}:${d.id}`;
        seen.add(key);
        let e = this.entities.get(key);
        if (!e) {
          e = { type, id: d.id, data: d, x: d.x, y: d.y, tx: d.x, ty: d.y };
          this.entities.set(key, e);
        } else {
          e.data = d;
          e.tx = d.x;
          e.ty = d.y;
          if (Math.hypot(e.tx - e.x, e.ty - e.y) > 6) {
            e.x = e.tx;
            e.y = e.ty;
          }
        }
      }
    };
    put('player', snap.players);
    put('monster', snap.monsters);
    put('caravan', snap.caravans);
    for (const key of [...this.entities.keys()]) if (!seen.has(key)) this.entities.delete(key);
    this.drops = snap.drops;
    this.traps = snap.traps;
    if (this.selected && !this.entities.has(`${this.selected.type}:${this.selected.id}`)) this.selected = null;
  }

  /** استيفاء الكيانات الأخرى (يُستدعى كل إطار). */
  update(dtSec) {
    const k = 1 - Math.exp(-dtSec * SMOOTH);
    for (const e of this.entities.values()) {
      e.x += (e.tx - e.x) * k;
      e.y += (e.ty - e.y) * k;
    }
  }

  entity(type, id) {
    return this.entities.get(`${type}:${id}`) ?? null;
  }

  /** أقرب كيان من نوع ما ضمن مدى (اقتراح للتوجيه التلقائي؛ الخادم هو من يتحقق). */
  nearest(type, range, filter = () => true) {
    let best = null;
    let bd = range;
    for (const e of this.entities.values()) {
      if (e.type !== type || !filter(e)) continue;
      const d = Math.hypot(e.x - this.me.x, e.y - this.me.y);
      if (d <= bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  /** أقرب كيان إلى نقطة في العالم (للّمس). */
  nearestTo(x, y, range = 1.2) {
    let best = null;
    let bd = range;
    for (const e of this.entities.values()) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  nearestNpc(world, range = BALANCE.interactRange) {
    let best = null;
    let bd = range;
    for (const n of world.npcs) {
      const d = Math.hypot(n.x - this.me.x, n.y - this.me.y);
      if (d <= bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  nearestDrop(range = BALANCE.pickupRange) {
    let best = null;
    let bd = range;
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - this.me.x, d.y - this.me.y);
      if (dist <= bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  myCaravan() {
    for (const e of this.entities.values()) if (e.type === 'caravan' && this.self && e.data.ownerId === this.self.id) return e.data;
    return null;
  }
}
