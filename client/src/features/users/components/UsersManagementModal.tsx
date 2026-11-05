import React, { useEffect, useState } from 'react';
import {
  Users, UserPlus, KeyRound, Shield, Trash2, Edit2, Check,
  X, RefreshCw, Server, AlertTriangle, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser, resetUserPassword } from '@/features/auth/api';
import type { ManagedUser, Role } from '@/features/auth/types';
import type { ServerItem } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';

interface UsersManagementModalProps {
  open: boolean;
  onClose: () => void;
  servers: ServerItem[];
  currentUserId?: string;
}

const ROLES: { id: Role; label: string; desc: string; color: string }[] = [
  {
    id: 'admin',
    label: 'Admin',
    desc: 'Akses penuh ke seluruh server, terminal, database, manajemen user, AI gateway & firewall.',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
  },
  {
    id: 'operator',
    label: 'Operator (DevOps)',
    desc: 'Operasi server, restart service/docker/db, buka terminal & eksekusi AI. Tanpa izin kelola user & tambah server.',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  },
  {
    id: 'viewer',
    label: 'Viewer (Read-Only)',
    desc: 'Hanya melihat metrics, logs, query DB baca, chat Copilot. Tidak bisa membuka SSH terminal atau mengubah service.',
    color: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
  }
];

export default function UsersManagementModal({
  open,
  onClose,
  servers,
  currentUserId
}: UsersManagementModalProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-modal states
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [allServers, setAllServers] = useState(true);
  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || 'Gagal memuat pengguna');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  if (!open) return null;

  const openAdd = () => {
    setEditingUser(null);
    setUsername('');
    setPassword('');
    setRole('operator');
    setAllServers(true);
    setSelectedServers([]);
    setDisabled(false);
    setEditorOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditingUser(u);
    setUsername(u.username);
    setPassword('');
    setRole(u.role);
    setAllServers(!u.servers || u.servers === '*');
    setSelectedServers(Array.isArray(u.servers) ? u.servers : []);
    setDisabled(!!u.disabled);
    setEditorOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const serverScope = allServers ? '*' : selectedServers;
      if (editingUser) {
        await updateUser(editingUser.id, {
          role,
          servers: serverScope,
          disabled
        });
        toast.success(`Pengguna ${editingUser.username} berhasil diperbarui`);
      } else {
        if (!password || password.length < 8) {
          throw new Error('Password awal minimal 8 karakter');
        }
        await createUser({
          username,
          password,
          role,
          servers: serverScope
        });
        toast.success(`Pengguna ${username} berhasil dibuat`);
      }
      setEditorOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan pengguna');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: ManagedUser) => {
    if (u.id === currentUserId) {
      toast.error('Anda tidak dapat menghapus akun Anda sendiri');
      return;
    }
    const confirmed = await confirmModal({
      title: 'Hapus Pengguna',
      message: `Apakah Anda yakin ingin menghapus pengguna "${u.username}"? Semua sesi aktif pengguna ini akan dicabut seketika.`,
      variant: 'danger',
      confirmText: 'Hapus Pengguna'
    });
    if (!confirmed) return;

    try {
      await deleteUser(u.id);
      toast.success(`Pengguna ${u.username} berhasil dihapus`);
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus pengguna');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !newPassword || newPassword.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.id, newPassword);
      toast.success(`Password pengguna ${resetTarget.username} berhasil direset`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mereset password');
    } finally {
      setResetting(false);
    }
  };

  const toggleServerSelect = (sid: string) => {
    setSelectedServers((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center shadow">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Manajemen Pengguna & Akses (RBAC)</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Kelola akun pengguna, peran otorisasi, dan pembatasan server
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={openAdd} className="gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              <span>Tambah Pengguna</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={loadData} disabled={loading} title="Segarkan">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} title="Tutup">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && users.length === 0 ? (
            <div className="py-16 text-center text-xs text-[var(--muted-foreground)]">
              Memuat data pengguna...
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--background)]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] font-medium text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-4 py-2.5">Pengguna</th>
                    <th className="px-4 py-2.5">Peran (Role)</th>
                    <th className="px-4 py-2.5">Cakupan Server</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Terakhir Login</th>
                    <th className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {users.map((u) => {
                    const roleInfo = ROLES.find((r) => r.id === u.role) || ROLES[1];
                    const isSelf = u.id === currentUserId;

                    return (
                      <tr key={u.id} className="hover:bg-[var(--muted)]/20 transition">
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center font-semibold text-[11px]">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] bg-primary/20 text-primary font-medium">
                                  Anda
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                              ID: {u.id.slice(0, 8)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${roleInfo.color}`}
                          >
                            <Shield className="w-3 h-3" />
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {!u.servers || u.servers === '*' ? (
                            <span className="text-[var(--foreground)] font-medium">
                              Semua Server (*)
                            </span>
                          ) : Array.isArray(u.servers) && u.servers.length > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--muted)] text-[11px]">
                              <Server className="w-3 h-3" /> {u.servers.length} Server Ditugaskan
                            </span>
                          ) : (
                            <span className="text-amber-500">Tidak ada server</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.disabled ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/10 text-red-500 font-medium border border-red-500/20">
                              Dinonaktifkan
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20">
                              Aktif
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[var(--muted-foreground)]">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'Belum pernah'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEdit(u)}
                              title="Edit Pengguna"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setResetTarget(u)}
                              title="Reset Password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </Button>
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(u)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                title="Hapus Pengguna"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>{users.length} pengguna terdaftar</span>
          <Button variant="default" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>

      {/* Add / Edit User Submodal */}
      {editorOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">
                {editingUser ? `Edit Pengguna: ${editingUser.username}` : 'Tambah Pengguna Baru'}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              {!editingUser && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">Username</span>
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="mis. devops_andi"
                  />
                </label>
              )}

              {!editingUser && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">Password Awal (Min. 8 Karakter)</span>
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </label>
              )}

              <div className="space-y-2">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">Pilih Peran (Role)</span>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <label
                      key={r.id}
                      onClick={() => setRole(r.id)}
                      className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                        role === r.id
                          ? 'border-primary bg-primary/5'
                          : 'border-[var(--border)] hover:bg-[var(--muted)]/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="mt-1"
                        checked={role === r.id}
                        onChange={() => setRole(r.id)}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold">{r.label}</div>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                          {r.desc}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Server Access Scope */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">
                    Cakupan Akses Server
                  </span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allServers}
                      onChange={(e) => setAllServers(e.target.checked)}
                      className="rounded"
                    />
                    <span>Semua Server (*)</span>
                  </label>
                </div>

                {!allServers && (
                  <div className="max-h-36 overflow-y-auto p-2 rounded-lg border border-[var(--border)] bg-[var(--background)] space-y-1 text-xs">
                    {servers.length === 0 ? (
                      <div className="text-center py-2 text-[var(--muted-foreground)]">
                        Tidak ada server terdaftar
                      </div>
                    ) : (
                      servers.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-1 rounded hover:bg-[var(--muted)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServers.includes(s.id)}
                            onChange={() => toggleServerSelect(s.id)}
                            className="rounded"
                          />
                          <span className="font-medium truncate">{s.name}</span>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono ml-auto">
                            {s.host}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {editingUser && editingUser.id !== currentUserId && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disabled}
                      onChange={(e) => setDisabled(e.target.checked)}
                      className="rounded text-red-500"
                    />
                    <span className="text-red-500 font-medium">Nonaktifkan akun ini</span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <KeyRound className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-sm font-semibold">Reset Password</h3>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  Untuk pengguna: <span className="font-bold text-[var(--foreground)]">{resetTarget.username}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">
                  Password Baru (Min. 8 Karakter)
                </span>
                <Input
                  type="password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setResetTarget(null)}>
                  Batal
                </Button>
                <Button type="submit" size="sm" disabled={resetting || newPassword.length < 8}>
                  {resetting ? 'Mereset...' : 'Reset Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

