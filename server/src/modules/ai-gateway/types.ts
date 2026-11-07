export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
  // OpenAI-compatible API-key providers (see compatProviders.ts)
  | 'groq' | 'mistral' | 'xai' | 'together' | 'fireworks' | 'cerebras' | 'perplexity' | 'moonshot' | 'dashscope' | 'zai' | 'minimax' | 'nvidia' | 'custom'
  // logged-in subscription accounts (OAuth)
  | 'claude' | 'codex' | 'copilot' | 'gemini-cli';

export interface VirtualApiKey {
  id: string;
  name: string;
  /** Full key: only present in the response that creates it. Never stored. */
  key?: string;
  /** sha256 of the full key, hex. What is stored and compared. */
  keyHash?: string;
  keyPrefix: string;        // masked prefix e.g. "7s-sk-...a1b2"
  createdAt: string;
  lastUsedAt?: string;
  enabled: boolean;
  rateLimitPerMin?: number;
  allowedProviders?: AiProviderId[];
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ProviderConfig {
  apiKey?: string;          // Encrypted at rest, masked in UI
  baseUrl?: string;         // Custom base URL
  enabled: boolean;
  connected?: boolean;      // Verified and active
  verifiedAt?: string;      // ISO timestamp of last successful check
  latencyMs?: number;
  defaultModel?: string;
  /** Models the key could list when it was verified (OpenAI-compatible providers), "<id>/<model>". */
  models?: string[];
  error?: string;
}

export interface AiGatewayConfig {
  providers: Partial<Record<AiProviderId, ProviderConfig>>;
  defaultProvider: AiProviderId;
  defaultModel: string;
  /** Fallback chains: model "auto/<name>" tries each `alias/model` in order (9Router "combo"). */
  combos?: Record<string, string[]>;
}

export interface ProviderVerificationResult {
  providerId: AiProviderId;
  valid: boolean;
  latencyMs?: number;
  models?: string[];
  error?: string;
}

export interface AiUsageLog {
  id: string;
  timestamp: string;
  keyId: string;
  keyName: string;
  provider: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  status: 'success' | 'error';
  statusCode: number;
  error?: string;
  streaming: boolean;
  ip?: string;
}

export interface AiGatewayStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  activeKeysCount: number;
  connectedProvidersCount: number;
}
