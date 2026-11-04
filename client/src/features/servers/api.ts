import { API_BASE, apiFetch, jsonPost, unwrap, downloadBlob } from '@/shared/api/client';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';

export type HistoryPoint = { t: number; cpu: number; mem: number; disk: number };
export const fetchHistory = async (id: string) =>
  unwrap<HistoryPoint[]>(await apiFetch(`${API_BASE}/servers/${id}/history`), 'Failed to fetch history');

export const exportServers = () => downloadBlob(`${API_BASE}/export`, 'vps-hub-servers.json');
export async function importServers(items: unknown): Promise<number> {
  const res = await apiFetch(`${API_BASE}/import`, jsonPost(items));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Import failed');
  return data.imported;
}

export async function fetchServers(): Promise<ServerItem[]> {
  const res = await apiFetch(`${API_BASE}/servers`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch servers');
  return data.data;
}

export async function createServer(payload: Partial<ServerItem> & { password?: string; privateKey?: string; passphrase?: string }): Promise<ServerItem> {
  const res = await apiFetch(`${API_BASE}/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create server');
  return data.data;
}

export async function updateServer(id: string, payload: Partial<ServerItem> & { password?: string; privateKey?: string; passphrase?: string }): Promise<ServerItem> {
  const res = await apiFetch(`${API_BASE}/servers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update server');
  return data.data;
}

export async function deleteServer(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete server');
  return data;
}

export async function testConnection(payload: any): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/servers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function pingServer(id: string): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/ping`);
  return await res.json();
}

export async function fetchServerMetrics(id: string): Promise<ServerMetrics> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/metrics`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch metrics');
  return data.data;
}
