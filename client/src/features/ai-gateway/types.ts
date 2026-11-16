export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
  | 'groq' | 'mistral' | 'xai' | 'together' | 'fireworks' | 'cerebras' | 'perplexity' | 'moonshot' | 'dashscope' | 'zai' | 'minimax' | 'nvidia' | 'deepinfra' | 'sambanova' | 'custom';

export type RoutingStrategy = 'ordered' | 'round_robin';

export interface VirtualApiKey {
  id: string;
  name: string;
  /** Full key: only in the response that creates it (stored as a hash). */
  key?: string;
  keyPrefix: string;
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
  apiKey: string;
  addedAt: string;
  enabled?: boolean;
}

export interface ProviderConfig {
  apiKey?: string;
  apiKeys?: ProviderApiKeyAccount[];
  baseUrl?: string;
  enabled: boolean;
  connected?: boolean;
  verifiedAt?: string;
  latencyMs?: number;
  defaultModel?: string;
  /** Models found when the key was verified (server fills this on connect). */
  models?: string[];
  customModels?: string[];
  error?: string;
  routingStrategy?: RoutingStrategy;
}

export interface AiGatewayConfig {
  providers: Partial<Record<AiProviderId, ProviderConfig>>;
  defaultProvider: AiProviderId;
  defaultModel: string;
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

// Subscription accounts logged in via OAuth (9Router style). Model ids are `alias/model`.
export type OAuthProviderId = 'claude' | 'codex' | 'copilot' | 'gemini-cli' | 'kimi' | 'kilocode' | 'muse' | 'nous';
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
export interface SubscriptionAccount {
  id: string;
  provider: OAuthProviderId;
  label?: string;
  email?: string;
  enabled?: boolean;
  connectedAt: string;
  refreshedAt?: string;
  expiresAt?: number;
  lastError?: string;
}
export type LoginStart =
  | { kind: 'redirect'; sessionId: string; authUrl: string; redirectUri: string; autoCallback?: boolean }
  | { kind: 'device'; sessionId: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };

export interface QuotaWindow { name: string; usedPercent: number; resetsAt?: string; used?: number; total?: number }
export interface AccountGatewayStats {
  todayRequests: number;
  todayTokens: number;
  totalRequests: number;
  totalTokens: number;
}
export interface AccountUsage {
  accountId?: string;
  provider: OAuthProviderId;
  plan?: string;
  windows: QuotaWindow[];
  exhausted: boolean;
  checkedAt: string;
  error?: string;
  gatewayStats?: AccountGatewayStats;
}
