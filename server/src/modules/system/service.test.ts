// Run: npx tsx src/modules/system/service.test.ts
import assert from 'node:assert/strict';
import { checkHostname, checkTimezone } from './service.js';

// Hostname validation
assert.equal(checkHostname('vps-prod-01'), 'vps-prod-01');
assert.equal(checkHostname('my.server.local'), 'my.server.local');
assert.throws(() => checkHostname('vps; rm -rf /'));
assert.throws(() => checkHostname('-vps'));
assert.throws(() => checkHostname(''));

// Timezone validation
assert.equal(checkTimezone('Asia/Jakarta'), 'Asia/Jakarta');
assert.equal(checkTimezone('UTC'), 'UTC');
assert.equal(checkTimezone('America/New_York'), 'America/New_York');
assert.throws(() => checkTimezone('Asia/Jakarta; id'));
assert.throws(() => checkTimezone(''));

console.log('system tuning tests ok');

