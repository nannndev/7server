import React, { useState } from 'react';
import { Lock, User, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useI18n, LANGS } from '@/shared/i18n';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await login(password, username);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message || 'Login gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-base">7Server Management</h1>
            <p className="text-xs text-[var(--muted-foreground)]">Masuk dengan akun terdaftar</p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Username
            </span>
            <Input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)] flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> Password
            </span>
            <Input
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500 leading-relaxed">
            {error}
          </div>
        )}

        <Button type="submit" disabled={busy || !password} className="w-full mt-2 font-medium">
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </Button>

        <div className="flex justify-center gap-1 pt-2 border-t border-[var(--border)] text-[11px]" role="group" aria-label={t('common.language')}>
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              className={`px-2 py-0.5 rounded transition ${
                lang === l.code
                  ? 'bg-[var(--muted)] text-[var(--foreground)] font-medium'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
