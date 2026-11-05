import assert from 'node:assert';
import { parseCrontab, serializeCrontab } from './service.js';
import type { CronJobItem } from './types.js';

console.log('Testing crontab parsing and serialization...');

const sampleCrontab = `
# Crontab managed by 7Server
# Database backup daily
0 2 * * * /usr/local/bin/backup-db.sh # run mysql backup

# Laravel scheduler every minute
* * * * * cd /var/www/my-app && php artisan schedule:run >> /dev/null 2>&1

# Inactive job (disabled)
# 0 0 * * 0 /usr/bin/certbot renew # weekly renew test

# Inactive job without comment
# */15 * * * * /usr/local/bin/check-health.sh
`;

const parsed = parseCrontab(sampleCrontab);

assert.strictEqual(parsed.length, 4, `Expected 4 parsed jobs, got ${parsed.length}`);

// Job 1
assert.strictEqual(parsed[0].schedule, '0 2 * * *');
assert.strictEqual(parsed[0].command, '/usr/local/bin/backup-db.sh');
assert.ok(parsed[0].comment?.includes('Database backup daily'));
assert.strictEqual(parsed[0].enabled, true);

// Job 2
assert.strictEqual(parsed[1].schedule, '* * * * *');
assert.strictEqual(parsed[1].command, 'cd /var/www/my-app && php artisan schedule:run >> /dev/null 2>&1');
assert.strictEqual(parsed[1].enabled, true);

// Job 3 (disabled)
assert.strictEqual(parsed[2].schedule, '0 0 * * 0');
assert.strictEqual(parsed[2].command, '/usr/bin/certbot renew');
assert.strictEqual(parsed[2].enabled, false);

// Job 4 (disabled)
assert.strictEqual(parsed[3].schedule, '*/15 * * * *');
assert.strictEqual(parsed[3].command, '/usr/local/bin/check-health.sh');
assert.strictEqual(parsed[3].enabled, false);

// Serialization test
const serialized = serializeCrontab(parsed);
assert.ok(serialized.includes('0 2 * * * /usr/local/bin/backup-db.sh'));
assert.ok(serialized.includes('# 0 0 * * 0 /usr/bin/certbot renew'));

// Re-parsing serialized output
const reparsed = parseCrontab(serialized);
assert.strictEqual(reparsed.length, 4);
assert.strictEqual(reparsed[0].enabled, true);
assert.strictEqual(reparsed[2].enabled, false);

console.log('cron tests ok');
