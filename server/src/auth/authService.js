// المصادقة: تسجيل/دخول/جلسات + إنشاء الشخصيات. مستقلة عن HTTP كي تُختبر مباشرة.

import { ERR } from '../../../shared/constants.js';
import { BALANCE } from '../../../shared/data/balance.js';
import { PROFESSIONS } from '../../../shared/data/professions.js';
import { baseStats } from '../../../shared/progression.js';
import { getDefaultWorld } from '../../../shared/maps/world.js';
import { SKILLS } from '../../../shared/data/skills.js';
import { normalizeUsername, validateUsername, validatePassword, validateCharacterName } from '../../../shared/validate.js';
import { hashPassword, verifyPassword, newSessionToken, hashToken } from '../security/passwords.js';

// تجزئة وهمية لمعادلة زمن الاستجابة عندما لا يوجد المستخدم (تقليل تسريب وجود الحساب)
let dummyHash = null;

export function createAuthService({ repo, config, hashParams }) {
  const world = getDefaultWorld();
  const ttl = config.sessionTtlDays;

  async function issueSession(userId) {
    const token = newSessionToken();
    await repo.createSession(userId, hashToken(token), ttl);
    return token;
  }

  return {
    async register(usernameRaw, password) {
      const username = normalizeUsername(usernameRaw);
      if (!validateUsername(username) || !validatePassword(password)) return { ok: false, error: ERR.INVALID };
      const row = await repo.createUser(username, await hashPassword(password, hashParams));
      if (!row) return { ok: false, error: ERR.USERNAME_TAKEN };
      return { ok: true, userId: row.id, token: await issueSession(row.id), username };
    },

    async login(usernameRaw, password) {
      const username = normalizeUsername(usernameRaw);
      if (!validateUsername(username) || typeof password !== 'string' || password.length > 128) return { ok: false, error: ERR.BAD_CREDENTIALS };
      const user = await repo.getUserByUsername(username);
      if (!user) {
        dummyHash ??= await hashPassword('dummy-password', hashParams);
        await verifyPassword(password, dummyHash);
        return { ok: false, error: ERR.BAD_CREDENTIALS };
      }
      if (!(await verifyPassword(password, user.passwordHash))) return { ok: false, error: ERR.BAD_CREDENTIALS };
      await repo.touchLogin(user.id);
      return { ok: true, userId: user.id, token: await issueSession(user.id), username };
    },

    async authenticate(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      return repo.getSession(hashToken(token));
    },

    logout: (token) => (typeof token === 'string' ? repo.deleteSession(hashToken(token)) : Promise.resolve()),

    listCharacters: (userId) => repo.listCharacters(userId),

    async createCharacter(userId, nameRaw, professionId) {
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
      if (!validateCharacterName(name)) return { ok: false, error: ERR.INVALID };
      const prof = Object.prototype.hasOwnProperty.call(PROFESSIONS, professionId) ? PROFESSIONS[professionId] : null;
      if (!prof) return { ok: false, error: ERR.INVALID };
      const city = world.spawns[0]; // يبدأ الجميع في مدينة الفجر
      const skills = Object.fromEntries(prof.skills.map((s) => [s, 1]));
      for (const s of prof.skills) if (!SKILLS[s]) throw new Error(`skill ${s} missing`);
      const r = await repo.createCharacter({
        userId,
        name,
        profession: prof.id,
        x: city.x,
        y: city.y,
        gold: BALANCE.startingGold,
        hp: baseStats(prof.id, 1).maxHp,
        skills,
        items: prof.startItems,
        maxChars: BALANCE.maxCharactersPerUser,
      });
      return r.ok ? { ok: true, characterId: r.id } : { ok: false, error: r.error };
    },
  };
}
