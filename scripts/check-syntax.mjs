// فحص صياغة كل ملفات JS (node --check) — يعمل بلا تثبيت اعتماديات. لا يستورد الوحدات؛ يتحقق من الصياغة فقط.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['shared', 'server/src', 'server/scripts', 'client/src', 'tests', 'scripts', 'tools'];
const skip = new Set(['node_modules', 'dist', 'android']);
let n = 0;
let bad = 0;
const walk = (d) => {
  let entries = [];
  try { entries = readdirSync(d); } catch { return; }
  for (const e of entries) {
    if (skip.has(e)) continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js|cjs)$/.test(e)) {
      n++;
      try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); } catch (err) { bad++; console.error(`SYNTAX ERROR: ${p}\n${err.stderr}`); }
    }
  }
};
roots.forEach(walk);
console.log(`checked ${n} files, ${bad} errors`);
process.exit(bad ? 1 : 0);
