import { API_BASE, apiFetch, jsonPost, unwrap, downloadBlob } from '@/shared/api/client';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';

export type HistoryPoint = { t: number; cpu: number; mem: number; disk: number };
export const fetchHistory = async (id: string) =>
  unwrap<HistoryPoint[]>(await apiFetch(`${API_BASE}/servers/${id}/history`), 'Failed to fetch history');

export interface SoftwareItem {
  id: string;
  name: string;
  category: 'runtime' | 'web' | 'database' | 'container' | 'tooling' | 'security';
  installed: boolean;
  version: string | null;
  /** systemd state (active, inactive, failed, …) for tools that run as a service */
  service?: string | null;
}
export const fetchSoftware = async (id: string) =>
  unwrap<SoftwareItem[]>(await apiFetch(`${API_BASE}/servers/${id}/software`), 'Failed to scan software');

export interface SoftwareUpgradeItem {
  package: string;
  currentVersion: string;
  newVersion: string;
}

export const fetchSoftwareUpgrades = async (id: string) =>
  unwrap<Record<string, SoftwareUpgradeItem>>(
    await apiFetch(`${API_BASE}/servers/${id}/software/upgrades`),
    'Failed to fetch software upgrades'
  );

export const exportServers = () => downloadBlob(`${API_BASE}/export`, '7server-servers.json');
export async function importServers(items: unknown): Promise<number> {
  const res = await apiFetch(`${API_BASE}/import`, jsonPost(items));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Import failed');
  return data.imported;
}

export async function fetchServers(): Promise<ServerItem[]> {
  const res = await apiFetch(`${API_BASE}/servers`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch servers');
  return data.data;
}

export async function createServer(payload: Partial<ServerItem> & { password?: string; privateKey?: string; passphrase?: string }): Promise<ServerItem> {
  const res = await apiFetch(`${API_BASE}/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create server');
  return data.data;
}

export async function updateServer(id: string, payload: Partial<ServerItem> & { password?: string; privateKey?: string; passphrase?: string }): Promise<ServerItem> {
  const res = await apiFetch(`${API_BASE}/servers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update server');
  return data.data;
}

export async function deleteServer(id: string): Promise<{ success: boolean }> {
  const res = await apiFetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete server');
  return data;
}

export async function testConnection(payload: any): Promise<{ success: boolean; message: string }> {
  const res = await apiFetch(`${API_BASE}/servers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

export async function pingServer(id: string): Promise<{ success: boolean; latencyMs?: number; message?: string }> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/ping`);
  return await res.json();
}

export async function fetchServerMetrics(id: string): Promise<ServerMetrics> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/metrics`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch metrics');
  return data.data;
}

export async function recordTemplateRun(
  serverId: string,
  payload: { templateName: string; templateId: string; installed: string; skipped: string }
): Promise<void> {
  await apiFetch(`${API_BASE}/servers/${serverId}/templates/run`, jsonPost(payload));
}

// ---------------------------------------------------------------------------
// Cronjobs API
// ---------------------------------------------------------------------------
export interface CronJobItem {
  id: string;
  schedule: string;
  command: string;
  comment?: string;
  enabled: boolean;
  raw: string;
}

export interface CronRunResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
}

export const fetchCronJobs = async (id: string) =>
  unwrap<CronJobItem[]>(await apiFetch(`${API_BASE}/servers/${id}/cron`), 'Failed to fetch cron jobs');

export const addCronJob = async (id: string, payload: { schedule: string; command: string; comment?: string; enabled?: boolean }) =>
  unwrap<CronJobItem[]>(await apiFetch(`${API_BASE}/servers/${id}/cron`, jsonPost(payload)), 'Failed to add cron job');

export const saveCronJobs = async (id: string, jobs: CronJobItem[]) =>
  unwrap<CronJobItem[]>(
    await apiFetch(`${API_BASE}/servers/${id}/cron`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs })
    }),
    'Failed to save cron jobs'
  );

export const deleteCronJob = async (id: string, jobId: string) =>
  unwrap<CronJobItem[]>(
    await apiFetch(`${API_BASE}/servers/${id}/cron/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
    'Failed to delete cron job'
  );

export const testRunCronJob = async (id: string, command: string) =>
  unwrap<CronRunResult>(
    await apiFetch(`${API_BASE}/servers/${id}/cron/run`, jsonPost({ command })),
    'Failed to test run cron job'
  );

// ---------------------------------------------------------------------------
// SSL / Certificates API
// ---------------------------------------------------------------------------
export interface CertificateItem {
  name: string;
  domains: string[];
  expiryDate: string;
  daysRemaining: number;
  isValid: boolean;
  isExpiringSoon: boolean;
  certPath: string;
  keyPath: string;
}

export interface CertRenewalResult {
  stdout: string;
  success: boolean;
  dryRun?: boolean;
}

export interface CertIssueResult {
  stdout: string;
  success: boolean;
  domain: string;
}

export const fetchCertificates = async (id: string) =>
  unwrap<CertificateItem[]>(await apiFetch(`${API_BASE}/servers/${id}/certificates`), 'Failed to fetch certificates');

export const renewCertificates = async (id: string, dryRun = false) =>
  unwrap<CertRenewalResult>(
    await apiFetch(`${API_BASE}/servers/${id}/certificates/renew`, jsonPost({ dryRun })),
    'Failed to renew certificates'
  );

export const issueCertificate = async (id: string, payload: { domain: string; email: string; webserver?: string }) =>
  unwrap<CertIssueResult>(
    await apiFetch(`${API_BASE}/servers/${id}/certificates/issue`, jsonPost(payload)),
    'Failed to issue certificate'
  );

// ---------------------------------------------------------------------------
// Security & Hardening API
// ---------------------------------------------------------------------------
export interface SshKeyItem {
  id: string;
  type: string;
  key: string;
  comment: string;
  raw: string;
}

export interface SecurityHardeningStatus {
  passwordAuth: boolean;
  rootLogin: string;
  sshPort: number;
  fail2banInstalled: boolean;
  fail2banActive: boolean;
  bannedIps: string[];
}

export const fetchSshKeys = async (id: string) =>
  unwrap<SshKeyItem[]>(await apiFetch(`${API_BASE}/servers/${id}/security/keys`), 'Failed to fetch SSH keys');

export const addSshKey = async (id: string, key: string) =>
  unwrap<SshKeyItem[]>(await apiFetch(`${API_BASE}/servers/${id}/security/keys`, jsonPost({ key })), 'Failed to add SSH key');

export const deleteSshKey = async (id: string, keyId: string) =>
  unwrap<SshKeyItem[]>(
    await apiFetch(`${API_BASE}/servers/${id}/security/keys/${encodeURIComponent(keyId)}`, { method: 'DELETE' }),
    'Failed to delete SSH key'
  );

export const fetchSecurityHardening = async (id: string) =>
  unwrap<SecurityHardeningStatus>(await apiFetch(`${API_BASE}/servers/${id}/security/hardening`), 'Failed to fetch security hardening status');

export const unbanIp = async (id: string, ip: string) =>
  unwrap<{ success: boolean; ip: string }>(
    await apiFetch(`${API_BASE}/servers/${id}/security/fail2ban/unban`, jsonPost({ ip })),
    'Failed to unban IP'
  );

// ---------------------------------------------------------------------------
// Server Audit Log API
// ---------------------------------------------------------------------------
export interface ServerAuditEntry {
  t: string;
  ip: string;
  method: string;
  path: string;
  detail: string;
  status?: number;
}

export const fetchServerAudit = async (id: string) =>
  unwrap<ServerAuditEntry[]>(await apiFetch(`${API_BASE}/servers/${id}/audit`), 'Failed to fetch server audit log');

// --- Backups & Disaster Recovery ---
export type BackupType = 'database' | 'files' | 'system' | 'other';
export type BackupDbEngine = 'mysql' | 'postgres' | 'mongodb' | 'redis' | 'sqlite' | 'unknown';

export interface BackupItem {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  type: BackupType;
  engine?: BackupDbEngine;
  source?: string;
}

export interface BackupProfile {
  id: string;
  serverId: string;
  name: string;
  type: 'database' | 'files';
  target: string;
  engine?: BackupDbEngine;
  schedule: string;
  retentionCount: number;
  destination: 'local' | 's3';
  s3Config?: {
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    region?: string;
  };
  createdAt: string;
  lastRunAt?: string | null;
  lastStatus?: 'success' | 'failed' | null;
  lastDurationMs?: number;
}

export interface CreateBackupRequest {
  name?: string;
  type: 'database' | 'files';
  engine?: BackupDbEngine;
  database?: string;
  sourcePath?: string;
  excludePatterns?: string[];
  retentionCount?: number;
}

export interface RestoreBackupRequest {
  filepath: string;
  type: 'database' | 'files';
  targetDatabase?: string;
  targetDir?: string;
}

export interface BackupRunResult {
  success: boolean;
  item?: BackupItem;
  stdout: string;
  stderr: string;
  durationMs: number;
  code: number;
}

export interface BackupRestoreResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  code: number;
}

export const fetchBackups = async (serverId: string): Promise<BackupItem[]> =>
  unwrap<BackupItem[]>(await apiFetch(`${API_BASE}/servers/${serverId}/backups`), 'Failed to fetch backups');

export const runBackup = async (serverId: string, req: CreateBackupRequest): Promise<BackupRunResult> =>
  unwrap<BackupRunResult>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/run`, jsonPost(req)), 'Failed to execute backup');

export const restoreBackup = async (serverId: string, req: RestoreBackupRequest): Promise<BackupRestoreResult> =>
  unwrap<BackupRestoreResult>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/restore`, jsonPost(req)), 'Failed to restore backup');

export const deleteBackupFile = async (serverId: string, filepath: string): Promise<void> =>
  unwrap<void>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/file`, jsonDelete({ filepath })), 'Failed to delete backup file');

export const downloadBackupFile = (serverId: string, filepath: string, filename: string) =>
  downloadBlob(`${API_BASE}/servers/${serverId}/backups/download?path=${encodeURIComponent(filepath)}`, filename);

export const fetchBackupProfiles = async (serverId: string): Promise<BackupProfile[]> =>
  unwrap<BackupProfile[]>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/profiles`), 'Failed to fetch backup profiles');

export const saveBackupProfile = async (serverId: string, profile: Partial<BackupProfile>): Promise<BackupProfile> =>
  unwrap<BackupProfile>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/profiles`, jsonPost(profile)), 'Failed to save backup profile');

export const deleteBackupProfile = async (serverId: string, profileId: string): Promise<void> =>
  unwrap<void>(await apiFetch(`${API_BASE}/servers/${serverId}/backups/profiles/${profileId}`, { method: 'DELETE' }), 'Failed to delete backup profile');
