import { API_BASE, apiFetch, unwrap } from '@/shared/api/client';
import type { CloudflareTunnelStatus, DnsCheckResult } from './types';

export async function fetchCloudflareTunnelStatus(serverId: string): Promise<CloudflareTunnelStatus> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/tunnels/cloudflare`), 'Failed to fetch Cloudflare Tunnel status');
}

export async function addCloudflareRoute(
  serverId: string,
  route: { hostname: string; service: string; autoDns?: boolean }
): Promise<CloudflareTunnelStatus> {
  return unwrap(
    await apiFetch(`${API_BASE}/servers/${serverId}/tunnels/cloudflare/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route)
    }),
    'Failed to add Cloudflare Tunnel route'
  );
}

export async function removeCloudflareRoute(
  serverId: string,
  hostname: string
): Promise<CloudflareTunnelStatus> {
  return unwrap(
    await apiFetch(`${API_BASE}/servers/${serverId}/tunnels/cloudflare/routes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostname })
    }),
    'Failed to remove Cloudflare Tunnel route'
  );
}

export async function checkDomainDns(domain: string, serverIp?: string): Promise<DnsCheckResult> {
  const params = new URLSearchParams({ domain });
  if (serverIp) params.set('serverIp', serverIp);
  const res = await apiFetch(`${API_BASE}/dns/check?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check DNS');
  return data;
}

