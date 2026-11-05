// Runs every *.test.ts in server/ and client/ (each is a plain assert script run with tsx).
// Run from the repo root: node scripts/run-tests.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tsx = path.join(root, 'server', 'node_modules', '.bin', 'tsx');
const find = (dir) => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile() && e.name.endsWith('.test.ts'))
  .map((e) => path.join(e.parentPath, e.name)).sort();

let failed = 0;
for (const pkg of ['server', 'client']) {
  for (const file of find(path.join(root, pkg, 'src'))) {
    const rel = path.relative(root, file);
    try {
      execFileSync(tsx, [path.relative(path.join(root, pkg), file)], { cwd: path.join(root, pkg), stdio: 'pipe' });
      console.log(`ok    ${rel}`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${rel}\n${String(e.stdout || '')}${String(e.stderr || '')}`);
    }
  }
}
if (failed) { console.log(`\n${failed} test file(s) failed`); process.exit(1); }
console.log('\nall tests passed');
