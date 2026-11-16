import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';

export interface CloudflareZoneSummary {
  id: string;
  name: string;
  status: string;
}

export interface SafeCloudflareIntegration {
  connected: boolean;
  accountId?: string;
  accountName?: string;
  zones: CloudflareZoneSummary[];
  verifiedAt?: string;
}

export async function fetchCloudflareIntegration(): Promise<SafeCloudflareIntegration> {
  const res = await apiFetch(`${API_BASE}/integrations/cloudflare`);
  return unwrap(res, 'Failed to fetch Cloudflare integration');
}

export async function connectCloudflareToken(token: string): Promise<SafeCloudflareIntegration> {
  const res = await apiFetch(`${API_BASE}/integrations/cloudflare/token`, jsonPost({ token }));
  return unwrap(res, 'Failed to verify Cloudflare API token');
}

export async function syncCloudflareZones(): Promise<SafeCloudflareIntegration> {
  const res = await apiFetch(`${API_BASE}/integrations/cloudflare/sync`, jsonPost({}));
  return unwrap(res, 'Failed to sync Cloudflare zones');
}

export async function disconnectCloudflare(): Promise<{ ok: boolean }> {
  const res = await apiFetch(`${API_BASE}/integrations/cloudflare`, { method: 'DELETE' });
  return unwrap(res, 'Failed to disconnect Cloudflare');
}
