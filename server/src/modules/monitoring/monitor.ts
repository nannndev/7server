// Background monitor: polls every server on the backend (no browser needed), keeps history on disk,
// checks nginx domains for HTTP/SSL health, and sends Discord alerts on state changes.
import path from 'path';
import tls from 'tls';
import { getKv, setKv } from '../../infra/db.js';
import { getAllServers, updateServer } from '../servers/store.js';
import { fetchServerMetrics } from '../metrics/service.js';
import { fetchNginxSites } from '../deployments/service.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { badRequest } from '../../http/errors.js';

// Settings, metric history and uptime results are single values in 7server.db (kv table).
const SETTINGS_FILE = 'monitor_settings';
const HISTORY_FILE = 'metric_history';
const UPTIME_FILE = 'uptime';

export type Thresholds = { cpu: number; mem: number; disk: number };
export interface MonitorSettings {
  enabled: boolean;
  intervalSec: number;
  uptimeIntervalMin: number;
  sslWarnDays: number;
  thresholds: Thresholds;
  discordWebhook: string; // stored encrypted
}

const DEFAULTS: MonitorSettings = {
  enabled: true,
  intervalSec: 60,
  uptimeIntervalMin: 5,
  sslWarnDays: 14,
  thresholds: { cpu: 90, mem: 90, disk: 90 },
  discordWebhook: ''
};

const readJSON = <T>(key: string, fallback: T): T => {
  try { return getKv<T>(key, fallback); } catch { return fallback; }
};
const writeJSON = (key: string, data: unknown) => setKv(key, data);

let settings: MonitorSettings = { ...DEFAULTS, ...readJSON(SETTINGS_FILE, {}) };
settings.thresholds = { ...DEFAULTS.thresholds, ...settings.thresholds };

// Public view never includes the webhook URL (anyone holding it can post to the channel).
export function getSettings() {
  const { discordWebhook, ...rest } = settings;
  return { ...rest, hasDiscordWebhook: !!discordWebhook };
}

const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function updateSettings(input: any) {
  const t = input?.thresholds || {};
  settings = {
    ...settings,
    enabled: input?.enabled !== undefined ? !!input.enabled : settings.enabled,
    intervalSec: clamp(input?.intervalSec, 30, 3600, settings.intervalSec),
    uptimeIntervalMin: clamp(input?.uptimeIntervalMin, 1, 1440, settings.uptimeIntervalMin),
    sslWarnDays: clamp(input?.sslWarnDays, 1, 90, settings.sslWarnDays),
    thresholds: {
      cpu: clamp(t.cpu, 1, 100, settings.thresholds.cpu),
      mem: clamp(t.mem, 1, 100, settings.thresholds.mem),
      disk: clamp(t.disk, 1, 100, settings.thresholds.disk)
    },
    // Empty/undefined = keep; explicit null = clear.
    discordWebhook:
      input?.discordWebhook === null ? '' : input?.discordWebhook ? encrypt(validateWebhook(input.discordWebhook)) : settings.discordWebhook
  };
  writeJSON(SETTINGS_FILE, settings);
  restart();
  return getSettings();
}

// ----------------- DISCORD ----------------- //

// Only real Discord webhook URLs: the server POSTs here, so an arbitrary URL would let callers make it hit any host.
export function validateWebhook(raw: unknown): string {
  const url = String(raw || '').trim();
  if (!/^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
    throw badRequest('Invalid Discord webhook URL (must start with https://discord.com/api/webhooks/...)');
  }
  return url;
}

export type AlertLevel = 'alert' | 'ok' | 'info';
const COLORS: Record<AlertLevel, number> = { alert: 0xef4444, ok: 0x22c55e, info: 0x3b82f6 };

export async function sendDiscord(text: string, level: AlertLevel = 'info'): Promise<void> {
  if (!settings.discordWebhook) throw badRequest('Webhook Discord belum dikonfigurasi');
  const res = await fetch(decrypt(settings.discordWebhook), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: '7Server',
      allowed_mentions: { parse: [] }, // a server/domain name must never ping @everyone
      embeds: [{ description: text.slice(0, 4000), color: COLORS[level], timestamp: new Date().toISOString() }]
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Discord: ${(await res.json().catch(() => ({}))).message || res.status}`);
}

const notify = (text: string, level: AlertLevel) => {
  sendDiscord(text, level).catch((e) => console.warn('[monitor] discord failed:', e.message));
};

// Escape Discord markdown so names like "my_app" or "*prod*" render literally.
export const esc = (s: string) => s.replace(/[\\*_~`|>]/g, (c) => `\\${c}`);

// ----------------- HISTORY ----------------- //

export type HistoryPoint = { t: number; cpu: number; mem: number; disk: number };
const HISTORY_MAX = 1440; // 24h at the default 60s interval
const history: Record<string, HistoryPoint[]> = readJSON(HISTORY_FILE, {});
let historyDirty = false;

export function recordHistory(id: string, m: any) {
  const list = (history[id] ||= []);
  list.push({ t: Date.now(), cpu: m.cpuUsagePercent || 0, mem: m.memory?.usedPercent || 0, disk: m.disk?.usedPercent || 0 });
  if (list.length > HISTORY_MAX) list.splice(0, list.length - HISTORY_MAX);
  historyDirty = true;
}

export const getHistory = (id: string) => history[id] || [];

// ----------------- ALERT STATE ----------------- //

// Keys currently in alert, e.g. "srv:<id>:cpu", "srv:<id>:down", "url:<domain>:down". Only transitions notify.
const activeAlerts = new Map<string, { since: number; message: string }>();

function setAlert(key: string, on: boolean, message: string, recoverMessage: string) {
  const was = activeAlerts.has(key);
  if (on && !was) {
    activeAlerts.set(key, { since: Date.now(), message });
    notify(`🔴 ${message}`, 'alert');
  } else if (!on && was) {
    activeAlerts.delete(key);
    notify(`✅ ${recoverMessage}`, 'ok');
  } else if (on) {
    activeAlerts.get(key)!.message = message;
  }
}

export const getActiveAlerts = () => [...activeAlerts.entries()].map(([key, v]) => ({ key, ...v }));

export function evaluateMetrics(name: string, id: string, m: any, t: Thresholds) {
  const checks: [string, string, number, number][] = [
    ['cpu', 'CPU', m.cpuUsagePercent || 0, t.cpu],
    ['mem', 'RAM', m.memory?.usedPercent || 0, t.mem],
    ['disk', 'Disk', m.disk?.usedPercent || 0, t.disk]
  ];
  for (const [k, label, v, limit] of checks) {
    setAlert(`srv:${id}:${k}`, v >= limit, `**${esc(name)}**: ${label} at ${v}% (limit ${limit}%)`, `**${esc(name)}**: ${label} back to normal (${v}%)`);
  }
}

// ----------------- SERVER POLLING ----------------- //

let metricsRunning = false;
export let lastMetricsRun: number | null = null;

async function pollServers() {
  if (metricsRunning) return; // never overlap: a slow SSH host must not stack ticks
  metricsRunning = true;
  try {
    const servers = getAllServers(true);
    await Promise.all(servers.map(async (s) => {
      try {
        const m = await fetchServerMetrics(s);
        recordHistory(s.id, m);
        updateServer(s.id, { status: 'online', lastChecked: new Date().toISOString(), metrics: m });
        setAlert(`srv:${s.id}:down`, false, '', `**${esc(s.name)}** (${s.host}) is back online`);
        evaluateMetrics(s.name, s.id, m, settings.thresholds);
      } catch (e: any) {
        updateServer(s.id, { status: 'offline', lastChecked: new Date().toISOString() });
        setAlert(`srv:${s.id}:down`, true, `**${esc(s.name)}** (${s.host}) is unreachable: ${esc(e.message)}`, '');
      }
    }));
    lastMetricsRun = Date.now();
    if (historyDirty) { writeJSON(HISTORY_FILE, history); historyDirty = false; }
  } finally {
    metricsRunning = false;
  }
}

// ----------------- UPTIME / SSL ----------------- //

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

let uptime: UptimeResult[] = readJSON(UPTIME_FILE, []);
export const getUptime = () => uptime;

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// Real public hostnames only; drop "_", IPs, localhost and the www. twin of a listed domain.
export function pickDomains(all: string[]): string[] {
  const set = new Set(all.map((d) => d.trim().toLowerCase()).filter((d) => d && d !== '_' && d !== 'localhost' && !IP_RE.test(d) && d.includes('.') && !d.includes('*')));
  return [...set].filter((d) => !(d.startsWith('www.') && set.has(d.slice(4)))).sort();
}

function sslExpiry(host: string): Promise<Date | null> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      resolve(cert?.valid_to ? new Date(cert.valid_to) : null);
    });
    sock.on('error', () => resolve(null));
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
  });
}

async function checkUrl(url: string): Promise<{ status: number | null; ms: number | null; error?: string }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': '7Server-Uptime/1.0' } });
    await res.body?.cancel();
    return { status: res.status, ms: Date.now() - start };
  } catch (e: any) {
    return { status: null, ms: null, error: e.cause?.code || e.name || e.message };
  }
}

let uptimeRunning = false;
let uptimeInFlight: Promise<void> | null = null;
export let lastUptimeRun: number | null = null;

// Concurrent callers (timer + "Cek sekarang") share one run instead of getting stale results.
export function runUptimeChecks(): Promise<void> {
  return (uptimeInFlight ||= doUptimeChecks().finally(() => { uptimeInFlight = null; }));
}

async function doUptimeChecks() {
  uptimeRunning = true;
  try {
    const results: UptimeResult[] = [];
    for (const s of getAllServers(true)) {
      let domains: string[] = [];
      try {
        const { sites } = await fetchNginxSites(s);
        domains = pickDomains(sites.filter((x) => x.enabled !== false).flatMap((x) => x.domains || []));
      } catch {
        continue; // server down is already reported by the metrics poller
      }
      const checked = await Promise.all(domains.map(async (domain): Promise<UptimeResult> => {
        const [expires, https] = await Promise.all([sslExpiry(domain), checkUrl(`https://${domain}`)]);
        // Sites without TLS: fall back to plain http.
        const r = https.status === null ? { ...(await checkUrl(`http://${domain}`)), url: `http://${domain}` } : { ...https, url: `https://${domain}` };
        const daysLeft = expires ? Math.floor((expires.getTime() - Date.now()) / 86400000) : null;
        return {
          serverId: s.id, serverName: s.name, domain, url: r.url, status: r.status, ms: r.ms, error: r.error,
          sslExpires: expires?.toISOString() || null, sslDaysLeft: daysLeft, checkedAt: Date.now()
        };
      }));
      results.push(...checked);
    }
    for (const r of results) {
      // ENOTFOUND = no DNS record: a stale nginx config, not an outage. Shown in the UI, never alerted.
      const down = r.error !== 'ENOTFOUND' && (r.status === null || r.status >= 500);
      setAlert(`url:${r.domain}:down`, down, `${esc(r.domain)} DOWN (${r.status ?? esc(r.error || 'no response')}) on ${esc(r.serverName)}`, `${esc(r.domain)} is back up (${r.status})`);
      const sslBad = r.sslDaysLeft !== null && r.sslDaysLeft !== undefined && r.sslDaysLeft < settings.sslWarnDays;
      setAlert(`url:${r.domain}:ssl`, sslBad, `SSL ${esc(r.domain)} expires in ${r.sslDaysLeft} days`, `SSL ${esc(r.domain)} renewed (${r.sslDaysLeft} days left)`);
    }
    uptime = results;
    lastUptimeRun = Date.now();
    writeJSON(UPTIME_FILE, uptime);
  } finally {
    uptimeRunning = false;
  }
}

// ----------------- SCHEDULER ----------------- //

let timers: NodeJS.Timeout[] = [];

function restart() {
  timers.forEach(clearInterval);
  timers = [];
  if (!settings.enabled) return;
  timers.push(setInterval(pollServers, settings.intervalSec * 1000));
  timers.push(setInterval(runUptimeChecks, settings.uptimeIntervalMin * 60000));
}

export function startMonitor() {
  restart();
  if (settings.enabled) {
    setTimeout(pollServers, 3000);
    setTimeout(runUptimeChecks, 15000);
  }
}

export const getStatus = () => ({ lastMetricsRun, lastUptimeRun, metricsRunning, uptimeRunning, activeAlerts: getActiveAlerts() });
