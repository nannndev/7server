import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';

// ----------------- MONITOR / UPTIME / AUDIT ----------------- //

export type Thresholds = { cpu: number; mem: number; disk: number };
export interface MonitorSettings {
  enabled: boolean;
  intervalSec: number;
  uptimeIntervalMin: number;
  sslWarnDays: number;
  thresholds: Thresholds;
  hasDiscordWebhook: boolean;
}
export interface MonitorStatus {
  lastMetricsRun: number | null;
  lastUptimeRun: number | null;
  metricsRunning: boolean;
  uptimeRunning: boolean;
  activeAlerts: { key: string; since: number; message: string }[];
}
export interface UptimeResult {
  serverId: string;
  serverName: string;
  domain: string;
  url: string;
  status: number | null;
  ms: number | null;
  error?: string;
  sslExpires?: string | null;
  sslDaysLeft?: number | null;
  checkedAt: number;
}
export interface AuditEntry { t: string; ip: string; method: string; path: string; detail: string; status?: number }

export const fetchMonitor = async () =>
  unwrap<{ settings: MonitorSettings; status: MonitorStatus }>(await apiFetch(`${API_BASE}/monitor`), 'Failed to load monitor');
export const saveMonitor = async (patch: Partial<MonitorSettings> & { discordWebhook?: string | null }) =>
  unwrap<MonitorSettings>(
    await apiFetch(`${API_BASE}/monitor`, { ...jsonPost(patch), method: 'PUT' }),
    'Failed to save monitor settings'
  );
export async function testDiscord(): Promise<void> {
  const res = await apiFetch(`${API_BASE}/monitor/discord-test`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Discord test failed');
}
export const fetchUptime = async () => unwrap<UptimeResult[]>(await apiFetch(`${API_BASE}/uptime`), 'Failed to load uptime');
export const runUptime = async () =>
  unwrap<UptimeResult[]>(await apiFetch(`${API_BASE}/uptime/run`, { method: 'POST' }), 'Uptime check failed');
export const fetchAudit = async (limit = 300) =>
  unwrap<AuditEntry[]>(await apiFetch(`${API_BASE}/audit?limit=${limit}`), 'Failed to load audit log');
