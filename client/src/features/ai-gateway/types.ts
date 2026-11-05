export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter';

export interface VirtualApiKey {
  id: string;
  name: string;
  key: string;
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

export interface ProviderConfig {
  apiKey?: string;
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
