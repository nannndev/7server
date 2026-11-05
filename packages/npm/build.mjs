// Builds the npm package in packages/npm/:
//   dist/server.js   the whole server bundled by esbuild (ESM, Node 22)
//   dist/client/     the dashboard (vite build)
// Run from the repo root: node packages/npm/build.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const PKG = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(PKG, '..', '..');
const DIST = path.join(PKG, 'dist');
const require = createRequire(path.join(ROOT, 'server', 'package.json'));
const esbuild = require('esbuild');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

// 1. dashboard
execFileSync('npx', ['vite', 'build', '--outDir', path.join(DIST, 'client'), '--emptyOutDir'], { cwd: path.join(ROOT, 'client'), stdio: 'inherit' });

// 2. server: one file. ssh2 stays a real dependency (its optional native addon can't be bundled);
// everything else is pure JS and gets inlined.
const external = ['ssh2', 'cpu-features'];
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external,
  legalComments: 'none',
  sourcemap: false,
  // CJS deps bundled into ESM need require/__dirname.
  banner: { js: "import { createRequire as __cr } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = __cr(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  logLevel: 'info'
};
await esbuild.build({ ...shared, entryPoints: [path.join(ROOT, 'server', 'src', 'index.ts')], outfile: path.join(DIST, 'server.js') });
await esbuild.build({ ...shared, entryPoints: [path.join(ROOT, 'server', 'src', 'resetPassword.ts')], outfile: path.join(DIST, 'reset-password.js') });

// 3. dependency versions follow the server's package.json, so the package can't drift.
const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'package.json'), 'utf8'));
const pkgFile = path.join(PKG, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.dependencies = { ssh2: serverPkg.dependencies.ssh2 };
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

// 4. sanity: nothing secret or local ended up in dist
const bad = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  if (/\.(db|db-wal|db-shm|pem|key)$|^\.env|secret\.key|dashboard\.password|\.migrated$/.test(e.name)) bad.push(p);
  else if (/\.(js|html|json)$/.test(e.name) && /GOCSPX-[A-Za-z0-9_-]{20}|7s-sk-[0-9a-f]{40}|BEGIN (RSA|OPENSSH) PRIVATE/.test(fs.readFileSync(p, 'utf8'))) bad.push(p);
});
walk(DIST);
if (bad.length) { console.error('Refusing to package, secret-looking files:\n' + bad.join('\n')); process.exit(1); }
console.log('\npackages/npm ready: npm pack (in packages/npm) to test, npm publish to release.');
