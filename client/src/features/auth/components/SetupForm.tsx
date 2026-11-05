// First run: no account exists yet, so the first visitor creates the admin. From another machine the
// server also asks for the one-time setup code it printed in its log.
import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, KeyRound, Loader2, Lock, User } from 'lucide-react';
import { setToken } from '@/shared/api/client';
import { useI18n } from '@/shared/i18n';

export default function SetupForm({ needsCode, onDone }: { needsCode: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('setup.minChars'));
    if (password !== confirm) return setError(t('setup.mismatch'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('setup.failed'));
      setToken(data.token);
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (icon: React.ReactNode, label: string, input: React.ReactNode) => (
    <label className="block space-y-1.5">
      <span className="text-xs font-mono text-[var(--muted-foreground)] flex items-center gap-1.5">{icon}{label}</span>
      <div className="well rounded-xl px-3 py-2 focus-within:ring-1 focus-within:ring-[var(--accent)]">{input}</div>
    </label>
  );
  const cls = 'bg-transparent text-xs text-[var(--foreground)] w-full outline-none font-mono';

  return (
    <form onSubmit={submit} className="space-y-3.5">
      <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{t('setup.intro')}</p>
      {field(<User className="w-3.5 h-3.5 text-[var(--foreground)]" />, t('auth.username'),
        <input className={cls} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" required minLength={2} maxLength={32} />)}
      {field(<Lock className="w-3.5 h-3.5 text-[var(--foreground)]" />, t('setup.password'),
        <input className={cls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />)}
      {field(<Lock className="w-3.5 h-3.5 text-[var(--foreground)]" />, t('setup.confirm'),
        <input className={cls} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />)}
      {needsCode && field(<KeyRound className="w-3.5 h-3.5 text-[var(--foreground)]" />, t('setup.code'),
        <input className={`${cls} tracking-[0.4em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required />)}
      {needsCode && <p className="text-[11px] text-[var(--muted-foreground)]">{t('setup.codeHint')}</p>}
      {error && (
        <div role="alert" className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" /><span>{error}</span>
        </div>
      )}
      <button type="submit" disabled={busy} className="btn-silver w-full mt-2 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        <span>{t('setup.submit')}</span>
        {!busy && <ArrowRight className="w-3.5 h-3.5" />}
      </button>
    </form>
  );
}
