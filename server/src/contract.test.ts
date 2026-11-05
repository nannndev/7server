// HTTP contract test: boots the app on a random port against a throwaway data dir (no real servers,
// no SSH) and checks that every route is mounted, protected by auth, and answers with the
// { success, data | error } shape and the status the client relies on.
// Run: npx tsx src/contract.test.ts            (writes /tmp/vpshub-contract.json)
//      npx tsx src/contract.test.ts --compare   (fails if anything differs from that snapshot)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SNAP = '/tmp/vpshub-contract.json';
const compare = process.argv.includes('--compare');
const ENTRY = process.env.VPSHUB_ENTRY || 'src/index.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-contract-'));
// A copy of the real key would let encrypted fixtures decrypt; a fresh key is enough here.
fs.writeFileSync(path.join(dataDir, 'servers.json'), '[]');
fs.writeFileSync(path.join(dataDir, 'monitor.json'), JSON.stringify({ enabled: false }));
const port = 5200 + Math.floor(Math.random() * 300);
// node directly (not npx): kill() must reach the server itself, or it outlives the test and holds its pipes.
const child = spawn(process.execPath, ['--import', 'tsx', ENTRY], {
  env: { ...process.env, PORT: String(port), DASHBOARD_PASSWORD: 'contract-pw', VPSHUB_DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const base = `http://127.0.0.1:${port}`;
const call = async (method: string, url: string, body?: unknown, token?: string) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON (download) */ }
  return { status: res.status, json, text };
};

async function main() {
  for (let i = 0; i < 60; i++) {
    try { await fetch(base + '/api/login', { method: 'POST' }); break; } catch { await new Promise((r) => setTimeout(r, 250)); }
    if (i === 59) throw new Error('server did not start:\n' + log);
  }

  const results: Record<string, { status: number; shape: string; error?: string }> = {};
  const shape = (j: any) => (j && typeof j === 'object' ? Object.keys(j).sort().join(',') : typeof j);
  const record = (k: string, r: { status: number; json: any }) => {
    results[k] = { status: r.status, shape: shape(r.json), error: r.json?.error };
  };

  // --- auth
  const bad = await call('POST', '/api/login', { password: 'nope' });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/api/login', { password: 'contract-pw' });
  assert.equal(ok.status, 200);
  const T = ok.json.token as string;
  record('login ok', { status: ok.status, json: { success: ok.json.success, token: 'x' } });
  record('login bad', bad);

  const ID = '00000000-0000-0000-0000-000000000000';
  const CID = '11111111-1111-1111-1111-111111111111';
  const routes: [string, string, unknown?][] = [
    ['GET', '/api/audit'], ['GET', `/api/servers/${ID}/history`], ['GET', '/api/monitor'], ['PUT', '/api/monitor', {}],
    ['PUT', '/api/monitor', { discordWebhook: 'https://evil.example/x' }], ['POST', '/api/monitor/discord-test'],
    ['GET', '/api/uptime'], ['GET', '/api/export'], ['POST', '/api/import', {}], ['POST', '/api/import', []],
    ['GET', '/api/servers'], ['GET', `/api/servers/${ID}`], ['POST', '/api/servers', {}], ['PUT', `/api/servers/${ID}`, {}],
    ['DELETE', `/api/servers/${ID}`], ['POST', '/api/servers/test', { host: '127.0.0.1', port: 1, username: 'x', password: 'x' }],
    ['GET', `/api/servers/${ID}/ping`], ['GET', `/api/servers/${ID}/metrics`], ['GET', `/api/servers/${ID}/processes`],
    ['POST', `/api/servers/${ID}/processes/kill`, {}], ['POST', `/api/servers/${ID}/processes/kill`, { pid: 1 }],
    ['GET', `/api/servers/${ID}/services`], ['POST', `/api/servers/${ID}/services/control`, {}],
    ['POST', `/api/servers/${ID}/services/control`, { serviceName: 'x', action: 'restart' }],
    ['GET', `/api/servers/${ID}/webapps`], ['POST', `/api/servers/${ID}/docker/control`, {}],
    ['GET', `/api/servers/${ID}/pm2`], ['POST', `/api/servers/${ID}/pm2/control`, {}], ['POST', `/api/servers/${ID}/supervisor/control`, {}],
    ['GET', `/api/servers/${ID}/nginx`], ['GET', `/api/servers/${ID}/ports`],
    ['GET', `/api/servers/${ID}/logs`], ['GET', `/api/servers/${ID}/logs?name=nginx`],
    ['GET', `/api/servers/${ID}/files?path=/`], ['GET', `/api/servers/${ID}/files/download?path=/x`],
    ['GET', `/api/servers/${ID}/files/read?path=/x`], ['POST', `/api/servers/${ID}/files/write`, {}],
    ['GET', `/api/servers/${ID}/docker`], ['GET', `/api/servers/${ID}/docker/inspect/abc`],
    ['POST', `/api/servers/${ID}/docker/container`, { containerId: 'x;id', action: 'restart' }],
    ['POST', `/api/servers/${ID}/docker/compose`, {}], ['POST', `/api/servers/${ID}/docker/prune`, { what: 'system' }],
    ['POST', `/api/servers/${ID}/docker/image/rm`, { image: 'a;b' }],
    ['GET', '/api/db/engines'], ['GET', `/api/servers/${ID}/db/discover`], ['GET', `/api/servers/${ID}/db/connections`],
    ['POST', `/api/servers/${ID}/db/connections`, { engine: 'mysql' }], ['PUT', `/api/db/connections/${CID}`, {}],
    ['DELETE', `/api/db/connections/${CID}`], ['GET', `/api/db/connections/${CID}/ping`], ['GET', `/api/db/connections/${CID}/databases`],
    ['GET', `/api/db/connections/${CID}/objects`], ['GET', `/api/db/connections/${CID}/preview`], ['POST', `/api/db/connections/${CID}/browse`, {}],
    ['GET', `/api/db/connections/${CID}/schema`], ['GET', `/api/db/connections/${CID}/structure`], ['POST', `/api/db/connections/${CID}/query`, { query: 'select 1' }],
    ['GET', `/api/db/connections/${CID}/dump`], ['POST', `/api/servers/${ID}/exec`, {}], ['POST', `/api/servers/${ID}/exec`, { command: 'id' }],
    ['POST', '/api/servers/batch-exec', {}], ['POST', '/api/servers/batch-exec', { command: 'id', serverIds: [] }],
    ['POST', '/api/servers/batch-exec', { command: 'id', serverIds: [ID] }],
    ['GET', '/api/does-not-exist']
  ];

  for (const [m, u, b] of routes) {
    // 1) every /api route must reject a missing token
    const anon = await call(m, u, b);
    assert.equal(anon.status, 401, `${m} ${u} must require auth, got ${anon.status}`);
    // 2) record what it does with a valid token
    const r = await call(m, u, b, T);
    const key = `${m} ${u}${b !== undefined ? ' ' + JSON.stringify(b) : ''}`;
    record(key, r);
    if (r.json) assert.equal(typeof r.json.success === 'boolean' || Array.isArray(r.json), true, `${key} response shape`);
  }

  // Data-dir isolation: nothing must have been written next to the real data.
  assert.ok(fs.existsSync(path.join(dataDir, 'secret.key')), 'secret.key must be created in VPSHUB_DATA_DIR');

  if (compare) {
    const prev = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
    const diffs: string[] = [];
    for (const k of new Set([...Object.keys(prev), ...Object.keys(results)])) {
      const a = JSON.stringify(prev[k]), b = JSON.stringify(results[k]);
      if (a !== b) diffs.push(`${k}\n    before: ${a}\n    after:  ${b}`);
    }
    if (diffs.length) { console.error('CONTRACT CHANGED:\n' + diffs.join('\n')); process.exitCode = 1; }
    else console.log(`contract unchanged (${Object.keys(results).length} checks)`);
  } else {
    fs.writeFileSync(SNAP, JSON.stringify(results, null, 2));
    console.log(`contract snapshot written (${Object.keys(results).length} checks)`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => { child.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });
