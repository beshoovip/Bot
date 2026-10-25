// دلو رموز (token bucket) لكل مفتاح. الساعة قابلة للحقن للاختبار.

export class TokenBucket {
  constructor(burst, perSec, now = Date.now) {
    this.burst = burst;
    this.perSec = perSec;
    this.now = now;
    this.tokens = burst;
    this.last = now();
  }
  take(cost = 1) {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSec);
    this.last = t;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

/** محدد معدل لكل اتصال ولكل حدث. */
export class ConnectionLimiter {
  constructor(limits, now = Date.now) {
    this.limits = limits;
    this.now = now;
    this.buckets = new Map();
    this.violations = 0;
  }
  allow(event) {
    const lim = this.limits[event];
    if (!lim) return false;
    let b = this.buckets.get(event);
    if (!b) {
      b = new TokenBucket(lim.burst, lim.perSec, this.now);
      this.buckets.set(event, b);
    }
    const ok = b.take();
    if (!ok) this.violations++;
    return ok;
  }
}

/** محدد معدل بنافذة ثابتة لمفاتيح (مثل IP) — يُستخدم لمسارات HTTP الحساسة. */
export class KeyedLimiter {
  constructor(max, windowMs, now = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }
  allow(key) {
    const t = this.now();
    const e = this.hits.get(key);
    if (!e || t - e.start >= this.windowMs) {
      this.hits.set(key, { start: t, n: 1 });
      this.#gc(t);
      return true;
    }
    e.n += 1;
    return e.n <= this.max;
  }
  #gc(t) {
    if (this.hits.size < 5000) return;
    for (const [k, v] of this.hits) if (t - v.start >= this.windowMs) this.hits.delete(k);
  }
}
