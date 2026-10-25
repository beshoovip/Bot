// نقطة الدخول: يشغّل الترحيلات (اختياريًا)، ثم GameServer، ثم HTTP + Socket.IO، مع إيقاف آمن.

import http from 'node:http';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPool } from './database/db.js';
import { migrate } from './database/migrate.js';
import { createRepo } from './database/repo.js';
import { createAuthService } from './auth/authService.js';
import { GameServer } from './game/GameServer.js';
import { createApp } from './network/app.js';
import { attachSocketServer } from './network/socket.js';

const config = loadConfig();
const log = createLogger(config.logLevel);

if (!config.databaseUrl) {
  log.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createPool(config);
if (process.env.RUN_MIGRATIONS !== 'false') {
  const r = await migrate(db, { log: (m) => log.info(m) });
  log.info('migrations done', r);
}
const repo = createRepo(db);
const auth = createAuthService({ repo, config });
const game = new GameServer({ repo, log });
await game.init();
game.start();

const app = createApp({ auth, config, db, game, log });
const server = http.createServer(app);
const io = attachSocketServer(server, { game, auth, config, log });
server.listen(config.port, () => log.info('server listening', { port: config.port, env: config.nodeEnv }));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  log.info('shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  try {
    await game.shutdown(); // يحفظ كل اللاعبين والقوافل
    io.close();
    await new Promise((r) => server.close(r));
    await db.end();
    log.info('shutdown complete');
    process.exit(0);
  } catch (e) {
    log.error('shutdown failed', e);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => log.error('unhandledRejection', e instanceof Error ? e : { err: String(e) }));
