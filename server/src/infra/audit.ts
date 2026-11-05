// Append-only audit log (JSON lines) of every state-changing API call and terminal session.
import fs from 'fs';
import path from 'path';
import { dataFile } from '../config.js';

const AUDIT_FILE = dataFile('audit.log');
const MAX_BYTES = 5 * 1024 * 1024;

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
    // shortcut: single rotation to audit.log.1 at 5MB; enough for one dashboard, ship to syslog if it grows
    if (fs.existsSync(AUDIT_FILE) && fs.statSync(AUDIT_FILE).size > MAX_BYTES) fs.renameSync(AUDIT_FILE, `${AUDIT_FILE}.1`);
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch (e: any) {
    console.warn('[audit] write failed:', e.message);
  }
}

export function readAudit(options: { limit?: number; user?: string; server?: string; search?: string } = {}): AuditEntry[] {
  const limit = options.limit ?? 200;
  try {
    const raw = fs.readFileSync(AUDIT_FILE, 'utf8').trim();
    if (!raw) return [];
    let entries: AuditEntry[] = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));

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

    return entries.slice(-limit).reverse();
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
