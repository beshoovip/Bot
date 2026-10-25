// حساب الضرر. كل النتائج تُحسب على الخادم فقط.

/**
 * الضرر = هجوم × مضاعف × تقلب ±10% × (30 / (30 + دفاع)). الحد الأدنى 1.
 * @param {number} atk
 * @param {number} def
 * @param {{mul?:number, takenMul?:number, rng?:()=>number}} [opts]
 */
export function computeDamage(atk, def, { mul = 1, takenMul = 1, rng = Math.random } = {}) {
  if (!(atk >= 0) || !(def >= 0)) throw new RangeError('atk/def must be non-negative numbers');
  const variance = 0.9 + rng() * 0.2;
  const raw = atk * mul * variance * takenMul;
  return Math.max(1, Math.round(raw * (30 / (30 + def))));
}

/** هل الهدف ضمن المدى؟ tolerance تغطي زمن الاستجابة بين العميل والخادم. */
export function inRange(a, b, range, tolerance = 0.6) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= range + tolerance;
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
