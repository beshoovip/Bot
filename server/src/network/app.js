// تطبيق Express: واجهة REST للحساب والشخصيات + فحص الصحة. CORS صارم بقائمة أصول صريحة.

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createApiHandlers } from '../auth/apiHandlers.js';

export function createApp({ auth, config, db, game, log }) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // الطلبات بلا Origin (curl، فحص الصحة، خادم لخادم) مسموحة؛ المتصفحات/Capacitor يجب أن تكون في القائمة
        if (!origin || config.corsOrigins.includes(origin) || (!config.isProd && config.corsOrigins.length === 0)) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '4kb' }));

  const api = createApiHandlers({ auth, config, db, game });
  const bearer = (req) => {
    const h = req.get('authorization') ?? '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  };
  const wrap = (fn) => async (req, res) => {
    try {
      const { status, body } = await fn({ body: req.body, token: bearer(req), ip: req.ip });
      res.status(status).json(body);
    } catch (e) {
      log.error('http handler failed', { path: req.path, err: e.message });
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  };

  app.get('/healthz', wrap(api.health));
  app.post('/api/register', wrap(api.register));
  app.post('/api/login', wrap(api.login));
  app.post('/api/logout', wrap(api.logout));
  app.get('/api/characters', wrap(api.listCharacters));
  app.post('/api/characters', wrap(api.createCharacter));
  app.use((req, res) => res.status(404).json({ ok: false, error: 'NOT_FOUND' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') return res.status(400).json({ ok: false, error: 'INVALID' });
    log.error('unhandled express error', { err: err?.message });
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  });
  return app;
}
