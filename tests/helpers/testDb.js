// قاعدة اختبار مؤقتة على PostgreSQL المحلي: تُنشأ، تُرحَّل، وتُحذف. تتطلب psql وخادمًا يعمل.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPsqlDb } from './psqlDb.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../database');
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function psql(args, input) {
  const [cmd, a] = asRoot ? ['runuser', ['-u', 'postgres', '--', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args]] : ['psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args]];
  return execFileSync(cmd, a, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function createTestDatabase(prefix = 'cr_test') {
  const name = `${prefix}_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  psql(['-d', 'postgres', '-c', `CREATE DATABASE ${name}`]);
  for (const dir of ['migrations', 'seeds']) {
    for (const f of readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.sql')).sort()) {
      psql(['-d', name], readFileSync(path.join(ROOT, dir, f), 'utf8'));
    }
  }
  const db = createPsqlDb({ database: name });
  return {
    name,
    db,
    drop() {
      try {
        psql(['-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`]);
      } catch {
        /* ignore */
      }
    },
  };
}
