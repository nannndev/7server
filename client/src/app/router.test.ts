// Run (from client/): npx --prefix ../server tsx src/app/router.test.ts
import assert from 'node:assert/strict';
import { parseRoute, routeToHash, Route } from '@/app/router';

const cases: [string, Route][] = [
  ['', { page: 'fleet' }],
  ['#/', { page: 'fleet' }],
  ['#/fleet/rack', { page: 'fleet', view: 'rack' }],
  ['#/servers/abc-123', { page: 'server', id: 'abc-123', tab: 'overview' }],
  ['#/servers/abc-123/docker', { page: 'server', id: 'abc-123', tab: 'docker' }],
  ['#/servers/abc-123/cron', { page: 'server', id: 'abc-123', tab: 'cron' }],
  ['#/servers/abc-123/ssl', { page: 'server', id: 'abc-123', tab: 'ssl' }],
  ['#/servers/abc-123/security', { page: 'server', id: 'abc-123', tab: 'security' }],
  ['#/servers/abc-123/backups', { page: 'server', id: 'abc-123', tab: 'backups' }],
  ['#/servers/abc-123/audit', { page: 'server', id: 'abc-123', tab: 'audit' }],
  ['#/monitoring', { page: 'monitoring', tab: 'alerts' }],
  ['#/monitoring/audit', { page: 'monitoring', tab: 'audit' }],
  ['#/ai-gateway', { page: 'ai-gateway', tab: 'providers' }],
  ['#/ai-gateway/providers', { page: 'ai-gateway', tab: 'providers' }],
  ['#/ai-gateway/keys', { page: 'ai-gateway', tab: 'keys' }],
  ['#/ai-gateway/quickstart', { page: 'ai-gateway', tab: 'quickstart' }],
  ['#/ai-gateway/usage', { page: 'ai-gateway', tab: 'usage' }]
];
for (const [hash, route] of cases) {
  assert.deepEqual(parseRoute(hash), route, hash);
  // format -> parse round-trips to the same route
  assert.deepEqual(parseRoute(routeToHash(route)), route, `roundtrip ${hash}`);
}

// Unknown / malformed input falls back instead of breaking the page.
assert.deepEqual(parseRoute('#/servers/x/hacker'), { page: 'server', id: 'x', tab: 'overview' });
assert.deepEqual(parseRoute('#/fleet/nope'), { page: 'fleet' });
assert.deepEqual(parseRoute('#/what/ever'), { page: 'fleet' });
assert.deepEqual(parseRoute('#/servers'), { page: 'fleet' });
assert.deepEqual(parseRoute('#/servers/a%2Fb/pm2'), { page: 'server', id: 'a/b', tab: 'pm2' });
assert.equal(routeToHash({ page: 'server', id: 'a/b', tab: 'pm2' }), '#/servers/a%2Fb/pm2');

console.log('router tests ok');
