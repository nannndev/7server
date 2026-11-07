import type { Request, Response } from 'express';
import {
  getKeyBySecret,
  recordKeyUsage,
  getInternalConfig,
  addUsageLog
} from './store.js';
import type { VirtualApiKey, AiProviderId } from './types.js';
import { resolveModel, subscriptionChat, subscriptionModels, claudeMessages, UpstreamError, comboName, isRetryable, COMBO_PREFIX } from './subscription.js';
import { isCoolingDown } from './usage.js';
import { isConnected } from './accounts.js';
import { resolveCompatModel, COMPAT_PROVIDERS } from './compatProviders.js';

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
      const out = await claudeMessages(req, res, body, req.path.endsWith('count_tokens') ? '/v1/messages/count_tokens' : '/v1/messages');
      recordKeyUsage(key.id, out.inTok, out.outTok);
      addUsageLog({ keyId: key.id, keyName: key.name, provider: 'claude', model: requested, inputTokens: out.inTok, outputTokens: out.outTok,
        durationMs: Date.now() - startTime, status: out.status < 400 ? 'success' : 'error', statusCode: out.status, error: out.error, streaming: !!req.body?.stream, ip: clientIp });
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

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(req.body)
    });

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

      recordKeyUsage(key.id, inputTokens, outputTokens);
      addUsageLog({
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
    let aborted = false;

    req.on('close', () => {
      aborted = true;
      reader.cancel().catch(() => {});
    });

    while (!aborted) {
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

    res.end();

    const durationMs = Date.now() - startTime;
    recordKeyUsage(key.id, inputTokens, outputTokens);
    addUsageLog({
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

export async function handleOpenAiChatCompletions(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || ''; // trusted only via TRUST_PROXY
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

  // 9Router-style "alias/model" (cc/, cx/, gh/, gc/) → logged-in subscription account, or a combo
  // "auto/<name>" that tries each target in order until one answers.
  const combo = comboName(req.body?.model);
  const chain = combo ? getInternalConfig().combos?.[combo] : undefined;
  if (combo && !chain?.length) {
    res.status(404).json({ error: { message: `Unknown combo "${combo}". Define it in 7Server → AI Gateway → Combos.`, type: 'invalid_request_error' } });
    return;
  }
  const targets = (chain || [String(req.body?.model || '')]).map(resolveModel).filter((t): t is NonNullable<typeof t> => !!t);
  if (targets.length) {
    if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
      res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
      return;
    }
    const allowed = targets.filter((t) => !key.allowedProviders || key.allowedProviders.includes(t.provider as AiProviderId));
    if (!allowed.length) {
      res.status(403).json({ error: { message: `This 7Server virtual key does not have permission to access provider ${targets[0].provider}.`, type: 'invalid_request_error' } });
      return;
    }
    // Accounts that just returned 429 go last instead of being retried first.
    const ordered = [...allowed.filter((t) => !isCoolingDown(t.provider)), ...allowed.filter((t) => isCoolingDown(t.provider))];
    const tried: string[] = [];
    let lastErr: any;
    for (const target of ordered) {
      const name = `${target.provider}/${target.model}`;
      try {
        const out = await subscriptionChat(req, res, req.body, target);
        recordKeyUsage(key.id, out.inTok, out.outTok);
        addUsageLog({ keyId: key.id, keyName: key.name, provider: target.provider as AiProviderId, model: combo ? `auto/${combo} → ${name}` : String(req.body.model), inputTokens: out.inTok, outputTokens: out.outTok,
          durationMs: Date.now() - startTime, status: 'success', statusCode: 200, streaming: !!req.body.stream, ip: clientIp, ...(tried.length ? { error: `fell back after: ${tried.join(', ')}` } : {}) });
        return;
      } catch (err: any) {
        lastErr = err;
        tried.push(`${name} (${err instanceof UpstreamError ? err.status : 'error'})`);
        // Once bytes went out the stream can't be restarted on another account.
        if (res.headersSent || !combo || !isRetryable(err)) break;
      }
    }
    const status = lastErr instanceof UpstreamError ? lastErr.status : 502;
    addUsageLog({ keyId: key.id, keyName: key.name, provider: ordered[0].provider as AiProviderId, model: String(req.body?.model), inputTokens: 0, outputTokens: 0,
      durationMs: Date.now() - startTime, status: 'error', statusCode: status, error: `${tried.join(' → ')}: ${String(lastErr?.message).slice(0, 200)}`, streaming: !!req.body?.stream, ip: clientIp });
    if (!res.headersSent) res.status(status).json({ error: { message: combo ? `All targets of auto/${combo} failed: ${tried.join(', ')}. Last: ${lastErr?.message}` : lastErr?.message, type: 'api_error' } });
    else res.end();
    return;
  }

  const cfg = getInternalConfig();
  const model = req.body?.model || 'gpt-4o';
  let targetProviderId: AiProviderId = 'openai';
  // "groq/llama-3.3-70b", "openrouter/anthropic/claude-sonnet-4"... → that provider, model sent without the prefix.
  const compat = resolveCompatModel(model);
  const upstreamBody = compat ? { ...req.body, model: compat.model } : req.body;

  if (compat) {
    targetProviderId = compat.provider.id;
  } else if (model.toLowerCase().includes('deepseek')) {
    targetProviderId = 'deepseek';
  } else if (model.toLowerCase().includes('llama') || model.toLowerCase().includes('mistral') || model.toLowerCase().includes('qwen')) {
    if (cfg.providers.ollama?.enabled) {
      targetProviderId = 'ollama';
    }
  }

  if (key.allowedProviders && !key.allowedProviders.includes(targetProviderId)) {
    res.status(403).json({
      error: {
        message: `This 7Server virtual key does not have permission to access provider ${targetProviderId}.`,
        type: 'invalid_request_error'
      }
    });
    return;
  }

  const provider = cfg.providers[targetProviderId];
  // Ollama and a custom endpoint (local LiteLLM/vLLM/LM Studio) may run without a key.
  if (!provider || !provider.enabled || (targetProviderId !== 'ollama' && targetProviderId !== 'custom' && !provider.apiKey)) {
    res.status(503).json({
      error: {
        message: `Provider ${targetProviderId} is not configured or disabled in 7Server AI Gateway.`,
        type: 'api_error'
      }
    });
    return;
  }

  const isStreaming = Boolean(req.body?.stream);
  const baseUrl = (provider.baseUrl || compat?.provider.baseUrl || (targetProviderId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
  const targetUrl = `${baseUrl}/chat/completions`;

  const upstreamHeaders: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (provider.apiKey) {
    upstreamHeaders['authorization'] = `Bearer ${provider.apiKey}`;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(upstreamBody)
    });

    if (!isStreaming) {
      const rawText = await upstreamRes.text();
      const durationMs = Date.now() - startTime;
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

      recordKeyUsage(key.id, inputTokens, outputTokens);
      addUsageLog({
        keyId: key.id,
        keyName: key.name,
        provider: targetProviderId,
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

    if (!upstreamRes.ok) {
      const errorText = await upstreamRes.text();
      const durationMs = Date.now() - startTime;
      addUsageLog({
        keyId: key.id,
        keyName: key.name,
        provider: targetProviderId,
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
    let aborted = false;

    req.on('close', () => {
      aborted = true;
      reader.cancel().catch(() => {});
    });

    while (!aborted) {
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
                outputTokens = Number(eventData.usage.completion_tokens) || outputTokens;
              } else if (eventData.choices?.[0]?.delta?.content) {
                // Approximate 1 token per 4 chars if usage not sent in chunk
                outputTokens += Math.max(1, Math.round(eventData.choices[0].delta.content.length / 4));
              }
            } catch {
              // ignore
            }
          }
        }
      }
    }

    res.end();

    const durationMs = Date.now() - startTime;
    recordKeyUsage(key.id, inputTokens, outputTokens);
    addUsageLog({
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
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
    const durationMs = Date.now() - startTime;
    addUsageLog({
      keyId: key.id,
      keyName: key.name,
      provider: targetProviderId,
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
        error: {
          message: `7Server AI Gateway proxy error: ${err.message}`,
          type: 'api_error'
        }
      });
    } else {
      res.end();
    }
  }
}

export async function handleListModels(req: Request, res: Response): Promise<void> {
  if (!authenticateVirtualKey(req)) {
    res.status(401).json({ error: { message: 'Invalid, expired, or disabled 7Server Virtual API Key.', type: 'invalid_request_error', code: 'invalid_api_key' } });
    return;
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
  res.json({
    object: 'list',
    data: [
      ...Object.keys(getInternalConfig().combos || {}).map((name) => ({ id: `${COMBO_PREFIX}${name}`, object: 'model', owned_by: '7server-combo' })),
      ...(await subscriptionModels()),
      ...staticModels.filter((m) => connected.has(m.owned_by)),
      // Connected OpenAI-compatible providers: the models found when the key was verified, already prefixed.
      ...COMPAT_PROVIDERS.filter((p) => connected.has(p.id)).flatMap((p) =>
        (cfg.providers[p.id]?.models || (p.sampleModel ? [`${p.id}/${p.sampleModel}`] : [])).map((id) => ({ id, object: 'model', owned_by: p.id })))
    ]
  });
}

