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

export interface DockerImage {
  id: string;
  repo: string;
  tag: string;
  size: string;
  createdSince: string;
  inUse: boolean;
}

export interface DockerVolume {
  name: string;
  driver: string;
  scope: string;
  inUse?: boolean;
  containers?: string[];
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containersCount?: number;
}

export interface DockerOverview {
  installed: boolean;
  version: string;
  composeVersion: string;
  containers: DockerContainer[];
  images: DockerImage[];
  volumes: DockerVolume[];
  networks: DockerNetwork[];
  df: { type: string; total: string; active: string; size: string; reclaimable: string }[];
}

export interface DockerInspect {
  id: string;
  name: string;
  image: string;
  created: string;
  startedAt: string;
  restartCount: number;
  restartPolicy: string;
  status: string;
  health?: string;
  exitCode: number;
  oomKilled: boolean;
  cmd: string;
  networks: { name: string; ip: string }[];
  mounts: { type: string; source: string; destination: string; rw: boolean }[];
  ports: { container: string; host: string }[];
  env: { key: string; value: string; masked: boolean }[];
}

export interface RunContainerPayload {
  name: string;
  image: string;
  ports?: string[];
  env?: string[];
  volumes?: string[];
  network?: string;
  restart?: string;
  memory?: string;
  cmd?: string;
}

export interface ComposeDeployPayload {
  project: string;
  workingDir: string;
  composeContent: string;
  envContent?: string;
  configFile?: string;
}

export const fetchDocker = async (id: string, stats = true) =>
  unwrap<DockerOverview>(await apiFetch(`${API_BASE}/servers/${id}/docker?stats=${stats ? 1 : 0}`), 'Failed to load Docker');

export const inspectDocker = async (id: string, cid: string) =>
  unwrap<DockerInspect>(await apiFetch(`${API_BASE}/servers/${id}/docker/inspect/${encodeURIComponent(cid)}`), 'Inspect failed');

export const dockerContainerAction = async (id: string, containerId: string, action: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/container`, jsonPost({ containerId, action })), 'Container action failed');

export const dockerRunContainer = async (id: string, payload: RunContainerPayload) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/run`, jsonPost(payload)), 'Run container failed');

export const dockerContainerLogs = async (id: string, cid: string, tail = 200, timestamps = false) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/logs/${encodeURIComponent(cid)}?tail=${tail}&timestamps=${timestamps ? 1 : 0}`), 'Failed to get logs');

// Images
export const dockerPullImage = async (id: string, image: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/image/pull`, jsonPost({ image })), 'Pull image failed');

export const dockerRemoveImage = async (id: string, image: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/image/rm`, jsonPost({ image })), 'Remove image failed');

// Volumes
export const dockerCreateVolume = async (id: string, name: string, driver?: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/volume/create`, jsonPost({ name, driver })), 'Create volume failed');

export const dockerRemoveVolume = async (id: string, name: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/volume/rm`, jsonPost({ name })), 'Remove volume failed');

export const dockerInspectVolume = async (id: string, name: string) =>
  unwrap<any>(await apiFetch(`${API_BASE}/servers/${id}/docker/volume/inspect/${encodeURIComponent(name)}`), 'Inspect volume failed');

// Networks
export const dockerCreateNetwork = async (id: string, name: string, driver?: string, subnet?: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/network/create`, jsonPost({ name, driver, subnet })), 'Create network failed');

export const dockerRemoveNetwork = async (id: string, name: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/network/rm`, jsonPost({ name })), 'Remove network failed');

export const dockerInspectNetwork = async (id: string, name: string) =>
  unwrap<any>(await apiFetch(`${API_BASE}/servers/${id}/docker/network/inspect/${encodeURIComponent(name)}`), 'Inspect network failed');

// Compose
export const dockerComposeAction = async (id: string, project: string, workingDir: string, action: string, configFiles = '') =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/compose`, jsonPost({ project, workingDir, action, configFiles })), 'Compose action failed');

export const dockerReadComposeFile = async (id: string, workingDir: string, configFile = 'docker-compose.yml') =>
  unwrap<{ composeContent: string; envContent: string }>(
    await apiFetch(`${API_BASE}/servers/${id}/docker/compose/file?workingDir=${encodeURIComponent(workingDir)}&configFile=${encodeURIComponent(configFile)}`),
    'Failed to read compose file'
  );

export const dockerDeployComposeStack = async (id: string, payload: ComposeDeployPayload) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/compose/deploy`, jsonPost(payload)), 'Deploy compose stack failed');

export const dockerPrune = async (id: string, what: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/docker/prune`, jsonPost({ what })), 'Prune failed');
