import React, { useState } from 'react';
import { ShieldCheck, Copy } from 'lucide-react';
import { setup2fa, confirm2fa, disable2fa } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';

interface TwoFactorModalProps {
  open: boolean;
  onClose: () => void;
}

// shortcut: secret is shown as text for manual entry (no QR library installed), add a QR render if users ask
export default function TwoFactorModal({ open, onClose }: TwoFactorModalProps) {
  const t = useT();
  const { user, refreshUser } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !user) return null;
  const enabled = Boolean(user.totpEnabled);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || t('twofa.failed'));
    } finally {
      setBusy(false);
    }
  };

  const start = () => run(async () => {
    const data = await setup2fa();
    setSecret(data.secret);
  });

  const confirm = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const data = await confirm2fa(code.trim());
      setRecoveryCodes(data.recoveryCodes);
      await refreshUser();
    });
  };

  const disable = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await disable2fa(password);
      await refreshUser();
      toast.success(t('twofa.disabled'));
      onClose();
    });
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(t('twofa.copied')), () => {});
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div role="dialog" aria-modal="true" aria-labelledby="twofa-title" className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h2 id="twofa-title" className="text-sm font-semibold">{t('twofa.title')}</h2>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {enabled && !recoveryCodes ? t('twofa.statusOn') : t('twofa.subtitle')}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {recoveryCodes ? (
            <>
              <p className="text-[var(--muted-foreground)]">{t('twofa.recoveryIntro')}</p>
              <div className="grid grid-cols-2 gap-1.5 p-3 rounded-lg bg-[var(--muted)] font-mono">
                {recoveryCodes.map((c) => <span key={c}>{c}</span>)}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => copy(recoveryCodes.join('\n'))}>
                  <Copy className="w-3.5 h-3.5" /> {t('twofa.copy')}
                </Button>
                <Button type="button" size="sm" onClick={onClose}>{t('twofa.done')}</Button>
              </div>
            </>
          ) : enabled ? (
            <form onSubmit={disable} className="space-y-4">
              <label className="block space-y-1">
                <span className="font-medium text-[var(--muted-foreground)]">{t('twofa.disablePassword')}</span>
                <Input type="password" required autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">{error}</div>}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
                <Button type="submit" size="sm" disabled={busy || !password}>{t('twofa.disable')}</Button>
              </div>
            </form>
          ) : secret ? (
            <form onSubmit={confirm} className="space-y-4">
              <p className="text-[var(--muted-foreground)]">{t('twofa.secretIntro')}</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--muted)]">
                <code className="font-mono break-all flex-1 select-all">{secret}</code>
                <button type="button" onClick={() => copy(secret)} aria-label={t('twofa.copy')} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <label className="block space-y-1">
                <span className="font-medium text-[var(--muted-foreground)]">{t('twofa.codeLabel')}</span>
                <Input inputMode="numeric" autoComplete="one-time-code" required autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
              </label>
              {error && <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">{error}</div>}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
                <Button type="submit" size="sm" disabled={busy || !code.trim()}>{t('twofa.enable')}</Button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-[var(--muted-foreground)]">{t('twofa.intro')}</p>
              {error && <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">{error}</div>}
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
                <Button type="button" size="sm" onClick={start} disabled={busy}>{t('twofa.start')}</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
