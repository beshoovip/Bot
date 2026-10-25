// تحويل لوحة المفاتيح والعصا الافتراضية إلى اتجاه من 8 ويُرسل للخادم عند التغير فقط (مع نبضة إعادة إرسال).

import { dirFromScreenVector } from '../../../shared/iso.js';

const KEY_VECTORS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export class InputController {
  /**
   * @param {{send:(ev:string,payload:object)=>boolean, now?:()=>number, onDir?:(dir:number)=>void}} o
   */
  constructor({ send, now = () => performance.now(), onDir = () => {}, inputEvent = 'input', sensitivity = 1 }) {
    this.send = send;
    this.now = now;
    this.onDir = onDir;
    this.inputEvent = inputEvent;
    this.sensitivity = sensitivity;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 }; // متجه الشاشة، طوله ≤ 1
    this.seq = 0;
    this.dir = -1;
    this.lastSentDir = -2;
    this.lastSentAt = 0;
    this.enabled = true;
  }

  keyDown(code) {
    if (code in KEY_VECTORS) this.keys.add(code);
  }
  keyUp(code) {
    this.keys.delete(code);
  }
  setJoystick(x, y) {
    this.joy = { x, y };
  }
  clear() {
    this.keys.clear();
    this.joy = { x: 0, y: 0 };
  }

  computeDir() {
    if (!this.enabled) return -1;
    let kx = 0;
    let ky = 0;
    for (const k of this.keys) {
      kx += KEY_VECTORS[k][0];
      ky += KEY_VECTORS[k][1];
    }
    if (kx !== 0 || ky !== 0) return dirFromScreenVector(kx, ky, 0.5);
    // الحساسية تقلّل/تزيد المنطقة الميتة للعصا
    return dirFromScreenVector(this.joy.x, this.joy.y, 0.25 / this.sensitivity);
  }

  /** يُستدعى كل إطار. */
  update() {
    const dir = this.computeDir();
    const t = this.now();
    const changed = dir !== this.lastSentDir;
    const heartbeat = dir >= 0 && t - this.lastSentAt > 1000;
    this.dir = dir;
    if (changed || heartbeat) {
      if (this.send(this.inputEvent, { seq: ++this.seq, dir })) {
        this.lastSentDir = dir;
        this.lastSentAt = t;
      }
    }
    if (changed) this.onDir(dir);
    return dir;
  }
}
