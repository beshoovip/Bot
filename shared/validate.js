// التحقق من مدخلات الرسائل. صارم: يرفض أي مفتاح غير معرّف وأي نوع خاطئ.

export const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
export const isNum = (v, min = -Infinity, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const isStr = (v, min = 0, max = Infinity) => typeof v === 'string' && v.length >= min && v.length <= max;

const ID_RE = /^[a-z0-9_:\-]{1,48}$/;
const IDEM_RE = /^[A-Za-z0-9_\-]{8,64}$/;

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function checkField(spec, v) {
  switch (spec.type) {
    case 'int':
      return isInt(v, spec.min, spec.max);
    case 'num':
      return isNum(v, spec.min, spec.max);
    case 'bool':
      return typeof v === 'boolean';
    case 'str':
      return isStr(v, spec.min ?? 0, spec.max ?? 1000) && (!spec.pattern || spec.pattern.test(v));
    case 'id':
      return typeof v === 'string' && ID_RE.test(v);
    case 'idem':
      return typeof v === 'string' && IDEM_RE.test(v);
    case 'enum':
      return spec.values.includes(v);
    case 'qtymap': {
      // { itemId: qty } بحد أقصى لعدد المفاتيح
      if (!isPlainObject(v)) return false;
      const keys = Object.keys(v);
      if (keys.length === 0 || keys.length > (spec.maxKeys ?? 12)) return false;
      return keys.every((k) => ID_RE.test(k) && isInt(v[k], 1, spec.maxQty ?? 999));
    }
    default:
      return false;
  }
}

/**
 * @param {Record<string, {type:string, optional?:boolean}>} schema
 * @param {unknown} payload
 * @returns {{ok:true, value:object}|{ok:false, error:string}}
 */
export function validatePayload(schema, payload) {
  if (!isPlainObject(payload)) return { ok: false, error: 'payload must be an object' };
  for (const k of Object.keys(payload)) {
    if (!Object.prototype.hasOwnProperty.call(schema, k)) return { ok: false, error: `unknown field: ${k}` };
  }
  const out = {};
  for (const [k, spec] of Object.entries(schema)) {
    const present = Object.prototype.hasOwnProperty.call(payload, k) && payload[k] !== undefined;
    if (!present) {
      if (spec.optional) continue;
      return { ok: false, error: `missing field: ${k}` };
    }
    if (!checkField(spec, payload[k])) return { ok: false, error: `invalid field: ${k}` };
    out[k] = payload[k];
  }
  return { ok: true, value: out };
}

// أسماء الحسابات والشخصيات
export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export function normalizeUsername(s) {
  return typeof s === 'string' ? s.trim().toLowerCase() : '';
}
export function validateUsername(s) {
  return USERNAME_RE.test(s);
}
export function validatePassword(s) {
  return typeof s === 'string' && s.length >= 8 && s.length <= 128;
}
// اسم الشخصية: حروف (عربية/لاتينية) وأرقام وشرطة سفلية، 3–16
const CHAR_NAME_RE = /^[\p{L}\p{N}_]{3,16}$/u;
export function validateCharacterName(s) {
  return typeof s === 'string' && CHAR_NAME_RE.test(s);
}

// تنظيف نص الدردشة: إزالة محارف التحكم وضغط المسافات.
export function sanitizeChat(s, maxLen = 200) {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\u0000-\u001F\u007F‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, maxLen);
}
