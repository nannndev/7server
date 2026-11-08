// API-key providers that speak the OpenAI chat-completions protocol. Adding one = one entry here
// (+ its card on the client). Requests pick a provider by model prefix: "groq/llama-3.3-70b-versatile".
import type { AiProviderId } from './types.js';

export interface CompatProvider {
  /** Model prefix and provider id. */
  id: AiProviderId;
  baseUrl: string;
  /** A cheap model the verifier and docs mention; not used for routing. */
  sampleModel: string;
}

export const COMPAT_PROVIDERS: CompatProvider[] = [
  { id: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', sampleModel: 'openai/gpt-4o-mini' },
  { id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', sampleModel: 'llama-3.3-70b-versatile' },
  { id: 'mistral', baseUrl: 'https://api.mistral.ai/v1', sampleModel: 'mistral-small-latest' },
  { id: 'xai', baseUrl: 'https://api.x.ai/v1', sampleModel: 'grok-3-mini' },
  { id: 'together', baseUrl: 'https://api.together.xyz/v1', sampleModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { id: 'fireworks', baseUrl: 'https://api.fireworks.ai/inference/v1', sampleModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct' },
  { id: 'cerebras', baseUrl: 'https://api.cerebras.ai/v1', sampleModel: 'llama-3.3-70b' },
  { id: 'perplexity', baseUrl: 'https://api.perplexity.ai', sampleModel: 'sonar' },
  { id: 'moonshot', baseUrl: 'https://api.moonshot.ai/v1', sampleModel: 'kimi-k2-0711-preview' },
  { id: 'dashscope', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', sampleModel: 'qwen-plus' },
  { id: 'zai', baseUrl: 'https://api.z.ai/api/paas/v4', sampleModel: 'glm-4.5' },
  { id: 'minimax', baseUrl: 'https://api.minimax.io/v1', sampleModel: 'MiniMax-M1' },
  { id: 'nvidia', baseUrl: 'https://integrate.api.nvidia.com/v1', sampleModel: 'meta/llama-3.3-70b-instruct' },
  // Any other OpenAI-compatible endpoint (LiteLLM, vLLM, LM Studio, a self-hosted proxy): base URL is required.
  { id: 'custom', baseUrl: '', sampleModel: '' }
];

const BY_ID = new Map(COMPAT_PROVIDERS.map((p) => [p.id as string, p]));
export const compatProvider = (id: string) => BY_ID.get(id);

/** "groq/llama-3.3-70b" → { provider: groq, model: "llama-3.3-70b" }. OpenRouter keeps its own vendor/model ids after the prefix. */
export function resolveCompatModel(model: unknown): { provider: CompatProvider; model: string } | null {
  const m = String(model || '');
  const i = m.indexOf('/');
  if (i <= 0) return null;
  const provider = BY_ID.get(m.slice(0, i));
  const rest = m.slice(i + 1);
  return provider && rest ? { provider, model: rest } : null;
}
