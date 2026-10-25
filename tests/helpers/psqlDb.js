// محوّل اختبار: يوفّر واجهة db.query(text, params) فوق psql، ليُختبر محرك اللعبة على PostgreSQL حقيقي
// دون حزمة pg (غير قابلة للتثبيت في بيئة التطوير هذه). كل استعلام = عملية psql منفصلة (ذرّية بذاتها).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('non-finite param');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''").replace(/\0/g, '')}'`;
}

export function interpolate(text, params = []) {
  // مرور واحد: قيم المعاملات قد تحوي نصوصًا مثل $1 ولا يجوز إعادة استبدالها
  return text.replace(/\$(\d+)/g, (m, n) => {
    const i = Number(n);
    if (i < 1 || i > params.length) return m;
    return lit(params[i - 1]);
  });
}

export function createPsqlDb({ database, sudoUser = process.getuid?.() === 0 ? 'postgres' : null, extraArgs = [] }) {
  async function exec(sql) {
    const args = ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-d', database, ...extraArgs, '-c', sql];
    const [cmd, cmdArgs] = sudoUser ? ['runuser', ['-u', sudoUser, '--', 'psql', ...args]] : ['psql', args];
    try {
      const { stdout } = await run(cmd, cmdArgs, { maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    } catch (e) {
      const msg = String(e.stderr || e.message).trim().split('\n').find((l) => l.includes('ERROR')) ?? String(e.stderr || e.message);
      const err = new Error(msg.replace(/^.*ERROR:\s*/, ''));
      err.code = /unique|duplicate key/i.test(msg) ? '23505' : /violates check/i.test(msg) ? '23514' : undefined;
      throw err;
    }
  }
  return {
    async query(text, params) {
      const sql = interpolate(text, params);
      const returnsRows = /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql);
      if (!returnsRows) {
        await exec(sql);
        return { rows: [], rowCount: 0 };
      }
      const wrapped = `WITH q AS (${sql.trim().replace(/;$/, '')}) SELECT COALESCE(json_agg(q), '[]'::json) FROM q`;
      const out = (await exec(wrapped)).trim();
      const rows = out ? JSON.parse(out) : [];
      return { rows, rowCount: rows.length };
    },
    exec,
    async end() {},
  };
}
