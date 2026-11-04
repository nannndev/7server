import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { login } from '@/features/auth/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useI18n, LANGS } from '@/shared/i18n';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t, lang, setLang } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">{t('auth.title')}</h1>
            <p className="text-[11px] text-[var(--muted-foreground)]">{t('auth.subtitle')}</p>
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--muted-foreground)]">{t('auth.password')}</span>
          <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <Button type="submit" disabled={busy || !password} className="w-full">
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>
        <div className="flex justify-center gap-1 pt-1 text-[11px]" role="group" aria-label={t('common.language')}>
          {LANGS.map((l) => (
            <button key={l.code} type="button" onClick={() => setLang(l.code)} aria-pressed={lang === l.code}
              className={`px-2 py-0.5 rounded ${lang === l.code ? 'bg-[var(--muted)] text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
              {l.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
