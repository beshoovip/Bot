// منطق واجهة HTTP بلا اعتماد على Express: كل معالج يأخذ { body, token, ip } ويعيد { status, body }.
// يُربط بـ Express في app.js، ويُختبر مباشرة في tests/server/api.test.js.

import { ERR } from '../../../shared/constants.js';
import { KeyedLimiter } from '../security/rateLimiter.js';

const STATUS = {
  [ERR.INVALID]: 400,
  [ERR.BAD_CREDENTIALS]: 401,
  [ERR.UNAUTHORIZED]: 401,
  [ERR.USERNAME_TAKEN]: 409,
  [ERR.NAME_TAKEN]: 409,
  [ERR.TOO_MANY_CHARACTERS]: 409,
  [ERR.RATE_LIMIT]: 429,
};
const out = (r, okStatus = 200) => (r.ok ? { status: okStatus, body: r } : { status: STATUS[r.error] ?? 400, body: { ok: false, error: r.error } });

export function createApiHandlers({ auth, config, db, game, now = Date.now }) {
  const authLimiter = new KeyedLimiter(config.authRateMax, config.httpRateWindowMs, now);

  async function requireUser(token) {
    const u = await auth.authenticate(token);
    return u ?? null;
  }

  return {
    async register({ body, ip }) {
      if (!authLimiter.allow(`reg:${ip}`)) return { status: 429, body: { ok: false, error: ERR.RATE_LIMIT } };
      const r = await auth.register(body?.username, body?.password);
      return out(r.ok ? { ok: true, token: r.token, username: r.username } : r, 201);
    },
    async login({ body, ip }) {
      if (!authLimiter.allow(`login:${ip}`)) return { status: 429, body: { ok: false, error: ERR.RATE_LIMIT } };
      const r = await auth.login(body?.username, body?.password);
      return out(r.ok ? { ok: true, token: r.token, username: r.username } : r);
    },
    async logout({ token }) {
      await auth.logout(token);
      return { status: 200, body: { ok: true } };
    },
    async listCharacters({ token }) {
      const u = await requireUser(token);
      if (!u) return { status: 401, body: { ok: false, error: ERR.UNAUTHORIZED } };
      return { status: 200, body: { ok: true, characters: await auth.listCharacters(u.userId) } };
    },
    async createCharacter({ body, token }) {
      const u = await requireUser(token);
      if (!u) return { status: 401, body: { ok: false, error: ERR.UNAUTHORIZED } };
      const r = await auth.createCharacter(u.userId, body?.name, body?.profession);
      return out(r.ok ? { ok: true, characterId: r.characterId } : r, 201);
    },
    async health() {
      try {
        await db.query('SELECT 1 AS ok');
        return { status: 200, body: { ok: true, db: true, online: game?.onlineCount ?? 0, uptime: Math.round(process.uptime()) } };
      } catch {
        return { status: 503, body: { ok: false, db: false } };
      }
    },
  };
}
