// Finds databases on a server using each adapter's DiscoverHint: running containers by image,
// host installs by systemd unit / listening port / client binary. Read-only, one SSH round-trip.
import { executeCommand } from '../infra/ssh.js';
import { ServerCredentials } from '../modules/servers/types.js';
import { adapters } from './registry.js';
import { DbConnection } from './types.js';

export interface DiscoveredDb {
  engine: string;
  name: string;
  location: DbConnection['location'];
  auth: DbConnection['auth'];
  host?: string;
  port?: number;
  image?: string;
  note?: string;
}

const SEP = '␟';

/** Repo part of an image ref, lower-cased: "ghcr.io/x/mysql:8.0@sha" -> "x/mysql"; bare ids stay as-is. */
export function imageRepo(image: string): string {
  let s = image.toLowerCase().split('@')[0];
  const parts = s.split('/');
  if (parts.length > 1 && /[.:]/.test(parts[0])) parts.shift(); // registry host
  s = parts.join('/');
  return s.replace(/:[^/]*$/, '');
}

export async function discoverDatabases(server: ServerCredentials): Promise<DiscoveredDb[]> {
  const all = [...adapters.values()];
  const units = [...new Set(all.flatMap((a) => a.discover?.units || []))];
  const bins = [...new Set(all.map((a) => a.discover?.binary).filter(Boolean))];
  const script = [
    `if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}${SEP}{{.Image}}${SEP}{{.Ports}}' | while IFS='${SEP}' read -r n i p; do`,
    // Image may be a bare id (e.g. "47b082957377"); resolve the repo tag so it can still be matched.
    `  case "$i" in *[!0-9a-f]*) r="$i";; *) r=$(docker image inspect "$i" --format '{{if .RepoTags}}{{index .RepoTags 0}}{{end}}' 2>/dev/null); [ -n "$r" ] || r=$(docker inspect "$n" --format '{{.Config.Image}}');; esac;`,
    `  printf 'C${SEP}%s${SEP}%s${SEP}%s\\n' "$n" "$r" "$p"; done; fi`,
    ...units.map((u) => `systemctl is-active --quiet ${u} 2>/dev/null && echo 'U${SEP}${u}'`),
    ...bins.map((b) => `command -v ${b} >/dev/null 2>&1 && echo 'B${SEP}${b}'`),
    `ss -ltnH 2>/dev/null | awk '{print "L${SEP}"$4}'`
  ].join('\n');

  const { stdout } = await executeCommand(server, script, 45000);
  const found: DiscoveredDb[] = [];
  const activeUnits = new Set<string>();
  const binaries = new Set<string>();
  const listening = new Map<number, string>(); // port -> bind address

  for (const line of stdout.split('\n')) {
    const [kind, a, b, c] = line.split(SEP);
    if (kind === 'U') activeUnits.add(a);
    else if (kind === 'B') binaries.add(a);
    else if (kind === 'L' && a) {
      const m = /^(.*):(\d+)$/.exec(a);
      if (m) listening.set(Number(m[2]), m[1]);
    } else if (kind === 'C' && a) {
      const repo = imageRepo(b || '');
      const adapter = all.find((ad) => ad.discover?.images?.test(repo));
      if (adapter) {
        found.push({
          engine: adapter.id,
          name: a,
          location: { kind: 'container', container: a },
          auth: adapter.authModes.includes('container-env') ? 'container-env' : adapter.authModes[0],
          image: b,
          note: c ? `ports: ${c}` : undefined
        });
      }
    }
  }

  for (const ad of all) {
    const d = ad.discover;
    if (!d) continue;
    const unitHit = d.units?.find((u) => activeUnits.has(u));
    const bind = d.port !== undefined ? listening.get(d.port) : undefined;
    // A port bound by docker-proxy belongs to a container already found above; require the unit or the binary too.
    if (!unitHit && !(bind !== undefined && d.binary && binaries.has(d.binary))) continue;
    const exposed = bind !== undefined && !/^(127\.|\[::1\]|localhost)/.test(bind);
    found.push({
      engine: ad.id,
      name: `${ad.label} (host)`,
      location: { kind: 'host' },
      // root on the host can usually use socket/peer auth for MySQL and Postgres.
      auth: ad.authModes.includes('socket') ? 'socket' : ad.authModes[0],
      port: d.port,
      note: [
        unitHit ? `service ${unitHit}` : '',
        d.binary && !binaries.has(d.binary) ? `klien ${d.binary} tidak terpasang` : '',
        exposed ? `⚠ port ${d.port} terbuka di ${bind}` : ''
      ].filter(Boolean).join(' · ') || undefined
    });
  }
  return found;
}
