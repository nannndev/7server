import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, Eye, EyeOff, X, Lock, Check } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface SudoPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password: string, remember: boolean) => Promise<void> | void;
  serverName: string;
  username: string;
  hasExistingPassword?: boolean;
  reason?: string;
}

export function SudoPasswordModal({
  isOpen,
  onClose,
  onConfirm,
  serverName,
  username,
  hasExistingPassword = false,
  reason
}: SudoPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setRemember(true);
      setError(null);
      setBusy(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setError('Please enter the sudo password');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password.trim(), remember);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)] bg-gradient-to-r from-amber-500/10 via-[var(--muted)]/20 to-transparent flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0 shadow-inner">
              <KeyRound className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <span>Sudo Authentication</span>
                {hasExistingPassword && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Saved
                  </span>
                )}
              </h3>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5 font-mono">
                {serverName} · user: {username}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs text-[var(--foreground)] leading-relaxed">
              {reason || `User '${username}' requires sudo/root privileges on this server to execute system commands.`}
            </p>
            <p className="text-[11px] text-[var(--muted-foreground)] leading-normal">
              Enter the sudo password for <span className="font-mono text-zinc-300">{username}</span> to authenticate non-interactive SSH execution.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--foreground)]">
              Sudo Password
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder={hasExistingPassword ? 'Enter new password to update...' : 'Enter sudo password...'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                disabled={busy}
                className="pr-10 text-xs bg-[var(--background)] h-9 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {error && (
              <p className="text-[11px] text-red-400 font-medium">{error}</p>
            )}
          </div>

          {/* Remember Password Checkbox */}
          <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 space-y-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
                className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0 mt-0.5 shrink-0"
              />
              <div className="space-y-0.5">
                <span className="font-semibold text-[var(--foreground)] block">
                  Always remember sudo password for this server
                </span>
                <span className="text-[11px] text-[var(--muted-foreground)] block leading-snug">
                  Encrypted at rest with AES-256-GCM. 7Server will automatically use it for future 1-click installs, service restarts, and Docker setups without prompting again.
                </span>
              </div>
            </label>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={busy}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !password.trim()}
              className="h-8 text-xs gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950 shadow-md shadow-amber-500/20"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{busy ? 'Authenticating...' : remember ? 'Save & Continue' : 'Continue'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
