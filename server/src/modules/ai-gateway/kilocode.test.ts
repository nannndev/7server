// Run: npx tsx src/modules/ai-gateway/kilocode.test.ts
// Kilo Code device login and chat routing. No network: fetch is stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-kilo-'));
const { startLogin, pollDeviceLogin, needsRefresh, KILOCODE } = await import('./oauth.js');
const { resolveModel, subscriptionChat } = await import('./subscription.js');
const { saveAccount } = await import('./accounts.js');

const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
let pollReplies: Response[] = [];
globalThis.fetch = (async (url: any, init: any = {}) => {
  const u = String(url);
  calls.push({ url: u, headers: init.headers || {}, body: String(init.body || '') });
  if (u === KILOCODE.codesUrl) return new Response(JSON.stringify({ code: 'KILO-42', verificationUrl: 'https://app.kilo.ai/device-auth?code=KILO-42', expiresIn: 300 }), { status: 200 });
  if (u === `${KILOCODE.codesUrl}/KILO-42`) return pollReplies.shift()!;
  if (u === `${KILOCODE.apiBaseUrl}/api/profile`) return new Response(JSON.stringify({ organizations: [{ id: 'org-7' }] }), { status: 200 });
  if (u === KILOCODE.chatUrl) return new Response(JSON.stringify({ choices: [{ message: { content: 'hi from kilo' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }), { status: 200 });
  return new Response('not stubbed', { status: 599 });
}) as any;

const start: any = await startLogin('kilocode');
assert.equal(start.kind, 'device');
assert.equal(start.userCode, 'KILO-42');
assert.equal(start.verificationUri, 'https://app.kilo.ai/device-auth?code=KILO-42');

// 202 = waiting; 200 approved = token, then the org is looked up for the org header.
pollReplies = [new Response('', { status: 202 }), new Response(JSON.stringify({ status: 'approved', token: 'kilo-tok', userEmail: 'me@x.dev' }), { status: 200 })];
assert.deepEqual(await pollDeviceLogin(start.sessionId), { status: 'pending' });
const done: any = await pollDeviceLogin(start.sessionId);
assert.equal(done.status, 'done');
assert.deepEqual([done.cred.accessToken, done.cred.email, done.cred.orgId], ['kilo-tok', 'me@x.dev', 'org-7']);
assert.equal(needsRefresh('kilocode', done.cred), false, 'Kilo tokens do not expire, so never refreshed ahead of time');

// A denied login is an error, not an endless wait.
const s2: any = await startLogin('kilocode');
pollReplies = [new Response('', { status: 403 })];
await assert.rejects(pollDeviceLogin(s2.sessionId), /ditolak/);

// kc/<vendor>/<model> → Kilo's OpenAI endpoint, real model name kept with its vendor part.
assert.deepEqual(resolveModel('kc/anthropic/claude-sonnet-4-20250514'), { provider: 'kilocode', model: 'anthropic/claude-sonnet-4-20250514' });
saveAccount('kilocode', done.cred);
const res: any = { statusCode: 200, headersSent: false, body: undefined };
res.status = (s: number) => { res.statusCode = s; return res; };
res.setHeader = () => res; res.on = () => res; res.write = () => true; res.end = () => {};
res.json = (b: any) => { res.body = b; res.headersSent = true; };
await subscriptionChat({} as any, res, { model: 'kc/anthropic/claude-sonnet-4-20250514', messages: [{ role: 'user', content: 'hi' }] } as any, { provider: 'kilocode', model: 'anthropic/claude-sonnet-4-20250514' });
const chat = calls.at(-1)!;
assert.equal(chat.url, KILOCODE.chatUrl);
assert.equal(chat.headers.Authorization, 'Bearer kilo-tok');
assert.equal(chat.headers['X-Kilocode-OrganizationID'], 'org-7');
assert.equal(JSON.parse(chat.body).model, 'anthropic/claude-sonnet-4-20250514');
assert.equal(res.body.model, 'kc/anthropic/claude-sonnet-4-20250514');
console.log('kilocode ok');
