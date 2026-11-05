// Run: npx tsx src/modules/ai-gateway/subscription.test.ts
// No network: upstream calls go to a stubbed global fetch.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-aigw-'));

const { pkce, parsePastedCallback, jwtPayload, needsRefresh, startLogin, completeLogin } = await import('./oauth.js');
const { resolveModel, subscriptionChat, subscriptionModels } = await import('./subscription.js');
const { saveAccount, getCredential, listAccounts, removeAccount } = await import('./accounts.js');
const { toClaude, toCodex, toGemini, CLAUDE_CODE_SYSTEM, textOf } = await import('./formats.js');
const { isPrivateIp, normalizeIp } = await import('./internalOnly.js');

// ---- PKCE: challenge = base64url(sha256(verifier))
const { verifier, challenge } = pkce();
assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));

// ---- pasted callback parsing
assert.deepEqual(parsePastedCallback('http://localhost:1455/auth/callback?code=abc&state=s1'), { code: 'abc', state: 's1' });
assert.deepEqual(parsePastedCallback('?code=xyz&state=s2'), { code: 'xyz', state: 's2' });
assert.deepEqual(parsePastedCallback('raw-code#s3'), { code: 'raw-code', state: 's3' });
assert.deepEqual(parsePastedCallback('  bare-code '), { code: 'bare-code', state: '' });
assert.throws(() => parsePastedCallback(''), /Tempel/);
assert.throws(() => parsePastedCallback('http://localhost/cb?error=access_denied'), /ditolak/);
assert.throws(() => parsePastedCallback('http://localhost/cb?state=x'), /code/);

// ---- model routing
assert.deepEqual(resolveModel('cc/claude-sonnet-5'), { provider: 'claude', model: 'claude-sonnet-5' });
assert.deepEqual(resolveModel('gh/gpt-5.5'), { provider: 'copilot', model: 'gpt-5.5' });
assert.deepEqual(resolveModel('codex/gpt-6-sol'), { provider: 'codex', model: 'gpt-6-sol' });
assert.equal(resolveModel('gpt-4o'), null); // plain names keep using the API-key providers
assert.equal(resolveModel('anthropic/claude-3.7-sonnet'), null); // OpenRouter-style names untouched
assert.equal(resolveModel('cc/'), null);

// ---- internal-only IP checks
for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '10.1.2.3', '172.17.0.2', '192.168.1.5', 'fd00::1']) assert.ok(isPrivateIp(ip), ip);
for (const ip of ['8.8.8.8', '172.32.0.1', '103.181.183.164', '2001:db8::1']) assert.ok(!isPrivateIp(ip), ip);
assert.equal(normalizeIp('::ffff:10.0.0.1'), '10.0.0.1');
// In a container the Docker bridge is not trusted unless asked for.
assert.ok(!isPrivateIp('172.17.0.1', false) && isPrivateIp('172.17.0.1', true) && isPrivateIp('10.0.0.5', false));

// ---- refresh timing
assert.ok(needsRefresh('claude', { accessToken: 'a', expiresAt: Date.now() + 60_000 }));
assert.ok(!needsRefresh('claude', { accessToken: 'a', expiresAt: Date.now() + 3_600_000 }));
assert.ok(!needsRefresh('claude', { accessToken: 'a' })); // no expiry info: use as-is, 401 triggers refresh
assert.ok(needsRefresh('claude', { accessToken: 'a', expiresAt: 0 })); // markExpired() after a 401 must force a refresh
assert.ok(needsRefresh('copilot', { accessToken: 'gh', apiToken: 'x', apiTokenExpiresAt: Date.now() + 1000 }));

// ---- format translation
const chat = { model: 'x', messages: [
  { role: 'system' as const, content: 'Be brief.' },
  { role: 'user' as const, content: [{ type: 'text', text: 'Hi' }] },
  { role: 'user' as const, content: 'there' },
  { role: 'assistant' as const, content: 'Hello' },
  { role: 'user' as const, content: 'Bye' }
] };
const c = toClaude(chat, 'claude-sonnet-5');
assert.equal(c.system[0].text, CLAUDE_CODE_SYSTEM); // OAuth tokens require the Claude Code identity first
assert.equal(c.system[1].text, 'Be brief.');
// consecutive user turns merge into one turn with two text blocks; single-text turns stay plain strings
assert.deepEqual(c.messages, [{ role: 'user', content: [{ type: 'text', text: 'Hi' }, { type: 'text', text: 'there' }] }, { role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Bye' }]);
const x = toCodex(chat, 'gpt-6-sol');
assert.equal(x.instructions, 'Be brief.');
assert.equal(x.store, false);
assert.equal(x.input.length, 4);
assert.equal(x.input[2].content[0].type, 'output_text');
const g = toGemini(chat, 'gemini-2.5-pro', 'proj-1');
assert.equal(g.project, 'proj-1');
assert.equal(g.request.contents[1].role, 'model');
assert.equal(g.request.systemInstruction?.parts[0].text, 'Be brief.');
assert.equal(textOf(null), '');

// ---- accounts: encrypted at rest, never plaintext on disk
saveAccount('claude', { accessToken: 'sk-ant-oat-SECRET', refreshToken: 'REFRESH-SECRET', expiresAt: Date.now() + 3_600_000, email: 'a@b.c' });
// Read the database file's bytes: the token must not appear anywhere in it (WAL included).
const dir = process.env.VPSHUB_DATA_DIR!;
const raw = fs.readdirSync(dir).filter((f) => f.startsWith('7server.db')).map((f) => fs.readFileSync(path.join(dir, f)).toString('latin1')).join('');
assert.ok(!raw.includes('SECRET'), 'tokens must be encrypted at rest');
assert.equal(listAccounts()[0].email, 'a@b.c');
assert.equal((listAccounts()[0] as any).secret, undefined);
assert.equal((await getCredential('claude')).accessToken, 'sk-ant-oat-SECRET');

// ---- stubbed upstream: login exchange + chat streaming translation
const realFetch = globalThis.fetch;
const calls: { url: string; init: any }[] = [];
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
globalThis.fetch = (async (url: any, init: any) => {
  calls.push({ url: String(url), init });
  const u = String(url);
  if (u.startsWith('https://auth.openai.com/oauth/token')) {
    const idt = ['x', Buffer.from(JSON.stringify({ email: 'me@x.io', 'https://api.openai.com/auth': { chatgpt_account_id: 'acc_1' } })).toString('base64url'), 'y'].join('.');
    return new Response(JSON.stringify({ access_token: 'codex-at', refresh_token: 'codex-rt', id_token: idt, expires_in: 3600 }));
  }
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    return sse([
      { type: 'message_start', message: { usage: { input_tokens: 11 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } }
    ]);
  }
  if (u.startsWith('https://chatgpt.com/backend-api/codex/responses')) {
    return sse([{ type: 'response.output_text.delta', delta: 'Yo' }, { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 1 } } }]);
  }
  return new Response('not stubbed: ' + u, { status: 599 });
}) as any;

// Codex login: start → paste callback → exchange (state must round-trip)
const start: any = await startLogin('codex');
assert.equal(start.kind, 'redirect');
const authUrl = new URL(start.authUrl);
assert.equal(authUrl.searchParams.get('redirect_uri'), 'http://localhost:1455/auth/callback');
assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
await assert.rejects(completeLogin(start.sessionId, 'http://localhost:1455/auth/callback?code=c1&state=WRONG'), /State/);
const s2: any = await startLogin('codex');
const done = await completeLogin(s2.sessionId, `http://localhost:1455/auth/callback?code=c1&state=${s2.sessionId}`);
assert.equal(done.cred.accessToken, 'codex-at');
assert.equal(done.cred.accountId, 'acc_1');
assert.equal(done.cred.email, 'me@x.io');
const tokenCall = calls.find((c) => c.url.startsWith('https://auth.openai.com/oauth/token'))!;
assert.match(String(tokenCall.init.body), /code_verifier=/);
await assert.rejects(completeLogin(s2.sessionId, 'code'), /kedaluwarsa/); // one-shot session
saveAccount('codex', done.cred);

// Fake express req/res capturing what the gateway writes.
function fakeRes() {
  const r: any = { statusCode: 0, headers: {}, chunks: [] as string[], headersSent: false, body: undefined as any };
  r.status = (s: number) => { r.statusCode = s; return r; };
  r.set = (h: Record<string, string>) => { Object.assign(r.headers, h); return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; return r; };
  r.write = (s: string) => { r.headersSent = true; r.chunks.push(s); return true; };
  r.end = (s?: string) => { if (s) r.chunks.push(s); r.headersSent = true; };
  r.json = (b: any) => { r.body = b; r.headersSent = true; };
  r.on = () => r;
  r.send = (b: string) => { r.body = b; };
  r.writableFinished = false;
  return r;
}
const fakeReq: any = { on: () => {} };

// Claude streaming → OpenAI chunks
let res = fakeRes();
let out = await subscriptionChat(fakeReq, res, { model: 'cc/claude-sonnet-5', stream: true, messages: [{ role: 'user', content: 'hi' }] }, { provider: 'claude', model: 'claude-sonnet-5' });
const deltas = res.chunks.filter((c: string) => c.startsWith('data: {')).map((c: string) => JSON.parse(c.slice(6)).choices[0].delta.content).join('');
assert.equal(deltas, 'Hello');
assert.ok(res.chunks.at(-1).includes('[DONE]'));
assert.deepEqual([out.inTok, out.outTok], [11, 2]);
const claudeCall = calls.find((c) => c.url.startsWith('https://api.anthropic.com/v1/messages'))!;
assert.equal(claudeCall.init.headers.Authorization, 'Bearer sk-ant-oat-SECRET');
assert.match(claudeCall.init.headers['anthropic-beta'], /oauth-2025-04-20/);

// Codex non-streaming caller: upstream always streams, gateway collects it into one JSON completion
res = fakeRes();
out = await subscriptionChat(fakeReq, res, { model: 'cx/gpt-6-sol', messages: [{ role: 'user', content: 'hi' }] }, { provider: 'codex', model: 'gpt-6-sol' });
assert.equal(res.body.choices[0].message.content, 'Yo');
assert.equal(res.body.model, 'cx/gpt-6-sol');
assert.equal(res.body.usage.total_tokens, 6);
const codexCall = calls.find((c) => c.url.startsWith('https://chatgpt.com/'))!;
assert.equal(codexCall.init.headers['ChatGPT-Account-ID'], 'acc_1');

// Not-logged-in provider is a clean 503, not a crash
await assert.rejects(subscriptionChat(fakeReq, fakeRes(), { model: 'gc/gemini-2.5-pro', messages: [{ role: 'user', content: 'x' }] }, { provider: 'gemini-cli', model: 'gemini-2.5-pro' }), /belum login/);

// /v1/models lists only connected accounts, alias-prefixed
const ids = (await subscriptionModels()).map((m) => m.id);
assert.ok(ids.includes('cc/claude-sonnet-5') && ids.includes('cx/gpt-6-sol'));
assert.ok(!ids.some((i) => i.startsWith('gc/') || i.startsWith('gh/')));

// ---- /v1/messages passthrough (Claude Code): body forwarded untouched except identity + betas
const { claudeMessages, withClaudeCodeSystem, mergeBetas } = await import('./subscription.js');
assert.deepEqual(withClaudeCodeSystem({ system: 'Be brief' }).system.map((b: any) => b.text), [CLAUDE_CODE_SYSTEM, 'Be brief']);
const already = { system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM }, { type: 'text', text: 'x' }] };
assert.equal(withClaudeCodeSystem(already), already); // Claude Code already sends it: no duplicate
assert.equal(mergeBetas('fine-grained-tool-streaming-2025-05-14,oauth-2025-04-20'), 'fine-grained-tool-streaming-2025-05-14,oauth-2025-04-20,claude-code-20250219');

const msgSse = [
  { type: 'message_start', message: { usage: { input_tokens: 42 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'Bash', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' } },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } }
].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
let msgCalls = 0;
const msgBodies: any[] = [];
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com/v1/messages/count_tokens')) return new Response('{"input_tokens":12}', { headers: { 'content-type': 'application/json' } });
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    msgCalls++;
    msgBodies.push({ headers: init.headers, body: JSON.parse(init.body) });
    if (msgCalls === 1) return new Response('{"type":"error","error":{"type":"authentication_error"}}', { status: 401, headers: { 'content-type': 'application/json' } });
    return new Response(msgSse, { headers: { 'content-type': 'text/event-stream' } });
  }
  if (u.startsWith('https://api.anthropic.com/v1/oauth/token')) return new Response(JSON.stringify({ access_token: 'fresh-at', refresh_token: 'fresh-rt', expires_in: 3600 }));
  return new Response('nope', { status: 599 });
}) as any;
const ccBody = { model: 'claude-sonnet-5', stream: true, max_tokens: 1000, system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM }], tools: [{ name: 'Bash', input_schema: { type: 'object' } }], messages: [{ role: 'user', content: 'ls' }] };
const ccReq: any = { on: () => {}, headers: { 'anthropic-version': '2023-06-01', 'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14' } };
res = fakeRes();
const outMsg = await claudeMessages(ccReq, res, ccBody);
assert.equal(msgCalls, 2, '401 -> refresh -> retry once');
assert.equal(msgBodies[1].headers.Authorization, 'Bearer fresh-at');
assert.deepEqual(msgBodies[1].body.tools, ccBody.tools, 'tools forwarded untouched');
assert.equal(msgBodies[1].body.system.length, 1, 'identity not duplicated');
assert.match(msgBodies[1].headers['anthropic-beta'], /fine-grained-tool-streaming-2025-05-14.*oauth-2025-04-20/);
assert.equal(res.chunks.map((c: any) => Buffer.from(c).toString()).join(''), msgSse, 'SSE bytes passed through unchanged');
assert.deepEqual([outMsg.inTok, outMsg.outTok], [42, 7]);
res = fakeRes();
res.send = (b: string) => { res.body = b; };
await claudeMessages(ccReq, res, { model: 'claude-sonnet-5', messages: [] }, '/v1/messages/count_tokens');
assert.equal(res.body, '{"input_tokens":12}');

removeAccount('claude');
assert.ok(!listAccounts().some((a) => a.provider === 'claude'));
assert.equal(jwtPayload('garbage').email, undefined);

globalThis.fetch = realFetch;
fs.rmSync(process.env.VPSHUB_DATA_DIR!, { recursive: true, force: true });
console.log('ai-gateway subscription tests ok');
