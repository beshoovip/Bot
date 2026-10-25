// سجل JSON بسيط إلى stdout/stderr (تلتقطه منصات الاستضافة). لا يُسجَّل أي سر.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

export function createLogger(level = 'info', sink = console) {
  const min = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, msg, extra) => {
    if (LEVELS[lvl] < min) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...(extra ?? {}) });
    (lvl === 'error' || lvl === 'warn' ? sink.error : sink.log)(line);
  };
  return {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e instanceof Error ? { err: e.message, stack: e.stack } : e),
  };
}

export const silentLogger = createLogger('silent');
