import React, { useState } from 'react';
import { Database, X, RefreshCw, HardDrive } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useT } from '@/shared/i18n';
import { dockerCreateVolume } from '../api';

interface VolumeModalProps {
  serverId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function VolumeModal({ serverId, isOpen, onClose, onSuccess }: VolumeModalProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('local');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const volName = name.trim();
    if (!volName) return;
    setLoading(true);
    setError(null);
    try {
      await dockerCreateVolume(serverId, volName, driver === 'local' ? undefined : driver);
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to create volume');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="metal relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('docker.createVolume')}</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">Create persistent Docker storage volume</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--line)] hover:text-[var(--foreground)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs">
          <div>
            <label className="mb-1.5 block font-medium text-[var(--foreground)]">
              {t('docker.volumeName')} <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. pg_data, app_uploads, redis_cache"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              className="font-mono text-xs"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-medium text-[var(--foreground)]">
              {t('docker.driver')}
            </label>
            <select
              value={driver}
              onChange={(e) => setDriver(e.target.value)}
              disabled={loading}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-mono"
            >
              <option value="local">local (default)</option>
            </select>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={loading || !name.trim()} className="gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <HardDrive className="h-3.5 w-3.5" />}
            {t('docker.createVolume')}
          </Button>
        </div>
      </div>
    </div>
  );
}

