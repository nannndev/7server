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
  baseUrl?: string
): Promise<{ config: AiGatewayConfig; verification: ProviderVerificationResult }> {
  const res = await apiFetch(
    `${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/connect`,
    jsonPost({ apiKey, baseUrl })
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to connect provider');
  return data;
}

export async function disconnectProviderApi(providerId: AiProviderId): Promise<AiGatewayConfig> {
  const res = await apiFetch(`${API_BASE}/ai-gateway/providers/${encodeURIComponent(providerId)}/disconnect`, {
    method: 'POST'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to disconnect provider');
  return data.config;
}

