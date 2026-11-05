// Run: npx tsx src/infra/db.test.ts
// One-time import of the old JSON files into 7server.db: data is equal, originals are kept as
// .migrated, a second start doesn't import twice, and a broken file is left alone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-db-'));
process.env.VPSHUB_DATA_DIR = dir;
const w = (f: string, v: unknown) => fs.writeFileSync(path.join(dir, f), typeof v === 'string' ? v : JSON.stringify(v));

const servers = [{ id: 's1', name: 'VPS 1', host: '10.0.0.1', encryptedPassword: 'iv:tag:data' }, { id: 's2', name: 'VPS 2', host: '10.0.0.2' }];
w('servers.json', servers);
w('users.json', [{ id: 'u1', username: 'admin', role: 'admin' }]);
w('sessions.json', [{ id: 'x1', tokenHash: 'h', userId: 'u1', expiresAt: Date.now() + 60_000 }]);
w('ai-gateway-accounts.json', { claude: { provider: 'claude', secret: 'enc', connectedAt: 'now' } });
w('ai-gateway-config.json', { providers: {}, defaultProvider: 'anthropic', defaultModel: 'm', combos: { coding: ['cc/a', 'cx/b'] } });
w('ai-gateway-usage.json', [{ id: 'b', timestamp: '2026-11-05T02:00:00Z', inputTokens: 2 }, { id: 'a', timestamp: '2026-11-05T01:00:00Z', inputTokens: 1 }]);
w('monitor.json', { enabled: true, thresholds: { cpu: 80 } });
w('history.json', { s1: [{ t: 1, cpu: 3 }] });
w('audit.log', '{"t":"2026-11-05T01:00:00Z","method":"POST","path":"/a","user":"admin"}\n{"t":"2026-11-05T02:00:00Z","method":"DELETE","path":"/b"}\n');
w('databases.json', '{ broken json');

const db = await import('./db.js');
assert.deepEqual(db.listDocs('servers'), servers, 'servers imported in order');
assert.equal(db.getDoc<any>('servers', 's1')!.encryptedPassword, 'iv:tag:data', 'ciphertext copied as-is');
assert.equal(db.listDocs<any>('users')[0].username, 'admin');
assert.equal(db.getDoc<any>('ai_accounts', 'claude')!.secret, 'enc');
assert.deepEqual(db.getKv<any>('ai_gateway_config', null).combos, { coding: ['cc/a', 'cx/b'] });
assert.deepEqual(db.readUsageRows(10).map((r) => r.id), ['b', 'a'], 'usage keeps newest-first');
assert.deepEqual(db.getKv<any>('monitor_settings', null).thresholds, { cpu: 80 });
assert.deepEqual(db.readAuditRows(10).map((r) => r.path), ['/b', '/a'], 'audit newest first');
assert.deepEqual(db.readAuditRows(10, 'admin').map((r) => r.path), ['/a'], 'audit filtered by user in SQL');

for (const f of ['servers.json', 'users.json', 'audit.log', 'ai-gateway-usage.json']) {
  assert.ok(!fs.existsSync(path.join(dir, f)) && fs.existsSync(path.join(dir, `${f}.migrated`)), `${f} kept as .migrated`);
}
assert.ok(fs.existsSync(path.join(dir, 'databases.json')), 'invalid JSON is left in place, not imported');
assert.equal(db.listDocs('db_connections').length, 0);
assert.equal(fs.statSync(path.join(dir, '7server.db')).mode & 0o777, 0o600, 'db file is private');

// Second start: a stray JSON file with the same name is not imported again (meta marks it done).
db.__closeDb();
w('servers.json', [{ id: 'zzz' }]);
assert.deepEqual(db.listDocs<any>('servers').map((s) => s.id), ['s1', 's2'], 'no double import');

// Document helpers keep order and replace in place.
db.putDoc('servers', 's1', { id: 's1', name: 'renamed' });
db.putDoc('servers', 's3', { id: 's3' });
assert.deepEqual(db.listDocs<any>('servers').map((s) => s.id), ['s1', 's2', 's3']);
assert.equal(db.getDoc<any>('servers', 's1')!.name, 'renamed');
assert.ok(db.deleteDoc('servers', 's2') && !db.deleteDoc('servers', 's2'));

fs.rmSync(dir, { recursive: true, force: true });
console.log('db migration tests ok');
