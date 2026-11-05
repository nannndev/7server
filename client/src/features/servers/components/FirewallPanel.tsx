import React, { useEffect, useState } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, Plus, Trash2, RefreshCw,
  Lock, AlertTriangle, CheckCircle, Info, Sparkles
} from 'lucide-react';
import {
  fetchFirewall, addFirewallRule, deleteFirewallRule, toggleFirewall,
  type FirewallStatus, type UfwRule
} from '@/features/servers/api';
import { useCan } from '@/features/auth/AuthContext';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';

interface FirewallPanelProps {
  serverId: string;
  serverName: string;
}

const COMMON_PRESETS = [
  { label: 'HTTP (80)', port: 80, proto: 'tcp' },
  { label: 'HTTPS (443)', port: 443, proto: 'tcp' },
  { label: 'SSH (22)', port: 22, proto: 'tcp' },
  { label: 'MySQL (3306)', port: 3306, proto: 'tcp' },
  { label: 'PostgreSQL (5432)', port: 5432, proto: 'tcp' },
  { label: 'Redis (6379)', port: 6379, proto: 'tcp' }
];

export default function FirewallPanel({ serverId, serverName }: FirewallPanelProps) {
  const canManageFirewall = useCan('firewall.manage');
  const [data, setData] = useState<FirewallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add rule form
  const [showAddForm, setShowAddForm] = useState(false);
  const [port, setPort] = useState('');
  const [protocol, setProtocol] = useState<'tcp' | 'udp' | 'any'>('tcp');
  const [action, setAction] = useState<'allow' | 'deny'>('allow');
  const [fromIp, setFromIp] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const loadFirewall = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFirewall(serverId);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat status firewall');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFirewall();
  }, [serverId]);

  const handleToggle = async () => {
    if (!data || !canManageFirewall) return;
    const willEnable = !data.enabled;

    if (willEnable && !data.sshSafe) {
      toast.error(`Tidak dapat mengaktifkan UFW: Port SSH (${data.sshPort}) belum memiliki aturan ALLOW. Tambahkan aturan ALLOW untuk port SSH terlebih dahulu agar koneksi server tidak terputus.`);
      return;
    }

    const confirmed = await confirmModal({
      title: willEnable ? 'Aktifkan Firewall UFW' : 'Nonaktifkan Firewall UFW',
      message: willEnable
        ? `Apakah Anda yakin ingin mengaktifkan firewall UFW di "${serverName}"? Pastikan port layanan penting sudah dibuka.`
        : `Apakah Anda yakin ingin mematikan firewall UFW di "${serverName}"? Seluruh traffic masuk tidak akan lagi disaring oleh UFW.`,
      variant: willEnable ? 'primary' : 'danger',
      confirmText: willEnable ? 'Aktifkan Firewall' : 'Matikan Firewall'
    });

    if (!confirmed) return;

    setToggling(true);
    try {
      const res = await toggleFirewall(serverId, willEnable);
      setData(res);
      toast.success(willEnable ? 'Firewall UFW berhasil diaktifkan' : 'Firewall UFW telah dimatikan');
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status firewall');
    } finally {
      setToggling(false);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!port || !canManageFirewall) return;

    setSubmitting(true);
    try {
      const res = await addFirewallRule(serverId, {
        port: port.trim(),
        protocol,
        action,
        fromIp: fromIp.trim() || undefined,
        comment: comment.trim() || undefined
      });
      setData(res);
      toast.success(`Aturan firewall untuk port ${port} berhasil ditambahkan`);
      setShowAddForm(false);
      setPort('');
      setFromIp('');
      setComment('');
    } catch (err: any) {
      toast.error(err.message || 'Gagal menambahkan aturan firewall');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (rule: UfwRule) => {
    if (!canManageFirewall) return;

    if (rule.isSsh && data?.enabled) {
      const confirmed = await confirmModal({
        title: 'PERINGATAN: Aturan Port SSH',
        message: `Aturan #${rule.number} melindungi port SSH (${data.sshPort}) yang sedang dipakai oleh 7Server. Menghapus aturan ini berpotensi memutus koneksi server jika tidak ada aturan SSH lain! Lanjutkan?`,
        variant: 'danger',
        confirmText: 'Tetap Hapus'
      });
      if (!confirmed) return;
    } else {
      const confirmed = await confirmModal({
        title: 'Hapus Aturan Firewall',
        message: `Hapus aturan #${rule.number} (${rule.to} ${rule.action} dari ${rule.from})?`,
        variant: 'danger',
        confirmText: 'Hapus Aturan'
      });
      if (!confirmed) return;
    }

    try {
      const res = await deleteFirewallRule(serverId, rule.number);
      setData(res);
      toast.success(`Aturan #${rule.number} berhasil dihapus`);
    } catch (err: any) {
      toast.error(err.message || 'Gagal menghapus aturan firewall');
    }
  };

  return (
    <Card className="p-5 space-y-5 border-[var(--border)]">
      {/* Header and Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Firewall Terpusat (UFW)</h3>
              {data && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                    data.enabled
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                  }`}
                >
                  {data.enabled ? 'AKTIF (ENFORCED)' : 'NONAKTIF'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Manajemen paket incoming/outgoing dengan pencegahan lockout otomatis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadFirewall}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </Button>

          {canManageFirewall && data && (
            <>
              <Button
                variant={data.enabled ? 'outline' : 'default'}
                size="sm"
                onClick={handleToggle}
                disabled={toggling}
                className={`h-8 text-xs font-semibold ${
                  data.enabled ? 'text-amber-500 hover:text-amber-600 border-amber-500/30' : ''
                }`}
              >
                {toggling ? 'Memproses...' : data.enabled ? 'Matikan Firewall' : 'Aktifkan Firewall'}
              </Button>

              <Button
                size="sm"
                onClick={() => setShowAddForm(!showAddForm)}
                className="h-8 gap-1.5 text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Aturan</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* SSH Safeguard Banner */}
      {data && (
        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 flex items-start gap-3 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                SSH Lockout Safeguard Aktif
              </span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                Port {data.sshPort}/tcp
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
              7Server mendeteksi port SSH aktif ({data.sshPort}) dan menjaganya agar tidak terblokir saat firewall dioperasikan.
              {!data.sshSafe && (
                <span className="text-amber-500 font-semibold block mt-0.5">
                  ⚠️ Perhatian: Belum ditemukan aturan eksplisit ALLOW untuk port {data.sshPort}. UFW dicegah untuk aktif hingga aturan ini dibuat.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Add Rule Form */}
      {showAddForm && (
        <form onSubmit={handleAddRule} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-primary" /> Tambah Aturan Firewall Baru
            </h4>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted-foreground)] mr-1">Preset Cepat:</span>
              {COMMON_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setPort(String(p.port));
                    setProtocol(p.proto as any);
                    setAction('allow');
                  }}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--card)] hover:bg-[var(--muted)] border border-[var(--border)] transition"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Port / Servis</span>
              <Input
                type="text"
                required
                placeholder="mis. 80, 443, 8080"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Protokol</span>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
                className="w-full h-9 rounded-md bg-[var(--background)] border border-[var(--border)] px-3 text-xs"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="any">Semua (Any)</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Aksi</span>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className="w-full h-9 rounded-md bg-[var(--background)] border border-[var(--border)] px-3 text-xs"
              >
                <option value="allow">IZINKAN (ALLOW)</option>
                <option value="deny">BLOKIR (DENY)</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[var(--muted-foreground)]">Dari IP (Opsional)</span>
              <Input
                type="text"
                placeholder="Kosongkan untuk Semua (Anywhere)"
                value={fromIp}
                onChange={(e) => setFromIp(e.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !port}>
              {submitting ? 'Menyimpan...' : 'Terapkan Aturan'}
            </Button>
          </div>
        </form>
      )}

      {/* Rules Table */}
      <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--background)]">
        <table className="w-full text-left text-xs">
          <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] font-medium text-[var(--muted-foreground)]">
            <tr>
              <th className="px-4 py-2.5 w-12">#</th>
              <th className="px-4 py-2.5">Port / Tujuan</th>
              <th className="px-4 py-2.5">Aksi</th>
              <th className="px-4 py-2.5">Dari (Sumber)</th>
              <th className="px-4 py-2.5">Tipe</th>
              <th className="px-4 py-2.5 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {loading && (!data || data.rules.length === 0) ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted-foreground)]">
                  Memuat aturan firewall UFW...
                </td>
              </tr>
            ) : !data || data.rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--muted-foreground)]">
                  Belum ada aturan UFW yang terdaftar.
                </td>
              </tr>
            ) : (
              data.rules.map((r) => {
                const isAllow = r.action.toUpperCase().includes('ALLOW');
                return (
                  <tr key={`${r.number}-${r.to}`} className="hover:bg-[var(--muted)]/20 transition">
                    <td className="px-4 py-2.5 font-mono text-[var(--muted-foreground)]">
                      {r.number}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <span>{r.to}</span>
                      {r.isSsh && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                          SSH Port
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          isAllow
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                        }`}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[var(--muted-foreground)]">
                      {r.from}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--muted-foreground)]">
                      {r.isV6 ? 'IPv6' : 'IPv4'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canManageFirewall && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRule(r)}
                          className="h-7 w-7 text-[var(--muted-foreground)] hover:text-red-500"
                          title="Hapus Aturan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
