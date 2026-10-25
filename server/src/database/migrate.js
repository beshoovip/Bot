// مشغّل ترحيلات قابل للتكرار: يطبّق ملفات database/migrations/*.sql بالترتيب مرة واحدة لكل ملف،
// داخل معاملة، مع قفل استشاري لمنع تشغيلين متزامنين. ثم يطبّق البذور (upsert آمن للتكرار).
// الاستخدام: node server/src/database/migrate.js   (يتطلب DATABASE_URL)

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../database');
const LOCK_KEY = 874_221_001;

async function listSql(dir) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(files.map(async (f) => ({ name: f, sql: await readFile(path.join(dir, f), 'utf8') })));
}
const checksum = (s) => createHash('sha256').update(s).digest('hex');

/** @param {{withClient: Function}} db */
export async function migrate(db, { log = console.log, seeds = true } = {}) {
  const migrations = await listSql(path.join(ROOT, 'migrations'));
  return db.withClient(async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
      const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
      const done = new Map(rows.map((r) => [r.name, r.checksum]));
      let applied = 0;
      for (const m of migrations) {
        const sum = checksum(m.sql);
        if (done.has(m.name)) {
          if (done.get(m.name) !== sum) throw new Error(`Migration ${m.name} was modified after being applied. Add a new migration instead.`);
          continue;
        }
        log(`applying ${m.name}`);
        try {
          await client.query('BEGIN');
          await client.query(m.sql);
          await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [m.name, sum]);
          await client.query('COMMIT');
          applied++;
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw new Error(`Migration ${m.name} failed: ${err.message}`);
        }
      }
      if (seeds) {
        for (const s of await listSql(path.join(ROOT, 'seeds'))) {
          log(`seeding ${s.name}`);
          await client.query(s.sql); // ملفات البذور تحوي BEGIN/COMMIT بنفسها
        }
      }
      return { applied, total: migrations.length };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  });
}

// تشغيل مباشر من سطر الأوامر
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { loadConfig } = await import('../config/env.js');
  const { createPool } = await import('./db.js');
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const db = createPool(cfg);
  try {
    const r = await migrate(db);
    console.log(`migrations: ${r.applied} applied, ${r.total} total`);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}
