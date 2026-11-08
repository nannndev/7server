import crypto from 'crypto';
import { listDocs, replaceDocs, getKv, setKv, appendUsage, readUsageRows, allUsageRows, clearUsage, compact } from '../../infra/db.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { COMPAT_PROVIDERS } from './compatProviders.js';
import type {
  VirtualApiKey,
  AiGatewayConfig,
  AiUsageLog,
  AiProviderId,
  AiGatewayStats
} from './types.js';

const MAX_USAGE_LOGS = 1000; // returned to the UI; the table keeps more and trims itself

// Keys are documents, config is one value, usage is an append-only table (infra/db.ts).
const readKeys = () => listDocs<VirtualApiKey>('ai_keys');
const writeKeys = (keys: VirtualApiKey[]) => replaceDocs('ai_keys', keys, (k) => k.id);
const readConfig = () => getKv<AiGatewayConfig>('ai_gateway_config', DEFAULT_CONFIG);
const writeConfig = (cfg: AiGatewayConfig) => setKv('ai_gateway_config', cfg);

// ------------------- KEYS STORE -------------------

// Keys are stored as a sha256 hash only. A 24-byte random secret needs no salt or slow hash: it can't
// be guessed, and a hash lets every request look it up without being able to recover the key.
export const hashKey = (secret: string) => crypto.createHash('sha256').update(secret.trim()).digest('hex');

/** Older rows stored the key itself: hash it once, drop the plain value. */
function upgradeStoredKeys(keys: VirtualApiKey[]): VirtualApiKey[] {
  let changed = false;
  for (const k of keys) {
    if (k.key && !k.keyHash) { k.keyHash = hashKey(k.key); changed = true; }
    if (k.key) { delete k.key; changed = true; }
  }
  if (changed) { writeKeys(keys); compact(); } // one-time: scrub the old plain keys from the file
  return keys;
}

/** Keys as stored (hash, never the secret). */
export function getAllKeys(): VirtualApiKey[] {
  return upgradeStoredKeys(readKeys());
}

/** For API responses: no hash either. */
export const publicKey = ({ keyHash, key, ...rest }: VirtualApiKey): VirtualApiKey => rest;

export function getKeyBySecret(secret: string): VirtualApiKey | null {
  if (!secret) return null;
  const h = Buffer.from(hashKey(secret), 'hex');
  return getAllKeys().find((k) => k.enabled && k.keyHash && crypto.timingSafeEqual(Buffer.from(k.keyHash, 'hex'), h)) || null;
}

export function createVirtualKey(name: string, allowedProviders?: AiProviderId[]): VirtualApiKey {
  const keys = getAllKeys();
  const rawSecret = `7s-sk-${crypto.randomBytes(24).toString('hex')}`;
  const suffix = rawSecret.slice(-4);
  const newKey: VirtualApiKey = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Default Key',
    keyHash: hashKey(rawSecret),
    keyPrefix: `7s-sk-...${suffix}`,
    createdAt: new Date().toISOString(),
    enabled: true,
    allowedProviders: allowedProviders && allowedProviders.length > 0 ? allowedProviders : undefined,
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0
  };
  keys.unshift(newKey);
  writeKeys(keys);
  // The only time the full key leaves the server: the caller shows it once.
  return { ...publicKey(newKey), key: rawSecret };
}

export function deleteVirtualKey(id: string): boolean {
  const keys = getAllKeys();
  const next = keys.filter((k) => k.id !== id);
  if (next.length === keys.length) return false;
  writeKeys(next);
  return true;
}

export function toggleVirtualKey(id: string, enabled?: boolean): VirtualApiKey | null {
  const keys = getAllKeys();
  const target = keys.find((k) => k.id === id);
  if (!target) return null;
  target.enabled = typeof enabled === 'boolean' ? enabled : !target.enabled;
  writeKeys(keys);
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
  writeKeys(keys);
}

// ------------------- CONFIG STORE -------------------

const DEFAULT_CONFIG: AiGatewayConfig = {
  providers: {
    anthropic: { enabled: false, connected: false, baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-3-7-sonnet-20250219' },
    openai: { enabled: false, connected: false, baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
    deepseek: { enabled: false, connected: false, baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
    gemini: { enabled: false, connected: false, baseUrl: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash' },
    openrouter: { enabled: false, connected: false, baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-3.7-sonnet' },
    ollama: { enabled: false, connected: false, baseUrl: 'http://localhost:11434', defaultModel: 'llama3.2' },
    // OpenAI-compatible API-key providers; base URLs come from compatProviders.ts
    ...Object.fromEntries(COMPAT_PROVIDERS.filter((p) => p.id !== 'openrouter').map((p) => [p.id, { enabled: false, connected: false, baseUrl: p.baseUrl, defaultModel: p.sampleModel }]))
  },
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-7-sonnet-20250219'
};

export function getInternalConfig(): AiGatewayConfig {
  const stored = readConfig();
  const cfg: AiGatewayConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    providers: { ...DEFAULT_CONFIG.providers, ...stored.providers }
  };

  // Decrypt API keys for internal proxy use
  for (const p of Object.keys(cfg.providers) as AiProviderId[]) {
    const prov = cfg.providers[p];
    if (!prov) continue;
    if (prov.apiKey) {
      prov.apiKey = decrypt(prov.apiKey);
    }
    if (Array.isArray(prov.apiKeys) && prov.apiKeys.length > 0) {
      prov.apiKeys = prov.apiKeys
        .map((k) => ({ ...k, apiKey: decrypt(k.apiKey) }))
        .filter((k) => !!k.apiKey);
      if (prov.apiKeys.length > 0) prov.apiKey = prov.apiKeys[0]!.apiKey;
    } else if (prov.apiKey) {
      prov.apiKeys = [{ id: `${p}:default`, apiKey: prov.apiKey, addedAt: prov.verifiedAt || new Date().toISOString() }];
    }
  }
  return cfg;
}

const maskSecret = (decrypted: string): string => {
  if (!decrypted) return '';
  if (decrypted.length <= 11) return `${decrypted.slice(0, 3)}...${decrypted.slice(-2)}`;
  return `${decrypted.slice(0, 7)}...${decrypted.slice(-4)}`;
};

export function getClientConfig(): AiGatewayConfig {
  const stored = readConfig();
  const cfg: AiGatewayConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    providers: { ...DEFAULT_CONFIG.providers, ...stored.providers }
  };

  // Mask API keys for safe UI presentation
  for (const p of Object.keys(cfg.providers) as AiProviderId[]) {
    const prov = cfg.providers[p];
    if (!prov) continue;
    if (prov.apiKey) {
      prov.apiKey = maskSecret(decrypt(prov.apiKey));
    }
    if (Array.isArray(prov.apiKeys) && prov.apiKeys.length > 0) {
      prov.apiKeys = prov.apiKeys
        .map((k) => ({ ...k, apiKey: maskSecret(decrypt(k.apiKey)) }))
        .filter((k) => !!k.apiKey);
      if (prov.apiKeys.length > 0) prov.apiKey = prov.apiKeys[0]!.apiKey;
    } else if (prov.apiKey) {
      prov.apiKeys = [{ id: `${p}:default`, apiKey: prov.apiKey, addedAt: prov.verifiedAt || new Date().toISOString() }];
    }
  }
  return cfg;
}

export function saveGatewayConfig(updates: Partial<AiGatewayConfig>): AiGatewayConfig {
  const currentStored = readConfig();
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

  writeConfig(merged);
  return getClientConfig();
}

export function connectProvider(
  providerId: AiProviderId,
  apiKey: string,
  baseUrl?: string,
  latencyMs?: number,
  models?: string[],
  opts?: { label?: string; addNew?: boolean; keyId?: string }
): AiGatewayConfig {
  const currentStored = readConfig();
  const target = currentStored.providers[providerId] || {
    enabled: true,
    connected: true,
    baseUrl: ''
  };

  const trimmed = apiKey.trim();
  const encryptedKey = trimmed ? encrypt(trimmed) : (target.apiKey || '');
  const now = new Date().toISOString();

  let apiKeys = Array.isArray(target.apiKeys) ? [...target.apiKeys] : [];
  if (apiKeys.length === 0 && target.apiKey) {
    apiKeys.push({ id: `${providerId}:default`, apiKey: target.apiKey, addedAt: target.verifiedAt || now });
  }

  if (trimmed) {
    const existingIdx = apiKeys.findIndex((k) => {
      if (opts?.keyId) return k.id === opts.keyId;
      try { return decrypt(k.apiKey) === trimmed; } catch { return false; }
    });
    if (existingIdx >= 0) {
      apiKeys[existingIdx] = {
        ...apiKeys[existingIdx]!,
        apiKey: encryptedKey,
        label: opts?.label !== undefined ? opts.label : apiKeys[existingIdx]!.label
      };
    } else if (opts?.addNew && apiKeys.length > 0) {
      apiKeys.push({
        id: `${providerId}:${crypto.randomUUID().slice(0, 8)}`,
        label: opts?.label,
        apiKey: encryptedKey,
        addedAt: now
      });
    } else if (apiKeys.length === 0) {
      apiKeys = [{ id: `${providerId}:default`, label: opts?.label, apiKey: encryptedKey, addedAt: now }];
    } else {
      apiKeys[0] = { ...apiKeys[0]!, label: opts?.label ?? apiKeys[0]!.label, apiKey: encryptedKey };
    }
  }

  currentStored.providers[providerId] = {
    ...target,
    apiKey: apiKeys[0]?.apiKey || encryptedKey,
    apiKeys: apiKeys.length > 0 ? apiKeys : undefined,
    baseUrl: baseUrl || target.baseUrl || '',
    enabled: true,
    connected: true,
    verifiedAt: now,
    latencyMs,
    ...(models ? { models } : {}),
    error: undefined
  };

  writeConfig(currentStored);
  return getClientConfig();
}

export function disconnectProvider(providerId: AiProviderId, keyId?: string): AiGatewayConfig {
  const currentStored = readConfig();
  const target = currentStored.providers[providerId];
  if (target) {
    if (keyId && Array.isArray(target.apiKeys) && target.apiKeys.length > 1) {
      const nextKeys = target.apiKeys.filter((k) => k.id !== keyId);
      currentStored.providers[providerId] = {
        ...target,
        apiKeys: nextKeys,
        apiKey: nextKeys[0]?.apiKey || '',
        connected: nextKeys.length > 0,
        enabled: nextKeys.length > 0
      };
    } else {
      currentStored.providers[providerId] = {
        ...target,
        apiKey: '',
        apiKeys: undefined,
        connected: false,
        enabled: false,
        error: undefined
      };
    }
  }
  writeConfig(currentStored);
  return getClientConfig();
}

export function reorderProviderKeys(providerId: AiProviderId, keyIds: string[]): AiGatewayConfig {
  const currentStored = readConfig();
  const target = currentStored.providers[providerId];
  if (target && Array.isArray(target.apiKeys) && target.apiKeys.length > 1) {
    const byId = new Map(target.apiKeys.map((k) => [k.id, k]));
    const ordered = [];
    for (const id of keyIds) {
      const found = byId.get(id);
      if (found) { ordered.push(found); byId.delete(id); }
    }
    for (const rest of byId.values()) ordered.push(rest);
    currentStored.providers[providerId] = {
      ...target,
      apiKeys: ordered,
      apiKey: ordered[0]?.apiKey || target.apiKey
    };
    writeConfig(currentStored);
  }
  return getClientConfig();
}

// ------------------- USAGE STORE -------------------

export function getUsageLogs(limit = 100): AiUsageLog[] {
  return readUsageRows(Math.min(limit, MAX_USAGE_LOGS)) as AiUsageLog[];
}

export function addUsageLog(logData: Omit<AiUsageLog, 'id' | 'timestamp' | 'totalTokens'>): void {
  const newLog: AiUsageLog = {
    ...logData,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    totalTokens: (logData.inputTokens || 0) + (logData.outputTokens || 0)
  };
  appendUsage(newLog as any);
}

export function clearUsageLogs(): void {
  clearUsage();
}

export function getGatewayStats(): AiGatewayStats {
  const keys = getAllKeys();
  const logs = allUsageRows() as AiUsageLog[];

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

