// قراءة الإعدادات من متغيرات البيئة فقط. لا أسرار في الكود.

function int(name, def, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Invalid env ${name}: ${raw}`);
  return v;
}

export function loadConfig(env = process.env) {
  const prev = process.env;
  process.env = env;
  try {
    const nodeEnv = env.NODE_ENV || 'development';
    const origins = (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const cfg = {
      nodeEnv,
      isProd: nodeEnv === 'production',
      port: int('PORT', 3000, { min: 1, max: 65535 }),
      databaseUrl: env.DATABASE_URL || '',
      databaseSsl: env.DATABASE_SSL === 'true' || (nodeEnv === 'production' && env.DATABASE_SSL !== 'false'),
      corsOrigins: origins,
      sessionTtlDays: int('SESSION_TTL_DAYS', 30, { min: 1, max: 365 }),
      trustProxy: env.TRUST_PROXY === 'true',
      httpRateWindowMs: int('HTTP_RATE_WINDOW_MS', 60_000, { min: 1000 }),
      httpRateMax: int('HTTP_RATE_MAX', 120, { min: 1 }),
      authRateMax: int('AUTH_RATE_MAX', 10, { min: 1 }),
      logLevel: env.LOG_LEVEL || 'info',
    };
    if (cfg.isProd) {
      if (!cfg.databaseUrl) throw new Error('DATABASE_URL is required in production');
      if (cfg.corsOrigins.length === 0) throw new Error('CORS_ORIGINS is required in production (comma-separated origins)');
    }
    return cfg;
  } finally {
    process.env = prev;
  }
}
