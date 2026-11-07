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
assert.doesNotMatch(text, /❌/, 'a handed-over failure is not shown as an error');
assert.equal(text.match(/\[DONE\]/g)?.length, 1, 'exactly one end of stream');

// Picked model: used as-is, and its own error is shown (no silent switch to another account).
hits.length = 0;
text = await ask('cx/gpt-6.1-sol');
assert.deepEqual(hits, ['codex']);
assert.match(text, /❌ codex/);

// Picking the Kimi model goes straight to Kimi.
hits.length = 0;
text = await ask('km/kimi-for-coding');
assert.deepEqual(hits, ['kimi']);
assert.match(text, /hello from kimi/);
console.log('copilot auto ok');
