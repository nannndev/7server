export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter'
  | 'groq' | 'mistral' | 'xai' | 'together' | 'fireworks' | 'cerebras' | 'perplexity' | 'moonshot' | 'dashscope' | 'zai' | 'minimax' | 'nvidia' | 'custom';

export interface VirtualApiKey {
  id: string;
  name: string;
  /** Full key: only in the response that creates it (stored as a hash). */
  key?: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  enabled: boolean;
  rateLimitPerMin?: number;
  allowedProviders?: AiProviderId[];
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface ProviderApiKeyAccount {
  id: string;
  label?: string;
  apiKey: string;
  addedAt: string;
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
  error?: string;
}

export interface AiGatewayConfig {
  providers: Partial<Record<AiProviderId, ProviderConfig>>;
  defaultProvider: AiProviderId;
  defaultModel: string;
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

// Subscription accounts logged in via OAuth (9Router style). Model ids are `alias/model`.
export type OAuthProviderId = 'claude' | 'codex' | 'copilot' | 'gemini-cli' | 'kimi' | 'kilocode' | 'muse' | 'nous';
export interface SubscriptionAccount {
  id: string;
  provider: OAuthProviderId;
  label?: string;
  email?: string;
  connectedAt: string;
  refreshedAt?: string;
  expiresAt?: number;
  lastError?: string;
}
export type LoginStart =
  | { kind: 'redirect'; sessionId: string; authUrl: string; redirectUri: string; autoCallback?: boolean }
  | { kind: 'device'; sessionId: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };

export interface QuotaWindow { name: string; usedPercent: number; resetsAt?: string; used?: number; total?: number }
export interface AccountUsage { accountId?: string; provider: OAuthProviderId; plan?: string; windows: QuotaWindow[]; exhausted: boolean; checkedAt: string; error?: string }
