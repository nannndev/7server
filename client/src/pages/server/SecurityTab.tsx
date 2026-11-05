import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  X,
  Server,
  Lock,
  Unlock,
  AlertTriangle,
  Radio
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Modal } from '@/shared/ui/modal';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { useServerPage } from './context';
import {
  fetchSshKeys,
  addSshKey,
  deleteSshKey,
  fetchSecurityHardening,
  unbanIp,
  type SshKeyItem,
  type SecurityHardeningStatus
} from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import { useT } from '@/shared/i18n';

export default function SecurityTab() {
  const t = useT();
  const { server } = useServerPage();

  const [keys, setKeys] = useState<SshKeyItem[] | null>(null);
  const [hardening, setHardening] = useState<SecurityHardeningStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add Key Modal
  const [showAddKeyModal, setShowAddKeyModal] = useState(false);
  const [newKeyContent, setNewKeyContent] = useState('');
  const [submittingKey, setSubmittingKey] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Unbanning IP state
  const [unbanningIp, setUnbanningIp] = useState<string | null>(null);

  const loadSecurityData = async (force = false) => {
    setError(null);
    try {
      await Promise.all([
        swr(`ssh-keys:${server.id}`, () => fetchSshKeys(server.id), setKeys, setLoading, force),
        swr(`hardening:${server.id}`, () => fetchSecurityHardening(server.id), setHardening, () => {}, force)
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to load security data');
    }
  };

  useEffect(() => {
    loadSecurityData();
  }, [server.id]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyContent.trim()) return;

    setSubmittingKey(true);
    try {
      const res = await addSshKey(server.id, newKeyContent.trim());
      setKeys(res);
      setNewKeyContent('');
      setShowAddKeyModal(false);
      toast.success(t('security.keyAdded'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to add public key');
    } finally {
      setSubmittingKey(false);
    }
  };

  const handleDeleteKey = async (key: SshKeyItem) => {
    const ok = await confirmModal({
      title: t('security.deleteKey'),
      message: t('security.confirmDeleteKey', { comment: key.comment }),
      variant: 'danger',
      confirmText: t('security.deleteKey')
    });
    if (!ok) return;
    try {
      const res = await deleteSshKey(server.id, key.id);
      setKeys(res);
      toast.success(t('security.keyDeleted'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete public key');
    }
  };

  const handleCopyKey = (key: SshKeyItem) => {
    navigator.clipboard.writeText(key.raw);
    setCopiedKeyId(key.id);
    toast.info(t('security.keyCopied'));
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleUnbanIp = async (ip: string) => {
    setUnbanningIp(ip);
    try {
      await unbanIp(server.id, ip);
      setHardening((prev) => (prev ? { ...prev, bannedIps: prev.bannedIps.filter((i) => i !== ip) } : null));
      toast.success(t('security.ipUnbanned', { ip }));
    } catch (err: any) {
      toast.error(err.message || t('security.unbanFailed'));
    } finally {
      setUnbanningIp(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <KeyRound className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('security.title')}</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('security.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSecurityData(true)}
              disabled={loading}
              className="gap-1.5 h-8 text-xs"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setShowAddKeyModal(true)}
              className="gap-1.5 h-8 text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('security.addKey')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => loadSecurityData(true)} className="h-6 text-[10px]">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Grid: Left Column (SSH Authorized Keys) & Right Column (Hardening & Fail2ban) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authorized Keys Vault */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--primary)]" />
                {t('security.keysTitle', { count: keys?.length || 0 })}
              </h3>
              <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                ~/.ssh/authorized_keys
              </span>
            </div>

            {!keys && !error ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : keys && keys.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl">
                {t('security.emptyKeys')}
              </div>
            ) : (
              <div className="space-y-2.5">
                {keys?.map((k) => {
                  const isCopied = copiedKeyId === k.id;
                  return (
                    <div
                      key={k.id}
                      className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted-foreground)]/30 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                            {k.type}
                          </Badge>
                          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                            {k.comment}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyKey(k)}
                            className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Copy Public Key"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteKey(k)}
                            className="h-7 w-7 text-[var(--muted-foreground)] hover:text-red-400"
                            title={t('security.deleteKey')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Truncated Key String */}
                      <div className="p-2 rounded bg-zinc-950 font-mono text-[10px] text-zinc-400 overflow-x-auto whitespace-pre border border-zinc-800/80">
                        {k.key.slice(0, 32)}...{k.key.slice(-24)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: SSH Hardening Policies & Fail2ban */}
        <div className="lg:col-span-5 space-y-4">
          {/* SSH Configuration Status */}
          <Card className="p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400" />
              {t('security.hardeningTitle')}
            </h3>

            <div className="space-y-3 pt-1">
              {/* Password Auth Status */}
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-[var(--foreground)] block">
                    {t('security.passwordAuth')}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    PasswordAuthentication in sshd_config
                  </span>
                </div>
                <Badge
                  variant={hardening?.passwordAuth ? 'warning' : 'success'}
                  className="text-[10px] font-mono py-0 px-2"
                >
                  {hardening?.passwordAuth ? t('security.statusActiveInsecure') : t('security.statusActiveSecure')}
                </Badge>
              </div>

              {/* Direct Root Login Status */}
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-[var(--foreground)] block">
                    {t('security.rootLogin')}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    PermitRootLogin in sshd_config
                  </span>
                </div>
                <Badge
                  variant={hardening?.rootLogin === 'yes' ? 'warning' : 'outline'}
                  className="text-[10px] font-mono py-0 px-2"
                >
                  {hardening?.rootLogin || 'prohibit-password'}
                </Badge>
              </div>

              {/* SSH Port */}
              <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-between">
                <div>
                  <span className="text-xs font-medium text-[var(--foreground)] block">
                    {t('security.sshPort')}
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)]">SSH server daemon port</span>
                </div>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] font-semibold">
                  Port {hardening?.sshPort || 22}
                </span>
              </div>
            </div>
          </Card>

          {/* Fail2ban Intrusion Defense */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                {t('security.fail2banTitle')}
              </h3>

              <Badge
                variant={hardening?.fail2banActive ? 'success' : 'secondary'}
                className="text-[10px] font-mono py-0 px-2"
              >
                {hardening?.fail2banActive ? t('security.f2bActive') : t('security.f2bInactive')}
              </Badge>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block">
                {t('security.bannedIps', { count: hardening?.bannedIps.length || 0 })}:
              </span>

              {hardening?.bannedIps && hardening.bannedIps.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {hardening.bannedIps.map((ip) => {
                    const isUnbanning = unbanningIp === ip;
                    return (
                      <div
                        key={ip}
                        className="px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 flex items-center justify-between text-xs"
                      >
                        <span className="font-mono font-medium text-red-400">{ip}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUnbanIp(ip)}
                          disabled={isUnbanning}
                          className="h-6 text-[10px] text-zinc-400 hover:text-[var(--foreground)]"
                        >
                          {isUnbanning ? t('security.unbanning') : t('security.unban')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border)] text-center text-xs text-[var(--muted-foreground)]">
                  {t('security.noBanned')}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Add SSH Key Modal */}
      {showAddKeyModal && (
        <Modal isOpen={showAddKeyModal} onClose={() => setShowAddKeyModal(false)} className="max-w-lg">
          <Card className="w-full p-5 space-y-4 bg-[var(--card)] border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[var(--primary)]" />
                {t('security.addKey')}
              </h3>
              <button
                onClick={() => setShowAddKeyModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddKey} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  {t('security.publicKey')}
                </label>
                <textarea
                  value={newKeyContent}
                  onChange={(e) => setNewKeyContent(e.target.value)}
                  placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5... user@laptop"
                  rows={4}
                  className="w-full p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] font-mono text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)] resize-none"
                  required
                />
                <span className="text-[10px] text-[var(--muted-foreground)]">
                  {t('security.keyPlaceholderHint')}
                </span>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddKeyModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingKey}
                  className="text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  {submittingKey ? t('security.savingKey') : t('security.saveKey')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}
    </div>
  );
}

