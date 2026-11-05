import type { AiProviderId, ProviderVerificationResult } from './types.js';

export async function verifyProviderConnection(
  providerId: AiProviderId,
  apiKey: string,
  customBaseUrl?: string
): Promise<ProviderVerificationResult> {
  const t0 = Date.now();
  const trimmedKey = apiKey?.trim();

  try {
    if (providerId === 'anthropic') {
      if (!trimmedKey) {
        return { providerId, valid: false, error: 'API key is required for Anthropic' };
      }
      const baseUrl = (customBaseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': trimmedKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }]
        })
      });

      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return {
          providerId,
          valid: true,
          latencyMs,
          models: [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229'
          ]
        };
      }

      const errText = await res.text();
      let errMsg = `Anthropic returned HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed.error?.message || errMsg;
      } catch {}
      return { providerId, valid: false, error: errMsg };
    }

    if (providerId === 'openai') {
      if (!trimmedKey) {
        return { providerId, valid: false, error: 'API key is required for OpenAI' };
      }
      const baseUrl = (customBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${trimmedKey}` }
      });

      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return {
          providerId,
          valid: true,
          latencyMs,
          models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo']
        };
      }

      const errText = await res.text();
      let errMsg = `OpenAI returned HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText);
        errMsg = parsed.error?.message || errMsg;
      } catch {}
      return { providerId, valid: false, error: errMsg };
    }

    if (providerId === 'deepseek') {
      if (!trimmedKey) {
        return { providerId, valid: false, error: 'API key is required for DeepSeek' };
      }
      const baseUrl = (customBaseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/models`, {
        headers: { authorization: `Bearer ${trimmedKey}` }
      });

      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return {
          providerId,
          valid: true,
          latencyMs,
          models: ['deepseek-chat', 'deepseek-reasoner']
        };
      }

      return { providerId, valid: false, error: `DeepSeek returned HTTP ${res.status}` };
    }

    if (providerId === 'gemini') {
      if (!trimmedKey) {
        return { providerId, valid: false, error: 'API key is required for Gemini' };
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`
      );
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return {
          providerId,
          valid: true,
          latencyMs,
          models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
        };
      }
      return { providerId, valid: false, error: `Google Gemini returned HTTP ${res.status}` };
    }

    if (providerId === 'openrouter') {
      if (!trimmedKey) {
        return { providerId, valid: false, error: 'API key is required for OpenRouter' };
      }
      const res = await fetch(`https://openrouter.ai/api/v1/auth/key`, {
        headers: { authorization: `Bearer ${trimmedKey}` }
      });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return {
          providerId,
          valid: true,
          latencyMs,
          models: [
            'anthropic/claude-3.7-sonnet',
            'openai/gpt-4o',
            'deepseek/deepseek-r1',
            'google/gemini-2.0-flash'
          ]
        };
      }
      return { providerId, valid: false, error: `OpenRouter returned HTTP ${res.status}` };
    }

    if (providerId === 'ollama') {
      const baseUrl = (customBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/tags`);
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        const data: any = await res.json().catch(() => ({}));
        const models = Array.isArray(data.models) ? data.models.map((m: any) => m.name) : ['llama3.2'];
        return {
          providerId,
          valid: true,
          latencyMs,
          models: models.length > 0 ? models : ['llama3.2']
        };
      }
      return { providerId, valid: false, error: `Ollama at ${baseUrl} returned HTTP ${res.status}` };
    }

    return { providerId, valid: false, error: `Unknown provider ${providerId}` };
  } catch (err: any) {
    return {
      providerId,
      valid: false,
      error: `Connection error: ${err.message || 'Network failure'}`
    };
  }
}

