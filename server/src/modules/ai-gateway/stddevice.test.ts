// Run: npx tsx src/modules/ai-gateway/stddevice.test.ts
// Muse Code and Nous: standard device login, then a minted key used for chat. No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-std-'));
const { startLogin, pollDeviceLogin, needsRefresh, MUSE, NOUS } = await import('./oauth.js');
const { subscriptionChat } = await import('./subscription.js');
const { saveAccount } = await import('./accounts.js');

const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
const replies = new Map<string, any[]>();
const j = (b: any, status = 200) => new Response(JSON.stringify(b), { status });
globalThis.fetch = (async (url: any, init: any = {}) => {
  const u = String(url);
  calls.push({ url: u, headers: init.headers || {}, body: String(init.body || '') });
  const q = replies.get(u);
  return q && q.length ? q.shift() : new Response('not stubbed', { status: 599 });
}) as any;
const fakeRes = () => {
  const res: any = { statusCode: 200, headersSent: false, body: undefined };
  res.status = (s: number) => { res.statusCode = s; return res; };
  res.setHeader = () => res; res.on = () => res; res.write = () => true; res.end = () => {};
  res.json = (b: any) => { res.body = b; res.headersSent = true; };
  return res;
};

// ---- Muse: Meta device login → mint Model API key; chat uses the key, not the Meta token.
replies.set(MUSE.deviceCodeUrl, [j({ device_code: 'mdc', user_code: 'META-1', verification_uri: 'https://auth.meta.com/device', interval: 5, expires_in: 600 })]);
replies.set(MUSE.tokenUrl, [j({ error: 'authorization_pending' }, 400), j({ access_token: 'meta-at' })]);
replies.set(MUSE.keyUrl, [j({ api_key: 'LLM|muse-key', user_email: ' Me@Meta.com ', is_subs_active: true })]);
let s: any = await startLogin('muse');
assert.equal(s.userCode, 'META-1');
assert.equal(calls[0].headers['x-api-version'], '1.0.0');
assert.deepEqual(await pollDeviceLogin(s.sessionId), { status: 'pending' });
let d: any = await pollDeviceLogin(s.sessionId);
assert.deepEqual([d.cred.accessToken, d.cred.email, d.cred.refreshToken], ['LLM|muse-key', 'me@meta.com', 'meta-at']);
assert.equal(needsRefresh('muse', d.cred), false, 'the minted key has no expiry');

saveAccount('muse', d.cred);
replies.set(MUSE.chatUrl, [j({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })]);
let res = fakeRes();
await subscriptionChat({} as any, res, { model: 'mu/muse-spark-1.3', messages: [{ role: 'user', content: 'hi' }] } as any, { provider: 'muse', model: 'muse-spark-1.3' });
assert.equal(calls.at(-1)!.headers.Authorization, 'Bearer LLM|muse-key');
assert.equal(res.body.model, 'mu/muse-spark-1.3');

// An inactive subscription fails the login with a clear message.
replies.set(MUSE.deviceCodeUrl, [j({ device_code: 'mdc2', user_code: 'META-2', verification_uri: 'https://auth.meta.com/device' })]);
replies.set(MUSE.tokenUrl, [j({ access_token: 'meta-at-2' })]);
replies.set(MUSE.keyUrl, [j({ is_subs_active: false, action_url: 'https://muse.ai/subscribe' })]);
s = await startLogin('muse');
await assert.rejects(pollDeviceLogin(s.sessionId), /langganan tidak aktif.*muse\.ai/);

// ---- Nous: device login (with scope) → agent key; chat uses the agent key and carries attribution tags.
replies.set(NOUS.deviceCodeUrl, [j({ device_code: 'ndc', user_code: 'NOUS-1', verification_uri: 'https://portal.nousresearch.com/device', interval: 5 })]);
replies.set(NOUS.tokenUrl, [j({ access_token: 'nous-at', refresh_token: 'nous-rt', expires_in: 3600 })]);
replies.set(NOUS.agentKeyUrl, [j({ api_key: 'nous-agent', expires_at: new Date(Date.now() + 7200_000).toISOString() })]);
s = await startLogin('nous');
assert.match(calls.at(-1)!.body, /scope=inference%3Ainvoke/);
d = await pollDeviceLogin(s.sessionId);
assert.deepEqual([d.cred.accessToken, d.cred.apiToken], ['nous-at', 'nous-agent']);
assert.equal(needsRefresh('nous', d.cred), false);
assert.equal(needsRefresh('nous', { ...d.cred, apiTokenExpiresAt: Date.now() + 1000 }), true, 'an expiring agent key triggers a refresh');

saveAccount('nous', d.cred);
replies.set(NOUS.chatUrl, [j({ choices: [{ message: { content: 'hi' } }] })]);
res = fakeRes();
await subscriptionChat({} as any, res, { model: 'ns/meituan/longcat-2.0:free', messages: [{ role: 'user', content: 'hi' }] } as any, { provider: 'nous', model: 'meituan/longcat-2.0:free' });
const nc = calls.at(-1)!;
assert.equal(nc.headers.Authorization, 'Bearer nous-agent');
const nb = JSON.parse(nc.body);
assert.equal(nb.model, 'meituan/longcat-2.0:free');
assert.ok(nb.tags.includes('product=7server') && nb.tags.includes('client=7server'));
console.log('std device ok');
