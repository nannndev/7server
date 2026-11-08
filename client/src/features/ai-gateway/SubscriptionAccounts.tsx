import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  LogIn,
  Plus,
  RefreshCw,
  Unplug,
  XCircle
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import {
  fetchAccountUsage,
  fetchAccounts,
  startAccountLogin,
  completeAccountLogin,
  pollAccountLogin,
  testAccount,
  disconnectAccount,
  reorderAccountsApi
} from './api';
import type { AccountUsage, LoginStart, OAuthProviderId, SubscriptionAccount } from './types';
import { useI18n, type MessageKey } from '@/shared/i18n';
import { BrandIcon } from '@/shared/ui/brand-icon';

const PROVIDERS: { id: OAuthProviderId; alias: string; name: string; plan: string; color: string }[] = [
  { id: 'claude', alias: 'cc', name: 'Claude', plan: 'Pro / Max', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { id: 'codex', alias: 'cx', name: 'ChatGPT / Codex', plan: 'Plus / Pro', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'copilot', alias: 'gh', name: 'GitHub Copilot', plan: 'subs.planCopilot', color: 'text-sky-500 bg-sky-500/10 border-sky-500/20' },
  { id: 'gemini-cli', alias: 'gc', name: 'Gemini (Google)', plan: 'subs.planGoogle', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
  { id: 'kimi', alias: 'km', name: 'Kimi Code', plan: 'subs.planKimi', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  { id: 'kilocode', alias: 'kc', name: 'Kilo Code', plan: 'subs.planKilo', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' },
  { id: 'muse', alias: 'mu', name: 'Muse Code (Meta)', plan: 'subs.planMuse', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'nous', alias: 'ns', name: 'Nous Research', plan: 'subs.planNous', color: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20' }
];

/** Login flow state for one provider card (accountId is set when re-authenticating an existing account). */
type Flow = { provider: OAuthProviderId; accountId?: string; start: LoginStart; pasted: string; busy: boolean };

/** Remaining quota per window: a thin gauge per limit, red when nearly used up. */
function QuotaBars({ usage, onRefresh }: { usage?: AccountUsage; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  if (!usage) return null;
  if (usage.error || !usage.windows.length) {
    return (
      <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] pt-0.5">
        <span>{t('subs.quotaUnknown')}</span>
        <button type="button" onClick={onRefresh} className="underline-offset-2 hover:underline">
          {t('subs.quotaRefresh')}
        </button>
      </div>
    );
  }
  return (
    <div className="pt-1 space-y-1">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {usage.windows.slice(0, 2).map((w) => {
          const left = Math.max(0, 100 - w.usedPercent);
          const tone = w.usedPercent >= 90 ? 'bg-red-500' : w.usedPercent >= 70 ? 'bg-amber-500' : 'bg-[var(--ok)]';
          return (
            <div key={w.name} className="rounded-lg bg-[var(--background)]/60 border border-[var(--border)]/60 px-2 py-1">
              <div className="flex justify-between text-[10px] gap-1">
                <span className="text-[var(--foreground)] truncate font-medium">
                  {w.name}
                  {w.total ? ` (${w.total - (w.used || 0)}/${w.total})` : ''}
                </span>
                <span className="font-mono text-[var(--muted-foreground)] shrink-0">
                  {t('subs.quotaLeft', { n: Math.round(left) })}
                  {w.resetsAt
                    ? ` · ${new Date(w.resetsAt).toLocaleString(locale, { hour: '2-digit', minute: '2-digit' })}`
                    : ''}
                </span>
              </div>
              <div
                className="mt-1 h-1 rounded-full bg-[var(--muted)] overflow-hidden"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(left)}
                aria-label={w.name}
              >
                <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${left}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onRefresh} className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline-offset-2 hover:underline">
          {t('subs.quotaRefresh')}
        </button>
      </div>
    </div>
  );
}

export function SubscriptionAccounts({ onChange }: { onChange?: (accounts: SubscriptionAccount[]) => void }) {
  const { t } = useI18n();
  const fmtExpiry = (ms?: number) => {
    if (!ms) return null;
    const min = Math.round((ms - Date.now()) / 60000);
    if (min <= 0) return t('subs.tokenExpired');
    return min < 120 ? t('subs.tokenMinutes', { n: min }) : t('subs.tokenHours', { n: Math.round(min / 60) });
  };
  const [accounts, setAccounts] = useState<SubscriptionAccount[]>([]);
  const [models, setModels] = useState<Partial<Record<OAuthProviderId, string[]>>>({});
  const [usage, setUsage] = useState<Record<string, AccountUsage>>({});
  const [expandedModels, setExpandedModels] = useState<Partial<Record<OAuthProviderId, boolean>>>({});
  const [showRiskDetails, setShowRiskDetails] = useState(false);

  const loadUsage = (fresh = false) =>
    fetchAccountUsage(fresh)
      .then((list) => {
        const map: Record<string, AccountUsage> = {};
        for (const u of list) {
          map[u.accountId || u.provider] = u;
          if (!map[u.provider]) map[u.provider] = u;
        }
        setUsage(map);
      })
      .catch(() => {});
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);

  const apply = (a: SubscriptionAccount[]) => {
    setAccounts(a);
    onChange?.(a);
  };

  useEffect(() => {
    fetchAccounts()
      .then((r) => {
        apply(r.accounts);
        setModels(r.models);
      })
      .catch((e) => toast.error(e.message));
    loadUsage();
    return () => window.clearTimeout(pollTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Device flow (GitHub, Kimi, Kilo, Muse, Nous): poll until the user approves the code on the provider site.
  useEffect(() => {
    if (!flow || flow.start.kind !== 'device') return;
    const { provider, accountId, start } = flow;
    const tick = async () => {
      try {
        const r = await pollAccountLogin(provider, start.sessionId, accountId);
        if (r.status === 'done') {
          const fresh = await fetchAccounts().catch(() => null);
          if (fresh) setModels(fresh.models);
          apply(r.accounts || fresh?.accounts || []);
          loadUsage(true);
          setFlow(null);
          toast.success(t('subs.connected'));
          return;
        }
        pollTimer.current = window.setTimeout(tick, (start.interval || 5) * 1000);
      } catch (e: any) {
        toast.error(e.message);
        setFlow(null);
      }
    };
    pollTimer.current = window.setTimeout(tick, (start.interval || 5) * 1000);
    return () => window.clearTimeout(pollTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.start.sessionId]);

  // Redirect flow with the local callback listener: the backend finishes the login itself, so just watch for the account.
  useEffect(() => {
    if (!flow || flow.start.kind !== 'redirect' || !flow.start.autoCallback) return;
    const { provider } = flow;
    const id = window.setInterval(async () => {
      try {
        const r = await fetchAccounts();
        const touched = r.accounts.some(
          (a) =>
            a.provider === provider &&
            Math.max(new Date(a.connectedAt).getTime(), a.refreshedAt ? new Date(a.refreshedAt).getTime() : 0) > startedAt.current
        );
        if (touched) {
          window.clearInterval(id);
          apply(r.accounts);
          setModels(r.models);
          loadUsage(true);
          setFlow(null);
          toast.success(t('subs.connected'));
        }
      } catch {
        /* keep waiting */
      }
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.start.sessionId]);
  const startedAt = useRef(0);

  const begin = async (provider: OAuthProviderId, accountId?: string) => {
    setBusy(accountId || provider);
    try {
      startedAt.current = Date.now();
      const start = await startAccountLogin(provider, accountId);
      setFlow({ provider, accountId, start, pasted: '', busy: false });
      window.open(start.kind === 'redirect' ? start.authUrl : start.verificationUri, '_blank', 'noopener');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!flow || flow.start.kind !== 'redirect') return;
    setFlow({ ...flow, busy: true });
    try {
      const updated = await completeAccountLogin(flow.provider, flow.start.sessionId, flow.pasted, flow.accountId);
      apply(updated);
      fetchAccounts().then((r) => setModels(r.models)).catch(() => {});
      loadUsage(true);
      setFlow(null);
      toast.success(t('subs.connected'));
    } catch (e: any) {
      toast.error(e.message);
      setFlow((f) => (f ? { ...f, busy: false } : f));
    }
  };

  const test = async (p: OAuthProviderId, accountId?: string) => {
    const key = accountId || p;
    setBusy(key);
    try {
      apply(await testAccount(p, accountId));
      toast.success(t('subs.tokenValid'));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (p: OAuthProviderId, name: string, accountId?: string) => {
    if (!(await confirmModal({ title: t('subs.disconnectTitle', { name }), message: t('subs.disconnectMsg'), variant: 'danger' }))) return;
    try {
      apply(await disconnectAccount(p, accountId));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const moveAccount = async (p: OAuthProviderId, provAccounts: SubscriptionAccount[], index: number, delta: -1 | 1) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= provAccounts.length) return;
    const ids = provAccounts.map((a) => a.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIdx, 0, moved);
    try {
      apply(await reorderAccountsApi(p, ids));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success(t('common.copied')));

  const connectedProviders = PROVIDERS.filter((p) => accounts.some((a) => a.provider === p.id) || flow?.provider === p.id);
  const availableProviders = PROVIDERS.filter((p) => !accounts.some((a) => a.provider === p.id) && flow?.provider !== p.id);

  return (
    <div className="space-y-3">
      {/* Compact Collapsible Risk Notice */}
      <div className="px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] text-[11px] text-[var(--muted-foreground)]">
        <button
          type="button"
          onClick={() => setShowRiskDetails((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <strong className="text-[var(--foreground)] truncate">{t('subs.riskTitle')}</strong>
            {!showRiskDetails && <span className="truncate opacity-80 hidden sm:inline">— {t('subs.riskBody')}</span>}
          </span>
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${showRiskDetails ? 'rotate-180' : ''}`} />
        </button>
        {showRiskDetails && <p className="mt-1.5 pl-5.5 text-[11px] leading-relaxed">{t('subs.riskBody')}</p>}
      </div>

      {/* Connected / Active Flow Accounts */}
      {connectedProviders.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {connectedProviders.map((p) => {
            const provAccounts = accounts.filter((a) => a.provider === p.id);
            const hasError = provAccounts.some((a) => a.lastError);
            const f = flow?.provider === p.id ? flow : null;
            const provModels = models[p.id] || [];
            const isExpanded = !!expandedModels[p.id];
            const visibleModels = isExpanded ? provModels : provModels.slice(0, 4);

            return (
              <Card
                key={p.id}
                className={`p-3.5 bg-[var(--card)] border space-y-2.5 ${
                  provAccounts.length > 0
                    ? hasError && provAccounts.every((a) => a.lastError)
                      ? 'border-red-500/35'
                      : 'border-emerald-500/40'
                    : 'border-[var(--rim)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${p.color}`}>
                      <BrandIcon name={p.id} className="w-4 h-4" fallback={<span className="font-bold text-[11px]">{p.alias}</span>} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[var(--foreground)] truncate">{p.name}</span>
                        <code className="text-[10px] font-mono px-1 py-px rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                          {p.alias}/
                        </code>
                      </div>
                      <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                        {p.plan.startsWith('subs.') ? t(p.plan as MessageKey) : p.plan}
                        {provAccounts.length > 1 ? ` · ${provAccounts.length} accounts (ordered rotation)` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {provAccounts.length > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0.5 text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
                        {provAccounts.length > 1 ? `${provAccounts.length} active` : t('aiGw.connected')}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || !!flow}
                      onClick={() => begin(p.id)}
                      title="Add another account to rotation"
                      className="h-7 px-2 text-[11px]"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Account
                    </Button>
                  </div>
                </div>

                {/* Ordered Accounts List inside Provider Card */}
                {provAccounts.length > 0 && (
                  <div className="space-y-2">
                    {provAccounts.map((acc, idx) => {
                      const accUsage = usage[acc.id] || (idx === 0 ? usage[p.id] : undefined);
                      const accLabel = acc.email || acc.label || `${p.name} #${idx + 1}`;
                      return (
                        <div
                          key={acc.id}
                          className={`rounded-lg border px-2.5 py-2 space-y-1.5 bg-[var(--background)]/40 ${
                            acc.lastError ? 'border-red-500/30' : 'border-[var(--border)]/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                title={`Rotation priority #${idx + 1}`}
                                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)] shrink-0"
                              >
                                #{idx + 1}
                              </span>
                              <span className="text-[11px] font-medium text-[var(--foreground)] truncate">
                                {accLabel}
                              </span>
                              {acc.expiresAt && (
                                <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
                                  · {fmtExpiry(acc.expiresAt)}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {provAccounts.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={idx === 0}
                                    onClick={() => moveAccount(p.id, provAccounts, idx, -1)}
                                    title="Move up in rotation order"
                                    className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-30 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={idx === provAccounts.length - 1}
                                    onClick={() => moveAccount(p.id, provAccounts, idx, 1)}
                                    title="Move down in rotation order"
                                    className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-30 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === acc.id}
                                onClick={() => test(p.id, acc.id)}
                                title={t('subs.test')}
                                className="h-6 px-1.5 text-[10px]"
                              >
                                <RefreshCw className={`w-2.5 h-2.5 ${busy === acc.id ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!!busy || !!flow}
                                onClick={() => begin(p.id, acc.id)}
                                title={t('subs.relogin')}
                                className="h-6 px-1.5 text-[10px]"
                              >
                                <LogIn className="w-2.5 h-2.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => disconnect(p.id, accLabel, acc.id)}
                                title={t('aiGw.disconnect')}
                                className="h-6 px-1.5 text-[10px] text-red-500 hover:bg-red-500/10"
                              >
                                <Unplug className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                          </div>

                          <QuotaBars usage={accUsage} onRefresh={() => loadUsage(true)} />
                          {acc.lastError && <div className="text-red-500 text-[10px] break-words">{acc.lastError}</div>}
                        </div>
                      );
                    })}

                    {provModels.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {visibleModels.map((m) => {
                          const full = `${p.alias}/${m}`;
                          return (
                            <button
                              key={full}
                              type="button"
                              onClick={() => copy(full)}
                              title={`Click to copy ${full}`}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)]/80 hover:bg-[var(--muted)] text-[var(--foreground)] border border-transparent hover:border-[var(--rim)] transition-colors flex items-center gap-1 max-w-full"
                            >
                              <span className="truncate max-w-[180px]">{full}</span>
                              <Copy className="w-2.5 h-2.5 opacity-50 shrink-0" />
                            </button>
                          );
                        })}
                        {provModels.length > 4 && (
                          <button
                            type="button"
                            onClick={() => setExpandedModels((prev) => ({ ...prev, [p.id]: !isExpanded }))}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--foreground)]/[0.05] hover:bg-[var(--foreground)]/10 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
                          >
                            {isExpanded ? 'Show less' : `+${provModels.length - 4} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {f?.start.kind === 'redirect' && (
                  <div className="space-y-2 p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
                    <div>
                      1. {t('subs.step1')} (
                      <a className="text-[var(--foreground)] underline" href={f.start.authUrl} target="_blank" rel="noopener noreferrer">
                        {t('subs.reopen')}
                      </a>
                      ).
                    </div>
                    {f.start.autoCallback && (
                      <div className="flex items-center gap-1.5 text-[var(--foreground)]">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {t('subs.waitingAuto')}
                      </div>
                    )}
                    <div>
                      {f.start.autoCallback ? t('subs.ifNotAuto') : '2. '}
                      {t('subs.redirectedTo')} <code className="font-mono">{f.start.redirectUri}</code>
                      {t('subs.mayError')}
                    </div>
                    <div>
                      {f.start.autoCallback ? '' : '3. '}
                      {t('subs.pasteUrl')}
                    </div>
                    <Input
                      value={f.pasted}
                      onChange={(e) => setFlow({ ...f, pasted: e.target.value })}
                      placeholder={`${f.start.redirectUri}?code=…&state=…`}
                      className="font-mono text-[11px] h-8"
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setFlow(null)} className="h-7 text-xs">
                        {t('common.cancel')}
                      </Button>
                      <Button size="sm" disabled={!f.pasted.trim() || f.busy} onClick={finish} className="btn-metal h-7 text-xs">
                        {f.busy ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}
                        {t('subs.finish')}
                      </Button>
                    </div>
                  </div>
                )}

                {f?.start.kind === 'device' && (
                  <div className="space-y-2 p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
                    <div>
                      {t('subs.deviceOpen')}{' '}
                      <a className="text-[var(--foreground)] underline" href={f.start.verificationUri} target="_blank" rel="noopener noreferrer">
                        {f.start.verificationUri}
                      </a>{' '}
                      {t('subs.deviceEnter')}
                    </div>
                    <button
                      onClick={() => copy((f.start as any).userCode)}
                      className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-dashed border-[var(--rim)] font-mono text-base tracking-widest text-[var(--foreground)]"
                    >
                      {f.start.userCode} <Copy className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {t('subs.waitingApproval')}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => setFlow(null)} className="h-7 text-xs">
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Available Subscription Accounts — Compact 4-Column Tile Grid */}
      {availableProviders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {availableProviders.map((p) => (
            <div
              key={p.id}
              className="p-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--rim)] transition-colors flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${p.color}`}>
                  <BrandIcon name={p.id} className="w-3.5 h-3.5" fallback={<span className="font-bold text-[10px]">{p.alias}</span>} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--foreground)] truncate">{p.name}</div>
                  <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                    <span className="font-mono">{p.alias}/</span> · {p.plan.startsWith('subs.') ? t(p.plan as MessageKey) : p.plan}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                disabled={busy === p.id || !!flow}
                onClick={() => begin(p.id)}
                className="h-7 px-2.5 text-[11px] btn-metal shrink-0"
              >
                {p.id === 'copilot' ? <ExternalLink className="w-3 h-3 mr-1" /> : <LogIn className="w-3 h-3 mr-1" />}
                {t('subs.login')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
