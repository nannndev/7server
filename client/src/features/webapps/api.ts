import { API_BASE, apiFetch, unwrap } from '@/shared/api/client';
import type { WebAppInfo, NginxSiteInfo, ListeningPortInfo } from '@/features/webapps/types';

export async function fetchWebApps(id: string): Promise<WebAppInfo[]> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/webapps`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch webapps');
  return data.data;
}

export async function fetchNginxSites(id: string): Promise<{ sites: NginxSiteInfo[]; configTest: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/nginx`), 'Failed to fetch Nginx sites');
}

export async function fetchListeningPorts(id: string): Promise<{ ports: ListeningPortInfo[]; ufwStatus: string; raw: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/ports`), 'Failed to fetch listening ports');
}
