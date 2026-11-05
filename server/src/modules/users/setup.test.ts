// Run: npx tsx src/modules/users/setup.test.ts
// First-run setup: no default password, loopback may create the admin, others need the code, only
// one admin can ever be created this way, and DASHBOARD_PASSWORD still seeds it non-interactively.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-setup-'));
process.env.VPSHUB_DATA_DIR = dir;
delete process.env.DASHBOARD_PASSWORD;

const { initUsersStore, getUsers } = await import('./store.js');
const setup = await import('./setup.js');
const { verifyPassword } = await import('./passwords.js');

await initUsersStore(undefined);
assert.equal(getUsers().length, 0, 'no default admin is created');
assert.ok(!fs.existsSync(path.join(dir, 'dashboard.password')), 'no password file is written');
assert.ok(setup.needsSetup());

const code = setup.openSetup()!;
assert.match(code, /^\d{6}$/);
assert.equal(setup.openSetup(), code, 'same code until used');
assert.equal(setup.setupNeedsCode('127.0.0.1'), false);
assert.equal(setup.setupNeedsCode('::ffff:127.0.0.1'), false);
assert.equal(setup.setupNeedsCode('10.0.0.5'), true, 'private network is not "this machine"');
assert.equal(setup.setupNeedsCode('172.17.0.1'), true, 'docker bridge must use the code');

const fail = async (p: Promise<unknown>, status: number, re: RegExp) => {
  await assert.rejects(p, (e: any) => { assert.equal(e.status, status); assert.match(e.message, re); return true; });
};
await fail(setup.completeSetup({ username: 'boss', password: 'longenough' }, '203.0.113.9'), 403, /setup code/);
await fail(setup.completeSetup({ username: 'boss', password: 'longenough', code: '000000' === code ? '111111' : '000000' }, '203.0.113.9'), 403, /setup code/);
await fail(setup.completeSetup({ username: 'x', password: 'longenough' }, '127.0.0.1'), 400, /Username/);
await fail(setup.completeSetup({ username: 'boss', password: 'short' }, '127.0.0.1'), 400, /8 characters/);
assert.equal(getUsers().length, 0, 'failed attempts create nothing');

// Remote caller with the right code creates the admin.
const u = await setup.completeSetup({ username: 'Boss', password: 'longenough', code }, '203.0.113.9');
assert.equal(u.username, 'boss');
assert.equal(u.role, 'admin');
assert.equal(getUsers().length, 1);
assert.ok(await verifyPassword('longenough', getUsers()[0].passwordHash));

// Setup is closed for good: no second admin, code is gone, even from loopback.
assert.equal(setup.needsSetup(), false);
assert.equal(setup.__setupCode(), null);
assert.equal(setup.openSetup(), null);
await fail(setup.completeSetup({ username: 'other', password: 'longenough' }, '127.0.0.1'), 409, /already done/);
assert.equal(getUsers().length, 1);

fs.rmSync(dir, { recursive: true, force: true });
console.log('setup tests ok');
