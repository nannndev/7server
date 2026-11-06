// Docker inventory & actions over SSH. Every user-supplied name goes through a strict allowlist,
// then is single-quoted, so nothing reaches the remote shell unescaped.
import { executeCommand, executeCommandStream } from '../../infra/ssh.js';
import { ServerCredentials, CommandResult } from '../servers/types.js';
import { badRequest } from '../../http/errors.js';

// Docker names/ids: letters, digits, _ . - (compose project and image refs also allow / : @).
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const IMAGE_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\/:@-]{0,255}$/;
const PATH_RE = /^\/[a-zA-Z0-9_.\/-]{1,255}$/;

export function checkName(v: unknown, re = NAME_RE): string {
  const s = String(v ?? '');
  if (!re.test(s)) throw badRequest(`Nama tidak valid: ${s.slice(0, 60)}`);
  return `'${s}'`; // regex already forbids quotes
}

export function checkPath(v: string, what: string): string {
  if (!PATH_RE.test(v) || v.split('/').includes('..')) throw badRequest(`${what} tidak valid`);
  return `'${v}'`;
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

const SEP = '␟'; // unit separator char; never appears in docker output

const pct = (s: string) => parseFloat(String(s).replace('%', '')) || 0;

export async function executeDockerCommand(
  server: ServerCredentials,
  cmd: string,
  timeoutMs = 60000,
  opts?: { stdin?: string }
): Promise<CommandResult> {
  const sudoPass = server.sudoPassword || (server.authType === 'password' ? server.password : undefined);
  const hasSudoPass = !!sudoPass;

  // Self-healing pre-flight for non-root users: if /var/run/docker.sock is not writable,
  // grant group membership and socket rw permissions using sudo so docker works seamlessly.
  const wrapper = `
if [ "$(id -u)" -ne 0 ] && [ -S /var/run/docker.sock ] && [ ! -w /var/run/docker.sock ]; then
  if [ -n "$__7SERVER_HAS_SUDO_PASS" ]; then
    sudo -S -p '' usermod -aG docker $(whoami) 2>/dev/null || true
    sudo -S -p '' chmod 666 /var/run/docker.sock 2>/dev/null || true
  elif sudo -n true 2>/dev/null; then
    sudo -n usermod -aG docker $(whoami) 2>/dev/null || true
    sudo -n chmod 666 /var/run/docker.sock 2>/dev/null || true
  fi
fi
${cmd}
`;

  const wrappedCmd = `export __7SERVER_HAS_SUDO_PASS=${hasSudoPass ? '1' : ''}\n${wrapper}`;
  return executeCommand(
    server,
    wrappedCmd,
    timeoutMs,
    hasSudoPass ? { stdin: `${sudoPass}\n${opts?.stdin || ''}` } : opts
  );
}

export async function executeDockerCommandStream(
  server: ServerCredentials,
  cmd: string,
  onChunk: (chunk: string, isStderr: boolean) => void,
  timeoutMs = 180000,
  opts?: { stdin?: string }
): Promise<CommandResult> {
  const sudoPass = server.sudoPassword || (server.authType === 'password' ? server.password : undefined);
  const hasSudoPass = !!sudoPass;

  const wrapper = `
if [ "$(id -u)" -ne 0 ] && [ -S /var/run/docker.sock ] && [ ! -w /var/run/docker.sock ]; then
  if [ -n "$__7SERVER_HAS_SUDO_PASS" ]; then
    sudo -S -p '' usermod -aG docker $(whoami) 2>/dev/null || true
    sudo -S -p '' chmod 666 /var/run/docker.sock 2>/dev/null || true
  elif sudo -n true 2>/dev/null; then
    sudo -n usermod -aG docker $(whoami) 2>/dev/null || true
    sudo -n chmod 666 /var/run/docker.sock 2>/dev/null || true
  fi
fi
${cmd}
`;

  const wrappedCmd = `export __7SERVER_HAS_SUDO_PASS=${hasSudoPass ? '1' : ''}\n${wrapper}`;
  return executeCommandStream(
    server,
    wrappedCmd,
    onChunk,
    timeoutMs,
    hasSudoPass ? { stdin: `${sudoPass}\n${opts?.stdin || ''}` } : opts
  );
}

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
    `echo "@@VOLUMES"; docker volume ls --format ${f(['.Name', '.Driver', '.Scope'])}`,
    `echo "@@NETWORKS"; docker network ls --format ${f(['.ID', '.Name', '.Driver', '.Scope'])}`,
    `echo "@@USED"; docker ps -a --format '{{.Image}}' ; docker ps -aq | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null`,
    `echo "@@DF"; docker system df --format ${f(['.Type', '.TotalCount', '.Active', '.Size', '.Reclaimable'])}`,
    `echo "@@HEALTH"; docker ps -aq | xargs -r docker inspect --format '{{.Id}}${SEP}{{if .State.Health}}{{.State.Health.Status}}{{end}}' 2>/dev/null`,
    `echo "@@VOLUMES_USED"; cids="$(docker ps -aq 2>/dev/null)"; if [ -n "$cids" ]; then docker inspect $cids --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}␟{{$.Name}}{{println}}{{end}}{{end}}' 2>/dev/null; fi`,
    `echo "@@NETWORKS_USED"; if [ -n "$cids" ]; then docker inspect $cids --format '{{range $net, $val := .NetworkSettings.Networks}}{{$net}}␟{{$.Name}}{{println}}{{end}}' 2>/dev/null; fi`
  ].filter(Boolean).join('\n');

  const { stdout } = await executeDockerCommand(server, script, 45000);
  if (stdout.includes('@@NODOCKER')) {
    return { installed: false, version: '', composeVersion: '', containers: [], images: [], volumes: [], networks: [], df: [] };
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

  const volUsed = new Map<string, string[]>();
  for (const l of sections.VOLUMES_USED || []) {
    const [vol, cname] = l.split(SEP);
    if (vol && cname) {
      const cleanName = cname.replace(/^\//, '');
      const list = volUsed.get(vol) || [];
      if (!list.includes(cleanName)) list.push(cleanName);
      volUsed.set(vol, list);
    }
  }

  const netUsed = new Map<string, string[]>();
  for (const l of sections.NETWORKS_USED || []) {
    const [net, cname] = l.split(SEP);
    if (net && cname) {
      const cleanName = cname.replace(/^\//, '');
      const list = netUsed.get(net) || [];
      if (!list.includes(cleanName)) list.push(cleanName);
      netUsed.set(net, list);
    }
  }

  const volumes: DockerVolume[] = (sections.VOLUMES || []).map((l) => {
    const [name, driver, scope] = l.split(SEP);
    const attached = volUsed.get(name) || [];
    return {
      name,
      driver: driver || 'local',
      scope: scope || 'local',
      inUse: attached.length > 0,
      containers: attached
    };
  });

  const networks: DockerNetwork[] = (sections.NETWORKS || []).map((l) => {
    const [id, name, driver, scope] = l.split(SEP);
    const attached = netUsed.get(name) || [];
    return {
      id: id ? id.slice(0, 12) : '',
      name,
      driver: driver || 'bridge',
      scope: scope || 'local',
      containersCount: attached.length
    };
  });

  const df = (sections.DF || []).map((l) => {
    const [type, total, active, size, reclaimable] = l.split(SEP);
    return { type, total, active, size, reclaimable };
  });

  return {
    installed: true,
    version: (sections.VERSION || [])[0] || '',
    composeVersion: (sections.COMPOSE || [])[0] || '',
    containers, images, volumes, networks, df
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

export function pullImageCommand(image: unknown): string {
  return `docker pull ${checkName(image, IMAGE_RE)} 2>&1`;
}

export function volumeCreateCommand(name: unknown, driver?: unknown): string {
  const n = checkName(name);
  const d = driver ? ` --driver ${checkName(driver)}` : '';
  return `docker volume create${d} ${n} 2>&1`;
}

export function volumeRemoveCommand(name: unknown): string {
  return `docker volume rm ${checkName(name)} 2>&1`;
}

export async function inspectVolume(server: ServerCredentials, name: unknown) {
  const { stdout, stderr } = await executeDockerCommand(server, `docker volume inspect ${checkName(name)} 2>&1`, 15000);
  let data: any;
  try { data = JSON.parse(stdout)[0]; } catch { throw new Error(stderr || stdout || 'volume inspect gagal'); }
  return data;
}

export function networkCreateCommand(name: unknown, driver?: unknown, subnet?: unknown): string {
  const n = checkName(name);
  const d = driver ? ` --driver ${checkName(driver)}` : '';
  const s = subnet ? ` --subnet ${checkName(subnet, /^[0-9./]{7,32}$/)}` : '';
  return `docker network create${d}${s} ${n} 2>&1`;
}

export function networkRemoveCommand(name: unknown): string {
  const s = String(name ?? '');
  if (['bridge', 'host', 'none'].includes(s)) {
    throw badRequest(`Jaringan default '${s}' tidak dapat dihapus`);
  }
  return `docker network rm ${checkName(name)} 2>&1`;
}

export async function inspectNetwork(server: ServerCredentials, name: unknown) {
  const { stdout, stderr } = await executeDockerCommand(server, `docker network inspect ${checkName(name)} 2>&1`, 15000);
  let data: any;
  try { data = JSON.parse(stdout)[0]; } catch { throw new Error(stderr || stdout || 'network inspect gagal'); }
  return data;
}

export interface RunContainerOptions {
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

export function runContainerCommand(options: RunContainerOptions): string {
  if (!options) throw badRequest('Opsi container tidak boleh kosong');
  const name = checkName(options.name);
  const image = checkName(options.image, IMAGE_RE);

  const PORT_RE = /^([0-9]{1,5}:)?[0-9]{1,5}(\/(tcp|udp))?$/;
  const portArgs = (options.ports || []).map((p) => {
    const s = String(p).trim();
    if (!s) return '';
    if (!PORT_RE.test(s)) throw badRequest(`Port binding tidak valid: ${s}`);
    return `-p '${s}'`;
  }).filter(Boolean).join(' ');

  const envArgs = (options.env || []).map((e) => {
    const s = String(e).trim();
    if (!s) return '';
    const eq = s.indexOf('=');
    if (eq === -1) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)) throw badRequest(`Nama env tidak valid: ${s}`);
      return `-e '${s}'`;
    }
    const key = s.slice(0, eq).trim();
    const val = s.slice(eq + 1);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw badRequest(`Nama env tidak valid: ${key}`);
    return `-e '${key}=${val.replace(/'/g, "'\\''")}'`;
  }).filter(Boolean).join(' ');

  const volArgs = (options.volumes || []).map((v) => {
    const s = String(v).trim();
    if (!s) return '';
    const parts = s.split(':');
    if (parts.length < 2 || parts.length > 3) throw badRequest(`Volume mapping tidak valid: ${s}`);
    const [src, dst, mode] = parts;
    if (!PATH_RE.test(src) && !NAME_RE.test(src)) throw badRequest(`Source volume tidak valid: ${src}`);
    if (!PATH_RE.test(dst)) throw badRequest(`Target volume path tidak valid: ${dst}`);
    if (mode && !['ro', 'rw'].includes(mode)) throw badRequest(`Mode volume tidak valid: ${mode}`);
    return `-v '${s}'`;
  }).filter(Boolean).join(' ');

  const netArg = options.network ? `--network ${checkName(options.network)}` : '';

  const RESTART_ALLOWED = ['no', 'always', 'unless-stopped', 'on-failure'];
  const restart = options.restart || 'unless-stopped';
  if (!RESTART_ALLOWED.includes(restart)) throw badRequest(`Restart policy '${restart}' tidak valid`);
  const restartArg = `--restart ${restart}`;

  const memArg = options.memory ? (/^[0-9]+[kmg]$/i.test(options.memory) ? `--memory ${options.memory}` : (() => { throw badRequest(`Format memory tidak valid: ${options.memory}`); })()) : '';

  const cmdArg = options.cmd ? String(options.cmd).replace(/[;\n\r]/g, ' ').trim() : '';

  return `docker run -d --name ${name} ${restartArg} ${netArg} ${memArg} ${portArgs} ${envArgs} ${volArgs} ${image} ${cmdArg}`.replace(/\s+/g, ' ').trim();
}

export async function getContainerLogs(server: ServerCredentials, id: unknown, tail = 200, timestamps = false): Promise<string> {
  const t = Math.min(Math.max(1, Number(tail) || 200), 2000);
  const ts = timestamps ? ' --timestamps' : '';
  const { stdout, stderr } = await executeDockerCommand(server, `docker logs --tail ${t}${ts} ${checkName(id)} 2>&1`, 30000);
  return (stdout + stderr).trim();
}

export async function readComposeFile(server: ServerCredentials, workingDir: string, configFile = 'docker-compose.yml'): Promise<{ composeContent: string; envContent: string }> {
  const dir = checkPath(workingDir, 'working_dir');
  const cfg = configFile.replace(/[^a-zA-Z0-9_.-]/g, '') || 'docker-compose.yml';
  const script = [
    `cat ${dir}/${cfg} 2>/dev/null || echo "@@NOCOMPOSE"`,
    `echo "@@ENV_SPLIT"`,
    `cat ${dir}/.env 2>/dev/null || echo ""`
  ].join('\n');
  const { stdout } = await executeCommand(server, script, 15000);
  const parts = stdout.split('@@ENV_SPLIT');
  const rawCompose = (parts[0] || '').trim();
  const rawEnv = (parts[1] || '').trim();
  if (rawCompose === '@@NOCOMPOSE') {
    throw new Error(`File ${cfg} tidak ditemukan di direktori ${workingDir}`);
  }
  return {
    composeContent: rawCompose,
    envContent: rawEnv
  };
}

export async function deployComposeStack(server: ServerCredentials, {
  project,
  workingDir,
  composeContent,
  envContent,
  configFile = 'docker-compose.yml'
}: {
  project: string;
  workingDir: string;
  composeContent: string;
  envContent?: string;
  configFile?: string;
}): Promise<string> {
  const p = checkName(project);
  const dir = checkPath(workingDir, 'working_dir');
  const cfg = configFile.replace(/[^a-zA-Z0-9_.-]/g, '') || 'docker-compose.yml';
  const b64Compose = Buffer.from(composeContent, 'utf-8').toString('base64');
  const b64Env = envContent != null ? Buffer.from(envContent, 'utf-8').toString('base64') : null;

  const script = [
    `mkdir -p ${dir}`,
    `cd ${dir}`,
    `echo '${b64Compose}' | base64 -d > ${dir}/${cfg}`,
    b64Env != null ? `echo '${b64Env}' | base64 -d > ${dir}/.env` : '',
    `DC="docker compose -p ${p.slice(1, -1)} -f ${cfg}"; (docker compose version >/dev/null 2>&1 || DC="docker-compose -p ${p.slice(1, -1)} -f ${cfg}"); $DC up -d --remove-orphans 2>&1`
  ].filter(Boolean).join(' && ');

  const { stdout, stderr, code } = await executeDockerCommand(server, script, 300000);
  if (code !== 0) throw new Error((stderr || stdout || `exit ${code}`).trim());
  return (stdout + stderr).trim();
}

export async function inspectContainer(server: ServerCredentials, id: unknown) {
  const { stdout, stderr } = await executeDockerCommand(server, `docker inspect ${checkName(id)} 2>&1`, 15000);
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
  return await executeDockerCommand(serverConfig, cmd, 15000);
}
