// Inventory & management of common server software: one SSH round-trip probe + service control & setup execution.
import { executeCommand } from '../../infra/ssh.js';
import type { ServerCredentials } from '../servers/types.js';

export type SoftwareCategory = 'runtime' | 'web' | 'database' | 'container' | 'tooling' | 'security';

export interface SoftwareItem {
  id: string;
  name: string;
  category: SoftwareCategory;
  installed: boolean;
  version: string | null;
  /** systemd unit state when the tool runs as a service: active, inactive, failed, … */
  service?: string | null;
}

// id, display name, category, binaries to try (first found wins), version command, systemd units to check.
// Version commands only ever print; `2>&1 | head -1` keeps one line whether the tool writes to stdout or stderr.
const CATALOG: {
  id: string;
  name: string;
  category: SoftwareCategory;
  bins: string[];
  version: string;
  units?: string[];
  customProbe?: string;
}[] = [
  // Runtimes & Package Managers
  { id: 'node', name: 'Node.js', category: 'runtime', bins: ['node'], version: 'node -v' },
  { id: 'npm', name: 'npm', category: 'runtime', bins: ['npm'], version: 'npm -v' },
  { id: 'pnpm', name: 'pnpm', category: 'runtime', bins: ['pnpm'], version: 'pnpm -v' },
  { id: 'yarn', name: 'Yarn', category: 'runtime', bins: ['yarn'], version: 'yarn -v' },
  { id: 'bun', name: 'Bun', category: 'runtime', bins: ['bun'], version: 'bun -v' },
  { id: 'deno', name: 'Deno', category: 'runtime', bins: ['deno'], version: 'deno --version' },
  { id: 'php', name: 'PHP', category: 'runtime', bins: ['php'], version: 'php -v', units: ['php*-fpm'] },
  { id: 'composer', name: 'Composer', category: 'runtime', bins: ['composer'], version: 'COMPOSER_ALLOW_SUPERUSER=1 composer --version --no-ansi' },
  { id: 'python', name: 'Python', category: 'runtime', bins: ['python3', 'python'], version: '$BIN --version' },
  { id: 'go', name: 'Go', category: 'runtime', bins: ['go'], version: 'go version' },
  { id: 'rust', name: 'Rust (Cargo)', category: 'runtime', bins: ['rustc', 'cargo'], version: '$BIN --version' },
  { id: 'java', name: 'Java (OpenJDK)', category: 'runtime', bins: ['java'], version: 'java -version' },

  // Web Servers, Reverse Proxies & Tunnels
  { id: 'nginx', name: 'Nginx', category: 'web', bins: ['nginx'], version: 'nginx -v', units: ['nginx'] },
  { id: 'apache', name: 'Apache', category: 'web', bins: ['apache2', 'httpd'], version: '$BIN -v', units: ['apache2', 'httpd'] },
  { id: 'caddy', name: 'Caddy', category: 'web', bins: ['caddy'], version: 'caddy version', units: ['caddy'] },
  { id: 'certbot', name: 'Certbot', category: 'web', bins: ['certbot'], version: 'certbot --version' },
  { id: 'cloudflared', name: 'Cloudflare Tunnel', category: 'web', bins: ['cloudflared'], version: 'cloudflared --version', units: ['cloudflared'] },
  { id: 'haproxy', name: 'HAProxy', category: 'web', bins: ['haproxy'], version: 'haproxy -v', units: ['haproxy'] },

  // Databases, Cache & Search
  { id: 'mysql', name: 'MySQL', category: 'database', bins: ['mysqld', 'mysql'], version: '$BIN --version', units: ['mysql'] },
  { id: 'mariadb', name: 'MariaDB', category: 'database', bins: ['mariadbd', 'mariadb'], version: '$BIN --version', units: ['mariadb'] },
  { id: 'postgres', name: 'PostgreSQL', category: 'database', bins: ['psql'], version: 'psql --version', units: ['postgresql'] },
  { id: 'redis', name: 'Redis', category: 'database', bins: ['redis-server', 'valkey-server', 'redis-cli'], version: '$BIN --version', units: ['redis-server', 'redis', 'valkey'] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', bins: ['mongod'], version: 'mongod --version', units: ['mongod'] },
  { id: 'sqlite', name: 'SQLite 3', category: 'database', bins: ['sqlite3'], version: 'sqlite3 --version' },
  { id: 'meilisearch', name: 'Meilisearch', category: 'database', bins: ['meilisearch'], version: 'meilisearch --version', units: ['meilisearch'] },

  // Containers & Orchestration
  { id: 'docker', name: 'Docker', category: 'container', bins: ['docker'], version: 'docker --version', units: ['docker'] },
  { id: 'compose', name: 'Docker Compose', category: 'container', bins: ['docker'], version: 'docker compose version' },
  { id: 'podman', name: 'Podman', category: 'container', bins: ['podman'], version: 'podman --version' },
  { id: 'lazydocker', name: 'Lazydocker', category: 'container', bins: ['lazydocker'], version: 'lazydocker --version' },

  // Tooling, Process Managers & Media
  { id: 'pm2', name: 'PM2', category: 'tooling', bins: ['pm2'], version: 'pm2 -v' },
  { id: 'supervisor', name: 'Supervisor', category: 'tooling', bins: ['supervisord'], version: 'supervisord -v', units: ['supervisor'] },
  { id: 'git', name: 'Git', category: 'tooling', bins: ['git'], version: 'git --version' },
  { id: 'gh', name: 'GitHub CLI', category: 'tooling', bins: ['gh'], version: 'gh --version' },
  { id: 'ffmpeg', name: 'FFmpeg', category: 'tooling', bins: ['ffmpeg'], version: 'ffmpeg -version' },
  { id: 'rclone', name: 'Rclone', category: 'tooling', bins: ['rclone'], version: 'rclone --version' },

  // Security, Network & System
  { id: 'ufw', name: 'UFW', category: 'security', bins: ['ufw'], version: 'ufw version', units: ['ufw'] },
  { id: 'fail2ban', name: 'Fail2ban', category: 'security', bins: ['fail2ban-client'], version: 'fail2ban-client --version', units: ['fail2ban'] },
  {
    id: 'swap',
    name: 'Swap Memory',
    category: 'security',
    bins: ['free'],
    version: 'echo active',
    units: ['swap'],
    customProbe: `SW_MB=$(free -m 2>/dev/null | awk '/^Swap:/{print $2}'); if [ -n "$SW_MB" ] && [ "$SW_MB" -gt 0 ] 2>/dev/null; then echo "@@swap|1|\${SW_MB}.0|active"; else echo "@@swap|0||"; fi`
  },
  { id: 'tailscale', name: 'Tailscale VPN', category: 'security', bins: ['tailscale'], version: 'tailscale version', units: ['tailscaled'] },
  { id: 'autoupdates', name: 'Auto Updates', category: 'security', bins: ['unattended-upgrade'], version: 'echo active', units: ['unattended-upgrades'] }
];

/** Builds the probe script. Each tool prints one line: `@@<id>|<installed 0/1>|<version line>|<unit state>`. */
export function buildProbe(): string {
  const header = `export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/local/go/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.deno/bin:$HOME/.local/bin"`;
  const lines = CATALOG.map((c) => {
    if (c.customProbe) {
      return c.customProbe;
    }
    const bins = c.bins.join(' ');
    // `systemctl is-active` on a glob (php*-fpm) needs the unit list; take the first matching unit's state.
    const unit = c.units
      ? `U=$(for u in ${c.units.join(' ')}; do s=$(systemctl list-units --all --plain --no-legend "$u.service" 2>/dev/null | awk 'NR==1{print $3}'); [ -n "$s" ] && { echo "$s"; break; }; done)`
      : 'U=';
    // BIN is exported into the inner sh so version commands can use whichever binary was found.
    // timeout keeps one hung tool (e.g. a broken java) from stalling the whole probe.
    return `BIN=; for b in ${bins}; do command -v "$b" >/dev/null 2>&1 && { BIN=$b; break; }; done
if [ -n "$BIN" ]; then V=$(BIN="$BIN" timeout 5 sh -c '${c.version.replace(/'/g, `'\\''`)}' 2>&1 | head -1 | tr -d '|\\r'); ${unit}; echo "@@${c.id}|1|$V|$U"; else echo "@@${c.id}|0||"; fi`;
  });
  return [header, ...lines].join('\n');
}

// Pull a version number out of whatever banner the tool prints ("nginx version: nginx/1.24.0" → "1.24.0").
export function parseVersion(raw: string): string | null {
  const m = raw.match(/v?(\d+\.\d+(?:\.\d+)?(?:[-+._][0-9A-Za-z]+)*)/);
  return m ? m[1] : raw.trim() || null;
}

export function parseInventory(stdout: string): SoftwareItem[] {
  const rows = new Map<string, string[]>();
  for (const line of stdout.split('\n')) {
    if (line.startsWith('@@')) {
      const [id, ...rest] = line.slice(2).split('|');
      rows.set(id, rest);
    }
  }
  return CATALOG.map((c) => {
    const [ok, rawVer = '', unit = ''] = rows.get(c.id) || [];
    // `docker compose version` fails on hosts without the plugin while `docker` itself exists.
    const installed = ok === '1' && !(c.id === 'compose' && !/version/i.test(rawVer));
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      installed,
      version: installed ? parseVersion(rawVer) : null,
      ...(c.units ? { service: installed ? unit.trim() || null : null } : {})
    };
  });
}

export async function fetchSoftware(target: ServerCredentials): Promise<SoftwareItem[]> {
  const r = await executeCommand(target, buildProbe(), 60000);
  return parseInventory(r.stdout);
}

export interface UpgradableInfo {
  package: string;
  currentVersion: string;
  newVersion: string;
}

export function parseUpgradable(stdout: string): Record<string, UpgradableInfo> {
  const map: Record<string, UpgradableInfo> = {};
  for (const line of stdout.split('\n')) {
    const m = line.match(/^([a-z0-9._+-]+)\/[^ ]+\s+([a-z0-9.:~_-]+)\s+[^\[]+\[upgradable from:\s+([^\]]+)\]/i);
    if (m) {
      const pkg = m[1].toLowerCase();
      map[pkg] = { package: m[1], newVersion: m[2], currentVersion: m[3] };
    }
  }
  return map;
}

export async function fetchUpgradablePackages(target: ServerCredentials): Promise<Record<string, UpgradableInfo>> {
  try {
    const r = await executeCommand(target, 'timeout 15 apt list --upgradable 2>/dev/null', 20000);
    return parseUpgradable(r.stdout);
  } catch {
    return {};
  }
}

export async function controlSoftwareService(
  target: ServerCredentials,
  toolId: string,
  action: 'start' | 'stop' | 'restart' | 'reload'
): Promise<{ ok: boolean; unit: string; state: string; output: string }> {
  const allowedActions = new Set(['start', 'stop', 'restart', 'reload']);
  if (!allowedActions.has(action)) {
    throw new Error(`Invalid service action: ${action}`);
  }
  const entry = CATALOG.find((c) => c.id === toolId);
  if (!entry || !entry.units || entry.units.length === 0) {
    throw new Error(`Tool "${toolId}" does not have a managed systemd service.`);
  }

  const sudoPass = target.sudoPassword || (target.authType === 'password' ? target.password : undefined);
  const hasSudoPass = !!sudoPass;

  if (toolId === 'swap') {
    const swapCmd = action === 'stop' ? 'swapoff -a' : 'swapon -a';
    const script = `
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  if [ -n "$__7SERVER_HAS_SUDO_PASS" ]; then
    sudo -S -p '' ${swapCmd} 2>&1
  elif sudo -n true 2>/dev/null; then
    sudo -n ${swapCmd} 2>&1
  else
    ${swapCmd} 2>&1
  fi
else
  ${swapCmd} 2>&1
fi
SW=$(free -m | awk '/^Swap:/{print $2}')
[ "$SW" -gt 0 ] && echo "STATE:active" || echo "STATE:inactive"
`;
    const r = await executeCommand(
      target,
      `export __7SERVER_HAS_SUDO_PASS=${hasSudoPass ? '1' : ''}\n${script}`,
      20000,
      hasSudoPass ? { stdin: `${sudoPass}\n` } : {}
    );
    const stateMatch = r.stdout.match(/STATE:(active|inactive)/);
    return {
      ok: true,
      unit: 'swap',
      state: stateMatch ? stateMatch[1] : 'active',
      output: r.stdout.replace(/STATE:(active|inactive)/, '').trim()
    };
  }

  const unitsList = entry.units.join(' ');
  const script = `
UNIT=""
for u in ${unitsList}; do
  found=$(systemctl list-unit-files "$u.service" --plain --no-legend 2>/dev/null | awk 'NR==1{print $1}')
  if [ -n "$found" ]; then
    UNIT="$found"
    break
  fi
done
[ -z "$UNIT" ] && UNIT="${entry.units[0]}.service"

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  if [ -n "$__7SERVER_HAS_SUDO_PASS" ]; then
    sudo -S -p '' systemctl ${action} "$UNIT" 2>&1 || true
  elif sudo -n true 2>/dev/null; then
    sudo -n systemctl ${action} "$UNIT" 2>&1 || true
  else
    systemctl ${action} "$UNIT" 2>&1 || true
  fi
else
  systemctl ${action} "$UNIT" 2>&1 || true
fi

STATE=$(systemctl is-active "$UNIT" 2>/dev/null || echo "inactive")
echo "@@RESULT|$UNIT|$STATE"
`;
  const r = await executeCommand(
    target,
    `export __7SERVER_HAS_SUDO_PASS=${hasSudoPass ? '1' : ''}\n${script}`,
    30000,
    hasSudoPass ? { stdin: `${sudoPass}\n` } : {}
  );
  const lines = r.stdout.trim().split('\n');
  const resLine = lines.find((l) => l.startsWith('@@RESULT|'));
  const [, unit = entry.units[0], state = 'unknown'] = resLine ? resLine.split('|') : [];
  const output = lines.filter((l) => !l.startsWith('@@RESULT|')).join('\n').trim();
  return {
    ok: state === 'active' || (action === 'stop' && state !== 'active'),
    unit,
    state: state.trim(),
    output
  };
}

export async function executeSoftwareScript(
  target: ServerCredentials,
  script: string,
  sudoPasswordOverride?: string
): Promise<{ ok: boolean; exitCode: number; output: string; durationMs: number; sudoRequired?: boolean }> {
  if (!script || !script.trim()) {
    throw new Error('Script cannot be empty');
  }
  const start = Date.now();
  const safeId = Math.random().toString(36).slice(2, 10);
  const remoteFile = `/tmp/__7server_setup_${safeId}.sh`;

  // Determine effective sudo password
  const sudoPass = sudoPasswordOverride || target.sudoPassword || (target.authType === 'password' ? target.password : undefined);
  const hasSudoPass = !!sudoPass;

  const wrapper = `cat << 'EOF_7SERVER_SCRIPT' > ${remoteFile}
${script}
EOF_7SERVER_SCRIPT
chmod +x ${remoteFile}
export DEBIAN_FRONTEND=noninteractive

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  if [ -n "$__7SERVER_HAS_SUDO_PASS" ]; then
    sudo -S -p '' -E bash ${remoteFile} 2>&1
  elif sudo -n true 2>/dev/null; then
    sudo -n -E bash ${remoteFile} 2>&1
  else
    echo "__7SERVER_SUDO_REQUIRED__"
    echo "sudo: a password is required for $(whoami) on $(hostname) to install system packages"
    EXIT_CODE=126
  fi
else
  bash ${remoteFile} 2>&1
fi
[ -z "$EXIT_CODE" ] && EXIT_CODE=$?
rm -f ${remoteFile}
echo "__7SERVER_EXIT_CODE:\${EXIT_CODE}"
`;

  const wrappedCmd = `export __7SERVER_HAS_SUDO_PASS=${hasSudoPass ? '1' : ''}\n${wrapper}`;
  const r = await executeCommand(
    target,
    wrappedCmd,
    300000,
    hasSudoPass ? { stdin: `${sudoPass}\n` } : {}
  );

  const combined = `${r.stdout || ''}${r.stderr ? `\n${r.stderr}` : ''}`;
  const isSudoRequired = combined.includes('__7SERVER_SUDO_REQUIRED__');
  const match = combined.match(/__7SERVER_EXIT_CODE:(\d+)/);
  const exitCode = match ? parseInt(match[1], 10) : (isSudoRequired ? 126 : r.code ?? 0);
  const cleanOutput = combined
    .replace('__7SERVER_SUDO_REQUIRED__', '')
    .replace(/__7SERVER_EXIT_CODE:\d+\s*$/, '')
    .trim();

  return {
    ok: exitCode === 0,
    exitCode,
    output: cleanOutput,
    durationMs: Date.now() - start,
    sudoRequired: isSudoRequired
  };
}
