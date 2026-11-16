import crypto from 'crypto';
import { listDocs, replaceDocs, getKv, setKv, appendUsage, readUsageRows, allUsageRows, clearUsage, compact } from '../../infra/db.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { COMPAT_PROVIDERS } from './compatProviders.js';
import { estimateCostUsd } from './pricing.js';
import type {
  VirtualApiKey,
  AiGatewayConfig,
  AiUsageLog,
  AiProviderId,
  AiGatewayStats,
  UsageAnalytics,
  UsageGroupRow,
  UsageRange,
  UsageSeriesPoint
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

export interface VirtualKeyPolicyInput {
  rateLimitPerMin?: number | null;
  maxBudgetUsd?: number | null;
  maxTokens?: number | null;
  expiresAt?: string | null;
}

const positiveOrUndefined = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const isoDateOrUndefined = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};

export function createVirtualKey(
  name: string,
  allowedProviders?: AiProviderId[],
  policy: VirtualKeyPolicyInput = {}
): VirtualApiKey {
  const keys = getAllKeys();
  const rawSecret = `7s-sk-${crypto.randomBytes(24).toString('hex')}`;
  const suffix = rawSecret.slice(-4);
  const newKey: VirtualApiKey = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Default Key',
    keyHash: hashKey(rawSecret),
    keyPrefix: `7s-sk-...${suffix}`,
    createdAt: new Date().toISOString(),
    expiresAt: isoDateOrUndefined(policy.expiresAt),
    enabled: true,
    rateLimitPerMin: positiveOrUndefined(policy.rateLimitPerMin),
    maxBudgetUsd: positiveOrUndefined(policy.maxBudgetUsd),
    maxTokens: positiveOrUndefined(policy.maxTokens),
    allowedProviders: allowedProviders && allowedProviders.length > 0 ? allowedProviders : undefined,
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0
  };
  keys.unshift(newKey);
  writeKeys(keys);
  // The only time the full key leaves the server: the caller shows it once.
  return { ...publicKey(newKey), key: rawSecret };
}

export function updateVirtualKey(
  id: string,
  updates: {
    name?: string;
    enabled?: boolean;
    allowedProviders?: AiProviderId[] | null;
  } & VirtualKeyPolicyInput
): VirtualApiKey | null {
  const keys = getAllKeys();
  const target = keys.find((k) => k.id === id);
  if (!target) return null;
  if (typeof updates.name === 'string' && updates.name.trim()) target.name = updates.name.trim();
  if (typeof updates.enabled === 'boolean') target.enabled = updates.enabled;
  if ('allowedProviders' in updates) {
    target.allowedProviders = Array.isArray(updates.allowedProviders) && updates.allowedProviders.length > 0
      ? updates.allowedProviders
      : undefined;
  }
  if ('rateLimitPerMin' in updates) target.rateLimitPerMin = positiveOrUndefined(updates.rateLimitPerMin);
  if ('maxBudgetUsd' in updates) target.maxBudgetUsd = positiveOrUndefined(updates.maxBudgetUsd);
  if ('maxTokens' in updates) target.maxTokens = positiveOrUndefined(updates.maxTokens);
  if ('expiresAt' in updates) target.expiresAt = isoDateOrUndefined(updates.expiresAt);
  writeKeys(keys);
  return publicKey(target);
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

export function recordKeyUsage(keyId: string, inputTokens: number, outputTokens: number, costUsd = 0): void {
  const keys = getAllKeys();
  const target = keys.find((k) => k.id === keyId);
  if (!target) return;
  target.lastUsedAt = new Date().toISOString();
  target.totalRequests = (target.totalRequests || 0) + 1;
  target.totalInputTokens = (target.totalInputTokens || 0) + inputTokens;
  target.totalOutputTokens = (target.totalOutputTokens || 0) + outputTokens;
  const nextCost = (target.totalCostUsd || 0) + Math.max(0, costUsd || 0);
  target.totalCostUsd = Math.round(nextCost * 1_000_000) / 1_000_000;
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
        .map((k) => ({ ...k, enabled: k.enabled !== false, apiKey: maskSecret(decrypt(k.apiKey)) }))
        .filter((k) => !!k.apiKey);
      if (prov.apiKeys.length > 0) prov.apiKey = prov.apiKeys[0]!.apiKey;
    } else if (prov.apiKey) {
      prov.apiKeys = [{ id: `${p}:default`, enabled: true, apiKey: prov.apiKey, addedAt: prov.verifiedAt || new Date().toISOString() }];
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

export function toggleProviderKeyAccount(providerId: AiProviderId, keyId: string, enabled: boolean): AiGatewayConfig {
  const currentStored = readConfig();
  const target = currentStored.providers[providerId];
  if (target) {
    let apiKeys = Array.isArray(target.apiKeys) ? [...target.apiKeys] : [];
    if (apiKeys.length === 0 && target.apiKey) {
      apiKeys = [{ id: `${providerId}:default`, apiKey: target.apiKey, addedAt: target.verifiedAt || new Date().toISOString(), enabled: true }];
    }
    const nextKeys = apiKeys.map((k) => (k.id === keyId ? { ...k, enabled } : k));
    const anyEnabled = nextKeys.some((k) => k.enabled !== false);
    const firstEnabled = nextKeys.find((k) => k.enabled !== false);
    currentStored.providers[providerId] = {
      ...target,
      apiKeys: nextKeys,
      apiKey: firstEnabled?.apiKey || target.apiKey,
      enabled: anyEnabled
    };
    writeConfig(currentStored);
  }
  return getClientConfig();
}

export function addProviderCustomModel(providerId: AiProviderId, model: string): AiGatewayConfig {
  const trimmed = model.trim();
  if (!trimmed) return getClientConfig();
  const currentStored = readConfig();
  const target = currentStored.providers[providerId] || { enabled: true };
  const existing = Array.isArray(target.customModels) ? target.customModels : [];
  if (!existing.includes(trimmed)) {
    currentStored.providers[providerId] = {
      ...target,
      customModels: [...existing, trimmed]
    };
    writeConfig(currentStored);
  }
  return getClientConfig();
}

export function removeProviderCustomModel(providerId: AiProviderId, model: string): AiGatewayConfig {
  const trimmed = model.trim();
  const currentStored = readConfig();
  const target = currentStored.providers[providerId];
  if (target && Array.isArray(target.customModels)) {
    currentStored.providers[providerId] = {
      ...target,
      customModels: target.customModels.filter((m) => m !== trimmed)
    };
    writeConfig(currentStored);
  }
  return getClientConfig();
}

// ------------------- USAGE STORE -------------------

export function getUsageLogs(limit = 100): AiUsageLog[] {
  return readUsageRows(Math.min(limit, MAX_USAGE_LOGS)) as AiUsageLog[];
}

export function addUsageLog(logData: Omit<AiUsageLog, 'id' | 'timestamp' | 'totalTokens'>): number {
  const costUsd = typeof logData.costUsd === 'number'
    ? logData.costUsd
    : estimateCostUsd(logData.model, logData.inputTokens || 0, logData.outputTokens || 0);
  const newLog: AiUsageLog = {
    ...logData,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    totalTokens: (logData.inputTokens || 0) + (logData.outputTokens || 0),
    costUsd
  };
  appendUsage(newLog as any);
  return costUsd;
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
  let totalCostUsd = 0;

  for (const log of logs) {
    totalInputTokens += log.inputTokens || 0;
    totalOutputTokens += log.outputTokens || 0;
    totalCostUsd += typeof log.costUsd === 'number'
      ? log.costUsd
      : estimateCostUsd(log.model, log.inputTokens || 0, log.outputTokens || 0);
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
    totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
    activeKeysCount,
    connectedProvidersCount
  };
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toLocalDate(utcMs: number, tzOffsetMin: number): Date {
  return new Date(utcMs - tzOffsetMin * 60_000);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function hourKey(utcMs: number, tzOffsetMin: number): { bucket: string; label: string } {
  const d = toLocalDate(utcMs, tzOffsetMin);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  return { bucket: `${yyyy}-${mm}-${dd}T${hh}:00`, label: `${hh}:00` };
}

function dayKey(utcMs: number, tzOffsetMin: number): { bucket: string; label: string } {
  const d = toLocalDate(utcMs, tzOffsetMin);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  return {
    bucket: `${yyyy}-${mm}-${dd}`,
    label: `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
  };
}

function monthKey(utcMs: number, tzOffsetMin: number): { bucket: string; label: string } {
  const d = toLocalDate(utcMs, tzOffsetMin);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  return {
    bucket: `${yyyy}-${mm}`,
    label: `${MONTH_SHORT[d.getUTCMonth()]} ${String(yyyy).slice(2)}`
  };
}

function finalizeGroups(
  map: Map<string, { label?: string; providerCounts?: Map<string, number>; requests: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; durationSum: number }>,
  grandTokens: number,
  grandRequests: number
): UsageGroupRow[] {
  const rows: UsageGroupRow[] = [];
  for (const [key, acc] of map.entries()) {
    let topProvider: string | undefined;
    if (acc.providerCounts && acc.providerCounts.size > 0) {
      let best = -1;
      for (const [p, c] of acc.providerCounts.entries()) {
        if (c > best) { best = c; topProvider = p; }
      }
    }
    const numerator = grandTokens > 0 ? acc.totalTokens : acc.requests;
    const denominator = grandTokens > 0 ? grandTokens : grandRequests;
    rows.push({
      key,
      ...(acc.label ? { label: acc.label } : {}),
      ...(topProvider ? { provider: topProvider } : {}),
      requests: acc.requests,
      errors: acc.errors,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      totalTokens: acc.totalTokens,
      costUsd: Math.round(acc.costUsd * 1_000_000) / 1_000_000,
      avgDurationMs: acc.requests > 0 ? Math.round(acc.durationSum / acc.requests) : 0,
      sharePct: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0
    });
  }
  return rows.sort((a, b) => (b.totalTokens - a.totalTokens) || (b.requests - a.requests));
}

/** Pure analytics aggregator over AI Gateway usage logs for chart & breakdown UI. */
export function buildUsageAnalytics(
  logs: AiUsageLog[],
  range: UsageRange = '30d',
  opts: { tzOffsetMin?: number; nowMs?: number; provider?: string; model?: string; keyId?: string } = {}
): UsageAnalytics {
  const tzOffsetMin = Number.isFinite(opts.tzOffsetMin) ? Math.max(-840, Math.min(840, Number(opts.tzOffsetMin))) : 0;
  const nowMs = opts.nowMs ?? Date.now();
  const providerFilter = opts.provider && opts.provider !== 'all' ? opts.provider.trim().toLowerCase() : '';
  const modelFilter = opts.model && opts.model !== 'all' ? opts.model.trim().toLowerCase() : '';
  const keyIdFilter = opts.keyId && opts.keyId !== 'all' ? opts.keyId.trim() : '';

  const cutoffMs =
    range === '1d'
      ? nowMs - 24 * 3600_000
      : range === '7d'
      ? nowMs - 7 * 86400_000
      : range === '30d'
      ? nowMs - 30 * 86400_000
      : 0;

  const filtered = logs.filter((log) => {
    const t = Date.parse(log.timestamp);
    if (!Number.isFinite(t) || t < cutoffMs) return false;
    if (providerFilter && String(log.provider || '').toLowerCase() !== providerFilter) return false;
    if (modelFilter && String(log.model || '').toLowerCase() !== modelFilter) return false;
    if (keyIdFilter && String(log.keyId || '') !== keyIdFilter) return false;
    return true;
  });

  // Determine granularity and pre-populate zero-filled buckets for smooth continuous charts
  type BucketAcc = { label: string; requests: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; durationSum: number };
  const buckets = new Map<string, BucketAcc>();

  let granularity: 'hour' | 'day' | 'month' = range === '1d' ? 'hour' : 'day';
  if (range === 'all' && filtered.length > 0) {
    let minT = nowMs;
    for (const l of filtered) {
      const t = Date.parse(l.timestamp);
      if (t < minT) minT = t;
    }
    const span = nowMs - minT;
    granularity = span <= 36 * 3600_000 ? 'hour' : span <= 120 * 86400_000 ? 'day' : 'month';
  }

  if (granularity === 'hour') {
    const hoursCount = range === '1d' ? 24 : 24;
    const endHour = Math.floor(nowMs / 3600_000) * 3600_000;
    for (let i = hoursCount - 1; i >= 0; i--) {
      const k = hourKey(endHour - i * 3600_000, tzOffsetMin);
      buckets.set(k.bucket, { label: k.label, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 });
    }
  } else if (granularity === 'day') {
    let daysCount = range === '7d' ? 7 : 30;
    if (range === 'all') {
      let minT = nowMs;
      for (const l of filtered) {
        const t = Date.parse(l.timestamp);
        if (t < minT) minT = t;
      }
      daysCount = Math.max(7, Math.min(120, Math.ceil((nowMs - minT) / 86400_000) + 1));
    }
    const endDay = Math.floor(nowMs / 86400_000) * 86400_000;
    for (let i = daysCount - 1; i >= 0; i--) {
      const k = dayKey(nowMs - i * 86400_000, tzOffsetMin);
      buckets.set(k.bucket, { label: k.label, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 });
    }
    void endDay;
  }

  const byModelMap = new Map<string, { providerCounts: Map<string, number>; requests: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; durationSum: number }>();
  const byProviderMap = new Map<string, { requests: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; durationSum: number }>();
  const byKeyMap = new Map<string, { label: string; requests: number; errors: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number; durationSum: number }>();

  let successCount = 0;
  let errorCount = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCostUsd = 0;
  let totalDuration = 0;

  for (const log of filtered) {
    const t = Date.parse(log.timestamp);
    const inTok = log.inputTokens || 0;
    const outTok = log.outputTokens || 0;
    const totTok = log.totalTokens ?? inTok + outTok;
    const cost = typeof log.costUsd === 'number' ? log.costUsd : estimateCostUsd(log.model, inTok, outTok);
    const dur = log.durationMs || 0;
    const isErr = log.status === 'error';

    if (isErr) errorCount++;
    else successCount++;
    totalInput += inTok;
    totalOutput += outTok;
    totalCostUsd += cost;
    totalDuration += dur;

    const k = granularity === 'hour' ? hourKey(t, tzOffsetMin) : granularity === 'day' ? dayKey(t, tzOffsetMin) : monthKey(t, tzOffsetMin);
    let b = buckets.get(k.bucket);
    if (!b) {
      b = { label: k.label, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 };
      buckets.set(k.bucket, b);
    }
    b.requests++;
    if (isErr) b.errors++;
    b.inputTokens += inTok;
    b.outputTokens += outTok;
    b.totalTokens += totTok;
    b.costUsd += cost;
    b.durationSum += dur;

    const modelName = String(log.model || 'unknown').trim();
    const provName = String(log.provider || 'unknown').trim();
    const keyId = String(log.keyId || 'unknown').trim();
    const keyName = String(log.keyName || keyId).trim();

    let mAcc = byModelMap.get(modelName);
    if (!mAcc) {
      mAcc = { providerCounts: new Map(), requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 };
      byModelMap.set(modelName, mAcc);
    }
    mAcc.requests++;
    if (isErr) mAcc.errors++;
    mAcc.inputTokens += inTok;
    mAcc.outputTokens += outTok;
    mAcc.totalTokens += totTok;
    mAcc.costUsd += cost;
    mAcc.durationSum += dur;
    mAcc.providerCounts.set(provName, (mAcc.providerCounts.get(provName) || 0) + 1);

    let pAcc = byProviderMap.get(provName);
    if (!pAcc) {
      pAcc = { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 };
      byProviderMap.set(provName, pAcc);
    }
    pAcc.requests++;
    if (isErr) pAcc.errors++;
    pAcc.inputTokens += inTok;
    pAcc.outputTokens += outTok;
    pAcc.totalTokens += totTok;
    pAcc.costUsd += cost;
    pAcc.durationSum += dur;

    let kAcc = byKeyMap.get(keyId);
    if (!kAcc) {
      kAcc = { label: keyName, requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0, durationSum: 0 };
      byKeyMap.set(keyId, kAcc);
    }
    kAcc.requests++;
    if (isErr) kAcc.errors++;
    kAcc.inputTokens += inTok;
    kAcc.outputTokens += outTok;
    kAcc.totalTokens += totTok;
    kAcc.costUsd += cost;
    kAcc.durationSum += dur;
  }

  const grandTotal = totalInput + totalOutput;
  const roundedCost = Math.round(totalCostUsd * 1_000_000) / 1_000_000;
  const requests = filtered.length;
  const series: UsageSeriesPoint[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, acc]) => ({
      bucket,
      label: acc.label,
      requests: acc.requests,
      errors: acc.errors,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      totalTokens: acc.totalTokens,
      costUsd: Math.round(acc.costUsd * 1_000_000) / 1_000_000,
      avgDurationMs: acc.requests > 0 ? Math.round(acc.durationSum / acc.requests) : 0
    }));

  return {
    range,
    tzOffsetMin,
    ...(keyIdFilter ? { keyId: keyIdFilter } : {}),
    summary: {
      requests,
      successCount,
      errorCount,
      successRate: requests > 0 ? Math.round((successCount / requests) * 1000) / 10 : 100,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: grandTotal,
      costUsd: roundedCost,
      avgDurationMs: requests > 0 ? Math.round(totalDuration / requests) : 0,
      uniqueModels: byModelMap.size,
      uniqueProviders: byProviderMap.size
    },
    series,
    byModel: finalizeGroups(byModelMap, grandTotal, requests),
    byProvider: finalizeGroups(byProviderMap, grandTotal, requests),
    byKey: finalizeGroups(byKeyMap, grandTotal, requests)
  };
}

export function getUsageAnalytics(
  range: UsageRange = '30d',
  opts: { tzOffsetMin?: number; provider?: string; model?: string; keyId?: string } = {}
): UsageAnalytics {
  const logs = allUsageRows() as AiUsageLog[];
  return buildUsageAnalytics(logs, range, opts);
}

