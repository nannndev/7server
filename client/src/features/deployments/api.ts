import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';
import type { WebAppInfo, NginxSiteInfo, ListeningPortInfo, SavedDeployConfig, DeployHistoryRecord } from '@/features/deployments/types';

export async function fetchWebApps(id: string): Promise<WebAppInfo[]> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/webapps`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch webapps');
  return data.data;
}

export async function fetchNginxSites(id: string): Promise<{ sites: NginxSiteInfo[]; configTest: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/nginx`), 'Failed to fetch Nginx sites');
}

export async function fetchListeningPorts(id: string): Promise<{ ports: ListeningPortInfo[]; ufwStatus: string; raw: string; probed?: number[] }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/ports`), 'Failed to fetch listening ports');
}

export async function fetchDeployConfigs(serverId: string): Promise<SavedDeployConfig[]> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/webapps/configs`), 'Failed to fetch deploy configs');
}

export async function fetchDeployHistory(serverId: string, appName: string): Promise<DeployHistoryRecord[]> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/history`), 'Failed to fetch deploy history');
}

export async function fetchAppWebhook(serverId: string, appName: string): Promise<{ autoDeploy: boolean; webhookSecret: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/webhook`), 'Failed to fetch webhook config');
}

export async function updateDeployConfig(
  serverId: string,
  appName: string,
  patch: { autoDeploy?: boolean; regenerateWebhook?: boolean; specPatch?: Record<string, any> }
): Promise<SavedDeployConfig> {
  const res = await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  });
  return unwrap(res, 'Failed to update deploy config');
}

export async function fetchAppLogs(serverId: string, appName: string, lines = 120): Promise<{ logs: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/logs?lines=${lines}`), 'Failed to fetch app logs');
}

export async function fetchAppEnv(serverId: string, appName: string): Promise<{ content: string; path: string }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/env`), 'Failed to read .env');
}

export async function saveAppEnv(serverId: string, appName: string, content: string): Promise<{ saved: boolean; path: string }> {
  const res = await apiFetch(`${API_BASE}/servers/${serverId}/webapps/${encodeURIComponent(appName)}/env`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  return unwrap(res, 'Failed to save .env');
}

export async function setupGitHubAutoDeployWebhook(
  serverId: string,
  appName: string,
  owner: string,
  repo: string,
  webhookUrl?: string
): Promise<{ success: boolean; message?: string; alreadyExists?: boolean; webhookUrl?: string }> {
  const res = await apiFetch(`${API_BASE}/git/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId, appName, webhookUrl })
  });
  return unwrap(res, 'Gagal mengonfigurasi webhook GitHub');
}

export { jsonPost };
