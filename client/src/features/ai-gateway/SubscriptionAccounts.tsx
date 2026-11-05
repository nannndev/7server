import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, LogIn, RefreshCw, Unplug, XCircle } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import {
  fetchAccountUsage,
  fetchAccounts, startAccountLogin, completeAccountLogin, pollAccountLogin, testAccount, disconnectAccount
} from './api';
import type { AccountUsage, LoginStart, OAuthProviderId, SubscriptionAccount } from './types';
import { useI18n, type MessageKey } from '@/shared/i18n';
import { BrandIcon } from '@/shared/ui/brand-icon';

const PROVIDERS: { id: OAuthProviderId; alias: string; name: string; plan: string; color: string }[] = [
  { id: 'claude', alias: 'cc', name: 'Claude', plan: 'Pro / Max', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  { id: 'codex', alias: 'cx', name: 'ChatGPT / Codex', plan: 'Plus / Pro', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'copilot', alias: 'gh', name: 'GitHub Copilot', plan: 'subs.planCopilot', color: 'text-sky-500 bg-sky-500/10 border-sky-500/20' },
  { id: 'gemini-cli', alias: 'gc', name: 'Gemini (Google)', plan: 'subs.planGoogle', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' }
];


/** Login flow state for one provider card. */
type Flow = { provider: OAuthProviderId; start: LoginStart; pasted: string; busy: boolean };

/** Remaining quota per window: a thin gauge per limit, red when nearly used up. */
function QuotaBars({ usage, onRefresh }: { usage?: AccountUsage; onRefresh: () => void }) {
  const { t, locale } = useI18n();
  if (!usage) return null;
  if (usage.error || !usage.windows.length) {
    return <div className="text-[10px] text-[var(--muted-foreground)]">{t('subs.quotaUnknown')}</div>;
  }
  return (
    <div className="pt-1.5 space-y-1.5">
      {usage.windows.slice(0, 3).map((w) => {
        const left = Math.max(0, 100 - w.usedPercent);
        const tone = w.usedPercent >= 90 ? 'bg-red-500' : w.usedPercent >= 70 ? 'bg-amber-500' : 'bg-[var(--ok)]';
        return (
          <div key={w.name}>
            <div className="flex justify-between text-[10px]">
              <span className="text-[var(--foreground)]">{w.name}{w.total ? ` · ${w.total - (w.used || 0)}/${w.total}` : ''}</span>
              <span className="font-mono">{t('subs.quotaLeft', { n: Math.round(left) })}{w.resetsAt ? ` · ${new Date(w.resetsAt).toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-[var(--muted)] overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(left)} aria-label={w.name}>
              <div className={`h-full rounded-full ${tone} transition-[width] duration-500`} style={{ width: `${left}%` }} />
            </div>
          </div>
        );
      })}
      <button type="button" onClick={onRefresh} className="text-[10px] underline-offset-2 hover:underline">{t('subs.quotaRefresh')}</button>
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
  const [usage, setUsage] = useState<Partial<Record<OAuthProviderId, AccountUsage>>>({});
  const loadUsage = (fresh = false) =>
    fetchAccountUsage(fresh).then((list) => setUsage(Object.fromEntries(list.map((u) => [u.provider, u])))).catch(() => {});
  const [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState<OAuthProviderId | null>(null);
  const pollTimer = useRef<number | undefined>(undefined);

  const apply = (a: SubscriptionAccount[]) => { setAccounts(a); onChange?.(a); };

  useEffect(() => {
    fetchAccounts().then((r) => { apply(r.accounts); setModels(r.models); }).catch((e) => toast.error(e.message));
    loadUsage();
    return () => window.clearTimeout(pollTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GitHub device flow: poll until the user approves the code on github.com.
  useEffect(() => {
    if (!flow || flow.start.kind !== 'device') return;
    const { provider, start } = flow;
    const tick = async () => {
      try {
        const r = await pollAccountLogin(provider, start.sessionId);
        if (r.status === 'done') {
          apply(r.accounts || []);
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
        const acc = r.accounts.find((a) => a.provider === provider);
        if (acc && new Date(acc.connectedAt).getTime() > startedAt.current) {
          window.clearInterval(id);
          apply(r.accounts);
          setFlow(null);
          toast.success(t('subs.connected'));
        }
      } catch { /* keep waiting */ }
    }, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow?.start.sessionId]);
  const startedAt = useRef(0);

  const begin = async (provider: OAuthProviderId) => {
    setBusy(provider);
    try {
      startedAt.current = Date.now();
      const start = await startAccountLogin(provider);
      setFlow({ provider, start, pasted: '', busy: false });
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
      apply(await completeAccountLogin(flow.provider, flow.start.sessionId, flow.pasted));
      setFlow(null);
      toast.success(t('subs.connected'));
    } catch (e: any) {
      toast.error(e.message);
      setFlow((f) => (f ? { ...f, busy: false } : f));
    }
  };

  const test = async (p: OAuthProviderId) => {
    setBusy(p);
    try { apply(await testAccount(p)); toast.success(t('subs.tokenValid')); } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const disconnect = async (p: OAuthProviderId, name: string) => {
    if (!(await confirmModal({ title: t('subs.disconnectTitle', { name }), message: t('subs.disconnectMsg'), variant: 'danger' }))) return;
    try { apply(await disconnectAccount(p)); } catch (e: any) { toast.error(e.message); }
  };

  const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast.success(t('common.copied')));

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 flex gap-2.5 text-[11px] text-[var(--muted-foreground)]">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <strong className="text-[var(--foreground)]">{t('subs.riskTitle')}</strong> {t('subs.riskBody')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROVIDERS.map((p) => {
          const acc = accounts.find((a) => a.provider === p.id);
          const f = flow?.provider === p.id ? flow : null;
          return (
            <Card key={p.id} className={`p-4 bg-[var(--card)] border space-y-3 ${acc ? 'border-emerald-500/40' : 'border-[var(--border)]'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${p.color}`}><BrandIcon name={p.id} className="w-[18px] h-[18px]" fallback={<span className="font-bold text-xs">{p.alias}</span>} /></div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">{p.name}</div>
                    <div className="text-[11px] text-[var(--muted-foreground)]">{p.plan.startsWith('subs.') ? t(p.plan as MessageKey) : p.plan} · <span className="font-mono">{p.alias}/</span></div>
                  </div>
                </div>
                {acc ? (
                  <Badge variant="outline" className={acc.lastError ? 'text-red-500 border-red-500/30 bg-red-500/10' : 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'}>
                    {acc.lastError ? <XCircle className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {acc.lastError ? t('subs.error') : t('aiGw.connected')}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[var(--muted-foreground)]">{t('subs.notLoggedIn')}</Badge>
                )}
              </div>

              {acc && (
                <div className="text-[11px] space-y-0.5 text-[var(--muted-foreground)]">
                  {acc.email && <div className="text-[var(--foreground)]">{acc.email}</div>}
                  {fmtExpiry(acc.expiresAt) && <div>{fmtExpiry(acc.expiresAt)}</div>}
                  <QuotaBars usage={usage[p.id]} onRefresh={() => loadUsage(true)} />
                  {acc.lastError && <div className="text-red-500 break-words">{acc.lastError}</div>}
                  <div className="font-mono truncate">model: {(models[p.id] || []).slice(0, 3).map((m) => `${p.alias}/${m}`).join(', ')}…</div>
                </div>
              )}

              {f?.start.kind === 'redirect' && (
                <div className="space-y-2 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
                  <div>1. {t('subs.step1')} (<a className="text-[var(--foreground)] underline" href={f.start.authUrl} target="_blank" rel="noopener noreferrer">{t('subs.reopen')}</a>).</div>
                  {f.start.autoCallback && (
                    <div className="flex items-center gap-1.5 text-[var(--foreground)]"><RefreshCw className="w-3 h-3 animate-spin" /> {t('subs.waitingAuto')}</div>
                  )}
                  <div>{f.start.autoCallback ? t('subs.ifNotAuto') : '2. '}{t('subs.redirectedTo')} <code className="font-mono">{f.start.redirectUri}</code>{t('subs.mayError')}</div>
                  <div>{f.start.autoCallback ? '' : '3. '}{t('subs.pasteUrl')}</div>
                  <Input
                    value={f.pasted}
                    onChange={(e) => setFlow({ ...f, pasted: e.target.value })}
                    placeholder={`${f.start.redirectUri}?code=…&state=…`}
                    className="font-mono text-[11px]"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => setFlow(null)}>{t('common.cancel')}</Button>
                    <Button size="sm" disabled={!f.pasted.trim() || f.busy} onClick={finish} className="btn-metal">
                      {f.busy ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}{t('subs.finish')}
                    </Button>
                  </div>
                </div>
              )}

              {f?.start.kind === 'device' && (
                <div className="space-y-2 p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[11px] text-[var(--muted-foreground)]">
                  <div>{t('subs.deviceOpen')} <a className="text-[var(--foreground)] underline" href={f.start.verificationUri} target="_blank" rel="noopener noreferrer">{f.start.verificationUri}</a> {t('subs.deviceEnter')}</div>
                  <button onClick={() => copy((f.start as any).userCode)} className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-[var(--rim)] font-mono text-lg tracking-widest text-[var(--foreground)]">
                    {f.start.userCode} <Copy className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> {t('subs.waitingApproval')}</span>
                    <Button size="sm" variant="outline" onClick={() => setFlow(null)}>{t('common.cancel')}</Button>
                  </div>
                </div>
              )}

              {!f && (
                <div className="flex gap-2 justify-end">
                  {acc && (
                    <>
                      <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => test(p.id)}>
                        <RefreshCw className={`w-3.5 h-3.5 mr-1 ${busy === p.id ? 'animate-spin' : ''}`} />{t('subs.test')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => disconnect(p.id, p.name)} className="text-red-500">
                        <Unplug className="w-3.5 h-3.5 mr-1" />{t('aiGw.disconnect')}
                      </Button>
                    </>
                  )}
                  <Button size="sm" disabled={busy === p.id || !!flow} onClick={() => begin(p.id)} className="btn-metal">
                    {p.id === 'copilot' ? <ExternalLink className="w-3.5 h-3.5 mr-1" /> : <LogIn className="w-3.5 h-3.5 mr-1" />}
                    {acc ? t('subs.relogin') : t('subs.login')}
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
