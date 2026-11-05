import React, { useEffect, useState } from 'react';
import {
  Lock,
  User,
  ShieldCheck,
  Eye,
  EyeOff,
  AlertTriangle,
  Sun,
  Moon,
  ArrowRight,
  Loader2,
  Server,
  Terminal,
  Cpu
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/shared/hooks/useTheme';
import { useI18n, LANGS } from '@/shared/i18n';
import SetupForm from './SetupForm';

const LOGO = '/icons/icon-opt2-server-blade.jpg';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { login, refreshUser } = useAuth();
  // First run (no account yet): show "create admin" instead of the sign-in form.
  const [setup, setSetup] = useState<{ needsSetup: boolean; needsCode: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/setup').then((r) => r.json()).then(setSetup).catch(() => setSetup({ needsSetup: false, needsCode: false }));
  }, []);
  const { theme, toggleTheme } = useTheme();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleKeyEvents = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await login(password, username);
      onLoggedIn();
    } catch (err: any) {
      setError(err.message || t('auth.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)]/30 selection:text-[var(--foreground)]">
      {/* ---------------- CARBON FIBRE GROUND (LANDING PAGE STYLE) ---------------- */}
      <div className="carbon" aria-hidden />

      {/* ---------------- TOP NAVBAR (MATCHING LANDING & DASHBOARD) ---------------- */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-md"
        style={{
          borderColor: 'var(--line)',
          background: 'color-mix(in srgb, var(--background) 82%, transparent)'
        }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 font-semibold text-sm">
            <img
              src={LOGO}
              alt=""
              width={28}
              height={28}
              className="rounded-[22%] shadow-sm"
              style={{ width: 28, height: 28 }}
            />
            <span>7Server</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Status indicator badge */}
            <div className="hidden sm:flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] border border-[var(--line)] bg-[var(--card)] text-[var(--muted-foreground)]">
              <span className="led breathe h-1.5 w-1.5 rounded-full" />
              <span>self-hosted · agentless · v2.0</span>
            </div>

            {/* Theme switch */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line)] bg-[var(--card)] transition-colors hover:bg-[var(--muted)]"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Language Selector */}
            <div className="flex items-center p-0.5 rounded-lg border border-[var(--line)] bg-[var(--card)] text-[11px]">
              {LANGS.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => setLang(l.code)}
                  aria-pressed={lang === l.code}
                  className={`px-2 py-0.5 rounded-md transition font-medium ${
                    lang === l.code
                      ? 'bg-[var(--muted)] text-[var(--foreground)] font-semibold'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- CENTER LOGIN SECTION ---------------- */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 my-auto">
        <div className="core-glow w-full max-w-[420px] space-y-5">
          {/* Header Title */}
          <div className="text-center space-y-2">
            <p className="metal inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px]">
              <span className="led breathe h-1.5 w-1.5 rounded-full" />
              control panel · rbac active
            </p>
            <h1 className="silver-text text-balance text-2xl sm:text-3xl font-semibold tracking-tight">
              {setup?.needsSetup ? t('setup.title') : t('auth.title')}
            </h1>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed max-w-xs mx-auto">
              {setup?.needsSetup ? t('setup.subtitle') : t('auth.subtitle')}
            </p>
          </div>

          {/* Machined Metal Form Card */}
          <div className="metal rounded-2xl p-6 sm:p-7 space-y-4">
            {setup?.needsSetup ? (
              <SetupForm needsCode={setup.needsCode} onDone={async () => { await refreshUser(); onLoggedIn(); }} />
            ) : (
            <form onSubmit={submit} className="space-y-3.5">
              {/* Username Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <label className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[var(--foreground)]" />
                    <span>{t('auth.username')}</span>
                  </label>
                </div>
                <div className="well rounded-xl px-3 py-2 flex items-center gap-2 focus-within:ring-1 focus-within:ring-[var(--accent)]">
                  <span className="text-xs font-mono text-[var(--muted-foreground)] select-none">#</span>
                  <input
                    type="text"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="admin"
                    className="bg-transparent text-xs text-[var(--foreground)] w-full outline-none font-mono"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <label className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[var(--foreground)]" />
                    <span>{t('auth.password')}</span>
                  </label>
                  {capsLock && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>{t('auth.capsLock')}</span>
                    </span>
                  )}
                </div>
                <div className="well rounded-xl px-3 py-2 flex items-center gap-2 focus-within:ring-1 focus-within:ring-[var(--accent)]">
                  <span className="text-xs font-mono text-[var(--muted-foreground)] select-none">$</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyEvents}
                    onKeyUp={handleKeyEvents}
                    placeholder="••••••••••••"
                    className="bg-transparent text-xs text-[var(--foreground)] w-full outline-none font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 transition"
                    title={showPassword ? t('common.hide') : t('common.show')}
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              {/* Submit Button (Polished Silver Bar) */}
              <button
                type="submit"
                disabled={busy || !password}
                className="btn-silver w-full mt-2 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('auth.signingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('auth.signIn')}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
            )}

            {/* Card Sub-Features Strip */}
            <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between text-[11px] font-mono text-[var(--muted-foreground)]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span>scrypt + rbac</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-sky-400" />
                <span>ai gateway</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-zinc-400" />
                <span>ssh tunnel</span>
              </span>
            </div>
          </div>

          {/* Bottom Telemetry Strip (Matching Landing Page 3-step grid) */}
          <div className="metal rounded-xl grid grid-cols-3 divide-x divide-[var(--line)] text-center py-2.5 px-1 font-mono text-[10px]">
            <div className="px-1">
              <span className="text-[var(--muted-foreground)] block">FLEET</span>
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>AGENTLESS</span>
            </div>
            <div className="px-1">
              <span className="text-[var(--muted-foreground)] block">SECURITY</span>
              <span className="font-semibold text-[var(--foreground)]">ENCRYPTED</span>
            </div>
            <div className="px-1">
              <span className="text-[var(--muted-foreground)] block">AI COPILOT</span>
              <span className="font-semibold text-purple-400">DUAL-MODE</span>
            </div>
          </div>
        </div>
      </main>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="w-full py-4 px-6 text-center text-xs font-mono text-[var(--muted-foreground)] border-t border-[var(--line)]">
        <p>7Server · Run every VPS from one dashboard. Install nothing on them.</p>
      </footer>
    </div>
  );
}
