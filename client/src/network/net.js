// عميل الشبكة: اتصال Socket.IO مع إعادة اتصال تلقائية وإعادة الانضمام، ومراسلة موثوقة للعمليات الاقتصادية
// (نفس مفتاح idem يُعاد إرساله بعد الانقطاع فلا تتكرر المعاملة على الخادم).

import { C2S, S2C } from '../../../shared/protocol.js';

export function newIdem() {
  const a = new Uint8Array(12);
  (globalThis.crypto ?? { getRandomValues: (x) => x.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export class Emitter {
  #h = new Map();
  on(ev, fn) {
    if (!this.#h.has(ev)) this.#h.set(ev, new Set());
    this.#h.get(ev).add(fn);
    return () => this.#h.get(ev)?.delete(fn);
  }
  emit(ev, ...a) {
    for (const fn of this.#h.get(ev) ?? []) fn(...a);
  }
}

export class NetClient extends Emitter {
  /**
   * @param {{ioFactory:Function, url:string, getToken:()=>string, now?:()=>number, timers?:object}} o
   */
  constructor({ ioFactory, url, getToken, now = () => Date.now(), timers = { setTimeout, clearTimeout, setInterval, clearInterval } }) {
    super();
    this.ioFactory = ioFactory;
    this.url = url;
    this.getToken = getToken;
    this.now = now;
    this.timers = timers;
    this.status = 'offline';
    this.characterId = null;
    this.joined = false;
    this.rtt = 100;
    this.pending = new Map(); // reqId → {event,payload,resolve,timer,sentOnce}
    this.reqSeq = 0;
    this.socket = null;
    this.pingTimer = null;
  }

  connect(characterId) {
    this.characterId = characterId;
    this.#setStatus('connecting');
    this.socket = this.ioFactory(this.url, { auth: { token: this.getToken() }, transports: ['websocket'], reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000, timeout: 8000 });
    const s = this.socket;
    s.on('connect', () => this.#join());
    s.on('disconnect', (reason) => {
      this.joined = false;
      this.#setStatus(reason === 'io client disconnect' ? 'offline' : 'reconnecting');
    });
    s.on('connect_error', (e) => {
      this.#setStatus('reconnecting');
      this.emit('connect_error', e?.message ?? 'error');
    });
    for (const ev of Object.values(S2C)) {
      s.on(ev, (payload) => {
        if (ev === S2C.PONG) this.rtt = Math.max(1, this.now() - payload.t);
        if (ev === S2C.ERROR && payload.code === 'DUPLICATE') this.#setStatus('kicked');
        this.emit(ev, payload);
      });
    }
    this.pingTimer = this.timers.setInterval(() => this.joined && this.send(C2S.PING, { t: this.now() }), 4000);
  }

  #setStatus(st) {
    if (this.status === st) return;
    this.status = st;
    this.emit('status', st);
  }

  #join() {
    this.socket.emit(C2S.JOIN, { characterId: this.characterId }, (res) => {
      if (res?.ok) {
        this.joined = true;
        this.#setStatus('online');
        this.#flushPending();
        this.emit('join_ok');
      } else {
        this.emit('join_failed', res?.error ?? 'UNKNOWN');
      }
    });
  }

  /** إرسال عادي بلا ضمان (حركة، هجوم...). */
  send(event, payload, cb) {
    if (!this.socket?.connected) return false;
    this.socket.emit(event, payload, cb);
    return true;
  }

  /** إرسال موثوق: يعيد وعدًا بنتيجة الخادم؛ إن انقطع الاتصال يُعاد إرسال نفس الحمولة (نفس idem) بعد إعادة الانضمام. */
  request(event, payload, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const id = ++this.reqSeq;
      const entry = { event, payload, resolve, timer: null, inFlight: false };
      this.pending.set(id, entry);
      entry.timer = this.timers.setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, error: 'TIMEOUT' });
      }, timeoutMs);
      if (this.joined) this.#dispatch(id, entry);
    });
  }

  #dispatch(id, entry) {
    entry.inFlight = true;
    this.socket.emit(entry.event, entry.payload, (res) => {
      if (!this.pending.has(id)) return;
      this.pending.delete(id);
      this.timers.clearTimeout(entry.timer);
      entry.resolve(res ?? { ok: false, error: 'NO_RESPONSE' });
    });
  }

  #flushPending() {
    for (const [id, entry] of this.pending) this.#dispatch(id, entry);
  }

  close() {
    this.timers.clearInterval(this.pingTimer);
    for (const e of this.pending.values()) {
      this.timers.clearTimeout(e.timer);
      e.resolve({ ok: false, error: 'CLOSED' });
    }
    this.pending.clear();
    this.socket?.disconnect();
    this.#setStatus('offline');
  }
}
