// غلاف رفيع حول pg.Pool. الواجهة الوحيدة التي يعرفها بقية الخادم: db.query(text, params) → { rows, rowCount }.
// (تُستخدم نفس الواجهة في الاختبارات عبر محوّل psql، فيُختبر المحرك على PostgreSQL حقيقي.)

import pg from 'pg';

// bigint (int8) → number. آمنة لأن قيمنا أقل بكثير من 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export function createPool(config) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => {
    // أخطاء اتصالات خاملة: لا نوقف العملية
    console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', err: err.message }));
  });
  return {
    query: (text, params) => pool.query(text, params),
    // معاملة متعددة الجمل (تُستخدم في الترحيلات فقط؛ منطق اللعبة يعتمد على دوال SQL ذرّية)
    async withClient(fn) {
      const client = await pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
