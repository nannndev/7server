import type { Request, Response } from 'express';
import {
  getKeyBySecret,
  recordKeyUsage,
  getInternalConfig,
  addUsageLog
} from './store.js';
import type { VirtualApiKey, AiProviderId } from './types.js';
import { resolveModel, subscriptionChat, subscriptionModels, UpstreamError } from './subscription.js';

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
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
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

  if (key.allowedProviders && !key.allowedProviders.includes('anthropic')) {
    res.status(403).json({
      type: 'error',
      error: {
        type: 'permission_error',
        message: 'This 7Server virtual key does not have permission to access the Anthropic provider.'
      }
    });
    return;
  }

  const cfg = getInternalConfig();
  const provider = cfg.providers.anthropic;

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
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
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

  // 9Router-style "alias/model" (cc/, cx/, gh/, gc/) → logged-in subscription account.
  const sub = resolveModel(req.body?.model);
  if (sub) {
    if (key.allowedProviders && !key.allowedProviders.includes(sub.provider as AiProviderId)) {
      res.status(403).json({ error: { message: `This 7Server virtual key does not have permission to access provider ${sub.provider}.`, type: 'invalid_request_error' } });
      return;
    }
    try {
      if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
        res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
        return;
      }
      const out = await subscriptionChat(req, res, req.body, sub);
      recordKeyUsage(key.id, out.inTok, out.outTok);
      addUsageLog({ keyId: key.id, keyName: key.name, provider: sub.provider as AiProviderId, model: req.body.model, inputTokens: out.inTok, outputTokens: out.outTok,
        durationMs: Date.now() - startTime, status: 'success', statusCode: 200, streaming: !!req.body.stream, ip: clientIp });
    } catch (err: any) {
      const status = err instanceof UpstreamError ? err.status : 502;
      addUsageLog({ keyId: key.id, keyName: key.name, provider: sub.provider as AiProviderId, model: String(req.body?.model), inputTokens: 0, outputTokens: 0,
        durationMs: Date.now() - startTime, status: 'error', statusCode: status, error: String(err.message).slice(0, 250), streaming: !!req.body?.stream, ip: clientIp });
      if (!res.headersSent) res.status(status).json({ error: { message: err.message, type: 'api_error' } });
      else res.end();
    }
    return;
  }

  const cfg = getInternalConfig();
  const model = req.body?.model || 'gpt-4o';
  let targetProviderId: AiProviderId = 'openai';

  if (model.toLowerCase().includes('deepseek')) {
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
  if (!provider || !provider.enabled || (targetProviderId !== 'ollama' && !provider.apiKey)) {
    res.status(503).json({
      error: {
        message: `Provider ${targetProviderId} is not configured or disabled in 7Server AI Gateway.`,
        type: 'api_error'
      }
    });
    return;
  }

  const isStreaming = Boolean(req.body?.stream);
  const baseUrl = (provider.baseUrl || (targetProviderId === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com/v1')).replace(/\/+$/, '');
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
    data: [...(await subscriptionModels()), ...staticModels.filter((m) => connected.has(m.owned_by))]
  });
}

