// Append-only audit log of every state-changing API call and terminal session (7server.db, table audit,
// capped at the newest 50k rows).
import { appendAudit, readAuditRows } from './db.js';

// Only these body fields are recorded; credentials and file contents never are.
const SAFE_FIELDS = [
  'command', 'action', 'pid', 'serviceName', 'containerId', 'name', 'path', 'host',
  'serverIds', 'project', 'workingDir', 'what', 'image', 'target', 'configFiles',
  'query', 'database', 'engine', 'allowWrite',
  'templateName', 'templateId', 'preset', 'installed', 'skipped',
  'cronSchedule', 'cronCommand', 'domain', 'keyComment', 'keyType', 'ip', 'dryRun'
];

export function auditSummary(body: any): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Array.isArray(body) ? `items=${body.length}` : '';
  return SAFE_FIELDS.filter((k) => body[k] !== undefined)
    .map((k) => `${k}=${String(Array.isArray(body[k]) ? body[k].join(',') : body[k]).slice(0, 500)}`)
    .join(' ');
}

export interface AuditEntry {
  t: string;
  ip: string;
  method: string;
  path: string;
  detail: string;
  status?: number;
  user?: string;
  role?: string;
  sessionId?: string;
}

export function writeAudit(entry: AuditEntry) {
  try {
    appendAudit(entry as any);
  } catch (e: any) {
    console.warn('[audit] write failed:', e.message);
  }
}

export function readAudit(options: { limit?: number; user?: string; server?: string; search?: string } = {}): AuditEntry[] {
  const limit = options.limit ?? 200;
  try {
    // Filters other than user need the decoded rows: read a wider window, filter, then cut to limit.
    const filtered = !!(options.server || options.search);
    let entries: AuditEntry[] = readAuditRows(filtered ? Math.max(limit * 20, 5000) : limit, options.user || undefined);
    if (options.user) {
      const u = options.user.toLowerCase();
      entries = entries.filter((e) => (e.user || '').toLowerCase() === u);
    }
    if (options.server) {
      const s = options.server.toLowerCase();
      entries = entries.filter((e) => (e.detail || '').toLowerCase().includes(s) || (e.path || '').toLowerCase().includes(s));
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      entries = entries.filter((e) =>
        (e.detail || '').toLowerCase().includes(q) ||
        (e.path || '').toLowerCase().includes(q) ||
        (e.user || '').toLowerCase().includes(q)
      );
    }

    return entries.slice(0, limit); // rows come newest first
  } catch {
    return [];
  }
}

export function exportAuditCsv(limit = 1000): string {
  const entries = readAudit({ limit });
  const headers = ['Timestamp', 'User', 'Role', 'Method', 'Path', 'Status', 'IP', 'Details'];
  const rows = entries.map((e) => [
    `"${e.t || ''}"`,
    `"${e.user || 'anonymous'}"`,
    `"${e.role || '-'}"`,
    `"${e.method || ''}"`,
    `"${e.path || ''}"`,
    e.status ?? '',
    `"${e.ip || ''}"`,
    `"${(e.detail || '').replace(/"/g, '""')}"`
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
