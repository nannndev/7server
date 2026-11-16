export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
  // OpenAI-compatible API-key providers (see compatProviders.ts)
  | 'groq' | 'mistral' | 'xai' | 'together' | 'fireworks' | 'cerebras' | 'perplexity' | 'moonshot' | 'dashscope' | 'zai' | 'minimax' | 'nvidia' | 'deepinfra' | 'sambanova' | 'custom'
  // logged-in subscription accounts (OAuth)
  | 'claude' | 'codex' | 'copilot' | 'gemini-cli' | 'kimi' | 'kilocode' | 'muse' | 'nous';

export type RoutingStrategy = 'ordered' | 'round_robin';

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
  expiresAt?: string;
  enabled: boolean;
  rateLimitPerMin?: number;
  maxBudgetUsd?: number;
  maxTokens?: number;
  allowedProviders?: AiProviderId[];
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd?: number;
}

export interface ProviderApiKeyAccount {
  id: string;
  label?: string;
  apiKey: string;          // Encrypted at rest, masked in UI
  addedAt: string;
  enabled?: boolean;
}

export interface ProviderConfig {
  apiKey?: string;          // Encrypted at rest, masked in UI
  apiKeys?: ProviderApiKeyAccount[]; // Ordered multi-account API keys for rotation
  baseUrl?: string;         // Custom base URL
  enabled: boolean;
  connected?: boolean;      // Verified and active
  verifiedAt?: string;      // ISO timestamp of last successful check
  latencyMs?: number;
  defaultModel?: string;
  /** Models the key could list when it was verified (OpenAI-compatible providers), "<id>/<model>". */
  models?: string[];
  /** User-added custom model IDs for this provider (works for both API-key and OAuth providers). */
  customModels?: string[];
  error?: string;
  routingStrategy?: RoutingStrategy;
}

export interface AiGatewayConfig {
  providers: Partial<Record<AiProviderId, ProviderConfig>>;
  defaultProvider: AiProviderId;
  defaultModel: string;
  /** Fallback chains: model "auto/<name>" tries each `alias/model` in order (9Router "combo"). */
  combos?: Record<string, string[]>;
  routingStrategy?: RoutingStrategy;
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
  costUsd?: number;
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
  totalCostUsd?: number;
  activeKeysCount: number;
  connectedProvidersCount: number;
}

export type UsageRange = '1d' | '7d' | '30d' | 'all';

export interface UsageSeriesPoint {
  bucket: string;
  label: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgDurationMs: number;
}

export interface UsageGroupRow {
  key: string;
  label?: string;
  provider?: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgDurationMs: number;
  sharePct: number;
}

export interface UsageAnalytics {
  range: UsageRange;
  tzOffsetMin: number;
  keyId?: string;
  summary: {
    requests: number;
    successCount: number;
    errorCount: number;
    successRate: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    avgDurationMs: number;
    uniqueModels: number;
    uniqueProviders: number;
  };
  series: UsageSeriesPoint[];
  byModel: UsageGroupRow[];
  byProvider: UsageGroupRow[];
  byKey: UsageGroupRow[];
}
