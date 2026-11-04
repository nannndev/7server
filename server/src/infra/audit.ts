// Append-only audit log (JSON lines) of every state-changing API call and terminal session.
import fs from 'fs';
import path from 'path';
import { dataFile } from '../config.js';

const AUDIT_FILE = dataFile('audit.log');
const MAX_BYTES = 5 * 1024 * 1024;

// Only these body fields are recorded; credentials and file contents never are.
const SAFE_FIELDS = ['command', 'action', 'pid', 'serviceName', 'containerId', 'name', 'path', 'host', 'serverIds', 'project', 'workingDir', 'what', 'image', 'target', 'configFiles', 'query', 'database', 'engine', 'allowWrite'];

export function auditSummary(body: any): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Array.isArray(body) ? `items=${body.length}` : '';
  return SAFE_FIELDS.filter((k) => body[k] !== undefined)
    .map((k) => `${k}=${String(Array.isArray(body[k]) ? body[k].join(',') : body[k]).slice(0, 500)}`)
    .join(' ');
}

export interface AuditEntry { t: string; ip: string; method: string; path: string; detail: string; status?: number }

export function writeAudit(entry: AuditEntry) {
  try {
    // shortcut: single rotation to audit.log.1 at 5MB; enough for one dashboard, ship to syslog if it grows
    if (fs.existsSync(AUDIT_FILE) && fs.statSync(AUDIT_FILE).size > MAX_BYTES) fs.renameSync(AUDIT_FILE, `${AUDIT_FILE}.1`);
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n', { mode: 0o600 });
  } catch (e: any) {
    console.warn('[audit] write failed:', e.message);
  }
}

export function readAudit(limit = 200): AuditEntry[] {
  try {
    const lines = fs.readFileSync(AUDIT_FILE, 'utf8').trim().split('\n');
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
