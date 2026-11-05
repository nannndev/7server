// Cuts a release: bumps packages/npm/package.json, commits, tags vX.Y.Z.
// Pushing the tag starts .github/workflows/release.yml (npm + Docker image + GitHub Release).
//   node scripts/release.mjs patch|minor|major|1.2.3
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const fail = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const arg = process.argv[2];
if (!arg) fail('usage: node scripts/release.mjs patch|minor|major|X.Y.Z');
if (git('status', '--porcelain')) fail('working tree not clean, commit first');
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('release from main');

const file = path.resolve(import.meta.dirname, '..', 'packages', 'npm', 'package.json');
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
const [ma, mi, pa] = pkg.version.split('-')[0].split('.').map(Number);
const next = { major: `${ma + 1}.0.0`, minor: `${ma}.${mi + 1}.0`, patch: `${ma}.${mi}.${pa + 1}` }[arg] ?? arg;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(next)) fail(`not a version: ${next}`);
if (git('tag', '-l', `v${next}`)) fail(`tag v${next} already exists`);

pkg.version = next;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
git('add', file);
git('commit', '-m', `release: v${next}`);
git('tag', '-a', `v${next}`, '-m', `v${next}`);
console.log(`✓ v${next} tagged. Publish it with:\n  git push origin main v${next}`);
