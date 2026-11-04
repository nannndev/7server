// Run (from server/): npx tsx src/modules/software/service.test.ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildProbe, parseInventory, parseVersion, parseUpgradable } from './service.js';

// Version banners as real tools print them.
assert.equal(parseVersion('v20.11.1'), '20.11.1');
assert.equal(parseVersion('nginx version: nginx/1.24.0 (Ubuntu)'), '1.24.0');
assert.equal(parseVersion('PHP 8.3.6 (cli) (built: Apr 15 2024)'), '8.3.6');
assert.equal(parseVersion('Docker version 27.1.1, build 6312585'), '27.1.1');
assert.equal(parseVersion('mysqld  Ver 8.0.39-0ubuntu0.22.04.1 for Linux'), '8.0.39-0ubuntu0.22.04.1');
assert.equal(parseVersion('psql (PostgreSQL) 14.13'), '14.13');
assert.equal(parseVersion('git version 2.34.1'), '2.34.1');
assert.equal(parseVersion('weird'), 'weird');
assert.equal(parseVersion(''), null);

const inv = parseInventory([
  'noise from motd',
  '@@node|1|v20.11.1|',
  '@@nginx|1|nginx version: nginx/1.24.0|active',
  '@@docker|1|Docker version 27.1.1, build x|inactive',
  "@@compose|1|docker: 'compose' is not a docker command.|",
  '@@php|0||'
].join('\n'));
const by = Object.fromEntries(inv.map((i) => [i.id, i]));
assert.deepEqual(by.node, { id: 'node', name: 'Node.js', category: 'runtime', installed: true, version: '20.11.1' });
assert.equal(by.nginx.service, 'active');
assert.equal(by.docker.service, 'inactive');
assert.equal(by.compose.installed, false, 'docker without the compose plugin is not compose');
assert.equal(by.php.installed, false);
assert.equal(by.php.service, null);
assert.equal(by.redis.installed, false, 'tools missing from output count as not installed');

// The generated probe must be valid sh and emit one well-formed line per catalog entry,
// even on a machine where most tools are absent.
const out = execFileSync('sh', ['-c', buildProbe()], { encoding: 'utf8', timeout: 60000 });
const lines = out.split('\n').filter((l) => l.startsWith('@@'));
assert.equal(lines.length, inv.length);
for (const l of lines) assert.match(l, /^@@[a-z0-9_-]+\|[01]\|[^|]*\|[^|]*$/, l);
assert.equal(parseInventory(out).find((i) => i.id === 'node')?.installed, true, 'node runs this test, so it is installed');

const upg = parseUpgradable([
  'Listing... Done',
  'nginx/jammy-updates 1.18.0-6ubuntu14.5 amd64 [upgradable from: 1.18.0-6ubuntu14.4]',
  'docker-ce/jammy 5:27.3.1-1~ubuntu.22.04~jammy amd64 [upgradable from: 5:26.1.4-1~ubuntu.22.04~jammy]'
].join('\n'));
assert.equal(upg.nginx?.newVersion, '1.18.0-6ubuntu14.5');
assert.equal(upg.nginx?.currentVersion, '1.18.0-6ubuntu14.4');
assert.equal(upg['docker-ce']?.newVersion, '5:27.3.1-1~ubuntu.22.04~jammy');

console.log('software tests ok');
