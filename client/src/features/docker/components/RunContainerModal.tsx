import React, { useState } from 'react';
import { Box, X, RefreshCw, Plus, Trash2, Cpu, HardDrive, Network, Shield, Play } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useT } from '@/shared/i18n';
import { dockerRunContainer, DockerOverview } from '../api';

interface RunContainerModalProps {
  serverId: string;
  dockerData: DockerOverview | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RunContainerModal({ serverId, dockerData, isOpen, onClose, onSuccess }: RunContainerModalProps) {
  const t = useT();
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [ports, setPorts] = useState<{ host: string; container: string }[]>([{ host: '', container: '' }]);
  const [envRaw, setEnvRaw] = useState('');
  const [volumes, setVolumes] = useState<{ source: string; target: string; mode: 'rw' | 'ro' }[]>([]);
  const [network, setNetwork] = useState('bridge');
  const [restart, setRestart] = useState('unless-stopped');
  const [memory, setMemory] = useState('');
  const [cmd, setCmd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddPort = () => setPorts((p) => [...p, { host: '', container: '' }]);
  const handleRemovePort = (idx: number) => setPorts((p) => p.filter((_, i) => i !== idx));

  const handleAddVolume = () => setVolumes((v) => [...v, { source: '', target: '', mode: 'rw' }]);
  const handleRemoveVolume = (idx: number) => setVolumes((v) => v.filter((_, i) => i !== idx));

  const handleRun = async () => {
    if (!name.trim() || !image.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const portStrings = ports
        .filter((p) => p.host.trim() && p.container.trim())
        .map((p) => `${p.host.trim()}:${p.container.trim()}`);

      const envStrings = envRaw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));

      const volStrings = volumes
        .filter((v) => v.source.trim() && v.target.trim())
        .map((v) => `${v.source.trim()}:${v.target.trim()}${v.mode === 'ro' ? ':ro' : ''}`);

      await dockerRunContainer(serverId, {
        name: name.trim(),
        image: image.trim(),
        ports: portStrings.length ? portStrings : undefined,
        env: envStrings.length ? envStrings : undefined,
        volumes: volStrings.length ? volStrings : undefined,
        network: network === 'bridge' ? undefined : network,
        restart,
        memory: memory.trim() || undefined,
        cmd: cmd.trim() || undefined
      });

      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to start container');
    } finally {
      setLoading(false);
    }
  };

  const pulledImages = dockerData?.images || [];
  const existingVolumes = dockerData?.volumes || [];
  const existingNetworks = dockerData?.networks || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="metal relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Box className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('docker.runContainerTitle')}</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">Configure and launch a Docker container on this node</p>
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

        {/* Form Body */}
        <div className="space-y-4 overflow-y-auto p-5 text-xs">
          {/* Container Name & Image */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.containerName')} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. my-app, cache-redis, api-proxy"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.image')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Input
                  placeholder="e.g. nginx:alpine, redis:7-alpine"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  disabled={loading}
                  className="font-mono text-xs"
                />
                {pulledImages.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {pulledImages.slice(0, 4).map((img) => {
                      const ref = `${img.repo}:${img.tag}`;
                      return (
                        <button
                          key={ref}
                          type="button"
                          onClick={() => setImage(ref)}
                          className="rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]"
                        >
                          {ref}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Port Bindings */}
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--foreground)]">{t('docker.ports')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddPort} className="h-6 gap-1 text-[11px]">
                <Plus className="h-3 w-3" /> Add Port
              </Button>
            </div>
            {ports.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  placeholder="Host Port (e.g. 8080)"
                  value={p.host}
                  onChange={(e) => {
                    const next = [...ports];
                    next[idx].host = e.target.value;
                    setPorts(next);
                  }}
                  className="h-7 font-mono text-xs"
                />
                <span className="text-[var(--muted-foreground)]">:</span>
                <Input
                  placeholder="Container Port (e.g. 80)"
                  value={p.container}
                  onChange={(e) => {
                    const next = [...ports];
                    next[idx].container = e.target.value;
                    setPorts(next);
                  }}
                  className="h-7 font-mono text-xs"
                />
                {ports.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemovePort(idx)}
                    className="h-7 w-7 text-red-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* Environment Variables */}
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-1.5">
            <label className="block font-medium text-[var(--foreground)]">
              {t('docker.envVars')}
            </label>
            <textarea
              placeholder={t('docker.envPlaceholder')}
              value={envRaw}
              onChange={(e) => setEnvRaw(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-xs leading-relaxed outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Volume Mounts */}
          <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--foreground)]">{t('docker.volumeMounts')}</span>
              <Button type="button" variant="ghost" size="sm" onClick={handleAddVolume} className="h-6 gap-1 text-[11px]">
                <Plus className="h-3 w-3" /> Add Mount
              </Button>
            </div>
            {volumes.length === 0 ? (
              <p className="text-[11px] text-[var(--muted-foreground)]">No volumes mounted. Click "+ Add Mount" to bind storage.</p>
            ) : (
              volumes.map((v, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    placeholder="Volume or Host Path (/srv/data)"
                    value={v.source}
                    onChange={(e) => {
                      const next = [...volumes];
                      next[idx].source = e.target.value;
                      setVolumes(next);
                    }}
                    className="h-7 font-mono text-xs"
                  />
                  <span className="text-[var(--muted-foreground)]">:</span>
                  <Input
                    placeholder="Container Path (/app/data)"
                    value={v.target}
                    onChange={(e) => {
                      const next = [...volumes];
                      next[idx].target = e.target.value;
                      setVolumes(next);
                    }}
                    className="h-7 font-mono text-xs"
                  />
                  <select
                    value={v.mode}
                    onChange={(e) => {
                      const next = [...volumes];
                      next[idx].mode = e.target.value as 'rw' | 'ro';
                      setVolumes(next);
                    }}
                    className="h-7 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 text-[11px] font-mono"
                  >
                    <option value="rw">rw</option>
                    <option value="ro">ro</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveVolume(idx)}
                    className="h-7 w-7 text-red-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Runtime Options: Network, Restart, Memory */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.network')}
              </label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-mono"
              >
                <option value="bridge">bridge (default)</option>
                <option value="host">host</option>
                {existingNetworks.filter((n) => !['bridge', 'host', 'none'].includes(n.name)).map((n) => (
                  <option key={n.name} value={n.name}>{n.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.restartPolicy')}
              </label>
              <select
                value={restart}
                onChange={(e) => setRestart(e.target.value)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-mono"
              >
                <option value="unless-stopped">unless-stopped (recommended)</option>
                <option value="always">always</option>
                <option value="on-failure">on-failure</option>
                <option value="no">no</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.memoryLimit')}
              </label>
              <Input
                placeholder="e.g. 512m, 1g"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          {/* Command override */}
          <div>
            <label className="mb-1 block font-medium text-[var(--foreground)]">
              {t('docker.cmdOverride')}
            </label>
            <Input
              placeholder="e.g. npm start, python app.py"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleRun} disabled={loading || !name.trim() || !image.trim()} className="gap-1.5">
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t('docker.runContainer')}
          </Button>
        </div>
      </div>
    </div>
  );
}

