import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Bell, Globe, ScrollText, Send, ShieldAlert, ExternalLink, Download, User, Check, CheckCircle2, Trash2, Activity, Webhook, MessageSquare } from 'lucide-react';
import {
  acknowledgeAlertApi,
  clearAlertHistoryApi,
  fetchMonitor,
  runMonitorPoll,
  saveMonitor,
  testCustomWebhook,
  testDiscord,
  testTelegram,
  fetchUptime,
  runUptime,
  fetchAudit,
  exportAuditCsv,
  AlertHistoryEntry,
  MonitorSettings,
  MonitorStatus,
  NotifyEvents,
  UptimeResult,
  AuditEntry
} from '@/features/monitoring/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useT } from '@/shared/i18n';

type Tab = 'alerts' | 'uptime' | 'audit';

const ago = (t: ReturnType<typeof useT>, ts: number | null) => {
    if (!ts) return t('mon.never');
    const s = Math.round((Date.now() - ts) / 1000);
    return s < 60 ? t('mon.secondsAgo', { n: s }) : s < 3600 ? t('mon.minutesAgo', { n: Math.round(s / 60) }) : t('mon.hoursAgo', { n: Math.round(s / 3600) });
};

// Alert text is Discord markdown; show it as plain text here.
const stripTags = (s: string) => s.replace(/\*\*/g, '').replace(/\\(.)/g, '$1');

// A routed page (#/monitoring/<tab>); the tab lives in the URL so it survives refresh and back/forward.
export default function MonitoringPage({ tab, onTabChange, onThresholdsSaved, onAlertsChanged }: {
    tab: Tab;
    onTabChange: (t: Tab) => void;
    onThresholdsSaved: (t: MonitorSettings['thresholds']) => void;
    onAlertsChanged?: (count: number) => void;
}) {
    const t = useT();
    const setTab = onTabChange;
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const [settings, setSettings] = useState<MonitorSettings | null>(null);
    const [status, setStatus] = useState<MonitorStatus | null>(null);
    const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
    const [tokenInput, setTokenInput] = useState('');
    const [telegramTokenInput, setTelegramTokenInput] = useState('');
    const [telegramChatInput, setTelegramChatInput] = useState('');
    const [customWebhookInput, setCustomWebhookInput] = useState('');
    const [pollingNow, setPollingNow] = useState(false);
    const [saving, setSaving] = useState(false);

    const [uptime, setUptime] = useState<UptimeResult[]>([]);
    const [checking, setChecking] = useState(false);
    const [loadingUptime, setLoadingUptime] = useState(false);
    const [uptimeFilter, setUptimeFilter] = useState<'all' | 'problem'>('all');

    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);
    const [auditQuery, setAuditQuery] = useState('');

    const guard = async (fn: () => Promise<unknown>) => {
        setError(null);
        try { await fn(); } catch (e: any) { setError(e.message); }
    };

    const loadMonitor = () => guard(async () => {
        const d = await fetchMonitor();
        setSettings(d.settings);
        setStatus(d.status);
        setAlertHistory(d.history || []);
        setTelegramChatInput(d.settings.telegramChatId || '');
        onAlertsChanged?.(d.status.activeAlerts.filter((a) => !a.acknowledged).length);
    });

    const loadAudit = () => guard(async () => {
        setLoadingAudit(true);
        try {
            setAudit(await fetchAudit());
        } finally {
            setLoadingAudit(false);
        }
    });

    const loadUptime = () => guard(async () => {
        setLoadingUptime(true);
        try {
            setUptime(await fetchUptime());
        } finally {
            setLoadingUptime(false);
        }
    });

    useEffect(() => {
        if (tab === 'alerts') loadMonitor();
        if (tab === 'uptime') loadUptime();
        if (tab === 'audit') loadAudit();
    }, [tab]);

    const save = async () => {
        if (!settings) return;
        setSaving(true);
        await guard(async () => {
            const next = await saveMonitor({
                ...settings,
                discordWebhook: tokenInput || undefined,
                telegramBotToken: telegramTokenInput || undefined,
                telegramChatId: telegramChatInput,
                customWebhookUrl: customWebhookInput || undefined
            });
            setSettings(next);
            setTokenInput('');
            setTelegramTokenInput('');
            setCustomWebhookInput('');
            onThresholdsSaved(next.thresholds);
            setNotice(t('mon.saved'));
            setTimeout(() => setNotice(null), 2500);
        });
        setSaving(false);
    };

    const clearChannel = async (patch: { discordWebhook?: null; telegramBotToken?: null; telegramChatId?: null; customWebhookUrl?: null }) => {
        await guard(async () => {
            const next = await saveMonitor(patch);
            setSettings(next);
            if ('telegramChatId' in patch) setTelegramChatInput('');
            setNotice(t('mon.saved'));
            setTimeout(() => setNotice(null), 2500);
        });
    };

    const toggleEvent = (key: keyof NotifyEvents) => {
        if (!settings) return;
        const curr = settings.notifyEvents || { cpu: true, mem: true, disk: true, down: true, ssl: true, http: true };
        setSettings({ ...settings, notifyEvents: { ...curr, [key]: !curr[key] } });
    };

    const num = (k: 'intervalSec' | 'uptimeIntervalMin' | 'sslWarnDays') => (e: React.ChangeEvent<HTMLInputElement>) =>
        settings && setSettings({ ...settings, [k]: Number(e.target.value) });

    const problems = uptime.filter((u) => u.status === null || u.status >= 400 || (u.sslDaysLeft ?? 999) < (settings?.sslWarnDays ?? 14));
    const shownUptime = uptimeFilter === 'problem' ? problems : uptime;
    const q = auditQuery.toLowerCase();
    const shownAudit = audit.filter((a) => !q || `${a.method} ${a.path} ${a.detail} ${a.ip}`.toLowerCase().includes(q));

    const tabs: [Tab, string, React.ElementType][] = [
        ['alerts', t('monitoring.tabAlerts'), Bell],
        ['uptime', `${t('monitoring.tabUptime')}${problems.length ? ` (${problems.length}⚠)` : ''}`, Globe],
        ['audit', t('monitoring.tabAudit'), ScrollText]
    ];

    return (
        <div className="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl flex flex-col overflow-hidden min-h-[70vh]">
            <div>

                <div className="px-4 pt-2 flex gap-1 border-b border-[var(--border)] overflow-x-auto" role="tablist" aria-label={t('monitoring.title')}>
                    {tabs.map(([k, label, Icon]) => (
                        <button
                            key={k}
                            role="tab"
                            aria-selected={tab === k}
                            onClick={() => setTab(k)}
                            className={`px-3 py-1.5 text-xs flex items-center gap-1.5 border-b-2 -mb-px whitespace-nowrap ${tab === k ? 'border-[var(--foreground)] font-semibold' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                }`}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </div>

                {error && <p role="alert" className="px-4 py-2 text-xs text-red-500 bg-red-500/10 border-b border-red-500/20">{error}</p>}

                <div key={tab} className="flex-1 overflow-auto p-4 fade-in">
                    {tab === 'alerts' && settings && (
                        <div className="space-y-5 text-xs">
                            {/* Live Poller Status Strip */}
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                        (status?.activeAlerts.length ?? 0) > 0
                                            ? 'bg-red-500/15 text-red-500 border border-red-500/30'
                                            : 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                    }`}>
                                        <Activity className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                                            <span>{t('monitoring.serverMonitor')}</span>
                                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                                                settings.enabled ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-zinc-400'
                                            }`}>
                                                {settings.enabled ? 'ACTIVE' : 'PAUSED'}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-[var(--muted-foreground)] truncate mt-0.5">
                                            {t('mon.lastMetrics')} <b>{ago(t, status?.lastMetricsRun ?? null)}</b> · {t('mon.lastUptime')} <b>{ago(t, status?.lastUptimeRun ?? null)}</b>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pollingNow}
                                        onClick={async () => {
                                            setPollingNow(true);
                                            await guard(async () => {
                                                const d = await runMonitorPoll();
                                                setSettings(d.settings);
                                                setStatus(d.status);
                                                setAlertHistory(d.history || []);
                                                onAlertsChanged?.(d.status.activeAlerts.filter((a) => !a.acknowledged).length);
                                            });
                                            setPollingNow(false);
                                        }}
                                        className="h-8 gap-1.5"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${pollingNow ? 'animate-spin' : ''}`} />
                                        <span>{pollingNow ? t('alerts.checking') : t('alerts.checkNow')}</span>
                                    </Button>
                                    <Button size="sm" onClick={save} disabled={saving} className="h-8 btn-metal">
                                        {saving ? t('mon.saving') : t('monitoring.saveSettings')}
                                    </Button>
                                </div>
                            </div>

                            {notice && <div role="status" className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs">{notice}</div>}

                            <div className="grid lg:grid-cols-2 gap-5">
                                {/* Left Column: Thresholds, Intervals & Event Rules */}
                                <div className="space-y-4">
                                    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)]/30 p-4 space-y-3.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="font-semibold text-sm">{t('mon.thresholds')}</h3>
                                            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                                                <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="rounded" />
                                                <span className="text-[11px] font-medium">{t('monitoring.enablePolling')}</span>
                                            </label>
                                        </div>

                                        <div className="space-y-3">
                                            {(['cpu', 'mem', 'disk'] as const).map((k) => {
                                                const val = settings.thresholds[k];
                                                return (
                                                    <div key={k} className="space-y-1">
                                                        <div className="flex items-center justify-between">
                                                            <span className="uppercase font-mono font-semibold text-[11px]">{k === 'mem' ? 'RAM' : k}</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <Input
                                                                    type="number" min={1} max={100} value={val}
                                                                    onChange={(e) => setSettings({ ...settings, thresholds: { ...settings.thresholds, [k]: Number(e.target.value) } })}
                                                                    className="h-7 w-16 text-xs text-right font-mono"
                                                                />
                                                                <span className="text-[var(--muted-foreground)]">%</span>
                                                            </div>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={10}
                                                            max={100}
                                                            value={val}
                                                            onChange={(e) => setSettings({ ...settings, thresholds: { ...settings.thresholds, [k]: Number(e.target.value) } })}
                                                            className="w-full accent-emerald-500 cursor-pointer h-1.5"
                                                        />
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]/70">
                                            <label className="space-y-1">
                                                <span className="text-[10.5px] text-[var(--muted-foreground)] block truncate">{t('mon.metricsInterval')}</span>
                                                <Input type="number" min={30} max={3600} value={settings.intervalSec} onChange={num('intervalSec')} className="h-7 text-xs font-mono" />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="text-[10.5px] text-[var(--muted-foreground)] block truncate">{t('mon.uptimeInterval')}</span>
                                                <Input type="number" min={1} max={1440} value={settings.uptimeIntervalMin} onChange={num('uptimeIntervalMin')} className="h-7 text-xs font-mono" />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="text-[10.5px] text-[var(--muted-foreground)] block truncate">{t('mon.sslWarnDays')}</span>
                                                <Input type="number" min={1} max={90} value={settings.sslWarnDays} onChange={num('sslWarnDays')} className="h-7 text-xs font-mono" />
                                            </label>
                                        </div>

                                        <div className="pt-2 border-t border-[var(--border)]/70 space-y-2">
                                            <div className="text-[11px] font-medium text-[var(--muted-foreground)]">{t('alerts.eventRules')}</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(
                                                    [
                                                        ['cpu', 'alerts.evCpu'],
                                                        ['mem', 'alerts.evMem'],
                                                        ['disk', 'alerts.evDisk'],
                                                        ['down', 'alerts.evDown'],
                                                        ['http', 'alerts.evHttp'],
                                                        ['ssl', 'alerts.evSsl']
                                                    ] as [keyof NotifyEvents, any][]
                                                ).map(([evKey, labelKey]) => {
                                                    const on = (settings.notifyEvents || { cpu: true, mem: true, disk: true, down: true, ssl: true, http: true })[evKey];
                                                    return (
                                                        <button
                                                            key={evKey}
                                                            type="button"
                                                            onClick={() => toggleEvent(evKey)}
                                                            className={`px-2.5 py-1 rounded-full border text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                                                on
                                                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-medium'
                                                                    : 'border-[var(--border)] text-[var(--muted-foreground)] opacity-65'
                                                            }`}
                                                        >
                                                            {on && <Check className="w-3 h-3" />}
                                                            <span>{t(labelKey)}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </section>

                                    {/* Active Alerts & Alert Timeline */}
                                    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)]/30 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="font-semibold text-sm flex items-center gap-2">
                                                <Bell className="w-4 h-4 text-red-500" />
                                                <span>{t('monitoring.activeAlerts')} ({status?.activeAlerts.length ?? 0})</span>
                                            </h3>
                                        </div>
                                        {status?.activeAlerts.length ? (
                                            <div className="space-y-1.5">
                                                {status.activeAlerts.map((a) => (
                                                    <div key={a.key} className={`rounded-lg border px-2.5 py-2 flex items-start justify-between gap-2 ${
                                                        a.acknowledged ? 'border-[var(--border)] bg-[var(--muted)]/30 opacity-75' : 'border-red-500/25 bg-red-500/10 text-red-500'
                                                    }`}>
                                                        <div className="min-w-0">
                                                            <div className="font-medium break-words">{stripTags(a.message)}</div>
                                                            <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">
                                                                {t('mon.since', { ago: ago(t, a.since) })}
                                                                {a.acknowledged && ` · ${t('alerts.acked')}`}
                                                            </div>
                                                        </div>
                                                        {!a.acknowledged && (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={async () => {
                                                                    const nextStatus = await acknowledgeAlertApi(a.key);
                                                                    setStatus(nextStatus);
                                                                    onAlertsChanged?.(nextStatus.activeAlerts.filter((x) => !x.acknowledged).length);
                                                                }}
                                                                className="h-6 px-2 text-[10px] shrink-0"
                                                            >
                                                                <Check className="w-3 h-3 mr-1" />
                                                                {t('alerts.ack')}
                                                            </Button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-[var(--muted-foreground)] py-1">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                <span>{t('monitoring.allNormal')}</span>
                                            </div>
                                        )}

                                        <div className="pt-3 border-t border-[var(--border)]/70 space-y-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-semibold text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]">
                                                    {t('alerts.recentHistory')}
                                                </span>
                                                {alertHistory.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => guard(async () => { await clearAlertHistoryApi(); setAlertHistory([]); })}
                                                        className="text-[10.5px] text-[var(--muted-foreground)] hover:text-red-500 inline-flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                        <span>{t('alerts.clearHistory')}</span>
                                                    </button>
                                                )}
                                            </div>
                                            {alertHistory.length === 0 ? (
                                                <p className="text-[11px] text-[var(--muted-foreground)] italic">{t('alerts.noHistory')}</p>
                                            ) : (
                                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                                                    {alertHistory.map((h) => (
                                                        <div key={h.id} className="flex items-start justify-between gap-2 text-[11px] py-1 border-b border-[var(--border)]/40 last:border-0">
                                                            <div className="flex items-start gap-2 min-w-0">
                                                                <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono shrink-0 ${
                                                                    h.type === 'triggered' ? 'bg-red-500/15 text-red-500' : 'bg-emerald-500/15 text-emerald-500'
                                                                }`}>
                                                                    {h.type === 'triggered' ? t('alerts.triggered') : t('alerts.recovered')}
                                                                </span>
                                                                <span className="text-[var(--foreground)]/90 break-words">{h.message}</span>
                                                            </div>
                                                            <span className="text-[10px] font-mono text-[var(--muted-foreground)] shrink-0">
                                                                {ago(t, h.ts)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column: Notification Channels */}
                                <div className="space-y-4">
                                    {/* Discord Channel */}
                                    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)]/30 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-indigo-400" />
                                                <h3 className="font-semibold text-sm">{t('alerts.channelDiscord')}</h3>
                                            </div>
                                            {settings.hasDiscordWebhook && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium">
                                                    {t('alerts.configured')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-[var(--muted-foreground)]">{t('monitoring.discordDesc')}</p>
                                        <Input
                                            type="password" autoComplete="off" value={tokenInput}
                                            placeholder={settings.hasDiscordWebhook ? t('mon.webhookKeep') : t('monitoring.webhookPlaceholder')}
                                            onChange={(e) => setTokenInput(e.target.value)} className="h-8 text-xs font-mono"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline" size="sm" className="gap-1 h-7 text-[11px]"
                                                disabled={!settings.hasDiscordWebhook}
                                                onClick={() => guard(async () => { await testDiscord(); setNotice(t('mon.pingSent')); setTimeout(() => setNotice(null), 3000); })}
                                            >
                                                <Send className="w-3 h-3" /> {t('alerts.test')}
                                            </Button>
                                            {settings.hasDiscordWebhook && (
                                                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-500 hover:text-red-500" onClick={() => clearChannel({ discordWebhook: null })}>
                                                    <Trash2 className="w-3 h-3 mr-1" /> {t('alerts.clear')}
                                                </Button>
                                            )}
                                        </div>
                                    </section>

                                    {/* Telegram Bot Channel */}
                                    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)]/30 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Send className="w-4 h-4 text-sky-400" />
                                                <h3 className="font-semibold text-sm">{t('alerts.channelTelegram')}</h3>
                                            </div>
                                            {settings.hasTelegramBotToken && settings.telegramChatId && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium">
                                                    {t('alerts.configured')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-2">
                                            <label className="space-y-1">
                                                <span className="text-[10.5px] text-[var(--muted-foreground)]">{t('alerts.telegramToken')}</span>
                                                <Input
                                                    type="password" autoComplete="off" value={telegramTokenInput}
                                                    placeholder={settings.hasTelegramBotToken ? '•••••••• (saved)' : '123456:ABC-DEF...'}
                                                    onChange={(e) => setTelegramTokenInput(e.target.value)} className="h-8 text-xs font-mono"
                                                />
                                            </label>
                                            <label className="space-y-1">
                                                <span className="text-[10.5px] text-[var(--muted-foreground)]">{t('alerts.telegramChatId')}</span>
                                                <Input
                                                    value={telegramChatInput}
                                                    placeholder="-1001234567890"
                                                    onChange={(e) => setTelegramChatInput(e.target.value)} className="h-8 text-xs font-mono"
                                                />
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline" size="sm" className="gap-1 h-7 text-[11px]"
                                                disabled={!settings.hasTelegramBotToken || !settings.telegramChatId}
                                                onClick={() => guard(async () => { await testTelegram(); setNotice(t('mon.pingSent')); setTimeout(() => setNotice(null), 3000); })}
                                            >
                                                <Send className="w-3 h-3" /> {t('alerts.test')}
                                            </Button>
                                            {(settings.hasTelegramBotToken || settings.telegramChatId) && (
                                                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-500 hover:text-red-500" onClick={() => clearChannel({ telegramBotToken: null, telegramChatId: null })}>
                                                    <Trash2 className="w-3 h-3 mr-1" /> {t('alerts.clear')}
                                                </Button>
                                            )}
                                        </div>
                                    </section>

                                    {/* Custom JSON Webhook Channel */}
                                    <section className="rounded-xl border border-[var(--border)] bg-[var(--background)]/30 p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Webhook className="w-4 h-4 text-emerald-400" />
                                                <h3 className="font-semibold text-sm">{t('alerts.channelWebhook')}</h3>
                                            </div>
                                            {settings.hasCustomWebhook && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-medium">
                                                    {t('alerts.configured')}
                                                </span>
                                            )}
                                        </div>
                                        <Input
                                            type="password" autoComplete="off" value={customWebhookInput}
                                            placeholder={settings.hasCustomWebhook ? t('mon.webhookKeep') : 'https://hooks.slack.com/services/... or https://ntfy.sh/topic'}
                                            onChange={(e) => setCustomWebhookInput(e.target.value)} className="h-8 text-xs font-mono"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline" size="sm" className="gap-1 h-7 text-[11px]"
                                                disabled={!settings.hasCustomWebhook}
                                                onClick={() => guard(async () => { await testCustomWebhook(); setNotice(t('mon.pingSent')); setTimeout(() => setNotice(null), 3000); })}
                                            >
                                                <Send className="w-3 h-3" /> {t('alerts.test')}
                                            </Button>
                                            {settings.hasCustomWebhook && (
                                                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-500 hover:text-red-500" onClick={() => clearChannel({ customWebhookUrl: null })}>
                                                    <Trash2 className="w-3 h-3 mr-1" /> {t('alerts.clear')}
                                                </Button>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'uptime' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-[var(--muted-foreground)] flex-1">
                                    {t('mon.uptimeDesc')}
                                </span>
                                <select value={uptimeFilter} onChange={(e) => setUptimeFilter(e.target.value as 'all' | 'problem')}
                                    className="h-7 bg-[var(--background)] border border-[var(--border)] rounded px-1.5" aria-label={t('mon.filter')}>
                                    <option value="all">{t('mon.filterAll', { n: uptime.length })}</option>
                                    <option value="problem">{t('mon.filterProblem', { n: problems.length })}</option>
                                </select>
                                <Button variant="outline" size="sm" className="gap-1" disabled={checking}
                                    onClick={async () => { setChecking(true); await guard(async () => setUptime(await runUptime())); setChecking(false); }}>
                                    <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> {checking ? t('mon.checking') : t('mon.checkNow')}
                                </Button>
                            </div>
                            {(checking || loadingUptime) && uptime.length === 0 ? (
                                <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                                    <TableSkeleton rows={5} cols={5} colWidths={['w-1/4', 'w-1/5', 'w-1/6', 'w-1/6', 'w-1/6']} />
                                </div>
                            ) : uptime.length === 0 ? (
                                <p className="text-xs text-[var(--muted-foreground)] py-10 text-center">
                                    {t('mon.uptimeEmpty')}
                                </p>
                            ) : (
                                <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] text-left">
                                            <tr>
                                                <th className="py-2 px-3">{t('mon.thDomain')}</th>
                                                <th className="py-2 px-3">{t('mon.thServer')}</th>
                                                <th className="py-2 px-3">{t('mon.thStatus')}</th>
                                                <th className="py-2 px-3 text-right">{t('mon.thResponse')}</th>
                                                <th className="py-2 px-3">SSL</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)]">
                                            {shownUptime.map((u) => {
                                                const noDns = u.error === 'ENOTFOUND';
                                                const down = !noDns && (u.status === null || u.status >= 500);
                                                const warn = !down && u.status !== null && u.status >= 400;
                                                const ssl = u.sslDaysLeft;
                                                return (
                                                    <tr key={u.domain}>
                                                        <td className="py-1.5 px-3 font-mono">
                                                            <a href={u.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                                                <span className="sensitive">{u.domain}</span> <ExternalLink className="w-3 h-3 opacity-50" />
                                                            </a>
                                                        </td>
                                                        <td className="py-1.5 px-3 text-[var(--muted-foreground)]">{u.serverName}</td>
                                                        <td className="py-1.5 px-3">
                                                            <span className={`font-mono px-1.5 py-0.5 rounded ${noDns ? 'bg-[var(--muted)] text-[var(--muted-foreground)]' : down ? 'bg-red-500/15 text-red-500' : warn ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
                                                                }`} title={noDns ? t('mon.noDnsHint') : undefined}>
                                                                {noDns ? t('mon.noDns') : u.status ?? u.error ?? 'ERR'}
                                                            </span>
                                                        </td>
                                                        <td className="py-1.5 px-3 text-right font-mono text-[var(--muted-foreground)]">{u.ms != null ? `${u.ms} ms` : '–'}</td>
                                                        <td className="py-1.5 px-3 font-mono">
                                                            {ssl == null ? (
                                                                <span className="text-[var(--muted-foreground)]">{t('mon.none')}</span>
                                                            ) : (
                                                                <span className={ssl < 0 ? 'text-red-500' : ssl < (settings?.sslWarnDays ?? 14) ? 'text-amber-600' : ''}>
                                                                    {ssl < 0 ? t('mon.expired') : t('mon.days', { n: ssl })}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {tab === 'audit' && (
                        <div className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input placeholder={t('monitoring.auditSearch')} value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} className="h-8 text-xs max-w-sm" />
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => guard(async () => setAudit(await fetchAudit()))}>
                                    <RefreshCw className="w-3.5 h-3.5" /> {t('common.refresh')}
                                </Button>
                                <Button variant="outline" size="sm" className="gap-1" onClick={() => exportAuditCsv()}>
                                    <Download className="w-3.5 h-3.5" /> {t('audit.exportCsv')}
                                </Button>
                                <span className="text-[11px] text-[var(--muted-foreground)] ml-auto">{t('mon.auditDesc')}</span>
                            </div>
                            {loadingAudit && audit.length === 0 ? (
                                <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                                    <TableSkeleton rows={6} cols={6} colWidths={['w-1/6', 'w-24', 'w-28', 'w-1/6', 'w-1/3', 'w-16']} />
                                </div>
                            ) : (
                                <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
                                    <table className="w-full text-xs">
                                        <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] text-left">
                                            <tr>
                                                <th className="py-2 px-3">{t('monitoring.thTimestamp')}</th>
                                                <th className="py-2 px-3">{t('audit.user')}</th>
                                                <th className="py-2 px-3">IP</th>
                                                <th className="py-2 px-3">{t('monitoring.thAction')}</th>
                                                <th className="py-2 px-3">{t('monitoring.thDetail')}</th>
                                                <th className="py-2 px-3">{t('mon.thStatus')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[var(--border)] font-mono">
                                            {shownAudit.map((a, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 px-3 whitespace-nowrap text-[var(--muted-foreground)]">{new Date(a.t).toLocaleString()}</td>
                                                    <td className="py-1.5 px-3 whitespace-nowrap">
                                                        {a.user ? (
                                                            <span className="flex items-center gap-1 font-sans text-xs">
                                                                <span className="font-semibold text-[var(--foreground)]">{a.user}</span>
                                                                {a.role && <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--muted)] text-[var(--muted-foreground)] uppercase">{a.role}</span>}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[var(--muted-foreground)] text-[11px]">-</span>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 px-3 text-[var(--muted-foreground)] sensitive">{a.ip.replace('::ffff:', '')}</td>
                                                    <td className="py-1.5 px-3 whitespace-nowrap">{a.method} {a.path.replace('/api/', '')}</td>
                                                    <td className="py-1.5 px-3 max-w-md truncate sensitive">{a.detail}</td>
                                                    <td className="py-1.5 px-3">
                                                        {a.status != null && (
                                                            <span className={a.status >= 400 ? 'text-red-500' : 'text-emerald-600'}>{a.status}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                            {shownAudit.length === 0 && (
                                                <tr><td colSpan={6} className="py-10 text-center text-[var(--muted-foreground)] font-sans">{t('mon.auditEmpty')}</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
