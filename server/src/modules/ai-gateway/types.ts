export type AiProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openrouter';

export interface VirtualApiKey {
  id: string;
  name: string;
  key: string;              // full key e.g. "7s-sk-..."
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
