// Run: npx tsx src/modules/ai-gateway/copilotAuto.test.ts
// Dashboard copilot: a picked model is honoured; "Auto" falls through accounts that reject their default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-copauto-'));
const { saveAccount } = await import('./accounts.js');
const { handleCopilotChat } = await import('./copilot.js');
const { KIMI } = await import('./oauth.js');

// Codex and Kimi logged in. Codex rejects its model (like a ChatGPT plan without that id), Kimi answers.
saveAccount('codex', { accessToken: 'cx', expiresAt: Date.now() + 3_600_000, accountId: 'a' });
saveAccount('kimi', { accessToken: 'km', expiresAt: Date.now() + 3_600_000, deviceId: 'd' });
const hits: string[] = [];
globalThis.fetch = (async (url: any) => {
  const u = String(url);
  if (u.includes('chatgpt.com/backend-api/codex')) { hits.push('codex'); return new Response('{"detail":"model is not supported when using Codex with a ChatGPT account"}', { status: 400 }); }
  if (u === KIMI.chatUrl) {
    hits.push('kimi');
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: 'hello from kimi' } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  }
  return new Response('not stubbed', { status: 599 });
}) as any;

async function ask(model?: string) {
  const out: string[] = [];
  const res: any = { writableFinished: false, headersSent: false, writeHead: () => res, setHeader: () => res, status: () => res, on: () => res, json: () => {} };
  res.write = (s: string) => { out.push(s); return true; };
  res.end = () => { res.writableFinished = true; };
  await handleCopilotChat({ body: { messages: [{ role: 'user', content: 'hi' }], model }, on: () => {} } as any, res);
  return out.join('');
}

// Auto: codex fails before answering → kimi answers; the chat ends once, with kimi's text.
let text = await ask(undefined);
assert.deepEqual(hits, ['codex', 'kimi']);
assert.match(text, /hello from kimi/);
assert.doesNotMatch(text, /"error"/, 'a handed-over failure is not shown as an error');
assert.equal(text.match(/\[DONE\]/g)?.length, 1, 'exactly one end of stream');

// Picked model: used as-is, and its own error is shown (no silent switch to another account).
hits.length = 0;
text = await ask('cx/gpt-6.1-sol');
assert.deepEqual(hits, ['codex']);
const ev = JSON.parse(text.split('\n\n').find((l) => l.includes('"error"'))!.slice(6));
assert.equal(ev.error.items[0].provider, 'codex');
assert.doesNotMatch(text, /"delta":"[^"]*❌/, 'errors are a separate event, not chat text the model would see again');

// Picking the Kimi model goes straight to Kimi.
hits.length = 0;
text = await ask('km/kimi-for-coding');
assert.deepEqual(hits, ['kimi']);
assert.match(text, /hello from kimi/);
// Every account fails → one short summary with an actionable reason per account, not a stack of raw errors.
globalThis.fetch = (async (url: any) => {
  const u = String(url);
  if (u.includes('chatgpt.com/backend-api/codex')) return new Response('{"detail":"The model is not supported when using Codex with a ChatGPT account."}', { status: 400 });
  if (u === KIMI.chatUrl) return new Response('{"error":{"message":"Your current subscription does not have access to Kimi Code right now.","type":"permission_denied_error"}}', { status: 403 });
  return new Response('not stubbed', { status: 599 });
}) as any;
text = await ask(undefined);
const all = text.split('\n\n').filter((l) => l.includes('"error"')).map((l) => JSON.parse(l.slice(6)).error);
assert.equal(all.length, 1, 'one error event, not one per account');
assert.equal(all[0].title, 'No connected account could answer');
assert.deepEqual(all[0].items.map((i: any) => [i.provider, i.reason]), [['codex', 'model not in your plan'], ['kimi', 'no active subscription']]);
assert.ok(all[0].items[0].detail, 'raw provider message kept for the details toggle');

// Reasons and catalog filters.
const { accountProblem } = await import('./copilot.js');
const { copilotChatModels, kiloFreeModels } = await import('./subscription.js');
assert.equal(accountProblem('kilocode 402: {"error":{"title":"Paid Model - Credits Required"}}'), 'no credits');
assert.equal(accountProblem('copilot 400: The requested model is not available for integrator'), 'model not in your plan');
assert.deepEqual(copilotChatModels([
  { id: 'gpt-5-mini', capabilities: { type: 'chat' }, policy: { state: 'enabled' } },
  { id: 'claude-opus', capabilities: { type: 'chat' }, policy: { state: 'disabled' } },
  { id: 'text-embedding', capabilities: { type: 'embeddings' } },
  { id: 'gpt-4.1', capabilities: { type: 'chat' } }
]), ['gpt-5-mini', 'gpt-4.1'], 'disabled-by-policy and embedding models are hidden');
assert.deepEqual(kiloFreeModels([
  { id: 'cohere/north:free', pricing: { prompt: '0', completion: '0' } },
  { id: 'anthropic/claude-sonnet-4', pricing: { prompt: '0.000003', completion: '0.000015' } }
]), ['cohere/north:free']);
console.log('copilot auto ok');
