import assert from 'node:assert/strict';
import { compareSemver, getCurrentVersion, checkLatestVersion, __resetVersionCache } from './version.js';

assert.equal(compareSemver('0.3.2', '0.3.1') > 0, true);
assert.equal(compareSemver('v1.0.0', '0.9.9') > 0, true);
assert.equal(compareSemver('0.3.1', '0.3.1'), 0);
assert.equal(compareSemver('0.2.0', '0.3.1') < 0, true);

assert.match(getCurrentVersion(), /^\d+\.\d+\.\d+/);

// Stub fetch to verify GitHub release detection + cache
__resetVersionCache();
const origFetch = globalThis.fetch;
let fetchCount = 0;
globalThis.fetch = (async () => {
  fetchCount++;
  return new Response(
    JSON.stringify({
      tag_name: 'v9.9.9',
      html_url: 'https://github.com/nannndev/7server/releases/tag/v9.9.9',
      body: 'New features and fixes',
      published_at: '2026-11-16T00:00:00Z'
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}) as any;

try {
  const r1 = await checkLatestVersion();
  assert.equal(r1.latestVersion, '9.9.9');
  assert.equal(r1.updateAvailable, true);
  assert.equal(r1.source, 'github');
  const r2 = await checkLatestVersion();
  assert.equal(r2.latestVersion, '9.9.9');
  assert.equal(fetchCount, 1, 'second call should use cache');
} finally {
  globalThis.fetch = origFetch;
  __resetVersionCache();
}

console.log('version ok');
