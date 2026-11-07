import assert from 'node:assert/strict';
import { requiredSoftware } from './requirements';
import { MARKETPLACE_CATALOG } from '../../servers/lib/templates';

const base = { installCmd: '', buildCmd: '', startCmd: '', domain: '' };

assert.deepEqual(requiredSoftware({ ...base, engine: 'native_node', installCmd: 'npm ci', buildCmd: 'npm run build', startCmd: 'npm start' }), ['git', 'node', 'pm2']);
assert.deepEqual(requiredSoftware({ ...base, engine: 'native_php', installCmd: 'composer install', buildCmd: 'php artisan optimize', domain: 'a.io' }), ['git', 'php', 'composer', 'nginx', 'certbot']);
assert.deepEqual(requiredSoftware({ ...base, engine: 'docker', installCmd: 'npm ci', startCmd: 'docker run x' }), ['git', 'docker', 'compose']);
assert.deepEqual(requiredSoftware({ ...base, engine: 'static', installCmd: 'pnpm i', buildCmd: 'pnpm build', domain: 'a.io' }), ['git', 'node', 'pnpm', 'nginx', 'certbot']);
assert.deepEqual(requiredSoftware({ ...base, engine: 'native_python', installCmd: 'pip install -r requirements.txt', startCmd: 'uvicorn main:app' }), ['git', 'python', 'node', 'pm2']);
assert.ok(!requiredSoftware({ ...base, installCmd: 'cargo build --release' }).includes('go'), '"go" must match the word, not substrings');

// Every id must be installable from the catalog, or "Install missing" would silently skip it.
const catalog = new Set(MARKETPLACE_CATALOG.map((t) => t.id));
for (const id of ['git', 'node', 'pnpm', 'yarn', 'bun', 'php', 'composer', 'python', 'go', 'docker', 'compose', 'pm2', 'nginx', 'certbot']) {
  assert.ok(catalog.has(id), `catalog is missing ${id}`);
}
console.log('requirements ok');

{
  const { planInstall } = await import('./requirements');
  const inst = new Map<string, string | null>([['git', '2.43.0'], ['node', '20.20.2'], ['pm2', '5.4.0']]);
  assert.deepEqual(planInstall(['git', 'node', 'pm2'], inst, 22), { missing: ['node'], versions: { node: '22.x' }, nodeTooOld: true });
  assert.deepEqual(planInstall(['git', 'node', 'pm2'], inst, 18), { missing: [], versions: {}, nodeTooOld: false });
  assert.deepEqual(planInstall(['git', 'node', 'pm2', 'nginx'], inst), { missing: ['nginx'], versions: {}, nodeTooOld: false });
  assert.deepEqual(planInstall(['git', 'node'], new Map([['git', null]]), 22).missing, ['node']);
}
console.log('planInstall ok');

{
  const { stripAnsi } = await import('../components/DeployProgress');
  assert.equal(stripAnsi('\x1b[32m✔ done\x1b[0m'), '✔ done');
  assert.equal(stripAnsi('[PM2] [39mDone.'), '[PM2] Done.', 'stray codes from split chunks');
  assert.equal(stripAnsi('normal [log] text'), 'normal [log] text', 'brackets in real output survive');
  assert.equal(stripAnsi('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>', 'left as text; React escapes it');
}
console.log('stripAnsi ok');

{
  const { freePort } = await import('./requirements');
  assert.equal(freePort(3000, [80, 22]), 3000);
  assert.equal(freePort(3000, [3000, 3001, 5432]), 3002, 'gegu on 3000: next app gets 3002');
}
console.log('freePort ok');
