// تجزئة كلمات المرور بـ scrypt المدمج في Node (بلا اعتماديات خارجية). الصيغة: scrypt$N$r$p$saltB64$hashB64

import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 128 * N * R * 2;

function derive(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: Math.max(MAXMEM, 128 * n * r * 2) }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password, params = { n: N, r: R, p: P }) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, params.n, params.r, params.p);
  return `scrypt$${params.n}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await derive(password, Buffer.from(saltB64, 'base64'), Number(n), Number(r), Number(p));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// رموز الجلسة: 32 بايت عشوائية؛ نخزن SHA-256 فقط في قاعدة البيانات.
export function newSessionToken() {
  return randomBytes(32).toString('base64url');
}
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}
