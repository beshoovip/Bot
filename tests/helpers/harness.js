// أدوات اختبار التكامل: عملاء مزيَّفون (بلا شبكة) فوق GameServer حقيقي وقاعدة PostgreSQL حقيقية.
// ملاحظة: هذا يختبر منطق الأونلاين (الحَكَم على الخادم)، لا طبقة Socket.IO ولا الشبكة الفعلية.

import { createTestDatabase } from './testDb.js';
import { createRepo } from '../../server/src/database/repo.js';
import { createAuthService } from '../../server/src/auth/authService.js';
import { GameServer } from '../../server/src/game/GameServer.js';
import { silentLogger, createLogger } from '../../server/src/config/logger.js';
import { ConnectionLimiter } from '../../server/src/security/rateLimiter.js';
import { loadConfig } from '../../server/src/config/env.js';
import { RATE_LIMITS, C2S, S2C } from '../../shared/protocol.js';
import { mulberry32 } from '../../shared/rng.js';

/** حدود معدل مرتفعة جدًا للاختبارات التي تتكرر فيها الأوامر عمدًا (حدود الإنتاج تُختبر في online.test.js). */
export function relaxedLimiter() {
  const lim = Object.fromEntries(Object.entries(RATE_LIMITS).map(([k, v]) => [k, { burst: v.burst * 1000, perSec: v.perSec * 1000 }]));
  return new ConnectionLimiter(lim);
}

export class FakeConn {
  constructor(game, userId, limiter = new ConnectionLimiter(RATE_LIMITS)) {
    this.game = game;
    this.userId = userId;
    this.limiter = limiter;
    this.player = null;
    this.events = [];
    this.closed = false;
  }
  emit(ev, payload) {
    this.events.push([ev, payload]);
  }
  close() {
    this.closed = true;
  }
  send(event, payload) {
    return this.game.handle(this, event, payload);
  }
  last(ev) {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i][0] === ev) return this.events[i][1];
    return null;
  }
  all(ev) {
    return this.events.filter((e) => e[0] === ev).map((e) => e[1]);
  }
  errors() {
    return this.all(S2C.ERROR).map((e) => e.code);
  }
  gameEvents(type) {
    return this.all(S2C.EVENT).filter((e) => e.type === type);
  }
}

export function createWorldHarness({ seed = 7, relaxed = false, noMonsters = false } = {}) {
  const tdb = createTestDatabase('game');
  const repo = createRepo(tdb.db);
  const config = loadConfig({});
  const auth = createAuthService({ repo, config, hashParams: { n: 1024, r: 8, p: 1 } });
  let counter = 0;
  const harness = {
    tdb,
    repo,
    auth,
    games: [],
    async newGame() {
      const game = new GameServer({ repo, log: process.env.TEST_LOG ? createLogger('debug') : silentLogger, rng: mulberry32(seed + harness.games.length) });
      await game.init();
      if (noMonsters) game.monsters.monsters.clear();
      harness.games.push(game);
      return game;
    },
    /** ينشئ حسابًا وشخصية بالمهنة المطلوبة (من الخادم) ويعيد معرّفاتهما. */
    async makeCharacter(profession, name) {
      const username = `user${++counter}_${profession}`;
      const reg = await auth.register(username, 'password123');
      if (!reg.ok) throw new Error(`register failed ${reg.error}`);
      const ch = await auth.createCharacter(reg.userId, name ?? `${profession}_${counter}`, profession);
      if (!ch.ok) throw new Error(`character failed ${ch.error}`);
      return { userId: reg.userId, characterId: ch.characterId, token: reg.token };
    },
    async connect(game, acct) {
      const conn = new FakeConn(game, acct.userId, relaxed ? relaxedLimiter() : undefined);
      const res = await conn.send(C2S.JOIN, { characterId: acct.characterId });
      if (!res.ok) throw new Error(`join failed ${res.error}`);
      return conn;
    },
    /** اختصار: حساب + شخصية + اتصال. */
    async spawn(game, profession, name) {
      const acct = await harness.makeCharacter(profession, name);
      const conn = await harness.connect(game, acct);
      return { acct, conn, p: conn.player };
    },
    async close() {
      for (const g of harness.games) await g.shutdown().catch(() => {});
      tdb.drop();
    },
  };
  return harness;
}

/** يقدّم زمن اللعبة ثم ينتظر انتهاء المهام الخلفية (الحفظ/المكافآت). */
export async function advance(game, seconds, dt = 0.1) {
  const n = Math.ceil(seconds / dt);
  for (let i = 0; i < n; i++) {
    game.tick(dt);
    if (i % 25 === 24) await game.idle();
  }
  await game.idle();
}

export function place(p, x, y) {
  p.x = x;
  p.y = y;
}

export const uid = (() => {
  let n = 0;
  return (prefix = 'id') => `${prefix}_${process.pid}_${++n}_${Math.floor(Math.random() * 1e6)}`;
})();

export { C2S, S2C };

/** يقدّم الزمن حتى يتحقق الشرط أو ينتهي الحد الأقصى (يعيد true إن تحقق). */
export async function advanceUntil(game, cond, maxSec = 300, dt = 0.25) {
  const n = Math.ceil(maxSec / dt);
  for (let i = 0; i < n; i++) {
    if (cond()) {
      await game.idle();
      return true;
    }
    game.tick(dt);
    if (i % 20 === 19) await game.idle();
  }
  await game.idle();
  return cond();
}

/** يجهّز تاجرًا ويطلق قافلة كاملة الحمولة (قمح) من مدينة الفجر. */
export async function launchWheatCaravan(h, game, trader, { units = 24 } = {}) {
  await h.repo.grant(trader.p.id, 600, {}, 'test_funds', uid('fund'));
  await game.refreshPlayer(trader.p);
  place(trader.p, 15.5, 17.5);
  const b = await trader.conn.send(C2S.BUY, { npcId: 'dawn_market', itemId: 'wheat', qty: units, idem: uid('buy') });
  if (!b.ok) throw new Error(`buy failed: ${b.error}`);
  place(trader.p, 19.5, 22.5);
  const r = await trader.conn.send(C2S.LAUNCH, { npcId: 'dawn_caravan', destCity: 'dusk_city', cargo: { wheat: units }, idem: uid('launch') });
  if (!r.ok) throw new Error(`launch failed: ${r.error}`);
  return r.caravanId;
}
