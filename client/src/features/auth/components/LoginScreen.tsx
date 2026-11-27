import React, { useEffect, useRef, useState } from 'react';
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
  Terminal,
  Cpu,
  Check
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useTheme } from '@/shared/hooks/useTheme';
import { useI18n, LANGS } from '@/shared/i18n';
import SetupForm from './SetupForm';
import ServerRackFigure, { type RackState } from './ServerRackFigure';

const LOGO = '/icons/icon-opt2-server-blade.png';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t, lang, setLang } = useI18n();
  const { login, verifyMfa, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // First run: show "create admin" setup instead of sign-in
  const [setup, setSetup] = useState<{ needsSetup: boolean; needsCode: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then(setSetup)
      .catch(() => setSetup({ needsSetup: false, needsCode: false }));
  }, []);

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [shake, setShake] = useState(false);
  // Set after password succeeds on a 2FA account; the form then asks for the code
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');

  // Synchronize typing with the isometric server rack LEDs
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef(0);
  const handleTyping = () => {
    setTyping(true);
    if (error) setError(null);
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 1200);
  };

  const rackState: RackState = unlocked ? 'success' : busy ? 'busy' : error ? 'error' : typing ? 'typing' : 'idle';

  const handleKeyEvents = (e: React.KeyboardEvent) => {
    if (e.getModifierState) {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !(mfaTicket ? code.trim() : password)) return;

    setBusy(true);
    setError(null);
    setShake(false);

    try {
      if (mfaTicket) {
        await verifyMfa(mfaTicket, code.trim());
      } else {
        const ticket = await login(password, username);
        if (ticket) {
          setMfaTicket(ticket);
          return;
        }
      }
      setUnlocked(true);
      setTimeout(onLoggedIn, 600);
    } catch (err: any) {
      const msg = err?.message || t('auth.failed');
      setError(msg);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-[var(--background)] text-[var(--foreground)] selection:bg-[var(--accent)]/30 selection:text-[var(--foreground)]">
      {/* ---------------- BACKDROP ---------------- */}
      <div className="login-aurora" aria-hidden />
      <div className="carbon" aria-hidden />

      {/* ---------------- TOP NAVBAR ---------------- */}
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
            <span className="font-semibold tracking-tight">7Server</span>
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

      {/* ---------------- CENTER SECTION ---------------- */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 my-auto">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_1fr] items-center gap-8 lg:gap-12">
          {/* Left: Interactive Isometric Server Rack */}
          <div className="hidden lg:flex flex-col items-center justify-center max-w-[480px] mx-auto w-full">
            <ServerRackFigure state={rackState} theme={theme === 'dark' ? 'dark' : 'light'} />
            <div className="mt-2 text-center">
              <p className="text-[11px] font-mono text-[var(--muted-foreground)]">
                {rackState === 'busy'
                  ? t('auth.rackVerifying')
                  : rackState === 'error'
                  ? t('auth.rackDenied')
                  : rackState === 'success'
                  ? t('auth.rackOpen')
                  : t('auth.rackIdle')}
              </p>
            </div>
          </div>

          {/* Right: The Sign-in Card */}
          <div className={`w-full max-w-[420px] mx-auto space-y-4 ${shake ? 'animate-auth-shake' : ''}`}>
            {/* Header */}
            <div className="space-y-1.5 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] border border-[var(--line)] bg-[var(--card)] text-[var(--muted-foreground)] mb-1">
                <span className={`h-1.5 w-1.5 rounded-full ${unlocked ? 'bg-emerald-500' : busy ? 'bg-amber-400 animate-pulse' : error ? 'bg-red-500' : 'bg-emerald-500'}`} />
                <span>control panel · rbac active</span>
              </div>
              <h1 className="silver-text text-2xl font-bold tracking-tight">
                {setup?.needsSetup ? t('setup.title') : t('auth.title')}
              </h1>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                {setup?.needsSetup ? t('setup.subtitle') : t('auth.subtitle')}
              </p>
            </div>

            {/* Machined Metal Card */}
            <div className="metal rounded-2xl p-6 sm:p-7 space-y-4">
              {setup?.needsSetup ? (
                <SetupForm needsCode={setup.needsCode} onDone={async () => { await refreshUser(); onLoggedIn(); }} />
              ) : (
                <form onSubmit={submit} className="space-y-3.5">
                  {mfaTicket ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <label htmlFor="mfa-code" className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-[var(--foreground)]" />
                          <span>{t('auth.mfaCode')}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => { setMfaTicket(null); setCode(''); setError(null); }}
                          className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition"
                        >
                          {t('auth.mfaBack')}
                        </button>
                      </div>
                      <div className={`well rounded-xl px-3 py-2 flex items-center gap-2 transition focus-within:ring-1 ${
                        error ? 'border-red-500/50 focus-within:ring-red-500' : 'focus-within:ring-[var(--accent)]'
                      }`}>
                        <span className="text-xs font-mono text-[var(--muted-foreground)] select-none">&gt;</span>
                        <input
                          id="mfa-code"
                          type="text"
                          inputMode="text"
                          autoComplete="one-time-code"
                          autoFocus
                          required
                          value={code}
                          onChange={(e) => { setCode(e.target.value); handleTyping(); }}
                          placeholder="123456"
                          className="bg-transparent text-xs text-[var(--foreground)] w-full outline-none font-mono tracking-widest"
                        />
                      </div>
                      <p className="text-[11px] text-[var(--muted-foreground)]">{t('auth.mfaHint')}</p>
                    </div>
                  ) : (
                  <>
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
                        onChange={(e) => { setUsername(e.target.value); handleTyping(); }}
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
                    <div className={`well rounded-xl px-3 py-2 flex items-center gap-2 transition focus-within:ring-1 ${
                      error ? 'border-red-500/50 focus-within:ring-red-500' : 'focus-within:ring-[var(--accent)]'
                    }`}>
                      <span className="text-xs font-mono text-[var(--muted-foreground)] select-none">$</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus
                        required
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); handleTyping(); }}
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
                  </>
                  )}

                  {/* Error Message: Simple, localized, zero reload */}
                  {error && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-start gap-2.5 animate-in fade-in duration-150"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold leading-snug">{error}</p>
                        <p className="text-[11px] opacity-80 leading-normal">
                          {t(mfaTicket ? 'auth.mfaHint' : 'auth.errorHelper')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={busy || !(mfaTicket ? code.trim() : password)}
                    className="btn-silver w-full mt-2 py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer transition active:scale-[0.99]"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{t('auth.signingIn')}</span>
                      </>
                    ) : unlocked ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{t('auth.success')}</span>
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

              {/* Sub-Features Strip */}
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

            {/* Bottom Telemetry Strip */}
            <div className="metal rounded-xl grid grid-cols-3 divide-x divide-[var(--line)] text-center py-2.5 px-1 font-mono text-[10px]">
              <div className="px-1">
                <span className="text-[var(--muted-foreground)] block">FLEET</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">AGENTLESS</span>
              </div>
              <div className="px-1">
                <span className="text-[var(--muted-foreground)] block">SECURITY</span>
                <span className="font-semibold text-[var(--foreground)]">ENCRYPTED</span>
              </div>
              <div className="px-1">
                <span className="text-[var(--muted-foreground)] block">AI COPILOT</span>
                <span className="font-semibold text-purple-500 dark:text-purple-400">DUAL-MODE</span>
              </div>
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
