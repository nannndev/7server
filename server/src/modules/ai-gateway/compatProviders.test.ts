import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-compat-'));
const { resolveCompatModel, compatProvider, COMPAT_PROVIDERS } = await import('./compatProviders.js');
const { connectProvider, createVirtualKey } = await import('./store.js');
const { handleOpenAiChatCompletions, handleListModels } = await import('./service.js');

// Prefix routing; the model goes upstream without our prefix.
assert.deepEqual(resolveCompatModel('groq/llama-3.3-70b-versatile')?.model, 'llama-3.3-70b-versatile');
assert.equal(resolveCompatModel('groq/llama-3.3-70b-versatile')?.provider.baseUrl, 'https://api.groq.com/openai/v1');
// OpenRouter model ids have their own vendor/ part: only our first prefix is stripped.
assert.equal(resolveCompatModel('openrouter/anthropic/claude-sonnet-4')?.model, 'anthropic/claude-sonnet-4');
// Not ours: plain names, subscription aliases, combos, empty rest.
for (const m of ['gpt-4o', 'cc/claude-opus-5-5', 'auto/fast', 'groq/', '/x', '', undefined]) assert.equal(resolveCompatModel(m), null, String(m));

// Every provider has a unique id and an https base URL (custom is the one that needs it from the user).
assert.equal(new Set(COMPAT_PROVIDERS.map((p) => p.id)).size, COMPAT_PROVIDERS.length);
for (const p of COMPAT_PROVIDERS) if (p.id !== 'custom') assert.match(p.baseUrl, /^https:\/\//, p.id);
assert.equal(compatProvider('custom')?.baseUrl, '');
// Through the real handler: a groq/ model reaches Groq's URL with Groq's key and the bare model name.
connectProvider('groq', 'gsk_test', '', 1, ['groq/llama-3.3-70b-versatile', 'groq/qwen/qwen3-32b']);
const key = createVirtualKey('compat-test');
const seen: { url: string; auth: string; model: string }[] = [];
globalThis.fetch = (async (url: any, init: any) => {
  seen.push({ url: String(url), auth: init?.headers?.authorization, model: JSON.parse(init.body).model });
  return new Response(JSON.stringify({ choices: [{ message: { content: 'hi from groq' } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }), { status: 200 });
}) as any;
function call(model: string) {
  const res: any = { statusCode: 200, headersSent: false, body: undefined };
  res.status = (s: number) => { res.statusCode = s; return res; };
  res.set = () => res; res.setHeader = () => res; res.on = () => res; res.write = () => true; res.end = () => {};
  res.send = (b: any) => { res.body = b; res.headersSent = true; };
  res.json = (b: any) => { res.body = b; res.headersSent = true; };
  const req: any = { headers: { authorization: `Bearer ${key.key}` }, body: { model, messages: [{ role: 'user', content: 'hi' }] }, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1', on: () => {} };
  return handleOpenAiChatCompletions(req, res).then(() => res);
}
let r = await call('groq/llama-3.3-70b-versatile');
assert.equal(r.statusCode, 200);
assert.deepEqual(seen[0], { url: 'https://api.groq.com/openai/v1/chat/completions', auth: 'Bearer gsk_test', model: 'llama-3.3-70b-versatile' });
// A provider that is not connected is refused, not silently sent to OpenAI.
r = await call('mistral/mistral-small-latest');
assert.equal(r.statusCode, 503);
assert.equal(seen.length, 1, 'no upstream call for an unconnected provider');
// /v1/models lists the connected provider's verified models (prefixed), and nothing from unconnected ones.
{
  const res: any = { json: (b: any) => { res.body = b; } , status: () => res };
  await handleListModels({ headers: { authorization: `Bearer ${key.key}` } } as any, res);
  const ids = res.body.data.map((m: any) => m.id);
  assert.ok(ids.includes('groq/llama-3.3-70b-versatile') && ids.includes('groq/qwen/qwen3-32b'));
  assert.ok(!ids.some((id: string) => id.startsWith('mistral/')));
}
console.log('compat providers ok');
