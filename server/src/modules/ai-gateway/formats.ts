// Translation between the OpenAI Chat Completions shape (what the gateway exposes) and the upstream
// shapes of the subscription providers: text, system prompts, multi-turn history and function tools
// (definitions, tool_choice, assistant tool_calls, tool results), both ways and while streaming.
// shortcut: images are passed through only where the upstream speaks OpenAI (Copilot).

export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ChatMessage {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: unknown;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}
export interface ToolDef { type: 'function'; function: { name: string; description?: string; parameters?: unknown } }
export type ToolChoice = 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: ToolChoice;
  stream?: boolean;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
}

/** Flattens OpenAI content (string or [{type:'text',text}]) to plain text. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => (typeof p === 'string' ? p : p?.type === 'text' || p?.type === 'input_text' ? p.text ?? '' : '')).join('');
  }
  return content == null ? '' : String(content);
}

const systemText = (msgs: ChatMessage[]) => msgs.filter((m) => m.role === 'system' || m.role === 'developer').map((m) => textOf(m.content)).join('\n\n');
const turns = (msgs: ChatMessage[]) => msgs.filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool');
const fnTools = (req: ChatRequest) => (Array.isArray(req.tools) ? req.tools.filter((t) => t?.type === 'function' && t.function?.name) : []);
const argsOf = (s: string) => { try { const v = JSON.parse(s || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/** Tool name for a tool_call_id, looked up in earlier assistant turns (Gemini needs the name on the result). */
const nameOfCall = (msgs: ChatMessage[], id?: string) => {
  for (const m of msgs) for (const c of m.tool_calls || []) if (c.id === id) return c.function.name;
  return 'tool';
};

/** Anthropic and Gemini need alternating user/assistant turns starting with user: merge same-role neighbours. */
function alternateBlocks<B>(items: { role: 'user' | 'assistant'; blocks: B[] }[], filler: B) {
  const out: { role: 'user' | 'assistant'; blocks: B[] }[] = [];
  for (const it of items) {
    if (!it.blocks.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === it.role) last.blocks.push(...it.blocks);
    else out.push({ role: it.role, blocks: [...it.blocks] });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', blocks: [filler] });
  return out;
}

// ---------------------------------------------------------------- Claude (Messages API)
// OAuth tokens are only accepted for requests that identify as Claude Code.
export const CLAUDE_CODE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

export function toClaude(req: ChatRequest, upstreamModel: string) {
  const sys = systemText(req.messages);
  const items = turns(req.messages).map((m) => {
    if (m.role === 'tool') return { role: 'user' as const, blocks: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: textOf(m.content) }] };
    const blocks: any[] = [];
    const text = textOf(m.content);
    if (text) blocks.push({ type: 'text', text });
    if (m.role === 'assistant') for (const c of m.tool_calls || []) blocks.push({ type: 'tool_use', id: c.id, name: c.function.name, input: argsOf(c.function.arguments) });
    return { role: m.role as 'user' | 'assistant', blocks };
  });
  const tools = fnTools(req);
  const choice = req.tool_choice;
  return {
    model: upstreamModel,
    max_tokens: req.max_tokens || req.max_completion_tokens || 8192,
    stream: !!req.stream,
    system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM }, ...(sys ? [{ type: 'text', text: sys }] : [])],
    messages: alternateBlocks(items, { type: 'text', text: '(continue)' }).map((m) =>
      // plain text turns stay strings (smaller, and what the API echoes back)
      ({ role: m.role, content: m.blocks.length === 1 && m.blocks[0].type === 'text' ? m.blocks[0].text : m.blocks })),
    ...(tools.length && choice !== 'none' ? {
      tools: tools.map((t) => ({ name: t.function.name, description: t.function.description || '', input_schema: t.function.parameters || { type: 'object', properties: {} } })),
      ...(choice === 'required' ? { tool_choice: { type: 'any' } } : typeof choice === 'object' ? { tool_choice: { type: 'tool', name: choice.function.name } } : {})
    } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
    ...(req.stop ? { stop_sequences: Array.isArray(req.stop) ? req.stop : [req.stop] } : {})
  };
}

export function claudeToOpenAi(j: any, model: string) {
  const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  const calls: ToolCall[] = (j.content || []).filter((b: any) => b.type === 'tool_use')
    .map((b: any) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  return completion(model, text, finishOf(j.stop_reason), j.usage?.input_tokens, j.usage?.output_tokens, calls);
}
const finishOf = (r?: string) => (r === 'tool_use' ? 'tool_calls' : r === 'max_tokens' ? 'length' : 'stop');

/** A streamed tool-call fragment: `index` keys the call; id/name come once, arguments arrive in pieces. */
export interface ToolDelta { index: number; id?: string; name?: string; args?: string }
export interface StreamPart { text?: string; tool?: ToolDelta; inTok?: number; outTok?: number; finish?: string; error?: string }

/** Claude SSE → parts. Block indexes include text blocks, so tool calls are renumbered 0, 1, … per message. */
export function claudeParser() {
  const toolIndex = new Map<number, number>();
  return (ev: any): StreamPart => {
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') return { text: ev.delta.text };
    if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
      toolIndex.set(ev.index, toolIndex.size);
      return { tool: { index: toolIndex.get(ev.index)!, id: ev.content_block.id, name: ev.content_block.name, args: '' } };
    }
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta' && toolIndex.has(ev.index)) {
      return { tool: { index: toolIndex.get(ev.index)!, args: ev.delta.partial_json || '' } };
    }
    if (ev.type === 'message_start') return { inTok: ev.message?.usage?.input_tokens };
    if (ev.type === 'message_delta') return { outTok: ev.usage?.output_tokens, finish: ev.delta?.stop_reason ? finishOf(ev.delta.stop_reason) : undefined };
    if (ev.type === 'error') return { error: ev.error?.message || 'Claude error' };
    return {};
  };
}
/** Stateless form kept for text-only callers and older tests. */
export const claudeEvent = (ev: any) => claudeParser()(ev);

// ---------------------------------------------------------------- Codex (ChatGPT Responses API)
export const CODEX_DEFAULT_INSTRUCTIONS = 'You are a helpful assistant.';

export function toCodex(req: ChatRequest, upstreamModel: string) {
  const sys = systemText(req.messages);
  const input: any[] = [];
  for (const m of turns(req.messages)) {
    if (m.role === 'tool') { input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: textOf(m.content) }); continue; }
    const text = textOf(m.content);
    if (text || m.role === 'user') input.push({ type: 'message', role: m.role, content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text }] });
    if (m.role === 'assistant') for (const c of m.tool_calls || []) input.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments || '{}' });
  }
  const tools = fnTools(req);
  const choice = req.tool_choice;
  return {
    model: upstreamModel,
    instructions: sys || CODEX_DEFAULT_INSTRUCTIONS,
    input,
    ...(tools.length ? {
      tools: tools.map((t) => ({ type: 'function', name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} }, strict: false })),
      tool_choice: choice === 'none' ? 'none' : choice === 'required' ? 'required' : typeof choice === 'object' ? { type: 'function', name: choice.function.name } : 'auto',
      parallel_tool_calls: true
    } : {}),
    stream: true, // the ChatGPT backend only streams; non-streaming callers get the stream collected
    store: false,
    include: []
  };
}

/** Codex Responses SSE → parts. Function calls are output items; their index is their order among calls. */
export function codexParser() {
  const byItem = new Map<string, number>();
  return (ev: any): StreamPart => {
    if (ev.type === 'response.output_text.delta') return { text: ev.delta };
    if (ev.type === 'response.output_item.added' && ev.item?.type === 'function_call') {
      const index = byItem.size;
      byItem.set(ev.item.id, index);
      return { tool: { index, id: ev.item.call_id || ev.item.id, name: ev.item.name, args: ev.item.arguments || '' } };
    }
    if (ev.type === 'response.function_call_arguments.delta' && byItem.has(ev.item_id)) return { tool: { index: byItem.get(ev.item_id)!, args: ev.delta || '' } };
    if (ev.type === 'response.completed') {
      const u = ev.response?.usage || {};
      return { inTok: u.input_tokens, outTok: u.output_tokens, finish: byItem.size ? 'tool_calls' : 'stop' };
    }
    if (ev.type === 'response.failed' || ev.type === 'error') return { error: ev.response?.error?.message || ev.message || 'Codex error' };
    return {};
  };
}
export const codexEvent = (ev: any) => codexParser()(ev);

// ---------------------------------------------------------------- Gemini CLI (Cloud Code Assist)
export function toGemini(req: ChatRequest, upstreamModel: string, project?: string) {
  const sys = systemText(req.messages);
  const items = turns(req.messages).map((m) => {
    if (m.role === 'tool') {
      const out = textOf(m.content);
      let response: any;
      try { response = JSON.parse(out); if (typeof response !== 'object' || response === null) response = { result: response }; } catch { response = { result: out }; }
      return { role: 'user' as const, blocks: [{ functionResponse: { name: nameOfCall(req.messages, m.tool_call_id), response } }] };
    }
    const blocks: any[] = [];
    const text = textOf(m.content);
    if (text) blocks.push({ text });
    if (m.role === 'assistant') for (const c of m.tool_calls || []) blocks.push({ functionCall: { name: c.function.name, args: argsOf(c.function.arguments) } });
    return { role: m.role as 'user' | 'assistant', blocks };
  });
  const tools = fnTools(req);
  const choice = req.tool_choice;
  return {
    model: upstreamModel,
    project,
    request: {
      contents: alternateBlocks(items, { text: '(continue)' }).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.blocks })),
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      ...(tools.length ? {
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } })) }],
        toolConfig: { functionCallingConfig: choice === 'none' ? { mode: 'NONE' } : choice === 'required' ? { mode: 'ANY' } : typeof choice === 'object' ? { mode: 'ANY', allowedFunctionNames: [choice.function.name] } : { mode: 'AUTO' } }
      } : {}),
      generationConfig: {
        ...(req.max_tokens || req.max_completion_tokens ? { maxOutputTokens: req.max_tokens || req.max_completion_tokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.top_p !== undefined ? { topP: req.top_p } : {}),
        ...(req.stop ? { stopSequences: Array.isArray(req.stop) ? req.stop : [req.stop] } : {})
      }
    }
  };
}

/** Gemini SSE → parts. Gemini sends each functionCall whole (no argument streaming) and no call id. */
export function geminiParser() {
  let calls = 0;
  return (ev: any): StreamPart & { tools?: ToolDelta[] } => {
    const r = ev.response || ev;
    const cand = r.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.map((p: any) => (p.thought ? '' : p.text || '')).join('');
    const tools: ToolDelta[] = parts.filter((p: any) => p.functionCall).map((p: any) => {
      const index = calls++;
      return { index, id: `call_${index}_${Date.now().toString(36)}`, name: p.functionCall.name, args: JSON.stringify(p.functionCall.args ?? {}) };
    });
    const u = r.usageMetadata;
    return {
      text: text || undefined,
      tools: tools.length ? tools : undefined,
      inTok: u?.promptTokenCount,
      outTok: u?.candidatesTokenCount,
      finish: cand?.finishReason ? (calls ? 'tool_calls' : cand.finishReason === 'MAX_TOKENS' ? 'length' : 'stop') : undefined
    };
  };
}
export const geminiEvent = (ev: any) => geminiParser()(ev);

// ---------------------------------------------------------------- OpenAI output helpers
export function completion(model: string, text: string, finish = 'stop', inTok = 0, outTok = 0, toolCalls: ToolCall[] = []) {
  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text || (toolCalls.length ? null : ''), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) }, finish_reason: finish }],
    usage: { prompt_tokens: inTok || 0, completion_tokens: outTok || 0, total_tokens: (inTok || 0) + (outTok || 0) }
  };
}

export function chunk(id: string, model: string, delta: Record<string, unknown>, finish: string | null = null) {
  return `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

/** Splits an SSE byte stream into parsed `data:` JSON events. */
export async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try { yield JSON.parse(data); } catch { /* keep-alive / partial */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
