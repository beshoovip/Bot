// عنوان الخادم يأتي من إعداد قابل للتغيير — لا يوجد localhost ثابت في الإنتاج.
// الأولوية: 1) ما يحفظه المستخدم في الإعدادات، 2) VITE_SERVER_URL وقت البناء، 3) نفس أصل الصفحة (للتطوير عبر المتصفح).

const STORAGE_KEY = 'caravan.serverUrl';

function safeStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function normalizeServerUrl(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/i.test(s)) return null;
  return s;
}

export function getServerUrl(env = {}, storage = safeStorage(), origin = globalThis.location?.origin) {
  const saved = normalizeServerUrl(storage?.getItem(STORAGE_KEY) ?? '');
  if (saved) return saved;
  const built = normalizeServerUrl(env.VITE_SERVER_URL ?? '');
  if (built) return built;
  if (origin && /^https?:/.test(origin) && !/^https?:\/\/localhost$/.test(origin)) return origin; // Capacitor يستخدم https://localhost فلا يصلح كخادم
  return null;
}

export function saveServerUrl(url, storage = safeStorage()) {
  const n = normalizeServerUrl(url);
  if (!n) return false;
  try {
    storage?.setItem(STORAGE_KEY, n);
    return true;
  } catch {
    return false;
  }
}

// إعدادات اللاعب المحلية
const SETTINGS_KEY = 'caravan.settings';
export const DEFAULT_SETTINGS = Object.freeze({ joystickSize: 1, buttonSize: 1, joystickSensitivity: 1, sound: true, leftHanded: false });

export function loadSettings(storage = safeStorage()) {
  try {
    const v = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? '{}');
    return {
      joystickSize: clamp(v.joystickSize, 0.7, 1.6, 1),
      buttonSize: clamp(v.buttonSize, 0.7, 1.6, 1),
      joystickSensitivity: clamp(v.joystickSensitivity, 0.5, 1.5, 1),
      sound: v.sound !== false,
      leftHanded: v.leftHanded === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function saveSettings(s, storage = safeStorage()) {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
function clamp(v, lo, hi, def) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
}
