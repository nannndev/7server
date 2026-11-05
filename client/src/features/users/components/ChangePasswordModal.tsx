import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { changePassword } from '@/features/auth/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('Password baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password tidak cocok');
      return;
    }

    setBusy(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success('Password berhasil diperbarui');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Ganti Password</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">Perbarui password akun Anda</p>
            </div>
          </div>
          <button
            onClick={() => setShowPasswords(!showPasswords)}
            type="button"
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded"
            title={showPasswords ? 'Sembunyikan password' : 'Tampilkan password'}
          >
            {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Password Saat Ini</span>
            <Input
              type={showPasswords ? 'text' : 'password'}
              required
              autoFocus
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Password Baru (Min. 8 Karakter)</span>
            <Input
              type={showPasswords ? 'text' : 'password'}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--muted-foreground)]">Konfirmasi Password Baru</span>
            <Input
              type={showPasswords ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
            />
          </label>

          {error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-500">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={busy || !oldPassword || !newPassword}>
              {busy ? 'Menyimpan...' : 'Simpan Password Baru'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
