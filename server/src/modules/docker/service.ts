// Docker inventory & actions over SSH. Every user-supplied name goes through a strict allowlist,
// then is single-quoted, so nothing reaches the remote shell unescaped.
import { executeCommand } from '../../infra/ssh.js';
import { ServerCredentials, CommandResult } from '../servers/types.js';
import { badRequest } from '../../http/errors.js';

// Docker names/ids: letters, digits, _ . - (compose project and image refs also allow / : @).
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\/:@-]{0,255}$/;

export function checkName(v: unknown, re = NAME_RE): string {
  const s = String(v ?? '');
  if (!re.test(s)) throw badRequest(`Nama tidak valid: ${s.slice(0, 60)}`);
  return `'${s}'`; // regex already forbids quotes
}

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

const SEP = '␟'; // unit separator char; never appears in docker output

const pct = (s: string) => parseFloat(String(s).replace('%', '')) || 0;

export async function fetchDockerOverview(server: ServerCredentials, withStats = true): Promise<DockerOverview> {
  const f = (fields: string[]) => `'${fields.map((x) => `{{${x}}}`).join(SEP)}'`;
  const script = [
    'command -v docker >/dev/null 2>&1 || { echo "@@NODOCKER"; exit 0; }',
    'echo "@@VERSION"; docker version --format "{{.Server.Version}}" 2>/dev/null',
    'echo "@@COMPOSE"; (docker compose version --short 2>/dev/null || docker-compose version --short 2>/dev/null)',
    `echo "@@PS"; docker ps -a --no-trunc --format ${f([
      '.ID', '.Names', '.Image', '.State', '.Status', '.Ports',
      '.Label "com.docker.compose.project"', '.Label "com.docker.compose.service"',
      '.Label "com.docker.compose.project.working_dir"', '.CreatedAt', '.Label "com.docker.compose.project.config_files"'
    ])}`,
    withStats ? `echo "@@STATS"; docker stats --no-stream --format ${f(['.ID', '.CPUPerc', '.MemUsage', '.MemPerc', '.NetIO'])} 2>/dev/null` : '',
    `echo "@@IMAGES"; docker images --format ${f(['.ID', '.Repository', '.Tag', '.Size', '.CreatedSince'])}`,
    `echo "@@USED"; docker ps -a --format '{{.Image}}' ; docker ps -aq | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null`,
    `echo "@@DF"; docker system df --format ${f(['.Type', '.TotalCount', '.Active', '.Size', '.Reclaimable'])}`,
    `echo "@@HEALTH"; docker ps -aq | xargs -r docker inspect --format '{{.Id}}${SEP}{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null`
  ].filter(Boolean).join('\n');

  const { stdout } = await executeCommand(server, script, 45000);
  if (stdout.includes('@@NODOCKER')) {
    return { installed: false, version: '', composeVersion: '', containers: [], images: [], df: [] };
  }

  const sections: Record<string, string[]> = {};
  let cur = '';
  for (const line of stdout.split('\n')) {
    if (line.startsWith('@@')) { cur = line.slice(2).trim(); sections[cur] = []; continue; }
    if (cur && line.trim()) sections[cur].push(line.replace(/\r$/, ''));
  }

  const stats = new Map<string, string[]>();
  for (const l of sections.STATS || []) { const p = l.split(SEP); stats.set(p[0], p); }
  const health = new Map<string, string>();
  for (const l of sections.HEALTH || []) { const [id, h] = l.split(SEP); if (h) health.set(id, h); }

  const containers: DockerContainer[] = (sections.PS || []).map((l) => {
    const [id, name, image, state, status, ports, project, service, workingDir, createdAt, configFiles] = l.split(SEP);
    // docker stats prints the 12-char short id
    const st = stats.get(id.slice(0, 12)) || stats.get(id);
    return {
      id: id.slice(0, 12), name, image, state, status, ports: ports || '', project: project || '', service: service || '',
      workingDir: workingDir || '', configFiles: configFiles || '', createdAt: createdAt || '',
      cpu: st ? pct(st[1]) : undefined, memUsage: st?.[2], memPercent: st ? pct(st[3]) : undefined, netIO: st?.[4],
      health: health.get(id)
    };
  });

  const used = new Set(sections.USED || []);
  const images: DockerImage[] = (sections.IMAGES || []).map((l) => {
    const [id, repo, tag, size, createdSince] = l.split(SEP);
    const ref = `${repo}:${tag}`;
    const inUse = used.has(ref) || used.has(repo) || [...used].some((u) => u.includes(id));
    return { id, repo, tag, size, createdSince, inUse };
  });

  const df = (sections.DF || []).map((l) => {
    const [type, total, active, size, reclaimable] = l.split(SEP);
    return { type, total, active, size, reclaimable };
  });

  return {
    installed: true,
    version: (sections.VERSION || [])[0] || '',
    composeVersion: (sections.COMPOSE || [])[0] || '',
    containers, images, df
  };
}

// ---------- actions ----------

const CONTAINER_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause', 'kill', 'rm'] as const;

export function containerCommand(id: unknown, action: string): string {
  if (!(CONTAINER_ACTIONS as readonly string[]).includes(action)) throw badRequest(`Aksi '${action}' tidak didukung`);
  const n = checkName(id);
  return action === 'rm' ? `docker rm -f ${n}` : `docker ${action} ${n}`;
}

const COMPOSE_ACTIONS: Record<string, string> = {
  restart: 'restart',
  stop: 'stop',
  start: 'start',
  up: 'up -d --remove-orphans',
  pull: 'pull',
  'pull-up': 'pull && $DC up -d --remove-orphans',
  down: 'down',
  ps: 'ps'
};

const PATH_RE = /^\/[a-zA-Z0-9_.\/-]{1,255}$/;
const checkPath = (v: string, what: string) => {
  if (!PATH_RE.test(v) || v.split('/').includes('..')) throw badRequest(`${what} tidak valid`);
  return `'${v}'`;
};

// Compose actions run from the project's own dir with its exact config files (both from container labels,
// re-validated here). Without -f, a project using e.g. docker-compose.prod.yml would silently not be found.
export function composeCommand(project: unknown, workingDir: unknown, action: string, configFiles: unknown = ''): string {
  const sub = COMPOSE_ACTIONS[action];
  if (!sub) throw badRequest(`Aksi compose '${action}' tidak didukung`);
  // Values are expanded inside DC="..." then word-split, so they must NOT carry their own quotes.
  // Safe because checkName/checkPath only allow [A-Za-z0-9_.-/] (no spaces, quotes, $ or globs).
  const unq = (q: string) => q.slice(1, -1);
  const p = unq(checkName(project));
  const dir = checkPath(String(workingDir ?? ''), 'working_dir');
  const files = String(configFiles ?? '').split(',').map((f) => f.trim()).filter(Boolean)
    .map((f) => `-f ${unq(checkPath(f, 'config file'))}`).join(' ');
  const args = `-p ${p}${files ? ` ${files}` : ''}`;
  return `cd ${dir} && DC="docker compose ${args}"; (docker compose version >/dev/null 2>&1 || DC="docker-compose ${args}"); $DC ${sub} 2>&1`;
}

const PRUNE: Record<string, string> = {
  images: 'docker image prune -af',
  'dangling-images': 'docker image prune -f',
  containers: 'docker container prune -f',
  volumes: 'docker volume prune -f',
  networks: 'docker network prune -f',
  'build-cache': 'docker builder prune -af'
};

export function pruneCommand(what: string): string {
  const cmd = PRUNE[what];
  if (!cmd) throw badRequest(`Prune '${what}' tidak didukung`);
  return `${cmd} 2>&1`;
}

export function imageRemoveCommand(image: unknown): string {
  return `docker rmi ${checkName(image, IMAGE_RE)} 2>&1`;
}

export async function inspectContainer(server: ServerCredentials, id: unknown) {
  const { stdout, stderr } = await executeCommand(server, `docker inspect ${checkName(id)} 2>&1`, 15000);
  let data: any;
  try { data = JSON.parse(stdout)[0]; } catch { throw new Error(stderr || stdout || 'inspect gagal'); }
  // Env vars commonly hold DB passwords/API keys: mask values by default.
  const env = (data.Config?.Env || []).map((e: string) => {
    const i = e.indexOf('=');
    const k = i === -1 ? e : e.slice(0, i);
    const v = i === -1 ? '' : e.slice(i + 1);
    const secret = /pass|secret|token|key|pwd|auth|credential|dsn|url/i.test(k);
    return { key: k, value: secret ? '••••••' : v, masked: secret };
  });
  return {
    id: data.Id?.slice(0, 12),
    name: String(data.Name || '').replace(/^\//, ''),
    image: data.Config?.Image,
    created: data.Created,
    startedAt: data.State?.StartedAt,
    restartCount: data.RestartCount,
    restartPolicy: data.HostConfig?.RestartPolicy?.Name,
    status: data.State?.Status,
    health: data.State?.Health?.Status,
    exitCode: data.State?.ExitCode,
    oomKilled: data.State?.OOMKilled,
    cmd: [].concat(data.Config?.Entrypoint || [], data.Config?.Cmd || []).join(' '),
    networks: Object.entries(data.NetworkSettings?.Networks || {}).map(([n, v]: any) => ({ name: n, ip: v.IPAddress })),
    mounts: (data.Mounts || []).map((m: any) => ({ type: m.Type, source: m.Source || m.Name, destination: m.Destination, rw: m.RW })),
    ports: Object.entries(data.NetworkSettings?.Ports || {}).map(([p, b]: any) => ({ container: p, host: (b || []).map((x: any) => `${x.HostIp}:${x.HostPort}`).join(', ') })),
    env
  };
}

// Legacy start/stop/restart used by the Services tab (DockerPanel uses containerCommand instead).
export async function manageDockerContainer(serverConfig: ServerCredentials, containerId: string, action = 'restart'): Promise<CommandResult> {
  const allowed = ['start', 'stop', 'restart'];
  if (!allowed.includes(action)) {
    throw badRequest(`Docker action '${action}' not supported`);
  }
  const cleanId = containerId.replace(/[^a-zA-Z0-9_\-]/g, '');
  const cmd = `docker ${action} ${cleanId}`;
  return await executeCommand(serverConfig, cmd, 15000);
}
