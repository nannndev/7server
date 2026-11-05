// Translation between the OpenAI Chat Completions shape (what the gateway exposes) and the upstream
// shapes of the subscription providers. Text, system prompts and multi-turn history are mapped;
// tool calls and images are passed through only where the upstream already speaks OpenAI (Copilot).
// shortcut: no tool-call / image translation for claude, codex and gemini; add per format when a client needs it.

export interface ChatMessage { role: 'system' | 'developer' | 'user' | 'assistant' | 'tool'; content: unknown }
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
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
const turns = (msgs: ChatMessage[]) => msgs.filter((m) => m.role === 'user' || m.role === 'assistant');

/** Anthropic requires alternating user/assistant starting with user: merge consecutive same-role turns. */
function alternate(msgs: ChatMessage[]) {
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const m of turns(msgs)) {
    const role = m.role as 'user' | 'assistant';
    const text = textOf(m.content);
    const last = out[out.length - 1];
    if (last && last.role === role) last.text += `\n\n${text}`;
    else out.push({ role, text });
  }
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', text: '(continue)' });
  return out;
}

// ---------------------------------------------------------------- Claude (Messages API)
// OAuth tokens are only accepted for requests that identify as Claude Code.
export const CLAUDE_CODE_SYSTEM = "You are Claude Code, Anthropic's official CLI for Claude.";

export function toClaude(req: ChatRequest, upstreamModel: string) {
  const sys = systemText(req.messages);
  return {
    model: upstreamModel,
    max_tokens: req.max_tokens || req.max_completion_tokens || 8192,
    stream: !!req.stream,
    system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM }, ...(sys ? [{ type: 'text', text: sys }] : [])],
    messages: alternate(req.messages).map((m) => ({ role: m.role, content: m.text })),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
    ...(req.stop ? { stop_sequences: Array.isArray(req.stop) ? req.stop : [req.stop] } : {})
  };
}

export function claudeToOpenAi(j: any, model: string) {
  const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  return completion(model, text, j.stop_reason === 'max_tokens' ? 'length' : 'stop', j.usage?.input_tokens, j.usage?.output_tokens);
}

/** One Claude SSE event → text delta / usage / done. */
export function claudeEvent(ev: any): { text?: string; inTok?: number; outTok?: number; finish?: string } {
  if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') return { text: ev.delta.text };
  if (ev.type === 'message_start') return { inTok: ev.message?.usage?.input_tokens };
  if (ev.type === 'message_delta') return { outTok: ev.usage?.output_tokens, finish: ev.delta?.stop_reason === 'max_tokens' ? 'length' : ev.delta?.stop_reason ? 'stop' : undefined };
  return {};
}

// ---------------------------------------------------------------- Codex (ChatGPT Responses API)
export const CODEX_DEFAULT_INSTRUCTIONS = 'You are a helpful assistant.';

export function toCodex(req: ChatRequest, upstreamModel: string) {
  const sys = systemText(req.messages);
  return {
    model: upstreamModel,
    instructions: sys || CODEX_DEFAULT_INSTRUCTIONS,
    input: turns(req.messages).map((m) => ({
      type: 'message',
      role: m.role,
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: textOf(m.content) }]
    })),
    stream: true, // the ChatGPT backend only streams; non-streaming callers get the stream collected
    store: false,
    include: []
  };
}

export function codexEvent(ev: any): { text?: string; inTok?: number; outTok?: number; finish?: string; error?: string } {
  if (ev.type === 'response.output_text.delta') return { text: ev.delta };
  if (ev.type === 'response.completed') {
    const u = ev.response?.usage || {};
    return { inTok: u.input_tokens, outTok: u.output_tokens, finish: 'stop' };
  }
  if (ev.type === 'response.failed' || ev.type === 'error') return { error: ev.response?.error?.message || ev.message || 'Codex error' };
  return {};
}

// ---------------------------------------------------------------- Gemini CLI (Cloud Code Assist)
export function toGemini(req: ChatRequest, upstreamModel: string, project?: string) {
  const sys = systemText(req.messages);
  return {
    model: upstreamModel,
    project,
    request: {
      contents: alternate(req.messages).map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
      ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}),
      generationConfig: {
        ...(req.max_tokens || req.max_completion_tokens ? { maxOutputTokens: req.max_tokens || req.max_completion_tokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.top_p !== undefined ? { topP: req.top_p } : {}),
        ...(req.stop ? { stopSequences: Array.isArray(req.stop) ? req.stop : [req.stop] } : {})
      }
    }
  };
}

export function geminiEvent(ev: any): { text?: string; inTok?: number; outTok?: number; finish?: string } {
  const r = ev.response || ev;
  const cand = r.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: any) => (p.thought ? '' : p.text || '')).join('');
  const u = r.usageMetadata;
  return {
    text: text || undefined,
    inTok: u?.promptTokenCount,
    outTok: u?.candidatesTokenCount,
    finish: cand?.finishReason ? (cand.finishReason === 'MAX_TOKENS' ? 'length' : 'stop') : undefined
  };
}

// ---------------------------------------------------------------- OpenAI output helpers
export function completion(model: string, text: string, finish = 'stop', inTok = 0, outTok = 0) {
  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: finish }],
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
