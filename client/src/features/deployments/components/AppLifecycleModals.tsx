import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, History, KeyRound, RefreshCw, RotateCcw, Save, ScrollText, Webhook, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';
import {
  fetchAppEnv,
  fetchAppLogs,
  fetchAppWebhook,
  fetchDeployHistory,
  saveAppEnv,
  updateDeployConfig
} from '../api';
import type { DeployHistoryRecord } from '../types';

export function DeployHistoryModal({
  serverId,
  appName,
  onClose,
  onRollback
}: {
  serverId: string;
  appName: string;
  onClose: () => void;
  onRollback: (commitSha: string) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<DeployHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchDeployHistory(serverId, appName)
      .then(setItems)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [serverId, appName]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('deploy.history')} · <span className="font-mono">{appName}</span>
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={load} className="h-7 w-7" title={t('common.refresh')}>
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-2.5">
          {loading && items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--muted-foreground)]">Loading...</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--muted-foreground)]">{t('deploy.noHistory')}</div>
          ) : (
            items.map((rec) => (
              <div key={rec.id} className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                      rec.status === 'success'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : rec.status === 'failed'
                        ? 'bg-red-500/15 text-red-500'
                        : 'bg-sky-500/15 text-sky-400'
                    }`}>
                      {rec.status}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--foreground)]">{rec.branch}</span>
                    {rec.commit && (
                      <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)]">
                        {rec.commit.slice(0, 7)}
                      </span>
                    )}
                    <span className="text-[10.5px] text-[var(--muted-foreground)] uppercase font-mono">
                      {rec.trigger}{rec.triggeredBy ? ` · ${rec.triggeredBy}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono text-[var(--muted-foreground)]">
                      {new Date(rec.startedAt).toLocaleString()}
                      {rec.durationMs != null ? ` (${Math.round(rec.durationMs / 1000)}s)` : ''}
                    </span>
                    {rec.commit && rec.status === 'success' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onClose();
                          onRollback(rec.commit!);
                        }}
                        className="h-6 px-2 text-[10.5px] gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t('deploy.rollback')}
                      </Button>
                    )}
                    {rec.logSnippet && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === rec.id ? null : rec.id)}
                        className="h-6 px-2 text-[10.5px]"
                      >
                        {expandedId === rec.id ? 'Hide log' : 'View log'}
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === rec.id && rec.logSnippet && (
                  <pre className="p-2.5 rounded-lg bg-zinc-950 text-zinc-200 font-mono text-[10.5px] max-h-60 overflow-auto whitespace-pre-wrap break-words">
                    {rec.logSnippet}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function WebhookConfigModal({
  serverId,
  appName,
  onClose,
  onChanged
}: {
  serverId: string;
  appName: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const t = useT();
  const [autoDeploy, setAutoDeploy] = useState(false);
  const [secret, setSecret] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSec, setCopiedSec] = useState(false);

  const webhookUrl = `${window.location.origin}/api/webhooks/deploy/${encodeURIComponent(serverId)}/${encodeURIComponent(appName)}`;

  useEffect(() => {
    fetchAppWebhook(serverId, appName)
      .then((d) => {
        setAutoDeploy(d.autoDeploy);
        setSecret(d.webhookSecret);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [serverId, appName]);

  const toggle = async (next: boolean) => {
    try {
      setAutoDeploy(next);
      await updateDeployConfig(serverId, appName, { autoDeploy: next });
      onChanged?.();
      toast.success(t('mon.saved'));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const regenerate = async () => {
    try {
      await updateDeployConfig(serverId, appName, { regenerateWebhook: true });
      const fresh = await fetchAppWebhook(serverId, appName);
      setSecret(fresh.webhookSecret);
      toast.success('Webhook secret regenerated');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Webhook className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('deploy.webhook')} · <span className="font-mono">{appName}</span>
            </h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {loading ? (
            <div className="py-6 text-center text-[var(--muted-foreground)]">Loading...</div>
          ) : (
            <>
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 cursor-pointer">
                <span className="font-medium text-[var(--foreground)]">{t('deploy.autoDeploy')}</span>
                <input
                  type="checkbox"
                  checked={autoDeploy}
                  onChange={(e) => toggle(e.target.checked)}
                  className="rounded border-[var(--border)]"
                />
              </label>

              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">{t('deploy.webhookHint')}</p>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-[var(--muted-foreground)]">Payload URL</label>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-[11px] truncate select-all">
                    {webhookUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(webhookUrl);
                      setCopiedUrl(true);
                      setTimeout(() => setCopiedUrl(false), 1800);
                    }}
                    className="h-8 px-2.5 shrink-0"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-[var(--muted-foreground)] flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> Webhook Secret
                  </label>
                  <button type="button" onClick={regenerate} className="text-[11px] text-amber-500 hover:underline cursor-pointer">
                    {t('deploy.regenerateSecret')}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] font-mono text-[11px] truncate select-all">
                    {revealed ? secret : '•'.repeat(Math.min(32, secret.length || 24))}
                  </code>
                  <Button variant="outline" size="sm" onClick={() => setRevealed((v) => !v)} className="h-8 px-2.5 shrink-0">
                    {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(secret);
                      setCopiedSec(true);
                      setTimeout(() => setCopiedSec(false), 1800);
                    }}
                    className="h-8 px-2.5 shrink-0"
                  >
                    {copiedSec ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppLogsModal({
  serverId,
  appName,
  onClose
}: {
  serverId: string;
  appName: string;
  onClose: () => void;
}) {
  const t = useT();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetchAppLogs(serverId, appName)
      .then((d) => setLogs(d.logs || '(no logs yet)'))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [serverId, appName]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('deploy.liveLogs')} · <span className="font-mono">{appName}</span>
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={load} className="h-7 gap-1 text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="p-4">
          <pre className="p-3.5 rounded-xl bg-zinc-950 border border-[var(--border)] text-zinc-100 font-mono text-[11px] leading-relaxed h-[60vh] overflow-auto whitespace-pre-wrap break-words">
            {loading && !logs ? 'Fetching logs...' : logs}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function AppEnvModal({
  serverId,
  appName,
  onClose
}: {
  serverId: string;
  appName: string;
  onClose: () => void;
}) {
  const t = useT();
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAppEnv(serverId, appName)
      .then((d) => {
        setContent(d.content || '');
        setFilePath(d.path);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [serverId, appName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAppEnv(serverId, appName, content);
      toast.success('.env saved');
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-3.5 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {t('deploy.envEditor')} · <span className="font-mono">{appName}</span>
            </h3>
            {filePath && <p className="text-[10.5px] font-mono text-[var(--muted-foreground)]">{filePath}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="py-10 text-center text-xs text-[var(--muted-foreground)]">Loading .env...</div>
          ) : (
            <>
              <textarea
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                placeholder="NODE_ENV=production&#10;PORT=3000"
                className="w-full rounded-xl bg-zinc-950 border border-[var(--border)] p-3 text-xs font-mono text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
                <Button size="sm" onClick={handleSave} disabled={saving} className="btn-metal gap-1.5">
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : t('common.save')}</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
