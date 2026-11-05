// OpenAI-compatible chat over logged-in subscription accounts, 9Router style:
//   POST /v1/chat/completions  { model: "cc/claude-sonnet-5" }   (alias/model)
//   GET  /v1/models                                              (every model of every connected account)
import type { Request, Response } from 'express';
import { getCredential, isConnected, markExpired } from './accounts.js';
import { COPILOT, type OAuthCredential, type OAuthProviderId } from './oauth.js';
import {
  type ChatRequest, CLAUDE_CODE_SYSTEM, toClaude, claudeToOpenAi, claudeEvent, toCodex, codexEvent, toGemini, geminiEvent,
  completion, chunk, sseEvents
} from './formats.js';

// Aliases match 9Router so existing client configs carry over.
export const ALIASES: Record<string, OAuthProviderId> = { cc: 'claude', cx: 'codex', gh: 'copilot', gc: 'gemini-cli' };
const ALIAS_OF: Record<OAuthProviderId, string> = { claude: 'cc', codex: 'cx', copilot: 'gh', 'gemini-cli': 'gc' };

// Seed lists (from 9Router's registry, Nov 2026). Copilot's live catalog is fetched when connected.
export const MODELS: Record<OAuthProviderId, string[]> = {
  claude: ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  codex: ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'],
  copilot: ['gpt-5.5', 'gpt-5.4', 'gpt-5-mini', 'claude-sonnet-5.5', 'claude-opus-5.5', 'claude-haiku-5.5', 'gemini-3.8-flash'],
  'gemini-cli': ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash']
};

/** "cc/claude-sonnet-5" → { provider: 'claude', model: 'claude-sonnet-5' }; null when not a subscription route. */
export function resolveModel(model: unknown): { provider: OAuthProviderId; model: string } | null {
  const m = String(model || '');
  const i = m.indexOf('/');
  if (i <= 0) return null;
  const provider = ALIASES[m.slice(0, i)] || (Object.keys(ALIAS_OF).includes(m.slice(0, i)) ? (m.slice(0, i) as OAuthProviderId) : undefined);
  const rest = m.slice(i + 1);
  return provider && rest ? { provider, model: rest } : null;
}

export class UpstreamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function call(provider: OAuthProviderId, cred: OAuthCredential, model: string, req: ChatRequest, signal: AbortSignal) {
  const json = (url: string, headers: Record<string, string>, body: unknown) =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });

  if (provider === 'claude') {
    return json('https://api.anthropic.com/v1/messages?beta=true', {
      Authorization: `Bearer ${cred.accessToken}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-app': 'cli',
      'User-Agent': 'claude-cli/2.1.280 (external, sdk-cli)',
      Accept: req.stream ? 'text/event-stream' : 'application/json'
    }, toClaude(req, model));
  }
  if (provider === 'codex') {
    return json('https://chatgpt.com/backend-api/codex/responses', {
      Authorization: `Bearer ${cred.accessToken}`,
      originator: 'codex_cli_rs',
      'User-Agent': 'codex_cli_rs/0.159.0',
      version: '0.159.0',
      session_id: crypto.randomUUID(),
      Accept: 'text/event-stream',
      ...(cred.accountId ? { 'ChatGPT-Account-ID': cred.accountId } : {})
    }, toCodex(req, model));
  }
  if (provider === 'gemini-cli') {
    const action = req.stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
    return json(`https://cloudcode-pa.googleapis.com/v1internal:${action}`, {
      Authorization: `Bearer ${cred.accessToken}`,
      'User-Agent': `GeminiCLI/0.34.0/${model} (linux; x64)`,
      'X-Goog-Api-Client': 'google-genai-sdk/1.41.0 gl-node/v22.19.0',
      Accept: req.stream ? 'text/event-stream' : 'application/json'
    }, toGemini(req, model, cred.projectId));
  }
  // copilot already speaks OpenAI chat completions: forward the body as-is with the real model name.
  return json('https://api.githubcopilot.com/chat/completions', {
    Authorization: `Bearer ${cred.apiToken}`,
    'copilot-integration-id': 'vscode-chat',
    'editor-version': 'vscode/1.110.0',
    'editor-plugin-version': 'copilot-chat/0.38.0',
    'user-agent': 'GitHubCopilotChat/0.38.0',
    'openai-intent': 'conversation-panel',
    'x-github-api-version': '2025-04-01',
    'X-Initiator': 'user'
  }, { ...req, model });
}

export interface ChatOutcome { inTok: number; outTok: number; status: number; error?: string }

/** Runs one chat request and writes an OpenAI-shaped response (JSON or SSE) to `res`. */
export async function subscriptionChat(req: Request, res: Response, body: ChatRequest, target: { provider: OAuthProviderId; model: string }): Promise<ChatOutcome> {
  const { provider, model } = target;
  const publicModel = `${ALIAS_OF[provider]}/${model}`;
  if (!isConnected(provider)) throw new UpstreamError(503, `Akun ${provider} belum login. Hubungkan di 7Server → AI Gateway.`);

  const ctrl = new AbortController();
  // Abort only if the client goes away before we finish (req 'close' fires right after the body is read).
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });

  let cred = await getCredential(provider);
  let up = await call(provider, cred, model, body, ctrl.signal);
  if (up.status === 401) {
    // Token revoked or rotated elsewhere: refresh once and retry.
    markExpired(provider);
    cred = await getCredential(provider);
    up = await call(provider, cred, model, body, ctrl.signal);
  }
  if (!up.ok) {
    const text = await up.text();
    throw new UpstreamError(up.status, `${provider} ${up.status}: ${text.slice(0, 400)}`);
  }

  // Copilot: OpenAI format already, stream/JSON through untouched.
  if (provider === 'copilot') {
    res.status(200).setHeader('Content-Type', up.headers.get('content-type') || 'application/json');
    if (!body.stream) {
      const j: any = await up.json();
      res.json({ ...j, model: publicModel });
      return { inTok: j.usage?.prompt_tokens || 0, outTok: j.usage?.completion_tokens || 0, status: 200 };
    }
    res.setHeader('Cache-Control', 'no-cache');
    let inTok = 0, outTok = 0;
    for await (const ev of sseEvents(up.body!)) {
      if (ev.usage) { inTok = ev.usage.prompt_tokens || inTok; outTok = ev.usage.completion_tokens || outTok; }
      res.write(`data: ${JSON.stringify({ ...ev, model: publicModel })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
    return { inTok, outTok, status: 200 };
  }

  // Non-streaming Claude/Gemini return JSON directly.
  if (!body.stream && provider === 'claude') {
    const j = await up.json();
    res.json(claudeToOpenAi(j, publicModel));
    return { inTok: j.usage?.input_tokens || 0, outTok: j.usage?.output_tokens || 0, status: 200 };
  }
  if (!body.stream && provider === 'gemini-cli') {
    const g = geminiEvent(await up.json());
    res.json(completion(publicModel, g.text || '', g.finish || 'stop', g.inTok, g.outTok));
    return { inTok: g.inTok || 0, outTok: g.outTok || 0, status: 200 };
  }

  // Everything else is an upstream SSE stream we translate event by event (Codex always streams).
  const parse = provider === 'claude' ? claudeEvent : provider === 'codex' ? codexEvent : geminiEvent;
  const id = `chatcmpl-${Date.now().toString(36)}`;
  let text = '', inTok = 0, outTok = 0, finish = 'stop';
  if (body.stream) {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    res.write(chunk(id, publicModel, { role: 'assistant', content: '' }));
  }
  for await (const ev of sseEvents(up.body!)) {
    const e: any = parse(ev);
    if (e.error) throw new UpstreamError(502, e.error);
    if (e.inTok) inTok = e.inTok;
    if (e.outTok) outTok = e.outTok;
    if (e.finish) finish = e.finish;
    if (e.text) {
      text += e.text;
      if (body.stream) res.write(chunk(id, publicModel, { content: e.text }));
    }
  }
  if (body.stream) {
    res.write(chunk(id, publicModel, {}, finish));
    res.end('data: [DONE]\n\n');
  } else {
    res.json(completion(publicModel, text, finish, inTok, outTok));
  }
  return { inTok, outTok, status: 200 };
}

/** Models of every connected account, in `alias/model` form. Copilot uses its live catalog when reachable. */
export async function subscriptionModels(): Promise<{ id: string; object: 'model'; owned_by: string }[]> {
  const out: { id: string; object: 'model'; owned_by: string }[] = [];
  for (const provider of Object.keys(MODELS) as OAuthProviderId[]) {
    if (!isConnected(provider)) continue;
    let ids = MODELS[provider];
    if (provider === 'copilot') {
      try {
        const cred = await getCredential('copilot');
        const r = await fetch('https://api.githubcopilot.com/models', {
          headers: { Authorization: `Bearer ${cred.apiToken}`, 'copilot-integration-id': 'vscode-chat', 'editor-version': 'vscode/1.110.0', 'user-agent': COPILOT.headers['User-Agent'] },
          signal: AbortSignal.timeout(10000)
        });
        if (r.ok) {
          const live = ((await r.json()).data || []).filter((m: any) => m?.capabilities?.type !== 'embeddings' && m?.model_picker_enabled !== false).map((m: any) => m.id);
          if (live.length) ids = live;
        }
      } catch { /* fall back to seed list */ }
    }
    for (const id of ids) out.push({ id: `${ALIAS_OF[provider]}/${id}`, object: 'model', owned_by: provider });
  }
  return out;
}

// ---------------------------------------------------------------- Anthropic Messages passthrough
// Claude Code (and any Anthropic SDK client) speaks /v1/messages. With a logged-in Claude account we
// forward the body untouched, so tools, thinking, images and prompt caching keep working; only auth
// changes. shortcut: cx/ gh/ gc/ models are not translated to the Messages format here; use
// /v1/chat/completions for those, or add a translator when a client needs it.

const CLAUDE_OAUTH_BETAS = ['claude-code-20250219', 'oauth-2025-04-20'];

/** OAuth tokens only work when the first system block is the Claude Code identity; add it if a client didn't. */
export function withClaudeCodeSystem(body: any): any {
  const sys = body?.system;
  const blocks = typeof sys === 'string' ? [{ type: 'text', text: sys }] : Array.isArray(sys) ? sys : [];
  if (blocks[0]?.type === 'text' && String(blocks[0].text || '').startsWith(CLAUDE_CODE_SYSTEM)) return body;
  return { ...body, system: [{ type: 'text', text: CLAUDE_CODE_SYSTEM }, ...blocks.filter((b: any) => !(b?.type === 'text' && !b.text))] };
}

/** Client beta flags plus the ones OAuth needs, deduplicated. */
export const mergeBetas = (client?: string) =>
  [...new Set([...String(client || '').split(',').map((s) => s.trim()).filter(Boolean), ...CLAUDE_OAUTH_BETAS])].join(',');

/**
 * Forwards an Anthropic Messages request to the logged-in Claude account and pipes the reply back
 * unchanged (JSON or SSE). `path` is '/v1/messages' or '/v1/messages/count_tokens'.
 */
export async function claudeMessages(req: Request, res: Response, body: any, path = '/v1/messages'): Promise<ChatOutcome> {
  if (!isConnected('claude')) throw new UpstreamError(503, 'Akun Claude belum login. Hubungkan di 7Server → AI Gateway.');
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });

  const payload = JSON.stringify(path.endsWith('count_tokens') ? body : withClaudeCodeSystem(body));
  const send = (cred: OAuthCredential) =>
    fetch(`https://api.anthropic.com${path}?beta=true`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cred.accessToken}`,
        'anthropic-version': String(req.headers['anthropic-version'] || '2023-06-01'),
        'anthropic-beta': mergeBetas(req.headers['anthropic-beta'] as string),
        'anthropic-dangerous-direct-browser-access': 'true',
        'x-app': 'cli',
        'User-Agent': 'claude-cli/2.1.280 (external, sdk-cli)',
        Accept: body?.stream ? 'text/event-stream' : 'application/json'
      },
      body: payload
    });

  let up = await send(await getCredential('claude'));
  if (up.status === 401) {
    markExpired('claude');
    up = await send(await getCredential('claude'));
  }

  const type = up.headers.get('content-type') || 'application/json';
  if (!up.ok || !type.includes('event-stream') || !up.body) {
    // Errors and JSON replies: pass status and body through so the client sees Anthropic's own error shape.
    const text = await up.text();
    res.status(up.status).setHeader('Content-Type', type);
    res.send(text);
    let u: any = {};
    try { u = JSON.parse(text).usage || {}; } catch { /* not JSON */ }
    return { inTok: u.input_tokens || 0, outTok: u.output_tokens || 0, status: up.status, error: up.ok ? undefined : text.slice(0, 250) };
  }

  res.status(200).set({ 'Content-Type': type, 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  let buf = '', inTok = 0, outTok = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value)); // bytes untouched
      // Watch the same bytes for usage numbers.
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        try {
          const e = claudeEvent(JSON.parse(line.slice(5)));
          if (e.inTok) inTok = e.inTok;
          if (e.outTok) outTok = e.outTok;
        } catch { /* partial / keep-alive */ }
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
  return { inTok, outTok, status: 200 };
}
