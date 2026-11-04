import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';

export async function controlDocker(id: string, containerId: string, action: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/docker/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId, action })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to control docker container');
  return data;
}

// ----------------- DOCKER ----------------- //

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  project: string;
  service: string;
  workingDir: string;
  configFiles: string;
  createdAt: string;
  cpu?: number;
  memUsage?: string;
  memPercent?: number;
  netIO?: string;
  health?: string;
}
export interface DockerImage { id: string; repo: string; tag: string; size: string; createdSince: string; inUse: boolean }
export interface DockerOverview {
  installed: boolean;
  version: string;
  composeVersion: string;
  containers: DockerContainer[];
  images: DockerImage[];
  df: { type: string; total: string; active: string; size: string; reclaimable: string }[];
}
export interface DockerInspect {
  id: string; name: string; image: string; created: string; startedAt: string; restartCount: number; restartPolicy: string;
  status: string; health?: string; exitCode: number; oomKilled: boolean; cmd: string;
  networks: { name: string; ip: string }[];
  mounts: { type: string; source: string; destination: string; rw: boolean }[];
  ports: { container: string; host: string }[];
  env: { key: string; value: string; masked: boolean }[];
}

export const fetchDocker = async (id: string, stats = true) =>
  unwrap<DockerOverview>(await apiFetch(`${API_BASE}/servers/${id}/docker?stats=${stats ? 1 : 0}`), 'Failed to load Docker');
export const inspectDocker = async (id: string, cid: string) =>
  unwrap<DockerInspect>(await apiFetch(`${API_BASE}/servers/${id}/docker/inspect/${encodeURIComponent(cid)}`), 'Inspect failed');
export const dockerContainerAction = async (id: string, containerId: string, action: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/container`, jsonPost({ containerId, action })), 'Container action failed');
export const dockerComposeAction = async (id: string, project: string, workingDir: string, action: string, configFiles = '') =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/compose`, jsonPost({ project, workingDir, action, configFiles })), 'Compose action failed');
export const dockerPrune = async (id: string, what: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/prune`, jsonPost({ what })), 'Prune failed');
export const dockerRemoveImage = async (id: string, image: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/image/rm`, jsonPost({ image })), 'Remove image failed');
