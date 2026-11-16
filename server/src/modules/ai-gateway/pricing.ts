/**
 * Token pricing catalog (USD per 1M tokens) for AI Gateway cost estimation.
 * Prices reflect approximate public list rates and serve as observability estimates
 * (subscription / OAuth providers still estimate equivalent API value when tokens are known).
 */

export interface ModelPricing {
  /** USD per 1,000,000 input tokens */
  inputPerMillion: number;
  /** USD per 1,000,000 output tokens */
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gpt-4.1': { inputPerMillion: 2.0, outputPerMillion: 8.0 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4.1-nano': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  'gpt-5-nano': { inputPerMillion: 0.05, outputPerMillion: 0.4 },
  'o1': { inputPerMillion: 15, outputPerMillion: 60 },
  'o3': { inputPerMillion: 2, outputPerMillion: 8 },
  'o3-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'o4-mini': { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  'text-embedding-3-small': { inputPerMillion: 0.02, outputPerMillion: 0 },
  'text-embedding-3-large': { inputPerMillion: 0.13, outputPerMillion: 0 },
  'text-embedding-ada-002': { inputPerMillion: 0.1, outputPerMillion: 0 },

  // Anthropic Claude
  'claude-opus-4-6': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-opus-4-5': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-opus-4': { inputPerMillion: 15, outputPerMillion: 75 },
  'claude-sonnet-4-6': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-sonnet-4': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-7-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-3-5-sonnet': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-haiku-4-5': { inputPerMillion: 0.8, outputPerMillion: 4 },
  'claude-3-5-haiku': { inputPerMillion: 0.8, outputPerMillion: 4 },

  // Google Gemini
  'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10 },
  'gemini-2.5-flash': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  'gemini-2.5-flash-lite': { inputPerMillion: 0.075, outputPerMillion: 0.3 },
  'gemini-2.0-flash': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  'gemini-1.5-pro': { inputPerMillion: 1.25, outputPerMillion: 5 },
  'gemini-1.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // DeepSeek
  'deepseek-chat': { inputPerMillion: 0.27, outputPerMillion: 1.1 },
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19 },

  // MiniMax / Zhipu GLM / Qwen / Kimi
  'minimax-m2.5': { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  'minimax-m2.7': { inputPerMillion: 0.3, outputPerMillion: 1.2 },
  'glm-4.7': { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  'glm-5': { inputPerMillion: 0.5, outputPerMillion: 2.0 },
  'qwen3-coder-plus': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'qwen3-max': { inputPerMillion: 1.2, outputPerMillion: 6.0 },
  'kimi-k2': { inputPerMillion: 0.6, outputPerMillion: 2.5 },
  'kimi-for-coding': { inputPerMillion: 0.6, outputPerMillion: 2.5 },

  // Llama / Groq / Open weights
  'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
};

/**
 * Strip provider alias prefix (e.g. `cc/claude-sonnet-4-6` -> `claude-sonnet-4-6`,
 * `openrouter/openai/gpt-4o` -> `gpt-4o`) and match exact or longest prefix.
 */
export function lookupModelPricing(model: string): ModelPricing {
  const clean = (model || '').trim().toLowerCase();
  if (!clean) return { inputPerMillion: 0, outputPerMillion: 0 };

  const lastSegment = clean.includes('/') ? clean.split('/').pop()! : clean;

  if (MODEL_PRICING[lastSegment]) return MODEL_PRICING[lastSegment];

  // Longest prefix match (handles dated tags like gpt-4o-2024-11-20 or claude-sonnet-4-5-20250929)
  let bestKey = '';
  for (const key of Object.keys(MODEL_PRICING)) {
    if (lastSegment.startsWith(key) && key.length > bestKey.length) {
      bestKey = key;
    }
  }
  if (bestKey) return MODEL_PRICING[bestKey];

  // Heuristic fallbacks by family/tier
  if (lastSegment.includes('ollama') || lastSegment.includes(':local') || clean.startsWith('ol/')) {
    return { inputPerMillion: 0, outputPerMillion: 0 };
  }
  if (lastSegment.includes('opus')) return { inputPerMillion: 15, outputPerMillion: 75 };
  if (lastSegment.includes('sonnet')) return { inputPerMillion: 3, outputPerMillion: 15 };
  if (lastSegment.includes('haiku')) return { inputPerMillion: 0.8, outputPerMillion: 4 };
  if (lastSegment.includes('nano') || lastSegment.includes('mini') || lastSegment.includes('flash') || lastSegment.includes('8b')) {
    return { inputPerMillion: 0.15, outputPerMillion: 0.6 };
  }
  if (lastSegment.includes('embed')) return { inputPerMillion: 0.05, outputPerMillion: 0 };

  return { inputPerMillion: 1.0, outputPerMillion: 3.0 };
}

/**
 * Estimate cost in USD rounded to 6 decimal places.
 */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const safeIn = Math.max(0, Number(inputTokens) || 0);
  const safeOut = Math.max(0, Number(outputTokens) || 0);
  if (safeIn === 0 && safeOut === 0) return 0;

  const pricing = lookupModelPricing(model);
  const raw = (safeIn / 1_000_000) * pricing.inputPerMillion + (safeOut / 1_000_000) * pricing.outputPerMillion;
  return Math.round(raw * 1_000_000) / 1_000_000;
}

