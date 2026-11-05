// Run: npx tsx src/modules/ai-gateway/tools.test.ts
// Function tools through the subscription gateway: requests translated to each upstream, and
// upstream tool calls translated back to OpenAI tool_calls (streamed and collected). No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.VPSHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-tools-'));

const { toClaude, toCodex, toGemini, claudeParser, codexParser, geminiParser } = await import('./formats.js');
const { subscriptionChat } = await import('./subscription.js');
const { saveAccount } = await import('./accounts.js');

const tools = [{ type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }];
// A full tool round: user asks, assistant calls the tool, tool answers, user follows up.
const history = {
  model: 'x', tools, tool_choice: 'auto' as const,
  messages: [
    { role: 'system' as const, content: 'You are a coder.' },
    { role: 'user' as const, content: 'open a.txt' },
    { role: 'assistant' as const, content: null, tool_calls: [{ id: 'call_1', type: 'function' as const, function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] },
    { role: 'tool' as const, tool_call_id: 'call_1', content: 'hello world' },
    { role: 'user' as const, content: 'summarise it' }
  ]
};

// ---- requests
const c: any = toClaude(history, 'claude-sonnet-5');
assert.deepEqual(c.tools, [{ name: 'read_file', description: 'Read a file', input_schema: tools[0].function.parameters }]);
assert.equal(c.tool_choice, undefined, 'auto is Claude default');
assert.deepEqual(c.messages[1], { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'read_file', input: { path: 'a.txt' } }] });
// tool result and the follow-up user text merge into one user turn (Claude needs alternation)
assert.deepEqual(c.messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'hello world' }, { type: 'text', text: 'summarise it' }] });
assert.deepEqual((toClaude({ ...history, tool_choice: 'required' }, 'm') as any).tool_choice, { type: 'any' });
assert.deepEqual((toClaude({ ...history, tool_choice: { type: 'function', function: { name: 'read_file' } } }, 'm') as any).tool_choice, { type: 'tool', name: 'read_file' });
assert.equal((toClaude({ ...history, tool_choice: 'none' }, 'm') as any).tools, undefined);

const x: any = toCodex(history, 'gpt-6-sol');
assert.deepEqual(x.tools, [{ type: 'function', name: 'read_file', description: 'Read a file', parameters: tools[0].function.parameters, strict: false }]);
assert.equal(x.tool_choice, 'auto');
assert.deepEqual(x.input.map((i: any) => i.type), ['message', 'function_call', 'function_call_output', 'message']);
assert.deepEqual(x.input[1], { type: 'function_call', call_id: 'call_1', name: 'read_file', arguments: '{"path":"a.txt"}' });
assert.deepEqual(x.input[2], { type: 'function_call_output', call_id: 'call_1', output: 'hello world' });

const g: any = toGemini(history, 'gemini-2.5-pro', 'p');
assert.deepEqual(g.request.tools[0].functionDeclarations[0].name, 'read_file');
assert.deepEqual(g.request.toolConfig, { functionCallingConfig: { mode: 'AUTO' } });
assert.deepEqual(g.request.contents[1], { role: 'model', parts: [{ functionCall: { name: 'read_file', args: { path: 'a.txt' } } }] });
assert.deepEqual(g.request.contents[2].parts[0], { functionResponse: { name: 'read_file', response: { result: 'hello world' } } }, 'name recovered from the call id');

// ---- stream parsers
const cp = claudeParser();
cp({ type: 'content_block_start', index: 0, content_block: { type: 'text' } });
assert.deepEqual(cp({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_9', name: 'read_file' } }).tool, { index: 0, id: 'toolu_9', name: 'read_file', args: '' }, 'block 1 is tool call 0');
assert.deepEqual(cp({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"pa' } }).tool, { index: 0, args: '{"pa' });
assert.equal(cp({ type: 'message_delta', delta: { stop_reason: 'tool_use' } }).finish, 'tool_calls');
const xp = codexParser();
assert.deepEqual(xp({ type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_A', name: 'read_file' } }).tool, { index: 0, id: 'call_A', name: 'read_file', args: '' });
assert.deepEqual(xp({ type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"path":' }).tool, { index: 0, args: '{"path":' });
assert.equal(xp({ type: 'response.completed', response: { usage: {} } }).finish, 'tool_calls');
const gp = geminiParser();
const gt = gp({ response: { candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'b' } } }] }, finishReason: 'STOP' }] } });
assert.equal(gt.tools![0].name, 'read_file');
assert.equal(gt.tools![0].args, '{"path":"b"}');
assert.equal(gt.finish, 'tool_calls');

// ---- end to end through subscriptionChat with stubbed upstreams
saveAccount('claude', { accessToken: 'a', expiresAt: Date.now() + 3_600_000 });
saveAccount('codex', { accessToken: 'b', expiresAt: Date.now() + 3_600_000 });
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
let sentToClaude: any;
globalThis.fetch = (async (url: any, init: any) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com/v1/messages')) {
    sentToClaude = JSON.parse(init.body);
    return sse([
      { type: 'message_start', message: { usage: { input_tokens: 9 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.txt"}' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 4 } }
    ]);
  }
  if (u.startsWith('https://chatgpt.com/backend-api/codex/responses')) {
    return sse([
      { type: 'response.output_item.added', item: { type: 'function_call', id: 'fc_1', call_id: 'call_X', name: 'read_file' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"path":"c.txt"}' },
      { type: 'response.completed', response: { usage: { input_tokens: 2, output_tokens: 1 } } }
    ]);
  }
  return new Response('x', { status: 599 });
}) as any;
function fakeRes() {
  const r: any = { headersSent: false, chunks: [] as string[], body: undefined };
  r.status = () => r; r.set = () => r; r.setHeader = () => r; r.on = () => r;
  r.write = (s: string) => { r.headersSent = true; r.chunks.push(s); return true; };
  r.end = () => {}; r.json = (b: any) => { r.body = b; };
  return r;
}
const req: any = { on: () => {} };

// Claude, streaming: OpenAI tool_call deltas, id+name first, then argument pieces, finish tool_calls
let res = fakeRes();
await subscriptionChat(req, res, { ...history, messages: history.messages.slice(0, 2), stream: true }, { provider: 'claude', model: 'claude-sonnet-5' });
assert.ok(sentToClaude.tools?.length === 1, 'tools reached Claude');
const deltas = res.chunks.filter((c: string) => c.startsWith('data: {')).map((c: string) => JSON.parse(c.slice(6)).choices[0]);
const toolDeltas = deltas.filter((d: any) => d.delta.tool_calls).map((d: any) => d.delta.tool_calls[0]);
assert.deepEqual(toolDeltas[0], { index: 0, id: 'toolu_1', type: 'function', function: { name: 'read_file', arguments: '' } });
assert.equal(toolDeltas.slice(1).map((t: any) => t.function.arguments).join(''), '{"path":"a.txt"}');
assert.ok(toolDeltas.slice(1).every((t: any) => t.id === undefined && t.function.name === undefined), 'later deltas carry arguments only');
assert.equal(deltas.at(-1).finish_reason, 'tool_calls');

// Codex, non-streaming: collected into message.tool_calls
res = fakeRes();
await subscriptionChat(req, res, { ...history, messages: history.messages.slice(0, 2) }, { provider: 'codex', model: 'gpt-6-sol' });
assert.deepEqual(res.body.choices[0].message.tool_calls, [{ id: 'call_X', type: 'function', function: { name: 'read_file', arguments: '{"path":"c.txt"}' } }]);
assert.equal(res.body.choices[0].message.content, null, 'content is null when only tools were called');
assert.equal(res.body.choices[0].finish_reason, 'tool_calls');

fs.rmSync(process.env.VPSHUB_DATA_DIR!, { recursive: true, force: true });
console.log('tool call tests ok');
