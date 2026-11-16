import { badRequest } from '../../http/errors.js';
import {
  getCloudflareIntegration,
  getCloudflareToken,
  saveCloudflareIntegration,
  updateCloudflareZones,
  type CloudflareZoneSummary,
  type SafeCloudflareIntegration
} from './store.js';

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CfEnvelope<T = any> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result: T;
  result_info?: any;
}

export async function cfFetch<T = any>(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.includes('..') || /^https?:/i.test(path)) {
    throw badRequest('Invalid Cloudflare API path');
  }
  const res = await fetch(`${CF_API}${cleanPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000)
  });

  const data = (await res.json().catch(() => ({}))) as CfEnvelope<T>;
  if (!res.ok || data?.success === false) {
    const errMsg =
      data?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
      `Cloudflare API ${method} ${cleanPath} failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data.result;
}

export async function verifyAndSaveCloudflareToken(token: string): Promise<SafeCloudflareIntegration> {
  const trimmed = token.trim();
  if (!trimmed) throw badRequest('Cloudflare API token is required');

  // Verify token validity
  await cfFetch(trimmed, 'GET', '/user/tokens/verify');

  // Best-effort account & zones lookup (token may be scoped to specific zones or accounts)
  let accountId: string | undefined;
  let accountName: string | undefined;
  try {
    const accounts = await cfFetch<Array<{ id: string; name: string }>>(trimmed, 'GET', '/accounts?per_page=20');
    if (Array.isArray(accounts) && accounts.length > 0) {
      accountId = accounts[0]!.id;
      accountName = accounts[0]!.name;
    }
  } catch {
    // Token might only have Zone permissions without Account:Read
  }

  let zones: CloudflareZoneSummary[] = [];
  try {
    const rawZones = await cfFetch<Array<{ id: string; name: string; status: string; account?: { id: string; name: string } }>>(
      trimmed,
      'GET',
      '/zones?per_page=50'
    );
    zones = (rawZones || []).map((z) => ({ id: z.id, name: z.name, status: z.status }));
    if (!accountId && rawZones?.[0]?.account?.id) {
      accountId = rawZones[0].account.id;
      accountName = rawZones[0].account.name;
    }
  } catch {
    // Ignore if token lacks Zone:Read
  }

  return saveCloudflareIntegration({ token: trimmed, accountId, accountName, zones });
}

export async function syncCloudflareZones(): Promise<SafeCloudflareIntegration> {
  const token = getCloudflareToken();
  if (!token) throw badRequest('Cloudflare integration is not connected');

  let accountId = getCloudflareIntegration()?.accountId;
  let accountName = getCloudflareIntegration()?.accountName;
  try {
    const accounts = await cfFetch<Array<{ id: string; name: string }>>(token, 'GET', '/accounts?per_page=20');
    if (Array.isArray(accounts) && accounts.length > 0) {
      accountId = accounts[0]!.id;
      accountName = accounts[0]!.name;
    }
  } catch {
    // keep existing
  }

  const rawZones = await cfFetch<Array<{ id: string; name: string; status: string; account?: { id: string; name: string } }>>(
    token,
    'GET',
    '/zones?per_page=50'
  );
  const zones = (rawZones || []).map((z) => ({ id: z.id, name: z.name, status: z.status }));
  if (!accountId && rawZones?.[0]?.account?.id) {
    accountId = rawZones[0].account.id;
    accountName = rawZones[0].account.name;
  }
  return updateCloudflareZones(zones, accountId, accountName);
}

async function resolveZoneId(token: string, zoneId?: string, zoneNameOrHost?: string): Promise<{ id: string; name?: string }> {
  if (zoneId) return { id: zoneId };
  const cached = getCloudflareIntegration()?.zones || [];
  const target = (zoneNameOrHost || '').toLowerCase().replace(/\.$/, '');
  if (target) {
    const match = cached
      .slice()
      .sort((a, b) => b.name.length - a.name.length)
      .find((z) => target === z.name.toLowerCase() || target.endsWith(`.${z.name.toLowerCase()}`));
    if (match) return { id: match.id, name: match.name };
  }

  // Fallback: query live zones
  const live = await cfFetch<Array<{ id: string; name: string }>>(token, 'GET', '/zones?per_page=50');
  if (target) {
    const match = (live || [])
      .slice()
      .sort((a, b) => b.name.length - a.name.length)
      .find((z) => target === z.name.toLowerCase() || target.endsWith(`.${z.name.toLowerCase()}`));
    if (match) return { id: match.id, name: match.name };
  }
  if (live?.length === 1 && !target) return { id: live[0]!.id, name: live[0]!.name };
  throw badRequest(`Could not resolve Cloudflare zone${target ? ` for "${target}"` : ''}. Pass zoneId or zoneName.`);
}

async function resolveAccountId(token: string, accountId?: string): Promise<string> {
  if (accountId) return accountId;
  const cached = getCloudflareIntegration()?.accountId;
  if (cached) return cached;
  const accounts = await cfFetch<Array<{ id: string }>>(token, 'GET', '/accounts?per_page=10');
  if (accounts?.[0]?.id) return accounts[0].id;
  throw badRequest('Could not resolve Cloudflare accountId');
}

export const READ_ONLY_CF_ACTIONS = new Set([
  'list_zones',
  'list_dns',
  'list_tunnels',
  'get_tunnel_config',
  'get_zone_settings',
  'api_get'
]);

export function isReadOnlyCloudflareAction(raw: string | { action?: string }): boolean {
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return typeof obj?.action === 'string' && READ_ONLY_CF_ACTIONS.has(obj.action);
  } catch {
    return false;
  }
}

export interface CloudflareActionInput {
  action: string;
  zoneId?: string;
  zoneName?: string;
  accountId?: string;
  recordId?: string;
  type?: string;
  name?: string;
  content?: string;
  proxied?: boolean;
  ttl?: number;
  priority?: number;
  tunnelId?: string;
  hostname?: string;
  service?: string;
  createDns?: boolean;
  mode?: string;
  purgeEverything?: boolean;
  files?: string[];
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path?: string;
  body?: unknown;
}

export async function executeCloudflareAction(input: CloudflareActionInput): Promise<unknown> {
  const token = getCloudflareToken();
  if (!token) {
    throw badRequest('Cloudflare is not connected. Add a Cloudflare API Token in Integrations first.');
  }

  switch (input.action) {
    case 'list_zones': {
      const zones = await cfFetch<Array<{ id: string; name: string; status: string; name_servers?: string[] }>>(
        token,
        'GET',
        '/zones?per_page=50'
      );
      return zones.map((z) => ({ id: z.id, name: z.name, status: z.status, name_servers: z.name_servers }));
    }

    case 'list_dns': {
      const z = await resolveZoneId(token, input.zoneId, input.zoneName || input.name);
      const qs = new URLSearchParams({ per_page: '100' });
      if (input.type) qs.set('type', input.type.toUpperCase());
      if (input.name) qs.set('name', input.name);
      const records = await cfFetch<any[]>(token, 'GET', `/zones/${z.id}/dns_records?${qs.toString()}`);
      return records.map((r) => ({
        id: r.id,
        type: r.type,
        name: r.name,
        content: r.content,
        proxied: r.proxied,
        ttl: r.ttl
      }));
    }

    case 'upsert_dns': {
      if (!input.type || !input.name || !input.content) {
        throw badRequest('upsert_dns requires type, name, and content');
      }
      const z = await resolveZoneId(token, input.zoneId, input.zoneName || input.name);
      const recType = input.type.toUpperCase();
      const fqdn =
        z.name && !input.name.includes('.') && input.name !== '@'
          ? `${input.name}.${z.name}`
          : input.name === '@' && z.name
            ? z.name
            : input.name;

      const existing = await cfFetch<any[]>(
        token,
        'GET',
        `/zones/${z.id}/dns_records?type=${encodeURIComponent(recType)}&name=${encodeURIComponent(fqdn)}`
      );

      const payload: Record<string, unknown> = {
        type: recType,
        name: fqdn,
        content: input.content,
        ttl: input.ttl ?? 1,
        ...(typeof input.proxied === 'boolean' ? { proxied: input.proxied } : {}),
        ...(typeof input.priority === 'number' ? { priority: input.priority } : {})
      };

      if (existing?.[0]?.id) {
        const updated = await cfFetch<any>(token, 'PATCH', `/zones/${z.id}/dns_records/${existing[0].id}`, payload);
        return { operation: 'updated', record: { id: updated.id, type: updated.type, name: updated.name, content: updated.content, proxied: updated.proxied } };
      }
      const created = await cfFetch<any>(token, 'POST', `/zones/${z.id}/dns_records`, payload);
      return { operation: 'created', record: { id: created.id, type: created.type, name: created.name, content: created.content, proxied: created.proxied } };
    }

    case 'delete_dns': {
      const z = await resolveZoneId(token, input.zoneId, input.zoneName || input.name);
      let targetId = input.recordId;
      if (!targetId && input.name) {
        const qs = new URLSearchParams({ name: input.name });
        if (input.type) qs.set('type', input.type.toUpperCase());
        const found = await cfFetch<any[]>(token, 'GET', `/zones/${z.id}/dns_records?${qs.toString()}`);
        targetId = found?.[0]?.id;
      }
      if (!targetId) throw badRequest('DNS record not found (provide recordId or name)');
      await cfFetch(token, 'DELETE', `/zones/${z.id}/dns_records/${targetId}`);
      return { deleted: targetId };
    }

    case 'list_tunnels': {
      const accId = await resolveAccountId(token, input.accountId);
      const tunnels = await cfFetch<any[]>(token, 'GET', `/accounts/${accId}/cfd_tunnel?is_deleted=false`);
      return tunnels.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        remote_config: t.remote_config,
        created_at: t.created_at
      }));
    }

    case 'get_tunnel_config': {
      if (!input.tunnelId) throw badRequest('get_tunnel_config requires tunnelId');
      const accId = await resolveAccountId(token, input.accountId);
      return cfFetch(token, 'GET', `/accounts/${accId}/cfd_tunnel/${input.tunnelId}/configurations`);
    }

    case 'update_tunnel_ingress': {
      if (!input.tunnelId || !input.hostname || !input.service) {
        throw badRequest('update_tunnel_ingress requires tunnelId, hostname, and service');
      }
      const accId = await resolveAccountId(token, input.accountId);
      const current = await cfFetch<any>(token, 'GET', `/accounts/${accId}/cfd_tunnel/${input.tunnelId}/configurations`);
      const existingIngress: Array<{ hostname?: string; service: string; originRequest?: unknown }> =
        Array.isArray(current?.config?.ingress) ? current.config.ingress : [];

      const filtered = existingIngress.filter((r) => r.hostname && r.hostname !== input.hostname);
      const fallback = existingIngress.find((r) => !r.hostname) || { service: 'http_status:404' };
      const nextIngress = [...filtered, { hostname: input.hostname, service: input.service }, fallback];

      const updated = await cfFetch(token, 'PUT', `/accounts/${accId}/cfd_tunnel/${input.tunnelId}/configurations`, {
        config: { ...(current?.config || {}), ingress: nextIngress }
      });

      let dnsResult: unknown = undefined;
      if (input.createDns !== false) {
        dnsResult = await executeCloudflareAction({
          action: 'upsert_dns',
          zoneId: input.zoneId,
          zoneName: input.zoneName,
          type: 'CNAME',
          name: input.hostname,
          content: `${input.tunnelId}.cfargotunnel.com`,
          proxied: true
        });
      }
      return { tunnel: updated, dns: dnsResult };
    }

    case 'get_zone_settings': {
      const z = await resolveZoneId(token, input.zoneId, input.zoneName);
      const ssl = await cfFetch<any>(token, 'GET', `/zones/${z.id}/settings/ssl`);
      const alwaysHttps = await cfFetch<any>(token, 'GET', `/zones/${z.id}/settings/always_use_https`);
      return { zoneId: z.id, ssl: ssl?.value, always_use_https: alwaysHttps?.value };
    }

    case 'set_ssl_mode': {
      if (!input.mode || !['off', 'flexible', 'full', 'strict'].includes(input.mode)) {
        throw badRequest('set_ssl_mode requires mode: off | flexible | full | strict');
      }
      const z = await resolveZoneId(token, input.zoneId, input.zoneName);
      return cfFetch(token, 'PATCH', `/zones/${z.id}/settings/ssl`, { value: input.mode });
    }

    case 'purge_cache': {
      const z = await resolveZoneId(token, input.zoneId, input.zoneName);
      const body = input.files?.length ? { files: input.files } : { purge_everything: input.purgeEverything !== false };
      return cfFetch(token, 'POST', `/zones/${z.id}/purge_cache`, body);
    }

    case 'api_get': {
      if (!input.path) throw badRequest('api_get requires path (e.g. /zones)');
      return cfFetch(token, 'GET', input.path);
    }

    case 'api_write': {
      const method = (input.method || 'POST').toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !input.path) {
        throw badRequest('api_write requires method (POST|PUT|PATCH|DELETE) and path');
      }
      return cfFetch(token, method, input.path, input.body);
    }

    default:
      throw badRequest(`Unknown Cloudflare action: ${input.action}`);
  }
}
