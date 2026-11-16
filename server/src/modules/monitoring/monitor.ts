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

// Settings, metric history, alert history and uptime results are single values in 7server.db (kv table).
const SETTINGS_FILE = 'monitor_settings';
const HISTORY_FILE = 'metric_history';
const ALERT_HISTORY_FILE = 'alert_history';
const UPTIME_FILE = 'uptime';

export type Thresholds = { cpu: number; mem: number; disk: number };
export interface NotifyEvents {
  cpu: boolean;
  mem: boolean;
  disk: boolean;
  down: boolean;
  ssl: boolean;
  http: boolean;
}
export interface MonitorSettings {
  enabled: boolean;
  intervalSec: number;
  uptimeIntervalMin: number;
  sslWarnDays: number;
  thresholds: Thresholds;
  notifyEvents: NotifyEvents;
  discordWebhook: string; // stored encrypted
  telegramBotToken: string; // stored encrypted
  telegramChatId: string;
  customWebhookUrl: string; // stored encrypted
}

const DEFAULT_EVENTS: NotifyEvents = { cpu: true, mem: true, disk: true, down: true, ssl: true, http: true };

const DEFAULTS: MonitorSettings = {
  enabled: true,
  intervalSec: 60,
  uptimeIntervalMin: 5,
  sslWarnDays: 14,
  thresholds: { cpu: 90, mem: 90, disk: 90 },
  notifyEvents: { ...DEFAULT_EVENTS },
  discordWebhook: '',
  telegramBotToken: '',
  telegramChatId: '',
  customWebhookUrl: ''
};

const readJSON = <T>(key: string, fallback: T): T => {
  try { return getKv<T>(key, fallback); } catch { return fallback; }
};
const writeJSON = (key: string, data: unknown) => setKv(key, data);

let settings: MonitorSettings = { ...DEFAULTS, ...readJSON(SETTINGS_FILE, {}) };
settings.thresholds = { ...DEFAULTS.thresholds, ...settings.thresholds };
settings.notifyEvents = { ...DEFAULT_EVENTS, ...(settings.notifyEvents || {}) };

// Public view never includes secrets (webhook URLs / bot token).
export function getSettings() {
  const { discordWebhook, telegramBotToken, customWebhookUrl, ...rest } = settings;
  return {
    ...rest,
    hasDiscordWebhook: !!discordWebhook,
    hasTelegramBotToken: !!telegramBotToken,
    hasCustomWebhook: !!customWebhookUrl
  };
}

const clamp = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function validateCustomWebhook(raw: unknown): string {
  const url = String(raw || '').trim();
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw badRequest('Invalid webhook URL'); }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw badRequest('Webhook URL must use http:// or https://');
  }
  return parsed.toString();
}

export function updateSettings(input: any) {
  const t = input?.thresholds || {};
  const ev = input?.notifyEvents || {};
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
    notifyEvents: {
      cpu: ev.cpu !== undefined ? !!ev.cpu : settings.notifyEvents.cpu,
      mem: ev.mem !== undefined ? !!ev.mem : settings.notifyEvents.mem,
      disk: ev.disk !== undefined ? !!ev.disk : settings.notifyEvents.disk,
      down: ev.down !== undefined ? !!ev.down : settings.notifyEvents.down,
      ssl: ev.ssl !== undefined ? !!ev.ssl : settings.notifyEvents.ssl,
      http: ev.http !== undefined ? !!ev.http : settings.notifyEvents.http
    },
    // Empty/undefined = keep; explicit null = clear.
    discordWebhook:
      input?.discordWebhook === null ? '' : input?.discordWebhook ? encrypt(validateWebhook(input.discordWebhook)) : settings.discordWebhook,
    telegramBotToken:
      input?.telegramBotToken === null ? '' : input?.telegramBotToken ? encrypt(String(input.telegramBotToken).trim()) : settings.telegramBotToken,
    telegramChatId:
      input?.telegramChatId === null ? '' : input?.telegramChatId !== undefined ? String(input.telegramChatId).trim() : settings.telegramChatId,
    customWebhookUrl:
      input?.customWebhookUrl === null ? '' : input?.customWebhookUrl ? encrypt(validateCustomWebhook(input.customWebhookUrl)) : settings.customWebhookUrl
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

export async function sendTelegram(text: string): Promise<void> {
  if (!settings.telegramBotToken || !settings.telegramChatId) throw badRequest('Telegram Bot Token atau Chat ID belum dikonfigurasi');
  const token = decrypt(settings.telegramBotToken);
  const plain = text.replace(/\*\*/g, '').replace(/\\(.)/g, '$1');
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: settings.telegramChatId,
      text: plain.slice(0, 4000),
      disable_web_page_preview: true
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Telegram: ${(await res.json().catch(() => ({}))).description || res.status}`);
}

export async function sendCustomWebhook(text: string, level: AlertLevel = 'info'): Promise<void> {
  if (!settings.customWebhookUrl) throw badRequest('Custom Webhook URL belum dikonfigurasi');
  const plain = text.replace(/\*\*/g, '').replace(/\\(.)/g, '$1');
  const res = await fetch(decrypt(settings.customWebhookUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: '7Server',
      level,
      text: plain,
      message: plain,
      timestamp: new Date().toISOString()
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

const notify = (text: string, level: AlertLevel) => {
  if (settings.discordWebhook) {
    sendDiscord(text, level).catch((e) => console.warn('[monitor] discord failed:', e.message));
  }
  if (settings.telegramBotToken && settings.telegramChatId) {
    sendTelegram(text).catch((e) => console.warn('[monitor] telegram failed:', e.message));
  }
  if (settings.customWebhookUrl) {
    sendCustomWebhook(text, level).catch((e) => console.warn('[monitor] custom webhook failed:', e.message));
  }
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

// ----------------- ALERT STATE & HISTORY ----------------- //

export interface AlertHistoryEntry {
  id: string;
  key: string;
  type: 'triggered' | 'recovered';
  message: string;
  ts: number;
}

const ALERT_HISTORY_MAX = 200;
let alertHistory: AlertHistoryEntry[] = readJSON(ALERT_HISTORY_FILE, []);
export const getAlertHistory = (limit = 60) => alertHistory.slice(0, limit);
export function clearAlertHistory() {
  alertHistory = [];
  writeJSON(ALERT_HISTORY_FILE, alertHistory);
}

function pushAlertHistory(key: string, type: 'triggered' | 'recovered', message: string) {
  alertHistory.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    key,
    type,
    message: message.replace(/\*\*/g, '').replace(/\\(.)/g, '$1'),
    ts: Date.now()
  });
  if (alertHistory.length > ALERT_HISTORY_MAX) alertHistory.length = ALERT_HISTORY_MAX;
  writeJSON(ALERT_HISTORY_FILE, alertHistory);
}

function shouldNotifyKey(key: string): boolean {
  const ev = settings.notifyEvents || DEFAULT_EVENTS;
  if (key.endsWith(':cpu')) return ev.cpu;
  if (key.endsWith(':mem')) return ev.mem;
  if (key.endsWith(':disk')) return ev.disk;
  if (key.startsWith('srv:') && key.endsWith(':down')) return ev.down;
  if (key.startsWith('url:') && key.endsWith(':down')) return ev.http;
  if (key.endsWith(':ssl')) return ev.ssl;
  return true;
}

// Keys currently in alert, e.g. "srv:<id>:cpu", "srv:<id>:down", "url:<domain>:down". Only transitions notify.
const activeAlerts = new Map<string, { since: number; message: string; acknowledged?: boolean }>();

function setAlert(key: string, on: boolean, message: string, recoverMessage: string) {
  const was = activeAlerts.has(key);
  if (on && !was) {
    activeAlerts.set(key, { since: Date.now(), message, acknowledged: false });
    pushAlertHistory(key, 'triggered', message);
    if (shouldNotifyKey(key)) notify(`🔴 ${message}`, 'alert');
  } else if (!on && was) {
    activeAlerts.delete(key);
    pushAlertHistory(key, 'recovered', recoverMessage);
    if (shouldNotifyKey(key)) notify(`✅ ${recoverMessage}`, 'ok');
  } else if (on) {
    activeAlerts.get(key)!.message = message;
  }
}

export function acknowledgeAlert(key: string): boolean {
  const item = activeAlerts.get(key);
  if (!item) return false;
  item.acknowledged = true;
  return true;
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

export async function runMetricsPollNow(): Promise<void> {
  await pollServers();
}

export function startMonitor() {
  restart();
  if (settings.enabled) {
    setTimeout(pollServers, 3000);
    setTimeout(runUptimeChecks, 15000);
  }
}

export const getStatus = () => ({ lastMetricsRun, lastUptimeRun, metricsRunning, uptimeRunning, activeAlerts: getActiveAlerts() });
