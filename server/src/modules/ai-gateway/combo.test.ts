// Run: npx tsx src/modules/ai-gateway/combo.test.ts
// Quota parsers, combo fallback across accounts and the 429 cooldown. No network: fetch is stubbed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-combo-'));

const { parseClaude, parseCodex, parseCopilot, isCoolingDown, __resetUsage } = await import('./usage.js');
const { comboName, isRetryable, UpstreamError } = await import('./subscription.js');
const { saveAccount } = await import('./accounts.js');
const { saveGatewayConfig, createVirtualKey } = await import('./store.js');
const { handleOpenAiChatCompletions } = await import('./service.js');

// ---- quota parsers (shapes from the providers' usage endpoints)
const c = parseClaude({ five_hour: { utilization: 87, resets_at: '2026-11-05T15:00:00Z' }, seven_day: { utilization: 40 }, seven_day_opus: { utilization: 100 },
  limits: [{ kind: 'weekly_scoped', percent: 12, scope: { model: { display_name: 'Fable' } } }] });
assert.deepEqual(c.windows.map((w) => [w.name, w.usedPercent]), [['session (5h)', 87], ['weekly', 40], ['weekly opus', 100], ['weekly fable', 12]]);
assert.equal(c.windows[0].resetsAt, '2026-11-05T15:00:00.000Z');
const x = parseCodex({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 30, reset_at: 1793900000 }, secondary_window: { used_percent: 65 } } });
assert.equal(x.plan, 'plus');
assert.deepEqual(x.windows.map((w) => [w.name, w.usedPercent]), [['session', 30], ['weekly', 65]]);
assert.equal(x.windows[0].resetsAt, new Date(1793900000 * 1000).toISOString(), 'epoch seconds become ms');
assert.deepEqual(parseCodex({ rate_limit: { limit_reached: true } }).windows, [{ name: 'limit', usedPercent: 100 }]);
const g = parseCopilot({ copilot_plan: 'individual', quota_reset_date: '2026-12-01', quota_snapshots: {
  premium_interactions: { entitlement: 300, remaining: 75 }, chat: { unlimited: true }, completions: { entitlement: 0, remaining: 0 } } });
assert.deepEqual(g.windows.map((w) => [w.name, w.usedPercent, w.used, w.total]), [['premium requests', 75, 225, 300]], 'unlimited and zero entitlements are skipped');
assert.deepEqual(parseCopilot({ monthly_quotas: { chat: 50 }, limited_user_quotas: { chat: 10 } }).windows.map((w) => w.usedPercent), [20]);
assert.deepEqual(parseClaude({}).windows, [], 'missing windows are not invented');

// ---- names and retry rules
assert.equal(comboName('auto/coding'), 'coding');
assert.equal(comboName('auto/'), null);
assert.equal(comboName('cc/claude-sonnet-5'), null);
assert.ok(isRetryable(new UpstreamError(429, 'x')) && isRetryable(new UpstreamError(503, 'x')) && !isRetryable(new UpstreamError(400, 'bad request')));

// ---- combo fallback through the real handler
saveAccount('claude', { accessToken: 'claude-at', expiresAt: Date.now() + 3_600_000 });
saveAccount('codex', { accessToken: 'codex-at', expiresAt: Date.now() + 3_600_000, accountId: 'acc' });
saveGatewayConfig({ combos: { coding: ['cc/claude-sonnet-5', 'cx/gpt-6-sol'] } });
const key = createVirtualKey('combo-test');

let claudeCalls = 0, codexCalls = 0;
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
globalThis.fetch = (async (url: any) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    claudeCalls++;
    return new Response('{"type":"error","error":{"type":"rate_limit_error"}}', { status: 429, headers: { 'retry-after': '120' } });
  }
  if (u.startsWith('https://chatgpt.com/backend-api/codex/responses')) {
    codexCalls++;
    return sse([{ type: 'response.output_text.delta', delta: 'from codex' }, { type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 2 } } }]);
  }
  return new Response('not stubbed', { status: 599 });
}) as any;

function call(model: string) {
  const res: any = { statusCode: 200, headersSent: false, chunks: [] as string[], body: undefined };
  res.status = (s: number) => { res.statusCode = s; return res; };
  res.set = () => res; res.setHeader = () => res; res.on = () => res;
  res.write = (s: string) => { res.headersSent = true; res.chunks.push(s); return true; };
  res.end = () => { res.headersSent = true; };
  res.json = (b: any) => { res.body = b; res.headersSent = true; };
  const req: any = { headers: { authorization: `Bearer ${key.key}` }, body: { model, messages: [{ role: 'user', content: 'hi' }] }, socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1', on: () => {} };
  return handleOpenAiChatCompletions(req, res).then(() => res);
}

let r = await call('auto/coding');
assert.equal(r.statusCode, 200);
assert.equal(r.body.choices[0].message.content, 'from codex', 'claude 429 -> fell back to codex');
assert.equal(r.body.model, 'cx/gpt-6-sol');
assert.deepEqual([claudeCalls, codexCalls], [1, 1]);
assert.ok(isCoolingDown('claude'), 'a 429 cools the account down (retry-after 120s)');

// Next request skips the cooling account first: codex answers without touching claude.
r = await call('auto/coding');
assert.equal(r.body.choices[0].message.content, 'from codex');
assert.deepEqual([claudeCalls, codexCalls], [1, 2], 'cooling account moved to the back');

// A plain single model does not fall back: its own error comes back.
__resetUsage();
r = await call('cc/claude-sonnet-5');
assert.equal(r.statusCode, 429);
assert.equal(codexCalls, 2);

// Unknown combo is a clear 404.
r = await call('auto/nope');
assert.equal(r.statusCode, 404);
assert.match(r.body.error.message, /Unknown combo/);

fs.rmSync(process.env.VPSHUB_DATA_DIR!, { recursive: true, force: true });
console.log('combo + usage tests ok');
