import dns from 'dns/promises';
import { executeCommand } from '../../infra/ssh.js';
import { executeSoftwareScript } from '../software/service.js';
import type { ServerCredentials } from '../servers/types.js';
import { badRequest, notFound } from '../../http/errors.js';
import { sq } from '../../databases/shell.js';
import type { CloudflareTunnelRoute, CloudflareTunnelStatus, CloudflareTunnelInfo, DnsCheckResult } from './types.js';

/** Parse cloudflared YAML config into structured routes and tunnel ID */
export function parseCloudflaredConfig(content: string): {
  tunnelId?: string;
  credentialsFile?: string;
  routes: CloudflareTunnelRoute[];
} {
  const lines = content.split('\n');
  let tunnelId: string | undefined;
  let credentialsFile: string | undefined;
  const routes: CloudflareTunnelRoute[] = [];

  let inIngress = false;
  let currentRoute: Partial<CloudflareTunnelRoute> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    if (trimmed.startsWith('tunnel:')) {
      tunnelId = trimmed.replace(/^tunnel:\s*/, '').trim();
      continue;
    }
    if (trimmed.startsWith('credentials-file:')) {
      credentialsFile = trimmed.replace(/^credentials-file:\s*/, '').trim();
      continue;
    }
    if (trimmed.startsWith('ingress:')) {
      inIngress = true;
      continue;
    }

    if (inIngress) {
      // Check for a new item starting with "- "
      const isNewItem = /^\s*-\s+/.test(line);
      if (isNewItem) {
        if (currentRoute && currentRoute.service) {
          routes.push({
            hostname: currentRoute.hostname || '',
            service: currentRoute.service,
            path: currentRoute.path
          });
        }
        currentRoute = {};
        const rest = line.replace(/^\s*-\s+/, '').trim();
        if (rest.startsWith('hostname:')) {
          currentRoute.hostname = rest.replace(/^hostname:\s*/, '').trim();
        } else if (rest.startsWith('service:')) {
          currentRoute.service = rest.replace(/^service:\s*/, '').trim();
        } else if (rest.startsWith('path:')) {
          currentRoute.path = rest.replace(/^path:\s*/, '').trim();
        }
      } else if (currentRoute) {
        if (trimmed.startsWith('hostname:')) {
          currentRoute.hostname = trimmed.replace(/^hostname:\s*/, '').trim();
        } else if (trimmed.startsWith('service:')) {
          currentRoute.service = trimmed.replace(/^service:\s*/, '').trim();
        } else if (trimmed.startsWith('path:')) {
          currentRoute.path = trimmed.replace(/^path:\s*/, '').trim();
        }
      }
    }
  }

  if (currentRoute && currentRoute.service) {
    routes.push({
      hostname: currentRoute.hostname || '',
      service: currentRoute.service,
      path: currentRoute.path
    });
  }

  return { tunnelId, credentialsFile, routes };
}

/** Build clean, valid cloudflared YAML config from parsed routes */
export function buildCloudflaredConfig(
  tunnelId: string,
  credentialsFile: string,
  routes: CloudflareTunnelRoute[]
): string {
  const lines: string[] = [];
  if (tunnelId) lines.push(`tunnel: ${tunnelId}`);
  if (credentialsFile) lines.push(`credentials-file: ${credentialsFile}`);
  lines.push('');
  lines.push('ingress:');

  // Add all named hostname routes
  for (const r of routes) {
    if (r.hostname) {
      lines.push(`  - hostname: ${r.hostname}`);
      if (r.path) lines.push(`    path: ${r.path}`);
      lines.push(`    service: ${r.service}`);
    }
  }

  // Always end with fallback rule
  const fallback = routes.find(r => !r.hostname);
  lines.push(`  - service: ${fallback?.service || 'http_status:404'}`);
  lines.push('');

  return lines.join('\n');
}

/** Add or update a route in cloudflared config.yml */
export function addCloudflaredRoute(content: string, route: CloudflareTunnelRoute): string {
  const parsed = parseCloudflaredConfig(content);
  const cleanHost = route.hostname.toLowerCase().trim();

  const existingIdx = parsed.routes.findIndex(r => r.hostname.toLowerCase() === cleanHost);
  if (existingIdx !== -1) {
    parsed.routes[existingIdx] = {
      hostname: cleanHost,
      service: route.service,
      path: route.path
    };
  } else {
    // Insert before fallback if present
    const fallbackIdx = parsed.routes.findIndex(r => !r.hostname);
    const newRoute: CloudflareTunnelRoute = {
      hostname: cleanHost,
      service: route.service,
      path: route.path
    };
    if (fallbackIdx !== -1) {
      parsed.routes.splice(fallbackIdx, 0, newRoute);
    } else {
      parsed.routes.push(newRoute);
    }
  }

  return buildCloudflaredConfig(parsed.tunnelId || '', parsed.credentialsFile || '', parsed.routes);
}

/** Remove an ingress route by hostname */
export function removeCloudflaredRoute(content: string, hostname: string): string {
  const parsed = parseCloudflaredConfig(content);
  const cleanHost = hostname.toLowerCase().trim();
  parsed.routes = parsed.routes.filter(r => r.hostname.toLowerCase() !== cleanHost);
  return buildCloudflaredConfig(parsed.tunnelId || '', parsed.credentialsFile || '', parsed.routes);
}

/** Check DNS resolution for a domain and compare to server IP */
export async function checkDomainDns(domain: string, serverIp?: string): Promise<DnsCheckResult> {
  const cleanDomain = String(domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!cleanDomain || !cleanDomain.includes('.')) {
    throw badRequest('Invalid domain format');
  }

  const cleanServerIp = serverIp ? serverIp.trim().replace(/:\d+$/, '') : undefined;
  const resolvedIps: string[] = [];
  const cnames: string[] = [];

  try {
    const aRecords = await dns.resolve4(cleanDomain);
    resolvedIps.push(...aRecords);
  } catch (err: any) {
    // ENOTFOUND or ENODATA is expected when domain is not yet pointing
  }

  try {
    const cnameRecords = await dns.resolveCname(cleanDomain);
    cnames.push(...cnameRecords);
  } catch {
    // optional CNAME
  }

  if (resolvedIps.length === 0 && cnames.length === 0) {
    return {
      domain: cleanDomain,
      serverIp: cleanServerIp,
      resolvedIps: [],
      cnames: [],
      matched: false,
      status: 'nxdomain'
    };
  }

  const matched = cleanServerIp ? resolvedIps.includes(cleanServerIp) : resolvedIps.length > 0;
  return {
    domain: cleanDomain,
    serverIp: cleanServerIp,
    resolvedIps,
    cnames,
    matched,
    status: matched ? 'ok' : 'mismatch'
  };
}

/** Probe cloudflared status & tunnels on remote server over SSH */
export async function fetchCloudflareTunnelStatus(server: ServerCredentials): Promise<CloudflareTunnelStatus> {
  const probeScript = [
    'echo "@@INSTALLED"',
    'command -v cloudflared >/dev/null 2>&1 && echo "1" || echo "0"',
    'echo "@@VERSION"',
    'cloudflared --version 2>/dev/null || echo ""',
    'echo "@@ACTIVE"',
    'systemctl is-active cloudflared 2>/dev/null || (pgrep -x cloudflared >/dev/null 2>&1 && echo "active" || echo "inactive")',
    'echo "@@TUNNELS"',
    'cloudflared tunnel list 2>/dev/null || echo ""',
    'echo "@@CONFIG"',
    'for p in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /root/.cloudflared/config.yml /root/.cloudflared/config.yaml ~/.cloudflared/config.yml ~/.cloudflared/config.yaml; do',
    '  if [ -f "$p" ]; then',
    '    echo "$p"',
    '    cat "$p"',
    '    break',
    '  fi',
    'done'
  ].join('\n');

  const { stdout } = await executeCommand(server, probeScript, 15000);

  const sections: Record<string, string[]> = {};
  let cur = '';
  for (const line of stdout.split('\n')) {
    if (line.startsWith('@@')) {
      cur = line.slice(2).trim();
      sections[cur] = [];
      continue;
    }
    if (cur) sections[cur].push(line.replace(/\r$/, ''));
  }

  const installed = (sections.INSTALLED?.[0] || '').trim() === '1';
  const version = (sections.VERSION?.[0] || '').trim();
  const active = (sections.ACTIVE?.[0] || '').trim() === 'active';

  // Parse available tunnels from `cloudflared tunnel list`
  // Table output: ID   NAME   CREATED   CONNECTIONS
  const availableTunnels: CloudflareTunnelInfo[] = [];
  const tunnelLines = sections.TUNNELS || [];
  for (const tline of tunnelLines) {
    const trimmed = tline.trim();
    if (!trimmed || trimmed.startsWith('ID') || trimmed.startsWith('---')) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 2 && parts[0].includes('-')) {
      availableTunnels.push({
        id: parts[0].trim(),
        name: parts[1].trim(),
        created: parts[2]?.trim()
      });
    }
  }

  // Parse config content
  const configLines = sections.CONFIG || [];
  let configPath: string | undefined;
  let parsedRoutes: CloudflareTunnelRoute[] = [];
  let tunnelId: string | undefined;

  if (configLines.length > 0) {
    configPath = configLines[0].trim();
    const yamlContent = configLines.slice(1).join('\n');
    const parsed = parseCloudflaredConfig(yamlContent);
    parsedRoutes = parsed.routes;
    tunnelId = parsed.tunnelId;
  }

  // Match tunnelName from available tunnels if tunnelId is known
  let tunnelName: string | undefined;
  if (tunnelId) {
    const found = availableTunnels.find(t => t.id === tunnelId || t.name === tunnelId);
    if (found) {
      tunnelName = found.name;
    }
  } else if (availableTunnels.length > 0) {
    tunnelName = availableTunnels[0].name;
    tunnelId = availableTunnels[0].id;
  }

  return {
    installed,
    version,
    active,
    configPath,
    tunnelId,
    tunnelName,
    routes: parsedRoutes,
    availableTunnels
  };
}

/** Add an ingress route to remote server's cloudflared config & route DNS */
export async function addTunnelRouteOnServer(
  server: ServerCredentials,
  route: CloudflareTunnelRoute,
  autoDns = true
): Promise<CloudflareTunnelStatus> {
  const status = await fetchCloudflareTunnelStatus(server);
  if (!status.installed) {
    throw badRequest('cloudflared is not installed on this server');
  }

  const cleanHost = String(route.hostname || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const cleanService = String(route.service || '').trim();
  if (!cleanHost || !cleanHost.includes('.')) {
    throw badRequest('Invalid hostname');
  }

  // Default config path if none exists
  const configPath = status.configPath || '/etc/cloudflared/config.yml';
  const targetTunnel = status.tunnelName || status.tunnelId;

  // Read current config
  const { stdout: currentContent } = await executeCommand(server, `cat ${sq(configPath)} 2>/dev/null || echo ""`, 10000);
  const updatedYaml = addCloudflaredRoute(currentContent || `tunnel: ${targetTunnel || 'default'}\ningress:\n  - service: http_status:404\n`, {
    ...route,
    hostname: cleanHost,
    service: cleanService
  });

  // Write updated config using executeSoftwareScript (which handles sudo privilege escalation)
  const base64Content = Buffer.from(updatedYaml, 'utf-8').toString('base64');
  const writeScript = [
    `mkdir -p $(dirname ${sq(configPath)})`,
    `echo ${sq(base64Content)} | base64 -d > ${sq(configPath)}`,
    `chmod 644 ${sq(configPath)} 2>/dev/null || true`,
    // If autoDns requested and tunnel is known:
    autoDns && targetTunnel ? `cloudflared tunnel route dns ${sq(targetTunnel)} ${sq(cleanHost)} 2>&1 || true` : '',
    // Restart or reload cloudflared
    'systemctl restart cloudflared 2>/dev/null || pkill -HUP cloudflared 2>/dev/null || true'
  ].filter(Boolean).join('\n');

  const res = await executeSoftwareScript(server, writeScript);
  if (!res.ok) {
    throw new Error(res.output || 'Failed to update cloudflared configuration on server');
  }

  // Return fresh status
  return fetchCloudflareTunnelStatus(server);
}

/** Remove an ingress route from remote server's config */
export async function removeTunnelRouteOnServer(
  server: ServerCredentials,
  hostname: string
): Promise<CloudflareTunnelStatus> {
  const status = await fetchCloudflareTunnelStatus(server);
  if (!status.installed || !status.configPath) {
    throw notFound('cloudflared config not found on server');
  }

  const cleanHost = String(hostname || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const { stdout: currentContent } = await executeCommand(server, `cat ${sq(status.configPath)} 2>/dev/null || echo ""`, 10000);
  const updatedYaml = removeCloudflaredRoute(currentContent, cleanHost);

  const base64Content = Buffer.from(updatedYaml, 'utf-8').toString('base64');
  const writeScript = [
    `echo ${sq(base64Content)} | base64 -d > ${sq(status.configPath)}`,
    `chmod 644 ${sq(status.configPath)} 2>/dev/null || true`,
    'systemctl restart cloudflared 2>/dev/null || pkill -HUP cloudflared 2>/dev/null || true'
  ].join('\n');

  const res = await executeSoftwareScript(server, writeScript);
  if (!res.ok) {
    throw new Error(res.output || 'Failed to update cloudflared configuration on server');
  }

  return fetchCloudflareTunnelStatus(server);
}

