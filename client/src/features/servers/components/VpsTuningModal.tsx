import React, { useEffect, useState } from 'react';
import {
  Layers,
  Settings2,
  X,
  RefreshCw,
  HardDrive,
  Cpu,
  Clock,
  Server,
  Zap,
  Check,
  AlertTriangle,
  Sliders,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/ui/toast';
import {
  fetchSystemTuning,
  configureSwap,
  configureSystem,
  SystemTuningStatus
} from '../api';

interface VpsTuningModalProps {
  serverId: string;
  serverName: string;
  serverHost: string;
  isOpen: boolean;
  initialTab?: 'swap' | 'system';
  onClose: () => void;
  onSuccess?: () => void;
}

const COMMON_TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (WIB · UTC+7)' },
  { value: 'Asia/Makassar', label: 'Asia/Makassar (WITA · UTC+8)' },
  { value: 'Asia/Jayapura', label: 'Asia/Jayapura (WIT · UTC+9)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT · UTC+8)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST · UTC+9)' }
];

const SWAP_PRESETS = [
  { sizeMB: 1024, label: '1 GB', desc: 'Ideal for 1GB RAM VPS' },
  { sizeMB: 2048, label: '2 GB', desc: 'Ideal for 2GB RAM VPS' },
  { sizeMB: 4096, label: '4 GB', desc: 'Compilation & heavy builds' },
  { sizeMB: 8192, label: '8 GB', desc: 'Large database / workloads' },
  { sizeMB: 0, label: 'Disable', desc: 'Turn off & delete /swapfile' }
];

export function VpsTuningModal({
  serverId,
  serverName,
  serverHost,
  isOpen,
  initialTab = 'swap',
  onClose,
  onSuccess
}: VpsTuningModalProps) {
  const t = useT();
  const [tab, setTab] = useState<'swap' | 'system'>(initialTab);
  const [data, setData] = useState<SystemTuningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Swap form state
  const [selectedSizeMB, setSelectedSizeMB] = useState<number>(2048);
  const [customSizeMB, setCustomSizeMB] = useState('');
  const [isCustomSize, setIsCustomSize] = useState(false);
  const [swappiness, setSwappiness] = useState(10);
  const [cachePressure, setCachePressure] = useState(50);

  // System form state
  const [hostname, setHostname] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [bbr, setBbr] = useState(true);
  const [optimizeLimits, setOptimizeLimits] = useState(false);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSystemTuning(serverId);
      setData(res);
      setHostname(res.hostname);
      setTimezone(res.timezone || 'UTC');
      setBbr(res.bbrEnabled);
      setSwappiness(res.swap.swappiness || 10);
      setCachePressure(res.swap.vfsCachePressure || 50);
      if (res.swap.totalMB > 0) {
        setSelectedSizeMB(res.swap.totalMB);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load system tuning status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    loadStatus();
  }, [isOpen, serverId, initialTab]);

  if (!isOpen) return null;

  const handleApplySwap = async () => {
    const finalSize = isCustomSize ? parseInt(customSizeMB, 10) || 0 : selectedSizeMB;
    setSaving(true);
    setError(null);
    try {
      await configureSwap(serverId, {
        sizeMB: finalSize,
        swappiness,
        vfsCachePressure: cachePressure
      });
      toast.success(finalSize > 0 ? `Swap allocated: ${finalSize} MB` : 'Swap disabled');
      await loadStatus();
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || 'Failed to apply swap configuration');
      toast.error(e.message || 'Failed to configure swap');
    } finally {
      setSaving(false);
    }
  };

  const handleApplySystem = async () => {
    setSaving(true);
    setError(null);
    try {
      await configureSystem(serverId, {
        hostname: hostname.trim() !== data?.hostname ? hostname.trim() : undefined,
        timezone: timezone !== data?.timezone ? timezone : undefined,
        bbr: bbr !== data?.bbrEnabled ? bbr : undefined,
        optimizeLimits
      });
      toast.success(t('tuning.applySystem') + ' OK');
      await loadStatus();
      onSuccess?.();
    } catch (e: any) {
      setError(e.message || 'Failed to apply system settings');
      toast.error(e.message || 'Failed to configure system');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="metal relative flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
              <Settings2 className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('tuning.title')}</h3>
                <span className="rounded bg-[var(--muted)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted-foreground)]">
                  {serverName} ({serverHost})
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Tune Linux kernel parameters, swap file allocation, and network optimization over SSH
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => loadStatus()} disabled={loading || saving} className="h-8 w-8">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--line)] hover:text-[var(--foreground)]"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="border-b border-[var(--border)] bg-[var(--muted)]/40 px-5 py-2">
          <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 bg-[var(--background)]">
            <button
              type="button"
              onClick={() => setTab('swap')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1 text-xs font-medium transition-all ${
                tab === 'swap' ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              {t('tuning.tabSwap')}
              {data && (
                <span className={`h-1.5 w-1.5 rounded-full ${data.swap.totalMB > 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('system')}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1 text-xs font-medium transition-all ${
                tab === 'system' ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              {t('tuning.tabSystem')}
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {loading && !data ? (
            <div className="flex h-64 items-center justify-center text-[var(--muted-foreground)]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading system parameters...
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-400">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" /> Error
                  </div>
                  <p className="mt-0.5">{error}</p>
                </div>
              )}

              {/* TAB 1: SWAP MEMORY CONFIGURATION */}
              {tab === 'swap' && data && (
                <div className="space-y-5">
                  {/* Summary Status Banner */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="metal rounded-xl border border-[var(--border)] p-3.5">
                      <div className="text-[11px] text-[var(--muted-foreground)]">{t('tuning.currentSwap')}</div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-mono text-xl font-bold">
                          {data.swap.totalMB} MB
                        </span>
                        <span className={`text-[11px] font-medium ${data.swap.totalMB > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {data.swap.totalMB > 0 ? t('tuning.swapActive') : t('tuning.swapInactive')}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)]">
                        Used: {data.swap.usedMB} MB · Free: {data.swap.freeMB} MB
                      </div>
                    </div>

                    <div className="metal rounded-xl border border-[var(--border)] p-3.5">
                      <div className="text-[11px] text-[var(--muted-foreground)]">{t('tuning.swappiness')}</div>
                      <div className="mt-1 font-mono text-xl font-bold">
                        {data.swap.swappiness}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                        VFS Cache Pressure: {data.swap.vfsCachePressure}
                      </div>
                    </div>

                    <div className="metal rounded-xl border border-[var(--border)] p-3.5">
                      <div className="text-[11px] text-[var(--muted-foreground)]">Root Disk Free Space</div>
                      <div className="mt-1 font-mono text-xl font-bold text-emerald-400">
                        {data.swap.diskFreeMB} MB
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                        Available on `/` for swap allocation
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                    {t('tuning.swapDesc')}
                  </p>

                  {/* Size Presets */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                    <div className="font-medium text-[var(--foreground)]">{t('tuning.selectSize')}</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {SWAP_PRESETS.map((p) => {
                        const isSelected = !isCustomSize && selectedSizeMB === p.sizeMB;
                        return (
                          <button
                            key={p.sizeMB}
                            type="button"
                            onClick={() => {
                              setIsCustomSize(false);
                              setSelectedSizeMB(p.sizeMB);
                            }}
                            className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                              isSelected
                                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] ring-1 ring-[var(--primary)]'
                                : 'border-[var(--border)] hover:bg-[var(--muted)]/50'
                            }`}
                          >
                            <span className="font-mono text-sm font-semibold">{p.label}</span>
                            <span className="mt-1 text-[10px] text-[var(--muted-foreground)] leading-tight">{p.desc}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Size Toggle */}
                    <div className="pt-2 flex items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={isCustomSize}
                          onChange={(e) => setIsCustomSize(e.target.checked)}
                          className="rounded border-[var(--border)]"
                        />
                        <span>{t('tuning.customSize')}</span>
                      </label>
                      {isCustomSize && (
                        <Input
                          placeholder="e.g. 3072"
                          value={customSizeMB}
                          onChange={(e) => setCustomSizeMB(e.target.value.replace(/[^0-9]/g, ''))}
                          className="h-8 w-36 font-mono text-xs"
                        />
                      )}
                    </div>
                  </div>

                  {/* Kernel Swappiness Configuration */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-[var(--foreground)]">{t('tuning.swappiness')} (vm.swappiness = {swappiness})</span>
                        <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
                          {t('tuning.swappinessHelp')}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant={swappiness === 10 ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSwappiness(10)}
                          className="h-7 text-xs"
                        >
                          10 (SSD Recommended)
                        </Button>
                        <Button
                          type="button"
                          variant={swappiness === 60 ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSwappiness(60)}
                          className="h-7 text-xs"
                        >
                          60 (Default)
                        </Button>
                      </div>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={swappiness}
                      onChange={(e) => setSwappiness(Number(e.target.value))}
                      className="w-full accent-[var(--primary)]"
                    />
                  </div>

                  {/* Active Swaps on Server */}
                  {data.swap.activeSwaps.length > 0 && (
                    <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                      <div className="font-medium text-[var(--foreground)]">Active Swap Devices & Files</div>
                      <div className="divide-y divide-[var(--border)] font-mono text-[11px]">
                        {data.swap.activeSwaps.map((s) => (
                          <div key={s.filename} className="py-1.5 flex items-center justify-between">
                            <span className="text-[var(--foreground)]">{s.filename} ({s.type})</span>
                            <span className="text-[var(--muted-foreground)]">
                              {(s.sizeKB / 1024).toFixed(0)} MB · Priority: {s.priority}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleApplySwap}
                      disabled={saving}
                      className="gap-2"
                    >
                      {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
                      {t('tuning.applySwap')}
                    </Button>
                  </div>
                </div>
              )}

              {/* TAB 2: SYSTEM SETTINGS (TIMEZONE, HOSTNAME, BBR, LIMITS) */}
              {tab === 'system' && data && (
                <div className="space-y-5">
                  {/* Hostname Setting */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                      <Server className="h-4 w-4 text-[var(--accent)]" />
                      <span>{t('tuning.hostname')}</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Change the internal Linux system hostname (`hostnamectl set-hostname`).
                    </p>
                    <div className="flex gap-2 pt-1 max-w-md">
                      <Input
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        placeholder="e.g. prod-app-01"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Timezone Setting */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                      <Clock className="h-4 w-4 text-[var(--accent)]" />
                      <span>{t('tuning.timezone')}</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Current system timezone: <strong className="font-mono text-[var(--foreground)]">{data.timezone}</strong>
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-1">
                      {COMMON_TIMEZONES.map((tz) => (
                        <button
                          key={tz.value}
                          type="button"
                          onClick={() => setTimezone(tz.value)}
                          className={`flex items-center justify-between rounded-xl border p-2.5 text-left transition-all ${
                            timezone === tz.value
                              ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                              : 'border-[var(--border)] hover:bg-[var(--muted)]/50 text-[var(--foreground)]'
                          }`}
                        >
                          <span className="font-mono text-xs">{tz.label}</span>
                          {timezone === tz.value && <Check className="h-3.5 w-3.5" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* TCP BBR Congestion Control */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                        <Zap className="h-4 w-4 text-[var(--accent)]" />
                        <span>{t('tuning.bbr')}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        data.bbrEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {data.bbrEnabled ? t('tuning.bbrActive') : t('tuning.bbrInactive')}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">
                      {t('tuning.bbrDesc')}
                    </p>
                    <div className="pt-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={bbr}
                          onChange={(e) => setBbr(e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                        />
                        <span className="font-medium text-[var(--foreground)]">Enable Google BBR Congestion Control & FQ Queueing</span>
                      </label>
                    </div>
                  </div>

                  {/* System Limits & Concurrency */}
                  <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                      <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                      <span>{t('tuning.limits')}</span>
                    </div>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      {t('tuning.limitsDesc')}
                    </p>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="rounded-lg border border-[var(--border)] p-2.5 bg-[var(--muted)]/30 font-mono text-xs">
                        <span className="text-[var(--muted-foreground)]">fs.file-max: </span>
                        <span className="font-bold">{data.fileMax}</span>
                      </div>
                      <div className="rounded-lg border border-[var(--border)] p-2.5 bg-[var(--muted)]/30 font-mono text-xs">
                        <span className="text-[var(--muted-foreground)]">net.core.somaxconn: </span>
                        <span className="font-bold">{data.somaxconn}</span>
                      </div>
                    </div>
                    <div className="pt-2">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optimizeLimits}
                          onChange={(e) => setOptimizeLimits(e.target.checked)}
                          className="h-4 w-4 rounded border-[var(--border)] accent-[var(--primary)]"
                        />
                        <span className="font-medium text-[var(--foreground)]">
                          Set fs.file-max=2,097,152 and somaxconn=65,535 (Persistent in /etc/sysctl.d)
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleApplySystem}
                      disabled={saving}
                      className="gap-2"
                    >
                      {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t('tuning.applySystem')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

