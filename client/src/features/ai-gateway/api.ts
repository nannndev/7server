import type { AccountUsage } from './types';
import type { OAuthProviderId, SubscriptionAccount, LoginStart } from './types';
import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';
import type {
  VirtualApiKey,
  AiGatewayConfig,
  AiUsageLog,
  AiGatewayStats,
  AiProviderId,
  ProviderVerificationResult
} from './types';

export async function fetchGatewayKeys(): Promise<VirtualApiKey[]> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/keys`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch virtual keys');
  return data.keys;
}

export async function createGatewayKey(name: string, allowedProviders?: AiProviderId[]): Promise<VirtualApiKey> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/keys`, jsonPost({ name, allowedProviders }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create virtual key');
  return data.key;
}

export async function deleteGatewayKey(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete virtual key');
  }
}

export async function toggleGatewayKey(id: string, enabled?: boolean): Promise<VirtualApiKey> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/keys/${encodeURIComponent(id)}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to toggle virtual key');
  return data.key;
}

export async function fetchGatewayConfig(): Promise<AiGatewayConfig> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/config`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch AI gateway configuration');
  return data.config;
}

export async function saveGatewayConfig(updates: Partial<AiGatewayConfig>): Promise<AiGatewayConfig> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/config`, jsonPost(updates));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save AI gateway configuration');
  return data.config;
}

export async function fetchGatewayUsage(limit = 100): Promise<AiUsageLog[]> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/usage?limit=${limit}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch AI usage logs');
  return data.logs;
}

export async function clearGatewayUsage(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/usage`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to clear usage logs');
  }
}

export async function fetchGatewayStats(): Promise<AiGatewayStats> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/stats`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch gateway statistics');
  return data.stats;
}

export async function verifyProvider(
  providerId: AiProviderId,
  apiKey?: string,
  baseUrl?: string
): Promise<ProviderVerificationResult> {
  const res = await apiFetch(
    `${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/verify`,
    jsonPost({ apiKey, baseUrl })
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Provider verification failed');
  return data;
}

export async function connectProviderApi(
  providerId: AiProviderId,
  apiKey: string,
  baseUrl?: string,
  opts?: { label?: string; addNew?: boolean; keyId?: string }
): Promise<{ config: AiGatewayConfig; verification: ProviderVerificationResult }> {
  const res = await apiFetch(
    `${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/connect`,
    jsonPost({ apiKey, baseUrl, ...opts })
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to connect provider');
  return data;
}

export async function disconnectProviderApi(providerId: AiProviderId, keyId?: string): Promise<AiGatewayConfig> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/disconnect`, jsonPost({ keyId }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to disconnect provider');
  return data.config;
}

export async function reorderProviderKeysApi(providerId: AiProviderId, keyIds: string[]): Promise<AiGatewayConfig> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/reorder`, jsonPost({ keyIds }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to reorder provider keys');
  return data.config;
}


// ---- Subscription accounts (OAuth login per provider, multi-account + ordered rotation)

const acct = (p: OAuthProviderId, action = '') => `${API_BASE}/ai-gateway/accounts/${encodeURIComponent(p)}${action ? `/${action}` : ''}`;
async function body<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || fallback);
  return data;
}

export const fetchAccounts = async () =>
  body<{ accounts: SubscriptionAccount[]; models: Record<OAuthProviderId, string[]>; aliases?: Partial<Record<OAuthProviderId, string>> }>(await apiFetch(`${API_BASE}/ai-gateway/accounts`), 'Failed to fetch accounts');
export const startAccountLogin = async (p: OAuthProviderId, accountId?: string) =>
  body<LoginStart>(await apiFetch(acct(p, 'start'), jsonPost({ accountId })), 'Failed to start login');
export const completeAccountLogin = async (p: OAuthProviderId, sessionId: string, callback: string, accountId?: string) =>
  (await body<{ accounts: SubscriptionAccount[] }>(await apiFetch(acct(p, 'complete'), jsonPost({ sessionId, callback, accountId })), 'Login failed')).accounts;
export const pollAccountLogin = async (p: OAuthProviderId, sessionId: string, accountId?: string) =>
  body<{ status: 'pending' | 'done'; accounts?: SubscriptionAccount[] }>(await apiFetch(acct(p, 'poll'), jsonPost({ sessionId, accountId })), 'Login failed');
export const testAccount = async (p: OAuthProviderId, accountId?: string) =>
  (await body<{ accounts: SubscriptionAccount[] }>(await apiFetch(acct(p, 'test'), jsonPost({ accountId })), 'Token invalid')).accounts;
export const disconnectAccount = async (p: OAuthProviderId, accountId?: string) =>
  (await body<{ accounts: SubscriptionAccount[] }>(
    await apiFetch(`${acct(p)}${accountId ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { method: 'DELETE' }),
    'Failed to disconnect'
  )).accounts;
export const reorderAccountsApi = async (p: OAuthProviderId, accountIds: string[]) =>
  (await body<{ accounts: SubscriptionAccount[] }>(await apiFetch(acct(p, 'reorder'), jsonPost({ accountIds })), 'Failed to reorder accounts')).accounts;

// ---- Quota and combos
export const fetchAccountUsage = async (fresh = false) =>
  (await body<{ usage: AccountUsage[] }>(await apiFetch(`${API_BASE}/ai-gateway/accounts/usage${fresh ? '?fresh=1' : ''}`), 'Failed to read quota')).usage;
export const fetchCombos = async () => (await body<{ combos: Record<string, string[]> }>(await apiFetch(`${API_BASE}/ai-gateway/combos`), 'Failed to load combos')).combos;
export const saveCombo = async (name: string, targets: string[]) =>
  (await body<{ combos: Record<string, string[]> }>(await apiFetch(`${API_BASE}/ai-gateway/combos/${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targets }) }), 'Failed to save combo')).combos;
export const deleteCombo = async (name: string) =>
  (await body<{ combos: Record<string, string[]> }>(await apiFetch(`${API_BASE}/ai-gateway/combos/${encodeURIComponent(name)}`, { method: 'DELETE' }), 'Failed to delete combo')).combos;
