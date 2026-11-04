// Read-only inventory of common server software: one SSH round-trip, `command -v` + a version probe per tool.
// Nothing here installs or changes anything on the host.
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
const CATALOG: { id: string; name: string; category: SoftwareCategory; bins: string[]; version: string; units?: string[] }[] = [
  { id: 'node', name: 'Node.js', category: 'runtime', bins: ['node'], version: 'node -v' },
  { id: 'npm', name: 'npm', category: 'runtime', bins: ['npm'], version: 'npm -v' },
  { id: 'pnpm', name: 'pnpm', category: 'runtime', bins: ['pnpm'], version: 'pnpm -v' },
  { id: 'bun', name: 'Bun', category: 'runtime', bins: ['bun'], version: 'bun -v' },
  { id: 'php', name: 'PHP', category: 'runtime', bins: ['php'], version: 'php -v', units: ['php*-fpm'] },
  { id: 'composer', name: 'Composer', category: 'runtime', bins: ['composer'], version: 'COMPOSER_ALLOW_SUPERUSER=1 composer --version --no-ansi' },
  { id: 'python', name: 'Python', category: 'runtime', bins: ['python3', 'python'], version: '$BIN --version' },
  { id: 'go', name: 'Go', category: 'runtime', bins: ['go'], version: 'go version' },
  { id: 'java', name: 'Java', category: 'runtime', bins: ['java'], version: 'java -version' },
  { id: 'nginx', name: 'Nginx', category: 'web', bins: ['nginx'], version: 'nginx -v', units: ['nginx'] },
  { id: 'apache', name: 'Apache', category: 'web', bins: ['apache2', 'httpd'], version: '$BIN -v', units: ['apache2', 'httpd'] },
  { id: 'caddy', name: 'Caddy', category: 'web', bins: ['caddy'], version: 'caddy version', units: ['caddy'] },
  { id: 'certbot', name: 'Certbot', category: 'web', bins: ['certbot'], version: 'certbot --version' },
  { id: 'mysql', name: 'MySQL / MariaDB', category: 'database', bins: ['mysqld', 'mariadbd', 'mysql'], version: '$BIN --version', units: ['mysql', 'mariadb'] },
  { id: 'postgres', name: 'PostgreSQL', category: 'database', bins: ['psql'], version: 'psql --version', units: ['postgresql'] },
  { id: 'redis', name: 'Redis', category: 'database', bins: ['redis-server', 'redis-cli'], version: '$BIN --version', units: ['redis-server', 'redis'] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', bins: ['mongod'], version: 'mongod --version', units: ['mongod'] },
  { id: 'docker', name: 'Docker', category: 'container', bins: ['docker'], version: 'docker --version', units: ['docker'] },
  { id: 'compose', name: 'Docker Compose', category: 'container', bins: ['docker'], version: 'docker compose version' },
  { id: 'pm2', name: 'PM2', category: 'tooling', bins: ['pm2'], version: 'pm2 -v' },
  { id: 'supervisor', name: 'Supervisor', category: 'tooling', bins: ['supervisord'], version: 'supervisord -v', units: ['supervisor'] },
  { id: 'git', name: 'Git', category: 'tooling', bins: ['git'], version: 'git --version' },
  { id: 'ufw', name: 'UFW', category: 'security', bins: ['ufw'], version: 'ufw version', units: ['ufw'] },
  { id: 'fail2ban', name: 'Fail2ban', category: 'security', bins: ['fail2ban-client'], version: 'fail2ban-client --version', units: ['fail2ban'] },
  { id: 'autoupdates', name: 'Auto Updates', category: 'security', bins: ['unattended-upgrade'], version: 'echo active', units: ['unattended-upgrades'] }
];

/** Builds the probe script. Each tool prints one line: `@@<id>|<installed 0/1>|<version line>|<unit state>`. */
export function buildProbe(): string {
  const lines = CATALOG.map((c) => {
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
  return lines.join('\n');
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
