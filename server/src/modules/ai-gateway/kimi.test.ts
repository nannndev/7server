// Run: npx tsx src/modules/ai-gateway/kimi.test.ts
// Kimi Code device login, refresh and chat routing. No network: fetch is stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-kimi-'));
const { startLogin, pollDeviceLogin, refreshCredential, KIMI } = await import('./oauth.js');
const { resolveModel, subscriptionChat } = await import('./subscription.js');
const { saveAccount } = await import('./accounts.js');

const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
let pollAnswers: any[] = [];
globalThis.fetch = (async (url: any, init: any = {}) => {
  const u = String(url);
  calls.push({ url: u, headers: init.headers || {}, body: String(init.body || '') });
  if (u === KIMI.deviceCodeUrl) return new Response(JSON.stringify({ device_code: 'dc-1', user_code: 'ABCD-1234', verification_uri: 'https://www.kimi.com/code/authorize_device', expires_in: 600, interval: 5 }), { status: 200 });
  if (u === KIMI.tokenUrl) return new Response(JSON.stringify(pollAnswers.shift()), { status: 200 });
  if (u === KIMI.chatUrl) return new Response(JSON.stringify({ choices: [{ message: { content: 'hi from kimi' } }], usage: { prompt_tokens: 4, completion_tokens: 2 } }), { status: 200 });
  return new Response('not stubbed', { status: 599 });
}) as any;

// ---- device login: user code shown, device id sent, pending is not an error
const start: any = await startLogin('kimi');
assert.equal(start.kind, 'device');
assert.equal(start.userCode, 'ABCD-1234');
const deviceId = calls[0].headers['X-Msh-Device-Id'];
assert.match(deviceId, /^[0-9a-f-]{36}$/, 'a fresh device id per login');
assert.match(calls[0].body, /client_id=17e5f671/);

pollAnswers = [{ error: 'authorization_pending' }, { access_token: 'kimi-at', refresh_token: 'kimi-rt', expires_in: 3600 }];
assert.deepEqual(await pollDeviceLogin(start.sessionId), { status: 'pending' }, 'Kimi returns 200 + error while waiting');
const done: any = await pollDeviceLogin(start.sessionId);
assert.equal(done.status, 'done');
assert.equal(done.cred.accessToken, 'kimi-at');
assert.equal(done.cred.deviceId, deviceId, 'the login device id is kept for later requests');
assert.equal(calls.at(-1)!.headers['X-Msh-Device-Id'], deviceId);

// ---- refresh keeps the device id and rotates tokens
pollAnswers = [{ access_token: 'kimi-at-2', refresh_token: 'kimi-rt-2', expires_in: 3600 }];
const next = await refreshCredential('kimi', done.cred);
assert.equal(next.accessToken, 'kimi-at-2');
assert.equal(next.deviceId, deviceId);
assert.match(calls.at(-1)!.body, /grant_type=refresh_token/);

// ---- chat: km/<model> → Kimi's OpenAI endpoint with bearer + device headers, real model name
assert.deepEqual(resolveModel('km/kimi-for-coding'), { provider: 'kimi', model: 'kimi-for-coding' });
saveAccount('kimi', next);
const res: any = { statusCode: 200, headersSent: false, body: undefined };
res.status = (s: number) => { res.statusCode = s; return res; };
res.setHeader = () => res; res.on = () => res; res.write = () => true; res.end = () => {};
res.json = (b: any) => { res.body = b; res.headersSent = true; };
const out = await subscriptionChat({} as any, res, { model: 'km/kimi-for-coding', messages: [{ role: 'user', content: 'hi' }] } as any, { provider: 'kimi', model: 'kimi-for-coding' });
const chat = calls.at(-1)!;
assert.equal(chat.url, KIMI.chatUrl);
assert.equal(chat.headers.Authorization, 'Bearer kimi-at-2');
assert.equal(chat.headers['X-Msh-Device-Id'], deviceId);
assert.equal(JSON.parse(chat.body).model, 'kimi-for-coding');
assert.equal(res.body.model, 'km/kimi-for-coding', 'response reports the public alias');
assert.deepEqual([out.inTok, out.outTok], [4, 2]);
console.log('kimi ok');
