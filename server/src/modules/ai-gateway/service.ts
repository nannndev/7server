import type { Request, Response } from 'express';
import {
  getKeyBySecret,
  recordKeyUsage,
  getInternalConfig,
  addUsageLog
} from './store.js';
import type { VirtualApiKey, AiProviderId, RoutingStrategy } from './types.js';
import {
  resolveModel,
  subscriptionChat,
  subscriptionModels,
  accountModels,
  buildProviderAutoChain,
  claudeMessages,
  UpstreamError,
  comboName,
  isRetryable,
  COMBO_PREFIX,
  ALIAS_OF
} from './subscription.js';
import { isCoolingDown, rotateRoundRobin } from './usage.js';
import { isConnected } from './accounts.js';
import { resolveCompatModel, COMPAT_PROVIDERS, compatProvider } from './compatProviders.js';
import { toClaude, claudeToOpenAi, claudeParser, completion, chunk, sseEvents, type ChatRequest } from './formats.js';

const RETRYABLE_UPSTREAM_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503, 504]);

function activeApiKeys(provider: { apiKey?: string; apiKeys?: Array<{ apiKey: string; enabled?: boolean }> }, allowEmpty = false): string[] {
  if (provider.apiKeys?.length) {
    return provider.apiKeys.filter((k) => k.enabled !== false).map((k) => k.apiKey).filter(Boolean);
  }
  if (provider.apiKey) return [provider.apiKey];
  return allowEmpty ? [''] : [];
}
const NATIVE_API_KEY_PROVIDERS = new Set<AiProviderId>(['openai', 'anthropic', 'gemini', 'deepseek', 'ollama']);
const API_KEY_MODEL_CATALOG: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3-mini'],
  anthropic: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  gemini: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
  ollama: ['llama3.2', 'qwen2.5-coder', 'deepseek-r1']
};

// Sliding 60s request timestamps per virtual key id for rateLimitPerMin enforcement
const keyRateWindow = new Map<string, number[]>();
export const __resetKeyRateLimits = () => keyRateWindow.clear();

export function createResAbortController(res: Response): AbortController {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) ac.abort();
  });
  return ac;
}

export function sendWireError(
  res: Response,
  wire: 'openai' | 'anthropic',
  status: number,
  message: string,
  type = 'invalid_request_error',
  code?: string
): void {
  if (wire === 'anthropic') {
    res.status(status).json({ type: 'error', error: { type, message } });
  } else {
    res.status(status).json({ error: { message, type, ...(code ? { code } : {}) } });
  }
}

export function enforceKeyPolicy(
  key: VirtualApiKey,
  res: Response,
  wire: 'openai' | 'anthropic'
): boolean {
  if (key.expiresAt) {
    const exp = Date.parse(key.expiresAt);
    if (Number.isFinite(exp) && Date.now() > exp) {
      sendWireError(res, wire, 401, 'This 7Server virtual API key has expired.', 'authentication_error', 'expired_api_key');
      return false;
    }
  }
  if (key.maxTokens && key.maxTokens > 0) {
    const usedTokens = (key.totalInputTokens || 0) + (key.totalOutputTokens || 0);
    if (usedTokens >= key.maxTokens) {
      sendWireError(res, wire, 429, `Virtual API key token quota exceeded (${usedTokens}/${key.maxTokens}).`, 'rate_limit_error', 'insufficient_quota');
      return false;
    }
  }
  if (key.maxBudgetUsd && key.maxBudgetUsd > 0) {
    const spent = key.totalCostUsd || 0;
    if (spent >= key.maxBudgetUsd) {
      sendWireError(res, wire, 429, `Virtual API key USD budget exceeded ($${spent.toFixed(4)}/$${key.maxBudgetUsd.toFixed(2)}).`, 'rate_limit_error', 'insufficient_quota');
      return false;
    }
  }
  if (key.rateLimitPerMin && key.rateLimitPerMin > 0) {
    const now = Date.now();
    const cutoff = now - 60_000;
    const prev = (keyRateWindow.get(key.id) || []).filter((t) => t > cutoff);
    if (prev.length >= key.rateLimitPerMin) {
      const retrySec = Math.max(1, Math.ceil((prev[0]! + 60_000 - now) / 1000));
      res.setHeader('Retry-After', String(retrySec));
      keyRateWindow.set(key.id, prev);
      sendWireError(res, wire, 429, `Virtual API key rate limit exceeded (${key.rateLimitPerMin} req/min). Retry in ${retrySec}s.`, 'rate_limit_error', 'rate_limit_exceeded');
      return false;
    }
    prev.push(now);
    keyRateWindow.set(key.id, prev);
  }
  return true;
}

export type ResolvedTarget =
  | { kind: 'oauth'; provider: import('./oauth.js').OAuthProviderId; model: string }
  | { kind: 'apikey'; provider: AiProviderId; model: string };

/** Resolves OAuth (`cc/model`) and API-key (`openai/gpt-4o`, `anthropic/...`, `groq/...`) model targets. */
export function resolveAnyTarget(rawModel: unknown): ResolvedTarget | null {
  const m = String(rawModel || '').trim();
  if (!m) return null;
  const sub = resolveModel(m);
  if (sub) return { kind: 'oauth', provider: sub.provider, model: sub.model };

  const slash = m.indexOf('/');
  if (slash <= 0) return null;
  const rawPrefix = m.slice(0, slash).toLowerCase();
  const rest = m.slice(slash + 1).trim();
  if (!rest) return null;

  const provId = (rawPrefix === 'google' ? 'gemini' : rawPrefix) as AiProviderId;
  if (NATIVE_API_KEY_PROVIDERS.has(provId) || compatProvider(provId)) {
    return { kind: 'apikey', provider: provId, model: rest };
  }
  return null;
}

export const isValidComboTarget = (target: string): boolean => Boolean(resolveAnyTarget(target));

export function buildApiKeyAutoChain(providerId: AiProviderId, cfg = getInternalConfig()): string[] {
  const pCfg = cfg.providers[providerId];
  const compat = compatProvider(providerId);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (m?: string) => {
    if (!m || m === 'auto') return;
    const clean = m.startsWith(`${providerId}/`) ? m.slice(providerId.length + 1) : m;
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };
  push(pCfg?.defaultModel);
  for (const m of pCfg?.models || []) push(m);
  for (const m of API_KEY_MODEL_CATALOG[providerId] || []) push(m);
  if (compat?.sampleModel) push(compat.sampleModel);
  return out.slice(0, 6);
}

function getEffectiveStrategy(cfg: ReturnType<typeof getInternalConfig>, providerId: AiProviderId): RoutingStrategy {
  return cfg.providers[providerId]?.routingStrategy || cfg.routingStrategy || 'ordered';
}

function getApiKeyBaseUrl(providerId: AiProviderId, configured?: string): string {
  if (providerId === 'gemini') {
    const base = (configured || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
    return base.endsWith('/openai') ? base : `${base}/v1beta/openai`;
  }
  if (providerId === 'ollama') {
    const base = (configured || 'http://localhost:11434').replace(/\/+$/, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
  if (providerId === 'deepseek') {
    return (configured || 'https://api.deepseek.com').replace(/\/+$/, '');
  }
  if (providerId === 'anthropic') {
    return (configured || 'https://api.anthropic.com').replace(/\/+$/, '');
  }
  const compat = compatProvider(providerId);
  return (configured || compat?.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function recordUsageAndCost(
  key: VirtualApiKey,
  logData: Parameters<typeof addUsageLog>[0],
  skipKeyStats = false
): void {
  const costUsd = addUsageLog(logData);
  if (!skipKeyStats) {
    recordKeyUsage(key.id, logData.inputTokens, logData.outputTokens, costUsd);
  }
}

export function authenticateVirtualKey(req: Request): VirtualApiKey | null {
  const authHeader = req.headers['authorization'];
  let keySecret = '';

  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    keySecret = authHeader.slice(7).trim();
  } else if (typeof req.headers['x-api-key'] === 'string') {
    keySecret = req.headers['x-api-key'].trim();
  }

  if (!keySecret) return null;
  return getKeyBySecret(keySecret);
}

export async function handleAnthropicMessages(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || ''; // trusted only via TRUST_PROXY
  const key = authenticateVirtualKey(req);

  if (!key) {
    res.status(401).json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Invalid, expired, or disabled 7Server Virtual API Key. Generate a key in the 7Server Dashboard under AI Gateway.'
      }
    });
    return;
  }

  if (!enforceKeyPolicy(key, res, 'anthropic')) return;

  // Logged-in Claude account: used for `cc/<model>`, and for plain Claude model names when no
  // Anthropic API key is configured (that is what Claude Code sends).
  const cfg = getInternalConfig();
  const provider = cfg.providers.anthropic;
  const requested = String(req.body?.model || '');
  const sub = resolveModel(requested);
  const hasApiKey = !!(provider?.enabled && provider.apiKey);
  if ((sub?.provider === 'claude' || (!sub && !hasApiKey)) && isConnected('claude')) {
    if (key.allowedProviders && !key.allowedProviders.includes('claude')) {
      res.status(403).json({ type: 'error', error: { type: 'permission_error', message: 'This 7Server virtual key does not have permission to use the Claude account.' } });
      return;
    }
    const body = sub ? { ...req.body, model: sub.model } : req.body;
    try {
      const out = await claudeMessages(
        req,
        res,
        body,
        req.path.endsWith('count_tokens') ? '/v1/messages/count_tokens' : '/v1/messages',
        getEffectiveStrategy(cfg, 'claude')
      );
      recordUsageAndCost(key, {
        keyId: key.id, keyName: key.name, provider: 'claude', model: requested,
        inputTokens: out.inTok, outputTokens: out.outTok,
        durationMs: Date.now() - startTime, status: out.status < 400 ? 'success' : 'error',
        statusCode: out.status, error: out.error, streaming: !!req.body?.stream, ip: clientIp
      });
    } catch (err: any) {
      const status = err instanceof UpstreamError ? err.status : 502;
      addUsageLog({ keyId: key.id, keyName: key.name, provider: 'claude', model: requested, inputTokens: 0, outputTokens: 0,
        durationMs: Date.now() - startTime, status: 'error', statusCode: status, error: String(err.message).slice(0, 250), streaming: !!req.body?.stream, ip: clientIp });
      if (!res.headersSent) res.status(status).json({ type: 'error', error: { type: 'api_error', message: err.message } });
      else res.end();
    }
    return;
  }
  if (sub) {
    res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: `/v1/messages supports Claude models only (cc/…). Use /v1/chat/completions for ${requested}.` } });
    return;
  }

  if (key.allowedProviders && !key.allowedProviders.includes('anthropic')) {
    res.status(403).json({ type: 'error', error: { type: 'permission_error', message: 'This 7Server virtual key does not have permission to access the Anthropic provider.' } });
    return;
  }

  if (!provider || !provider.enabled || !provider.apiKey) {
    res.status(503).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Anthropic upstream provider is not configured or disabled in 7Server. Please set your master Anthropic API Key in 7Server AI Gateway settings.'
      }
    });
    return;
  }

  const model = req.body?.model || provider.defaultModel || 'claude-3-7-sonnet-20250219';
  const isStreaming = Boolean(req.body?.stream);
  const baseUrl = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/v1/messages`;

  const upstreamHeaders: Record<string, string> = {
    'x-api-key': provider.apiKey,
    'anthropic-version': (req.headers['anthropic-version'] as string) || '2023-06-01',
    'content-type': 'application/json'
  };

  if (req.headers['anthropic-beta']) {
    upstreamHeaders['anthropic-beta'] = req.headers['anthropic-beta'] as string;
  }

  const ac = createResAbortController(res);

  try {
    const rawKeyList = activeApiKeys(provider);
    if (!rawKeyList.length) {
      res.status(400).json({ type: 'error', error: { type: 'api_error', message: 'All API key accounts for anthropic are disabled.' } });
      return;
    }
    const keyList = rotateRoundRobin(rawKeyList, 'apikey:anthropic', getEffectiveStrategy(cfg, 'anthropic'));
    let upstreamRes: globalThis.Response | undefined;
    for (let i = 0; i < keyList.length; i++) {
      upstreamHeaders['x-api-key'] = keyList[i]!;
      upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: upstreamHeaders,
        body: JSON.stringify(req.body),
        signal: ac.signal
      });
      if (upstreamRes.ok || i + 1 >= keyList.length || !RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
        break;
      }
    }
    upstreamRes = upstreamRes!;

    if (!isStreaming) {
      const rawText = await upstreamRes.text();
      const durationMs = Date.now() - startTime;
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const parsed = JSON.parse(rawText);
        if (parsed?.usage) {
          inputTokens = Number(parsed.usage.input_tokens) || 0;
          outputTokens = Number(parsed.usage.output_tokens) || 0;
        }
      } catch {
        // Raw text not JSON
      }

      recordUsageAndCost(key, {
        keyId: key.id,
        keyName: key.name,
        provider: 'anthropic',
        model,
        inputTokens,
        outputTokens,
        durationMs,
        status: upstreamRes.ok ? 'success' : 'error',
        statusCode: upstreamRes.status,
        error: !upstreamRes.ok ? rawText.slice(0, 250) : undefined,
        streaming: false,
        ip: clientIp
      });

      res.status(upstreamRes.status);
      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
      res.send(rawText);
      return;
    }

    // Streaming response (SSE)
    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      const durationMs = Date.now() - startTime;
      addUsageLog({
        keyId: key.id,
        keyName: key.name,
        provider: 'anthropic',
        model,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        status: 'error',
        statusCode: upstreamRes.status,
        error: errorText.slice(0, 250),
        streaming: true,
        ip: clientIp
      });

      res.status(upstreamRes.status);
      res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
      res.send(errorText);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    let inputTokens = 0;
    let outputTokens = 0;
    let lineBuffer = '';
    const textDecoder = new TextDecoder();

    if (!upstreamRes.body) {
      res.end();
      return;
    }

    const reader = upstreamRes.body.getReader();
    ac.signal.addEventListener('abort', () => {
      reader.cancel().catch(() => {});
    }, { once: true });

    try {
      while (!ac.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        res.write(value);

        // Parse SSE chunks to extract token usage without altering stream
        lineBuffer += textDecoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const eventData = JSON.parse(jsonStr);
                if (eventData.type === 'message_start' && eventData.message?.usage) {
                  inputTokens = Number(eventData.message.usage.input_tokens) || inputTokens;
                } else if (eventData.type === 'message_delta' && eventData.usage) {
                  outputTokens = Number(eventData.usage.output_tokens) || outputTokens;
                }
              } catch {
                // Non-fatal parse attempt
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }

    const durationMs = Date.now() - startTime;
    recordUsageAndCost(key, {
      keyId: key.id,
      keyName: key.name,
      provider: 'anthropic',
      model,
      inputTokens,
      outputTokens,
      durationMs,
      status: 'success',
      statusCode: 200,
      streaming: true,
      ip: clientIp
    });

  } catch (err: any) {
    if (err?.name === 'AbortError' || ac.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    const durationMs = Date.now() - startTime;
    addUsageLog({
      keyId: key.id,
      keyName: key.name,
      provider: 'anthropic',
      model,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      status: 'error',
      statusCode: 500,
      error: err.message || 'Upstream request failed',
      streaming: isStreaming,
      ip: clientIp
    });

    if (!res.headersSent) {
      res.status(500).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: `7Server AI Gateway proxy error: ${err.message}`
        }
      });
    } else {
      res.end();
    }
  }
}

async function executeApiKeyAnthropicAsOpenAi(
  res: Response,
  cfg: ReturnType<typeof getInternalConfig>,
  provider: NonNullable<ReturnType<typeof getInternalConfig>['providers']['anthropic']>,
  model: string,
  reqBody: any,
  ac: AbortController,
  isChain: boolean
): Promise<{ inTok: number; outTok: number; status: number; error?: string; handled: boolean }> {
  const baseUrl = getApiKeyBaseUrl('anthropic', provider.baseUrl);
  const rawKeys = activeApiKeys(provider);
  const keyList = rotateRoundRobin(rawKeys, 'apikey:anthropic', getEffectiveStrategy(cfg, 'anthropic'));
  const claudeBody = toClaude(reqBody as ChatRequest, model);

  let upstreamRes: globalThis.Response | undefined;
  let lastErrorText = '';
  for (let i = 0; i < keyList.length; i++) {
    upstreamRes = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': keyList[i]!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeBody),
      signal: ac.signal
    });
    if (upstreamRes.ok) break;
    lastErrorText = await upstreamRes.text();
    if (i + 1 >= keyList.length || !RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
      if (isChain && RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
        throw new UpstreamError(upstreamRes.status, `anthropic ${upstreamRes.status}: ${lastErrorText.slice(0, 300)}`);
      }
      res.status(upstreamRes.status).setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
      res.send(lastErrorText);
      return { inTok: 0, outTok: 0, status: upstreamRes.status, error: lastErrorText.slice(0, 250), handled: true };
    }
  }
  upstreamRes = upstreamRes!;

  if (!reqBody?.stream) {
    const raw = await upstreamRes.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { /* ignore */ }
    res.status(200).json(claudeToOpenAi(parsed, `anthropic/${model}`));
    return {
      inTok: Number(parsed?.usage?.input_tokens) || 0,
      outTok: Number(parsed?.usage?.output_tokens) || 0,
      status: 200,
      handled: true
    };
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const id = `chatcmpl-${Date.now().toString(36)}`;
  const parse = claudeParser();
  let inTok = 0;
  let outTok = 0;
  let finish = 'stop';
  for await (const ev of sseEvents(upstreamRes.body!)) {
    if (ac.signal.aborted) break;
    const part = parse(ev);
    if (part.inTok) inTok = part.inTok;
    if (part.outTok) outTok = part.outTok;
    if (part.finish) finish = part.finish;
    if (part.text) res.write(chunk(id, `anthropic/${model}`, { content: part.text }));
  }
  res.write(chunk(id, `anthropic/${model}`, {}, finish));
  res.end('data: [DONE]\n\n');
  return { inTok, outTok, status: 200, handled: true };
}

async function executeApiKeyOpenAiTarget(
  res: Response,
  cfg: ReturnType<typeof getInternalConfig>,
  targetProviderId: AiProviderId,
  upstreamModel: string,
  reqBody: any,
  ac: AbortController,
  isChain: boolean
): Promise<{ inTok: number; outTok: number; status: number; error?: string; handled: boolean }> {
  const provider = cfg.providers[targetProviderId];
  if (!provider || !provider.enabled || (targetProviderId !== 'ollama' && targetProviderId !== 'custom' && !provider.apiKey && !provider.apiKeys?.length)) {
    const msg = `Provider ${targetProviderId} is not configured or disabled in 7Server AI Gateway.`;
    if (isChain) throw new UpstreamError(503, msg);
    res.status(503).json({ error: { message: msg, type: 'api_error' } });
    return { inTok: 0, outTok: 0, status: 503, error: msg, handled: true };
  }

  if (targetProviderId === 'anthropic') {
    return executeApiKeyAnthropicAsOpenAi(res, cfg, provider, upstreamModel, reqBody, ac, isChain);
  }

  const isStreaming = Boolean(reqBody?.stream);
  const baseUrl = getApiKeyBaseUrl(targetProviderId, provider.baseUrl);
  const targetUrl = `${baseUrl}/chat/completions`;
  const rawKeys = activeApiKeys(provider, targetProviderId === 'ollama' || targetProviderId === 'custom');
  if (!rawKeys.length) {
    throw new Error(`All API key accounts for ${targetProviderId} are disabled.`);
  }
  const keyList = rotateRoundRobin(rawKeys, `apikey:${targetProviderId}`, getEffectiveStrategy(cfg, targetProviderId));

  const basePayload = { ...reqBody, model: upstreamModel };
  const withIncludeUsage =
    isStreaming && basePayload.stream_options?.include_usage === undefined
      ? { ...basePayload, stream_options: { ...(basePayload.stream_options || {}), include_usage: true } }
      : basePayload;

  let upstreamRes: globalThis.Response | undefined;
  for (let i = 0; i < keyList.length; i++) {
    const makeHeaders = (): Record<string, string> => ({
      'content-type': 'application/json',
      ...(keyList[i] ? { authorization: `Bearer ${keyList[i]}` } : {})
    });
    upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify(withIncludeUsage),
      signal: ac.signal
    });
    // Retry once without injected stream_options if an upstream rejects it with 400
    if (upstreamRes.status === 400 && withIncludeUsage !== basePayload) {
      const errPreview = await upstreamRes.text();
      if (/stream_options|include_usage/i.test(errPreview)) {
        upstreamRes = await fetch(targetUrl, {
          method: 'POST',
          headers: makeHeaders(),
          body: JSON.stringify(basePayload),
          signal: ac.signal
        });
      } else {
        // Re-wrap consumed body so error handler below reads exact text
        upstreamRes = new globalThis.Response(errPreview, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: upstreamRes.headers
        });
      }
    }
    if (upstreamRes.ok || i + 1 >= keyList.length || !RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
      break;
    }
  }
  upstreamRes = upstreamRes!;

  if (!isStreaming) {
    const rawText = await upstreamRes.text();
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed?.usage) {
        inputTokens = Number(parsed.usage.prompt_tokens) || 0;
        outputTokens = Number(parsed.usage.completion_tokens) || 0;
      }
    } catch {
      // ignore
    }

    if (!upstreamRes.ok && isChain && RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
      throw new UpstreamError(upstreamRes.status, `${targetProviderId} ${upstreamRes.status}: ${rawText.slice(0, 300)}`);
    }

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
    res.send(rawText);
    return {
      inTok: inputTokens,
      outTok: outputTokens,
      status: upstreamRes.status,
      error: !upstreamRes.ok ? rawText.slice(0, 250) : undefined,
      handled: true
    };
  }

  if (!upstreamRes.ok) {
    const errorText = await upstreamRes.text();
    if (isChain && RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
      throw new UpstreamError(upstreamRes.status, `${targetProviderId} ${upstreamRes.status}: ${errorText.slice(0, 300)}`);
    }
    res.status(upstreamRes.status);
    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
    res.send(errorText);
    return {
      inTok: 0,
      outTok: 0,
      status: upstreamRes.status,
      error: errorText.slice(0, 250),
      handled: true
    };
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!upstreamRes.body) {
    res.end();
    return { inTok: 0, outTok: 0, status: 200, handled: true };
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let exactOutSeen = false;
  let lineBuffer = '';
  const textDecoder = new TextDecoder();
  const reader = upstreamRes.body.getReader();
  ac.signal.addEventListener('abort', () => {
    reader.cancel().catch(() => {});
  }, { once: true });

  try {
    while (!ac.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      res.write(value);

      lineBuffer += textDecoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:')) {
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const eventData = JSON.parse(jsonStr);
              if (eventData.usage) {
                inputTokens = Number(eventData.usage.prompt_tokens) || inputTokens;
                const exactOut = Number(eventData.usage.completion_tokens);
                if (Number.isFinite(exactOut) && exactOut > 0) {
                  outputTokens = exactOut;
                  exactOutSeen = true;
                }
              } else if (!exactOutSeen && eventData.choices?.[0]?.delta?.content) {
                // Approximate 1 token per 4 chars if usage not yet sent in stream
                outputTokens += Math.max(1, Math.round(eventData.choices[0].delta.content.length / 4));
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }

  return { inTok: inputTokens, outTok: outputTokens, status: 200, handled: true };
}

async function runOpenAiChatForKey(
  req: Request,
  res: Response,
  key: VirtualApiKey,
  opts: { skipPolicy?: boolean; skipKeyStats?: boolean } = {}
): Promise<void> {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || ''; // trusted only via TRUST_PROXY

  if (!opts.skipPolicy && !enforceKeyPolicy(key, res, 'openai')) return;

  const cfg = getInternalConfig();
  const requestedModel = String(req.body?.model || 'gpt-4o');
  const combo = comboName(requestedModel);
  const chain = combo ? cfg.combos?.[combo] : undefined;
  if (combo && !chain?.length) {
    res.status(404).json({ error: { message: `Unknown combo "${combo}". Define it in 7Server → AI Gateway → Combos.`, type: 'invalid_request_error' } });
    return;
  }

  const directTarget = !combo ? resolveAnyTarget(requestedModel) : null;
  const isProviderAuto = directTarget?.model === 'auto';

  let resolvedTargets: ResolvedTarget[] = [];
  if (combo) {
    resolvedTargets = (chain || [])
      .map(resolveAnyTarget)
      .filter((t): t is ResolvedTarget => !!t);
  } else if (isProviderAuto && directTarget) {
    if (directTarget.kind === 'oauth') {
      resolvedTargets = buildProviderAutoChain(directTarget.provider, (await accountModels())[directTarget.provider]).map((m) => ({
        kind: 'oauth' as const,
        provider: directTarget.provider,
        model: m
      }));
    } else {
      resolvedTargets = buildApiKeyAutoChain(directTarget.provider, cfg).map((m) => ({
        kind: 'apikey' as const,
        provider: directTarget.provider,
        model: m
      }));
    }
  } else if (directTarget) {
    resolvedTargets = [directTarget];
  } else {
    // Plain unprefixed model name: infer target API-key provider cleanly
    let targetProviderId: AiProviderId = 'openai';
    const compat = resolveCompatModel(requestedModel);
    let upstreamModel = requestedModel;
    if (compat) {
      targetProviderId = compat.provider.id;
      upstreamModel = compat.model;
    } else if (requestedModel.toLowerCase().includes('deepseek')) {
      targetProviderId = 'deepseek';
    } else if (requestedModel.toLowerCase().includes('gemini')) {
      targetProviderId = 'gemini';
    } else if (requestedModel.toLowerCase().includes('claude')) {
      targetProviderId = 'anthropic';
    } else if (requestedModel.toLowerCase().includes('llama') || requestedModel.toLowerCase().includes('mistral') || requestedModel.toLowerCase().includes('qwen')) {
      if (cfg.providers.ollama?.enabled) targetProviderId = 'ollama';
    }
    resolvedTargets = [{ kind: 'apikey', provider: targetProviderId, model: upstreamModel }];
  }

  if (resolvedTargets.length === 0) {
    res.status(400).json({ error: { message: `No valid routing targets found for "${requestedModel}".`, type: 'invalid_request_error' } });
    return;
  }

  const isChain = Boolean(combo || isProviderAuto);
  const allowed = resolvedTargets.filter((t) => !key.allowedProviders || key.allowedProviders.includes(t.provider as AiProviderId));
  if (!allowed.length) {
    res.status(403).json({
      error: {
        message: `This 7Server virtual key does not have permission to access provider ${resolvedTargets[0]!.provider}.`,
        type: 'invalid_request_error'
      }
    });
    return;
  }

  // Validate messages when hitting OAuth or combo targets
  const hasOauth = allowed.some((t) => t.kind === 'oauth');
  if (hasOauth && (!Array.isArray(req.body?.messages) || req.body.messages.length === 0)) {
    res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
    return;
  }

  // Cooling-down OAuth targets go last
  const ordered = [
    ...allowed.filter((t) => t.kind !== 'oauth' || !isCoolingDown(t.provider)),
    ...allowed.filter((t) => t.kind === 'oauth' && isCoolingDown(t.provider))
  ];

  const ac = createResAbortController(res);
  const tried: string[] = [];
  let lastErr: any;

  for (const target of ordered) {
    const label = `${target.provider}/${target.model}`;
    try {
      if (target.kind === 'oauth') {
        const out = await subscriptionChat(req, res, req.body, target, getEffectiveStrategy(cfg, target.provider as AiProviderId));
        recordUsageAndCost(key, {
          keyId: key.id,
          keyName: key.name,
          provider: target.provider as AiProviderId,
          model: isChain ? `${requestedModel} → ${label}` : requestedModel,
          inputTokens: out.inTok,
          outputTokens: out.outTok,
          durationMs: Date.now() - startTime,
          status: 'success',
          statusCode: 200,
          streaming: !!req.body?.stream,
          ip: clientIp,
          ...(tried.length ? { error: `fell back after: ${tried.join(', ')}` } : {})
        }, opts.skipKeyStats);
        return;
      }

      const out = await executeApiKeyOpenAiTarget(res, cfg, target.provider, target.model, req.body, ac, isChain);
      recordUsageAndCost(key, {
        keyId: key.id,
        keyName: key.name,
        provider: target.provider,
        model: isChain ? `${requestedModel} → ${label}` : requestedModel,
        inputTokens: out.inTok,
        outputTokens: out.outTok,
        durationMs: Date.now() - startTime,
        status: out.status < 400 ? 'success' : 'error',
        statusCode: out.status,
        error: tried.length && out.status < 400 ? `fell back after: ${tried.join(', ')}` : out.error,
        streaming: !!req.body?.stream,
        ip: clientIp
      }, opts.skipKeyStats);
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError' || ac.signal.aborted) {
        if (!res.writableEnded) res.end();
        return;
      }
      lastErr = err;
      tried.push(`${label} (${err instanceof UpstreamError ? err.status : 'error'})`);
      if (res.headersSent || !isChain || !isRetryable(err)) break;
    }
  }

  const status = lastErr instanceof UpstreamError ? lastErr.status : 500;
  addUsageLog({
    keyId: key.id,
    keyName: key.name,
    provider: ordered[0]!.provider as AiProviderId,
    model: requestedModel,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: Date.now() - startTime,
    status: 'error',
    statusCode: status,
    error: `${tried.join(' → ')}: ${String(lastErr?.message || 'Upstream request failed').slice(0, 200)}`,
    streaming: Boolean(req.body?.stream),
    ip: clientIp
  });

  if (!res.headersSent) {
    res.status(status).json({
      error: {
        message: isChain
          ? `All targets of ${requestedModel} failed: ${tried.join(', ')}. Last: ${lastErr?.message}`
          : `7Server AI Gateway proxy error: ${lastErr?.message || 'Upstream request failed'}`,
        type: 'api_error'
      }
    });
  } else {
    res.end();
  }
}

export async function handleOpenAiChatCompletions(req: Request, res: Response): Promise<void> {
  const key = authenticateVirtualKey(req);

  if (!key) {
    res.status(401).json({
      error: {
        message: 'Invalid, expired, or disabled 7Server Virtual API Key.',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
    return;
  }

  await runOpenAiChatForKey(req, res, key);
}

/** Admin Web Playground handler — executes via the gateway pipeline without requiring a raw virtual secret. */
export async function handlePlaygroundChat(req: Request, res: Response): Promise<void> {
  const syntheticKey: VirtualApiKey = {
    id: 'playground',
    name: 'Web Playground',
    keyPrefix: 'admin',
    createdAt: '',
    enabled: true,
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };
  await runOpenAiChatForKey(req, res, syntheticKey, { skipPolicy: true, skipKeyStats: true });
}

function responsesBodyToMessages(body: any): { role: string; content: string }[] {
  const msgs: { role: string; content: string }[] = [];
  if (typeof body?.instructions === 'string' && body.instructions.trim()) {
    msgs.push({ role: 'system', content: body.instructions.trim() });
  }
  const input = body?.input;
  if (typeof input === 'string') {
    msgs.push({ role: 'user', content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        msgs.push({ role: 'user', content: item });
      } else if (item && typeof item === 'object') {
        const role = item.role || 'user';
        let content = '';
        if (typeof item.content === 'string') content = item.content;
        else if (Array.isArray(item.content)) {
          content = item.content.map((c: any) => c?.text || c?.input_text || '').filter(Boolean).join('\n');
        }
        if (content) msgs.push({ role, content });
      }
    }
  }
  return msgs;
}

/** OpenAI Responses API (`/v1/responses`) — forwards natively to OpenAI/compat, or adapts to Chat for OAuth providers. */
export async function handleOpenAiResponses(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const key = authenticateVirtualKey(req);

  if (!key) {
    res.status(401).json({
      error: { message: 'Invalid, expired, or disabled 7Server Virtual API Key.', type: 'invalid_request_error', code: 'invalid_api_key' }
    });
    return;
  }
  if (!enforceKeyPolicy(key, res, 'openai')) return;

  const cfg = getInternalConfig();
  const requestedModel = String(req.body?.model || 'gpt-4o');
  const direct = resolveAnyTarget(requestedModel);

  // If targeting OAuth or Anthropic, adapt Responses input -> messages and run chat pipeline
  if (direct?.kind === 'oauth' || direct?.provider === 'anthropic') {
    const messages = responsesBodyToMessages(req.body);
    if (!messages.length) {
      res.status(400).json({ error: { message: 'input is required', type: 'invalid_request_error' } });
      return;
    }
    req.body = {
      model: requestedModel,
      messages,
      stream: Boolean(req.body?.stream),
      ...(req.body?.temperature !== undefined ? { temperature: req.body.temperature } : {}),
      ...(req.body?.max_output_tokens !== undefined ? { max_tokens: req.body.max_output_tokens } : {})
    };
    await runOpenAiChatForKey(req, res, key, { skipPolicy: true });
    return;
  }

  const targetProviderId: AiProviderId = direct?.kind === 'apikey' ? direct.provider : 'openai';
  const upstreamModel = direct?.kind === 'apikey' ? direct.model : requestedModel;

  if (key.allowedProviders && !key.allowedProviders.includes(targetProviderId)) {
    res.status(403).json({
      error: { message: `This 7Server virtual key does not have permission to access provider ${targetProviderId}.`, type: 'invalid_request_error' }
    });
    return;
  }

  const provider = cfg.providers[targetProviderId];
  if (!provider || !provider.enabled || (targetProviderId !== 'ollama' && targetProviderId !== 'custom' && !provider.apiKey && !provider.apiKeys?.length)) {
    res.status(503).json({
      error: { message: `Provider ${targetProviderId} is not configured or disabled in 7Server AI Gateway.`, type: 'api_error' }
    });
    return;
  }

  const baseUrl = getApiKeyBaseUrl(targetProviderId, provider.baseUrl);
  const targetUrl = `${baseUrl}/responses`;
  const rawKeys = activeApiKeys(provider, targetProviderId === 'ollama' || targetProviderId === 'custom');
  const keyList = rotateRoundRobin(rawKeys, `apikey:${targetProviderId}`, getEffectiveStrategy(cfg, targetProviderId));
  const isStreaming = Boolean(req.body?.stream);
  const ac = createResAbortController(res);
  const upstreamPayload = { ...req.body, model: upstreamModel };

  try {
    let upstreamRes: globalThis.Response | undefined;
    for (let i = 0; i < keyList.length; i++) {
      upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(keyList[i] ? { authorization: `Bearer ${keyList[i]}` } : {})
        },
        body: JSON.stringify(upstreamPayload),
        signal: ac.signal
      });
      if (upstreamRes.ok || i + 1 >= keyList.length || !RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
        break;
      }
    }
    upstreamRes = upstreamRes!;

    if (!isStreaming || !upstreamRes.ok) {
      const rawText = await upstreamRes.text();
      let inTok = 0;
      let outTok = 0;
      try {
        const parsed = JSON.parse(rawText);
        if (parsed?.usage) {
          inTok = Number(parsed.usage.input_tokens ?? parsed.usage.prompt_tokens) || 0;
          outTok = Number(parsed.usage.output_tokens ?? parsed.usage.completion_tokens) || 0;
        }
      } catch { /* ignore */ }
      recordUsageAndCost(key, {
        keyId: key.id,
        keyName: key.name,
        provider: targetProviderId,
        model: requestedModel,
        inputTokens: inTok,
        outputTokens: outTok,
        durationMs: Date.now() - startTime,
        status: upstreamRes.ok ? 'success' : 'error',
        statusCode: upstreamRes.status,
        error: !upstreamRes.ok ? rawText.slice(0, 250) : undefined,
        streaming: isStreaming,
        ip: clientIp
      });
      res.status(upstreamRes.status).setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
      res.send(rawText);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    if (!upstreamRes.body) {
      res.end();
      return;
    }

    let inTok = 0;
    let outTok = 0;
    let buf = '';
    const dec = new TextDecoder();
    const reader = upstreamRes.body.getReader();
    ac.signal.addEventListener('abort', () => { reader.cancel().catch(() => {}); }, { once: true });

    try {
      while (!ac.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const ev = JSON.parse(payload);
            const usage = ev?.response?.usage || ev?.usage;
            if (usage) {
              inTok = Number(usage.input_tokens ?? usage.prompt_tokens) || inTok;
              outTok = Number(usage.output_tokens ?? usage.completion_tokens) || outTok;
            }
          } catch { /* ignore */ }
        }
      }
    } finally {
      reader.releaseLock();
      res.end();
    }

    recordUsageAndCost(key, {
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
      model: requestedModel,
      inputTokens: inTok,
      outputTokens: outTok,
      durationMs: Date.now() - startTime,
      status: 'success',
      statusCode: 200,
      streaming: true,
      ip: clientIp
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || ac.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    addUsageLog({
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
      model: requestedModel,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      status: 'error',
      statusCode: 500,
      error: err.message || 'Upstream request failed',
      streaming: isStreaming,
      ip: clientIp
    });
    if (!res.headersSent) {
      res.status(500).json({ error: { message: `7Server AI Gateway responses proxy error: ${err.message}`, type: 'api_error' } });
    } else {
      res.end();
    }
  }
}

/** OpenAI Embeddings API (`/v1/embeddings`). */
export async function handleOpenAiEmbeddings(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const key = authenticateVirtualKey(req);

  if (!key) {
    res.status(401).json({
      error: { message: 'Invalid, expired, or disabled 7Server Virtual API Key.', type: 'invalid_request_error', code: 'invalid_api_key' }
    });
    return;
  }
  if (!enforceKeyPolicy(key, res, 'openai')) return;

  const cfg = getInternalConfig();
  const requestedModel = String(req.body?.model || 'text-embedding-3-small');
  const direct = resolveAnyTarget(requestedModel);
  if (direct?.kind === 'oauth') {
    res.status(400).json({ error: { message: 'Embeddings are only supported on API-key providers.', type: 'invalid_request_error' } });
    return;
  }
  const targetProviderId: AiProviderId = direct?.kind === 'apikey' ? direct.provider : 'openai';
  const upstreamModel = direct?.kind === 'apikey' ? direct.model : requestedModel;

  if (key.allowedProviders && !key.allowedProviders.includes(targetProviderId)) {
    res.status(403).json({
      error: { message: `This 7Server virtual key does not have permission to access provider ${targetProviderId}.`, type: 'invalid_request_error' }
    });
    return;
  }

  const provider = cfg.providers[targetProviderId];
  if (!provider || !provider.enabled || (targetProviderId !== 'ollama' && targetProviderId !== 'custom' && !provider.apiKey && !provider.apiKeys?.length)) {
    res.status(503).json({
      error: { message: `Provider ${targetProviderId} is not configured or disabled in 7Server AI Gateway.`, type: 'api_error' }
    });
    return;
  }

  const baseUrl = getApiKeyBaseUrl(targetProviderId, provider.baseUrl);
  const targetUrl = `${baseUrl}/embeddings`;
  const rawKeys = activeApiKeys(provider, targetProviderId === 'ollama' || targetProviderId === 'custom');
  const keyList = rotateRoundRobin(rawKeys, `apikey:${targetProviderId}`, getEffectiveStrategy(cfg, targetProviderId));
  const ac = createResAbortController(res);

  try {
    let upstreamRes: globalThis.Response | undefined;
    for (let i = 0; i < keyList.length; i++) {
      upstreamRes = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(keyList[i] ? { authorization: `Bearer ${keyList[i]}` } : {})
        },
        body: JSON.stringify({ ...req.body, model: upstreamModel }),
        signal: ac.signal
      });
      if (upstreamRes.ok || i + 1 >= keyList.length || !RETRYABLE_UPSTREAM_STATUSES.has(upstreamRes.status)) {
        break;
      }
    }
    upstreamRes = upstreamRes!;
    const rawText = await upstreamRes.text();
    let inTok = 0;
    try {
      const parsed = JSON.parse(rawText);
      if (parsed?.usage) {
        inTok = Number(parsed.usage.prompt_tokens ?? parsed.usage.total_tokens) || 0;
      }
    } catch { /* ignore */ }

    recordUsageAndCost(key, {
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
      model: requestedModel,
      inputTokens: inTok,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      status: upstreamRes.ok ? 'success' : 'error',
      statusCode: upstreamRes.status,
      error: !upstreamRes.ok ? rawText.slice(0, 250) : undefined,
      streaming: false,
      ip: clientIp
    });

    res.status(upstreamRes.status).setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json');
    res.send(rawText);
  } catch (err: any) {
    if (err?.name === 'AbortError' || ac.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    addUsageLog({
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
      model: requestedModel,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - startTime,
      status: 'error',
      statusCode: 500,
      error: err.message || 'Upstream request failed',
      streaming: false,
      ip: clientIp
    });
    if (!res.headersSent) {
      res.status(500).json({ error: { message: `7Server AI Gateway embeddings proxy error: ${err.message}`, type: 'api_error' } });
    } else {
      res.end();
    }
  }
}

export async function handleListModels(req: Request, res: Response): Promise<void> {
  const key = authenticateVirtualKey(req);
  if (!key) {
    res.status(401).json({ error: { message: 'Invalid, expired, or disabled 7Server Virtual API Key.', type: 'invalid_request_error', code: 'invalid_api_key' } });
    return;
  }
  if (key.expiresAt) {
    const exp = Date.parse(key.expiresAt);
    if (Number.isFinite(exp) && Date.now() > exp) {
      res.status(401).json({ error: { message: 'This 7Server virtual API key has expired.', type: 'invalid_request_error', code: 'expired_api_key' } });
      return;
    }
  }

  const staticModels = [
    { id: 'claude-3-7-sonnet-20250219', object: 'model', owned_by: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', object: 'model', owned_by: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', object: 'model', owned_by: 'anthropic' },
    { id: 'claude-3-opus-20240229', object: 'model', owned_by: 'anthropic' },
    { id: 'gpt-4o', object: 'model', owned_by: 'openai' },
    { id: 'gpt-4o-mini', object: 'model', owned_by: 'openai' },
    { id: 'o1', object: 'model', owned_by: 'openai' },
    { id: 'o3-mini', object: 'model', owned_by: 'openai' },
    { id: 'deepseek-chat', object: 'model', owned_by: 'deepseek' },
    { id: 'deepseek-reasoner', object: 'model', owned_by: 'deepseek' },
    { id: 'gemini-2.0-flash', object: 'model', owned_by: 'google' },
    { id: 'gemini-1.5-pro', object: 'model', owned_by: 'google' }
  ];

  const cfg = getInternalConfig();
  const connected = new Set(Object.entries(cfg.providers).filter(([, p]) => p?.connected).map(([id]) => (id === 'gemini' ? 'google' : id)));
  const allowedSet = key.allowedProviders?.length ? new Set<string>(key.allowedProviders) : null;
  const providerAllowed = (ownedBy: string) => {
    if (!allowedSet) return true;
    const normalized = ownedBy === 'google' ? 'gemini' : ownedBy;
    return allowedSet.has(normalized);
  };

  // Connected `<alias>/auto` entries for both OAuth subscription providers and API-key providers
  const subModels = await subscriptionModels();
  const oauthConnectedProviders = new Set(subModels.map((m) => m.owned_by));
  const oauthAutoModels = [...oauthConnectedProviders]
    .filter((p) => providerAllowed(p))
    .map((p) => ({
      id: `${ALIAS_OF[p as keyof typeof ALIAS_OF] || p}/auto`,
      object: 'model' as const,
      owned_by: p
    }));

  const apiKeyConnectedIds = Object.entries(cfg.providers)
    .filter(([, p]) => p?.enabled && p?.connected)
    .map(([id]) => id);
  const apiKeyAutoModels = apiKeyConnectedIds
    .filter((id) => providerAllowed(id))
    .map((id) => ({ id: `${id}/auto`, object: 'model' as const, owned_by: id }));

  const combos = Object.entries(cfg.combos || {})
    .filter(([, targets]) => {
      if (!allowedSet) return true;
      return (targets || []).some((t) => {
        const resolved = resolveAnyTarget(t);
        return resolved ? allowedSet.has(resolved.provider) : false;
      });
    })
    .map(([name]) => ({ id: `${COMBO_PREFIX}${name}`, object: 'model' as const, owned_by: '7server-combo' }));

  const compatModels = COMPAT_PROVIDERS
    .filter((p) => connected.has(p.id) && providerAllowed(p.id))
    .flatMap((p) => {
      const base = cfg.providers[p.id]?.models || (p.sampleModel ? [`${p.id}/${p.sampleModel}`] : []);
      const custom = (cfg.providers[p.id]?.customModels || []).map((m) => (m.includes('/') ? m : `${p.id}/${m}`));
      return Array.from(new Set([...base, ...custom])).map((id) => ({
        id,
        object: 'model' as const,
        owned_by: p.id
      }));
    });

  const coreCustomModels = (['anthropic', 'openai', 'gemini', 'deepseek', 'ollama', 'openrouter'] as AiProviderId[])
    .filter((id) => connected.has(id) && providerAllowed(id))
    .flatMap((id) =>
      (cfg.providers[id]?.customModels || []).map((m) => ({
        id: m.includes('/') ? m : `${id}/${m}`,
        object: 'model' as const,
        owned_by: id
      }))
    );

  const oauthCustomModels = (Object.keys(ALIAS_OF) as Array<keyof typeof ALIAS_OF>)
    .filter((id) => isConnected(id) && providerAllowed(id))
    .flatMap((id) =>
      (cfg.providers[id]?.customModels || []).map((m) => ({
        id: m.includes('/') ? m : `${ALIAS_OF[id]}/${m}`,
        object: 'model' as const,
        owned_by: id
      }))
    );

  res.json({
    object: 'list',
    data: [
      ...combos,
      ...oauthAutoModels,
      ...apiKeyAutoModels,
      ...subModels.filter((m) => providerAllowed(m.owned_by)),
      ...oauthCustomModels,
      ...staticModels.filter((m) => connected.has(m.owned_by) && providerAllowed(m.owned_by)),
      ...compatModels,
      ...coreCustomModels
    ]
  });
}

