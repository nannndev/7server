import fs from 'fs';
import crypto from 'crypto';
import { dataFile } from '../../config.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import type {
  VirtualApiKey,
  AiGatewayConfig,
  AiUsageLog,
  AiProviderId,
  AiGatewayStats
} from './types.js';

const KEYS_FILE = dataFile('ai-gateway-keys.json');
const CONFIG_FILE = dataFile('ai-gateway-config.json');
const USAGE_FILE = dataFile('ai-gateway-usage.json');
const MAX_USAGE_LOGS = 1000;

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function safeWriteJson<T>(filePath: string, data: T): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// ------------------- KEYS STORE -------------------

export function getAllKeys(): VirtualApiKey[] {
  return safeReadJson<VirtualApiKey[]>(KEYS_FILE, []);
}

export function getKeyBySecret(secret: string): VirtualApiKey | null {
  if (!secret) return null;
  const keys = getAllKeys();
  const trimmed = secret.trim();
  return keys.find((k) => k.key === trimmed && k.enabled) || null;
}

export function createVirtualKey(name: string, allowedProviders?: AiProviderId[]): VirtualApiKey {
  const keys = getAllKeys();
  const rawSecret = `7s-sk-${crypto.randomBytes(24).toString('hex')}`;
  const suffix = rawSecret.slice(-4);
  const newKey: VirtualApiKey = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Default Key',
    key: rawSecret,
    keyPrefix: `7s-sk-...${suffix}`,
    createdAt: new Date().toISOString(),
    enabled: true,
    allowedProviders: allowedProviders && allowedProviders.length > 0 ? allowedProviders : undefined,
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };
  keys.unshift(newKey);
  safeWriteJson(KEYS_FILE, keys);
  return newKey;
}

export function deleteVirtualKey(id: string): boolean {
  const keys = getAllKeys();
  const next = keys.filter((k) => k.id !== id);
  if (next.length === keys.length) return false;
  safeWriteJson(KEYS_FILE, next);
  return true;
}

export function toggleVirtualKey(id: string, enabled?: boolean): VirtualApiKey | null {
  const keys = getAllKeys();
  const target = keys.find((k) => k.id === id);
  if (!target) return null;
  target.enabled = typeof enabled === 'boolean' ? enabled : !target.enabled;
  safeWriteJson(KEYS_FILE, keys);
  return target;
}

export function recordKeyUsage(keyId: string, inputTokens: number, outputTokens: number): void {
  const keys = getAllKeys();
  const target = keys.find((k) => k.id === keyId);
  if (!target) return;
  target.lastUsedAt = new Date().toISOString();
  target.totalRequests = (target.totalRequests || 0) + 1;
  target.totalInputTokens = (target.totalInputTokens || 0) + inputTokens;
  target.totalOutputTokens = (target.totalOutputTokens || 0) + outputTokens;
  safeWriteJson(KEYS_FILE, keys);
}

// ------------------- CONFIG STORE -------------------

const DEFAULT_CONFIG: AiGatewayConfig = {
  providers: {
    anthropic: { enabled: false, connected: false, baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-7-sonnet-20250219' },
    openai: { enabled: false, connected: false, baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
    deepseek: { enabled: false, connected: false, baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
    gemini: { enabled: false, connected: false, baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash' },
    openrouter: { enabled: false, connected: false, baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-3.7-sonnet' },
    ollama: { enabled: false, connected: false, baseUrl: 'http://localhost:11434', defaultModel: 'llama3.2' }
  },
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-7-sonnet-20250219'
};

export function getInternalConfig(): AiGatewayConfig {
  const stored = safeReadJson<AiGatewayConfig>(CONFIG_FILE, DEFAULT_CONFIG);
  const cfg: AiGatewayConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    providers: { ...DEFAULT_CONFIG.providers, ...stored.providers }
  };

  // Decrypt API keys for internal proxy use
  for (const p of Object.keys(cfg.providers) as AiProviderId[]) {
    const prov = cfg.providers[p];
    if (prov && prov.apiKey) {
      prov.apiKey = decrypt(prov.apiKey);
    }
  }
  return cfg;
}

export function getClientConfig(): AiGatewayConfig {
  const stored = safeReadJson<AiGatewayConfig>(CONFIG_FILE, DEFAULT_CONFIG);
  const cfg: AiGatewayConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    providers: { ...DEFAULT_CONFIG.providers, ...stored.providers }
  };

  // Mask API keys for safe UI presentation
  for (const p of Object.keys(cfg.providers) as AiProviderId[]) {
    const prov = cfg.providers[p];
    if (prov && prov.apiKey) {
      const decrypted = decrypt(prov.apiKey);
      if (decrypted) {
        const prefix = decrypted.slice(0, 7);
        const suffix = decrypted.slice(-4);
        prov.apiKey = `${prefix}...${suffix}`;
      } else {
        prov.apiKey = '';
      }
    }
  }
  return cfg;
}

export function saveGatewayConfig(updates: Partial<AiGatewayConfig>): AiGatewayConfig {
  const currentStored = safeReadJson<AiGatewayConfig>(CONFIG_FILE, DEFAULT_CONFIG);
  const merged: AiGatewayConfig = {
    ...currentStored,
    ...updates,
    providers: {
      ...currentStored.providers,
      ...(updates.providers || {})
    }
  };

  // Ensure keys are encrypted before writing to disk
  for (const p of Object.keys(merged.providers) as AiProviderId[]) {
    const newProv = updates.providers?.[p];
    const existingProv = currentStored.providers[p];

    if (newProv && typeof newProv.apiKey === 'string') {
      const candidate = newProv.apiKey.trim();
      // If client didn't touch masked key (contains '...'), retain existing encrypted key
      if (candidate.includes('...') && existingProv?.apiKey) {
        merged.providers[p]!.apiKey = existingProv.apiKey;
      } else if (candidate) {
        merged.providers[p]!.apiKey = encrypt(candidate);
      } else {
        merged.providers[p]!.apiKey = '';
      }
    } else if (existingProv?.apiKey) {
      merged.providers[p]!.apiKey = existingProv.apiKey;
    }
  }

  safeWriteJson(CONFIG_FILE, merged);
  return getClientConfig();
}

export function connectProvider(
  providerId: AiProviderId,
  apiKey: string,
  baseUrl?: string,
  latencyMs?: number
): AiGatewayConfig {
  const currentStored = safeReadJson<AiGatewayConfig>(CONFIG_FILE, DEFAULT_CONFIG);
  const target = currentStored.providers[providerId] || {
    enabled: true,
    connected: true,
    baseUrl: ''
  };

  const encryptedKey = apiKey.trim() ? encrypt(apiKey.trim()) : (target.apiKey || '');

  currentStored.providers[providerId] = {
    ...target,
    apiKey: encryptedKey,
    baseUrl: baseUrl || target.baseUrl || '',
    enabled: true,
    connected: true,
    verifiedAt: new Date().toISOString(),
    latencyMs,
    error: undefined
  };

  safeWriteJson(CONFIG_FILE, currentStored);
  return getClientConfig();
}

export function disconnectProvider(providerId: AiProviderId): AiGatewayConfig {
  const currentStored = safeReadJson<AiGatewayConfig>(CONFIG_FILE, DEFAULT_CONFIG);
  if (currentStored.providers[providerId]) {
    currentStored.providers[providerId] = {
      ...currentStored.providers[providerId]!,
      apiKey: '',
      connected: false,
      enabled: false,
      error: undefined
    };
  }
  safeWriteJson(CONFIG_FILE, currentStored);
  return getClientConfig();
}

// ------------------- USAGE STORE -------------------

export function getUsageLogs(limit = 100): AiUsageLog[] {
  const logs = safeReadJson<AiUsageLog[]>(USAGE_FILE, []);
  return logs.slice(0, limit);
}

export function addUsageLog(logData: Omit<AiUsageLog, 'id' | 'timestamp' | 'totalTokens'>): void {
  const logs = safeReadJson<AiUsageLog[]>(USAGE_FILE, []);
  const newLog: AiUsageLog = {
    ...logData,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    totalTokens: (logData.inputTokens || 0) + (logData.outputTokens || 0)
  };
  logs.unshift(newLog);
  if (logs.length > MAX_USAGE_LOGS) {
    logs.length = MAX_USAGE_LOGS;
  }
  safeWriteJson(USAGE_FILE, logs);
}

export function clearUsageLogs(): void {
  safeWriteJson(USAGE_FILE, []);
}

export function getGatewayStats(): AiGatewayStats {
  const keys = getAllKeys();
  const logs = safeReadJson<AiUsageLog[]>(USAGE_FILE, []);

  const totalRequests = logs.length;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const log of logs) {
    totalInputTokens += log.inputTokens || 0;
    totalOutputTokens += log.outputTokens || 0;
  }

  const activeKeysCount = keys.filter((k) => k.enabled).length;
  const cfg = getClientConfig();
  const connectedProvidersCount = Object.values(cfg.providers).filter(
    (p) => p && p.connected
  ).length;

  return {
    totalRequests,
    totalInputTokens,
    totalOutputTokens,
    activeKeysCount,
    connectedProvidersCount
  };
}

