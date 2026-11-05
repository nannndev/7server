import React, { useEffect, useState } from 'react';
import { X, RefreshCw, Bell, Globe, ScrollText, Send, ShieldAlert, ExternalLink, Download, User } from 'lucide-react';
import { fetchMonitor, saveMonitor, testDiscord, fetchUptime, runUptime, fetchAudit, exportAuditCsv, MonitorSettings, MonitorStatus, UptimeResult, AuditEntry } from '@/features/monitoring/api';
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
    const [tokenInput, setTokenInput] = useState('');
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
        onAlertsChanged?.(d.status.activeAlerts.length);
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
            const next = await saveMonitor({ ...settings, discordWebhook: tokenInput || undefined });
            setSettings(next);
            setTokenInput('');
            onThresholdsSaved(next.thresholds);
            setNotice(t('mon.saved'));
            setTimeout(() => setNotice(null), 2500);
        });
        setSaving(false);
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
                        <div className="grid md:grid-cols-2 gap-6 text-xs">
                            <section className="space-y-3">
                                <h3 className="font-semibold text-sm">{t('monitoring.serverMonitor')}</h3>
                                <p className="text-[var(--muted-foreground)]">
                                    {t('monitoring.serverMonitorDesc')}
                                    {t('mon.lastMetrics')} <b>{ago(t, status?.lastMetricsRun ?? null)}</b>, {t('mon.lastUptime')} <b>{ago(t, status?.lastUptimeRun ?? null)}</b>.
                                </p>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
                                    {t('monitoring.enablePolling')}
                                </label>
                                <label className="flex items-center justify-between gap-2">
                                    <span>{t('mon.metricsInterval')}</span>
                                    <Input type="number" min={30} max={3600} value={settings.intervalSec} onChange={num('intervalSec')} className="h-7 w-24 text-xs" />
                                </label>
                                <label className="flex items-center justify-between gap-2">
                                    <span>{t('mon.uptimeInterval')}</span>
                                    <Input type="number" min={1} max={1440} value={settings.uptimeIntervalMin} onChange={num('uptimeIntervalMin')} className="h-7 w-24 text-xs" />
                                </label>
                                <label className="flex items-center justify-between gap-2">
                                    <span>{t('mon.sslWarnDays')}</span>
                                    <Input type="number" min={1} max={90} value={settings.sslWarnDays} onChange={num('sslWarnDays')} className="h-7 w-24 text-xs" />
                                </label>
                                <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                                    <span className="text-[var(--muted-foreground)]">{t('mon.thresholds')}</span>
                                    {(['cpu', 'mem', 'disk'] as const).map((k) => (
                                        <label key={k} className="flex items-center justify-between gap-2">
                                            <span className="uppercase font-mono">{k === 'mem' ? 'RAM' : k}</span>
                                            <Input
                                                type="number" min={1} max={100} value={settings.thresholds[k]}
                                                onChange={(e) => setSettings({ ...settings, thresholds: { ...settings.thresholds, [k]: Number(e.target.value) } })}
                                                className="h-7 w-24 text-xs"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </section>

                            <section className="space-y-3">
                                <h3 className="font-semibold text-sm">{t('monitoring.discordTitle')}</h3>
                                <p className="text-[var(--muted-foreground)]">
                                    {t('monitoring.discordDesc')}
                                </p>
                                <label className="block space-y-1">
                                    <span>{t('monitoring.webhookUrl')} {settings.hasDiscordWebhook && <span className="text-emerald-500">{t('mon.webhookSaved')}</span>}</span>
                                    <Input
                                        type="password" autoComplete="off" value={tokenInput}
                                        placeholder={settings.hasDiscordWebhook ? t('mon.webhookKeep') : t('monitoring.webhookPlaceholder')}
                                        onChange={(e) => setTokenInput(e.target.value)} className="h-8 text-xs font-mono"
                                    />
                                </label>
                                <Button
                                    variant="outline" size="sm" className="gap-1"
                                    disabled={!settings.hasDiscordWebhook}
                                    title={!settings.hasDiscordWebhook ? t('mon.webhookSaveFirst') : ''}
                                    onClick={() => guard(async () => { await testDiscord(); setNotice(t('mon.pingSent')); setTimeout(() => setNotice(null), 3000); })}
                                >
                                    <Send className="w-3.5 h-3.5" /> {t('monitoring.testWebhook')}
                                </Button>

                                <div className="pt-3 border-t border-[var(--border)] space-y-1.5">
                                    <span className="font-semibold">{t('monitoring.activeAlerts')} ({status?.activeAlerts.length ?? 0})</span>
                                    {status?.activeAlerts.length ? (
                                        status.activeAlerts.map((a) => (
                                            <div key={a.key} className="text-red-500 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                                                {stripTags(a.message)} <span className="text-[var(--muted-foreground)]">· {t('mon.since', { ago: ago(t, a.since) })}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[var(--muted-foreground)]">{t('monitoring.allNormal')}</p>
                                    )}
                                </div>
                            </section>

                            <div className="md:col-span-2 flex items-center gap-3 pt-3 border-t border-[var(--border)]">
                                <Button onClick={save} disabled={saving}>{saving ? t('mon.saving') : t('monitoring.saveSettings')}</Button>
                                {notice && <span role="status" className="text-emerald-500">{notice}</span>}
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
                                    <Download className="w-3.5 h-3.5" /> Ekspor CSV
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
                                                <th className="py-2 px-3">User</th>
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
