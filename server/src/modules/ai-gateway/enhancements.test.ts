// Comprehensive tests for AI Gateway enhancements: pricing, key policies (RPM, budget, tokens, expiry),
// round-robin rotation, universal combos & API-key <alias>/auto, /v1/models filtering, stream_options,
// res.on('close') abort, /v1/responses, and /v1/embeddings.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-ai-enh-'));

const { estimateCostUsd } = await import('./pricing.js');
const {
  createVirtualKey,
  updateVirtualKey,
  saveGatewayConfig,
  getUsageLogs,
  recordKeyUsage,
  toggleProviderKeyAccount,
  addProviderCustomModel,
  removeProviderCustomModel
} = await import('./store.js');
const { saveAccount, toggleAccount, isConnected } = await import('./accounts.js');
const { isReadOnlyCloudflareAction } = await import('../cloudflare/service.js');
const {
  handleOpenAiChatCompletions,
  handleOpenAiResponses,
  handleOpenAiEmbeddings,
  handleListModels,
  isValidComboTarget,
  __resetKeyRateLimits
} = await import('./service.js');

function mockRes() {
  const ee = new EventEmitter() as any;
  ee.statusCode = 200;
  ee.headers = {} as Record<string, string>;
  ee.headersSent = false;
  ee.writableFinished = false;
  ee.writableEnded = false;
  ee.chunks = [] as Buffer[];
  ee.body = undefined;
  ee.status = (s: number) => { ee.statusCode = s; return ee; };
  ee.setHeader = (k: string, v: string) => { ee.headers[k.toLowerCase()] = v; };
  ee.set = (obj: Record<string, string>) => {
    for (const [k, v] of Object.entries(obj)) ee.headers[k.toLowerCase()] = v;
    return ee;
  };
  ee.writeHead = (s: number, h: Record<string, string> = {}) => {
    ee.statusCode = s;
    ee.headersSent = true;
    ee.set(h);
  };
  ee.write = (c: any) => {
    ee.headersSent = true;
    ee.chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
    return true;
  };
  ee.end = (c?: any) => {
    if (c) ee.write(c);
    ee.headersSent = true;
    ee.writableFinished = true;
    ee.writableEnded = true;
    ee.emit('close');
  };
  ee.send = (b: any) => {
    ee.body = typeof b === 'string' ? (() => { try { return JSON.parse(b); } catch { return b; } })() : b;
    ee.end();
  };
  ee.json = (b: any) => {
    ee.body = b;
    ee.end();
  };
  return ee;
}

function mockReq(secret: string, body: any = {}) {
  return {
    headers: { authorization: `Bearer ${secret}` },
    body,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    on: () => {}
  } as any;
}

// ---- 1. Pricing estimates ----
assert.equal(estimateCostUsd('gpt-4o-2024-11-20', 1_000_000, 500_000), 7.5);
assert.equal(estimateCostUsd('cc/claude-sonnet-4-6', 1_000_000, 1_000_000), 18);
assert.equal(estimateCostUsd('ol/llama3.2', 50_000, 20_000), 0);
assert.equal(estimateCostUsd('text-embedding-3-small', 1_000_000, 0), 0.02);

// ---- 2. Rate Limit (RPM), Expiry, Token Quota & Budget Enforcement ----
saveGatewayConfig({
  providers: {
    openai: {
      enabled: true,
      connected: true,
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-openai-1',
      apiKeys: [
        { id: 'k1', label: 'Key 1', apiKey: 'sk-openai-1', addedAt: '2026-01-01T00:00:00Z' },
        { id: 'k2', label: 'Key 2', apiKey: 'sk-openai-2', addedAt: '2026-01-01T00:00:00Z' }
      ]
    },
    groq: {
      enabled: true,
      connected: true,
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-test-1'
    }
  },
  routingStrategy: 'round_robin',
  combos: {
    hybrid: ['cc/claude-sonnet-5', 'groq/llama-3.3-70b-versatile']
  }
});

assert.equal(isValidComboTarget('groq/llama-3.3-70b-versatile'), true);
assert.equal(isValidComboTarget('cc/claude-sonnet-5'), true);
assert.equal(isValidComboTarget('openai/auto'), true);
assert.equal(isValidComboTarget('invalid-bare-string'), false);

const authSeen: string[] = [];
const bodiesSeen: any[] = [];
let seenAbort = false;

globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (init?.headers?.authorization) authSeen.push(String(init.headers.authorization));
  if (init?.body) bodiesSeen.push(JSON.parse(String(init.body)));

  if (u.endsWith('/responses')) {
    return new Response(JSON.stringify({
      id: 'resp_1',
      output_text: 'response ok',
      usage: { input_tokens: 12, output_tokens: 8 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.endsWith('/embeddings')) {
    return new Response(JSON.stringify({
      object: 'list',
      data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
      usage: { prompt_tokens: 10, total_tokens: 10 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    return new Response('{"error":"rate limited"}', { status: 429, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.groq.com/openai/v1/chat/completions')) {
    return new Response(JSON.stringify({
      id: 'chat_groq',
      choices: [{ message: { role: 'assistant', content: 'groq fallback ok' } }],
      usage: { prompt_tokens: 15, completion_tokens: 5 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.openai.com/v1/chat/completions')) {
    const reqBody = JSON.parse(String(init?.body || '{}'));
    if (reqBody.stream) {
      if (reqBody.stream_options?.include_usage && reqBody.model === 'reject-stream-opt') {
        return new Response('Unknown parameter: stream_options', { status: 400 });
      }
      if (reqBody.model === 'abort-test') {
        return await new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            seenAbort = true;
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          }, { once: true });
        });
      }
      const sse = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } })}\n\n`,
        'data: [DONE]\n\n'
      ].join('');
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    return new Response(JSON.stringify({
      id: 'chat_oai',
      choices: [{ message: { role: 'assistant', content: `ok:${reqBody.model}` } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('unhandled mock url: ' + u, { status: 599 });
}) as any;

// Round-robin test on OpenAI multi-key
const rrKey = createVirtualKey('rr-key', undefined, { rateLimitPerMin: 2 });
let res = mockRes();
await handleOpenAiChatCompletions(mockReq(rrKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: '1' }] }), res);
assert.equal(res.statusCode, 200);
assert.equal(res.body.choices[0].message.content, 'ok:gpt-4o');

res = mockRes();
await handleOpenAiChatCompletions(mockReq(rrKey.key!, { model: 'openai/auto', messages: [{ role: 'user', content: '2' }] }), res);
assert.equal(res.statusCode, 200);
assert.equal(authSeen[0], 'Bearer sk-openai-1');
assert.equal(authSeen[1], 'Bearer sk-openai-2', 'round_robin should advance to 2nd key');

// 3rd request hits RPM=2 limit -> 429 + Retry-After
res = mockRes();
await handleOpenAiChatCompletions(mockReq(rrKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: '3' }] }), res);
assert.equal(res.statusCode, 429);
assert.ok(Number(res.headers['retry-after']) >= 1, 'Retry-After header expected');

// Update policy to remove rateLimit and test maxTokens & expiry
__resetKeyRateLimits();
updateVirtualKey(rrKey.id, { rateLimitPerMin: null, maxTokens: 20 });
// Key already used 15 + 15 = 30 tokens > maxTokens 20 -> rejected 429
res = mockRes();
await handleOpenAiChatCompletions(mockReq(rrKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'over quota' }] }), res);
assert.equal(res.statusCode, 429);
assert.match(res.body.error.message, /token quota/i);

const expiredKey = createVirtualKey('expired-key', undefined, { expiresAt: '2020-01-01T00:00:00.000Z' });
res = mockRes();
await handleOpenAiChatCompletions(mockReq(expiredKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }), res);
assert.equal(res.statusCode, 401);
assert.match(res.body.error.message, /expired/i);

const budgetKey = createVirtualKey('budget-key', undefined, { maxBudgetUsd: 0.5 });
recordKeyUsage(budgetKey.id, 100, 100, 0.51);
res = mockRes();
await handleOpenAiChatCompletions(mockReq(budgetKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }), res);
assert.equal(res.statusCode, 429);
assert.match(res.body.error.message, /budget/i);

// ---- 3. Universal combo mixing OAuth + API-key provider ----
saveAccount('claude', { accessToken: 'cl-at', expiresAt: Date.now() + 3_600_000 });
const hybridKey = createVirtualKey('hybrid-key');
res = mockRes();
await handleOpenAiChatCompletions(mockReq(hybridKey.key!, { model: 'auto/hybrid', messages: [{ role: 'user', content: 'hi' }] }), res);
assert.equal(res.statusCode, 200);
assert.equal(res.body.choices[0].message.content, 'groq fallback ok');

// ---- 4. /v1/models filtered by allowedProviders + <alias>/auto ----
const scopedKey = createVirtualKey('scoped-groq-only', ['groq']);
res = mockRes();
await handleListModels(mockReq(scopedKey.key!), res);
assert.equal(res.statusCode, 200);
const modelIds = (res.body.data as any[]).map((m) => m.id);
assert.ok(modelIds.includes('groq/auto'), 'scoped key sees groq/auto');
assert.ok(modelIds.includes('auto/hybrid'), 'hybrid combo contains groq so it stays visible');
assert.ok(!modelIds.includes('openai/auto'), 'scoped key must NOT see openai/auto');

// ---- 5. stream_options injection + retry fallback ----
bodiesSeen.length = 0;
res = mockRes();
await handleOpenAiChatCompletions(mockReq(hybridKey.key!, { model: 'openai/reject-stream-opt', stream: true, messages: [{ role: 'user', content: 's' }] }), res);
assert.equal(res.statusCode, 200);
assert.equal(bodiesSeen[0].stream_options?.include_usage, true, 'first streaming attempt injects include_usage');
assert.equal(bodiesSeen[1].stream_options, undefined, '400 retry strips stream_options');

// ---- 6. res.on('close') aborts upstream fetch only when unfinished ----
const abortRes = mockRes();
const abortPromise = handleOpenAiChatCompletions(
  mockReq(hybridKey.key!, { model: 'openai/abort-test', stream: true, messages: [{ role: 'user', content: 'wait' }] }),
  abortRes
);
setTimeout(() => {
  abortRes.writableFinished = false;
  abortRes.emit('close');
}, 15);
await abortPromise;
assert.equal(seenAbort, true, 'unfinished res close should abort upstream fetch signal');

// ---- 7. /v1/responses and /v1/embeddings ----
res = mockRes();
await handleOpenAiResponses(mockReq(hybridKey.key!, { model: 'openai/gpt-4o', input: 'hello responses' }), res);
assert.equal(res.statusCode, 200);
assert.equal(res.body.output_text, 'response ok');

res = mockRes();
await handleOpenAiEmbeddings(mockReq(hybridKey.key!, { model: 'openai/text-embedding-3-small', input: 'embed me' }), res);
assert.equal(res.statusCode, 200);
assert.deepEqual(res.body.data[0].embedding, [0.1, 0.2]);

const latestLogs = getUsageLogs(5);
assert.ok(latestLogs.some((l) => l.model === 'openai/text-embedding-3-small' && typeof l.costUsd === 'number'));

// ---- 8. Per-provider custom models + per-account enable/disable + Cloudflare action safety ----
const withCustom = addProviderCustomModel('openai', 'gpt-5-custom-test');
assert.ok(withCustom.providers.openai?.customModels?.includes('gpt-5-custom-test'));

res = mockRes();
await handleListModels(mockReq(hybridKey.key!), res);
assert.ok(res.body.data.some((m: any) => m.id === 'openai/gpt-5-custom-test'), 'custom model listed in /v1/models');

const afterRemove = removeProviderCustomModel('openai', 'gpt-5-custom-test');
assert.ok(!afterRemove.providers.openai?.customModels?.includes('gpt-5-custom-test'));

// Disable k1 -> routing must only use k2 (sk-openai-2)
toggleProviderKeyAccount('openai', 'k1', false);
authSeen.length = 0;
res = mockRes();
await handleOpenAiChatCompletions(mockReq(hybridKey.key!, { model: 'openai/gpt-4o', messages: [{ role: 'user', content: 'hi' }] }), res);
assert.equal(res.statusCode, 200);
assert.deepEqual(authSeen, ['Bearer sk-openai-2']);

// Disable OAuth account -> isConnected becomes false
const savedOAuth = saveAccount('kimi', { accessToken: 'tok-kimi-1', email: 'kimi@test.local' });
assert.equal(isConnected('kimi'), true);
toggleAccount('kimi', savedOAuth.id, false);
assert.equal(isConnected('kimi'), false);
toggleAccount('kimi', savedOAuth.id, true);
assert.equal(isConnected('kimi'), true);

// Cloudflare read-only vs mutating check
assert.equal(isReadOnlyCloudflareAction('{"action":"list_dns","zoneName":"example.com"}'), true);
assert.equal(isReadOnlyCloudflareAction('{"action":"api_get","path":"/zones"}'), true);
assert.equal(isReadOnlyCloudflareAction('{"action":"upsert_dns","type":"CNAME","name":"a.example.com","content":"x"}'), false);
assert.equal(isReadOnlyCloudflareAction('{"action":"api_write","method":"DELETE","path":"/zones/1"}'), false);

console.log('AI Gateway enhancements tests passed!');

