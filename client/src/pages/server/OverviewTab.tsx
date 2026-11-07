import React, { useState } from 'react';
import {
  Activity,
  Layers,
  RefreshCw,
  Power,
  Cpu,
  Database,
  HardDrive,
  FileText,
  Send,
  Network,
  Sliders,
  Settings2
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { Input } from '@/shared/ui/input';
import TelemetryChart from '@/features/servers/components/TelemetryChart';
import { VpsTuningModal } from '@/features/servers/components/VpsTuningModal';
import { useServerPage, formatMB } from './context';
import { useT } from '@/shared/i18n';
import { OverviewGaugesSkeleton } from '@/shared/ui/skeleton';

export default function OverviewTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const metrics = server.metrics;
  const [customCmd, setCustomCmd] = useState('');
  const [tuningModal, setTuningModal] = useState<{ open: boolean; tab: 'swap' | 'system' }>({
    open: false,
    tab: 'swap'
  });

  if (!metrics) {
    return <OverviewGaugesSkeleton />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Top Live Gauges (4 cards: CPU, RAM, Swap, Disk) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CPU */}
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-2">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4" /> {t('overview.cpuLoad')}
              </span>
              <span className="font-mono text-[var(--foreground)] text-sm font-semibold">
                {metrics?.cpuUsagePercent ?? 0}%
              </span>
            </div>
            <Progress
              value={metrics?.cpuUsagePercent ?? 0}
              indicatorClassName={
                (metrics?.cpuUsagePercent ?? 0) > 80
                  ? 'bg-red-500'
                  : (metrics?.cpuUsagePercent ?? 0) > 50
                  ? 'bg-amber-500'
                  : 'bg-[var(--primary)]'
              }
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)] font-mono mt-2">
              <span>{metrics?.cpuCores || 1} vCPU</span>
              <span>Load: {metrics?.loadAverage?.join(', ') || '0, 0, 0'}</span>
            </div>
          </Card>

          {/* RAM */}
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-2">
              <span className="flex items-center gap-1.5">
                <Database className="w-4 h-4" /> {t('overview.ram')}
              </span>
              <span className="font-mono text-[var(--foreground)] text-sm font-semibold">
                {metrics?.memory?.usedPercent ?? 0}%
              </span>
            </div>
            <Progress
              value={metrics?.memory?.usedPercent ?? 0}
              indicatorClassName={
                (metrics?.memory?.usedPercent ?? 0) > 85
                  ? 'bg-red-500'
                  : (metrics?.memory?.usedPercent ?? 0) > 65
                  ? 'bg-amber-500'
                  : 'bg-[var(--primary)]'
              }
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)] font-mono mt-2">
              <span>{t('overview.used', { val: formatMB(metrics?.memory?.usedMB) })}</span>
              <span>{t('overview.total', { val: formatMB(metrics?.memory?.totalMB) })}</span>
            </div>
          </Card>

          {/* SWAP (Interactive with VPS Tuning Modal) */}
          <Card
            className="p-4 transition-all hover:border-[var(--primary)]/60 cursor-pointer group"
            onClick={() => setTuningModal({ open: true, tab: 'swap' })}
          >
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-2">
              <span className="flex items-center gap-1.5 group-hover:text-[var(--foreground)] transition-colors">
                <Layers className="w-4 h-4 text-[var(--accent)]" /> {t('overview.swap')}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[var(--foreground)] text-sm font-semibold">
                  {metrics?.swap?.totalMB ? `${metrics.swap.usedPercent}%` : '0 MB'}
                </span>
                <span className="rounded border border-[var(--border)] px-1.5 py-0.2 text-[9px] font-mono text-[var(--muted-foreground)] group-hover:border-[var(--primary)] group-hover:text-[var(--primary)] transition-colors">
                  {t('overview.configSwap')}
                </span>
              </div>
            </div>
            <Progress
              value={metrics?.swap?.usedPercent ?? 0}
              indicatorClassName={
                (metrics?.swap?.usedPercent ?? 0) > 85
                  ? 'bg-red-500'
                  : (metrics?.swap?.usedPercent ?? 0) > 50
                  ? 'bg-amber-500'
                  : 'bg-[var(--primary)]'
              }
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)] font-mono mt-2">
              {metrics?.swap?.totalMB ? (
                <>
                  <span>{t('overview.used', { val: formatMB(metrics.swap.usedMB) })}</span>
                  <span>{t('overview.total', { val: formatMB(metrics.swap.totalMB) })}</span>
                </>
              ) : (
                <span className="text-amber-500 font-medium flex items-center gap-1">
                  {t('overview.swapNotConfigured')} →
                </span>
              )}
            </div>
          </Card>

          {/* Disk */}
          <Card className="p-4">
            <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-2">
              <span className="flex items-center gap-1.5">
                <HardDrive className="w-4 h-4" /> {t('overview.disk')}
              </span>
              <span className="font-mono text-[var(--foreground)] text-sm font-semibold">
                {metrics?.disk?.usedPercent ?? 0}%
              </span>
            </div>
            <Progress
              value={metrics?.disk?.usedPercent ?? 0}
              indicatorClassName={
                (metrics?.disk?.usedPercent ?? 0) > 90
                  ? 'bg-red-500'
                  : (metrics?.disk?.usedPercent ?? 0) > 75
                  ? 'bg-amber-500'
                  : 'bg-[var(--primary)]'
              }
            />
            <div className="flex justify-between text-[11px] text-[var(--muted-foreground)] font-mono mt-2">
              <span>{t('overview.used', { val: formatMB(metrics?.disk?.usedMB) })}</span>
              <span>{t('overview.free', { val: formatMB(metrics?.disk?.freeMB) })}</span>
            </div>
          </Card>
        </div>

        {/* System Identity & Quick Operations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                {t('overview.systemInfo')}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 text-[11px]"
                onClick={() => setTuningModal({ open: true, tab: 'system' })}
              >
                <Settings2 className="w-3 h-3 text-[var(--accent)]" /> {t('overview.vpsTuning')}
              </Button>
            </div>
            <div className="divide-y divide-[var(--border)] text-xs font-mono">
              <div className="py-2 flex justify-between">
                <span className="text-[var(--muted-foreground)] font-sans">{t('overview.hostname')}</span>
                <span className="text-[var(--foreground)] sensitive">{metrics?.hostname || server.name}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--muted-foreground)] font-sans">{t('overview.os')}</span>
                <span className="text-[var(--foreground)] inline-flex items-center gap-1.5"><BrandIcon name={metrics?.os || 'Linux'} className="w-3.5 h-3.5" />{metrics?.os || 'Linux'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--muted-foreground)] font-sans">{t('overview.kernel')}</span>
                <span className="text-[var(--foreground)]">{metrics?.kernel || '--'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--muted-foreground)] font-sans">{t('overview.uptime')}</span>
                <span className="text-[var(--foreground)]">{metrics?.uptime || '--'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-[var(--muted-foreground)] font-sans">{t('overview.docker')}</span>
                <span className="text-[var(--foreground)]">
                  {metrics?.docker?.installed
                    ? t('overview.dockerActive', {
                        running: metrics.docker.runningContainers,
                        total: metrics.docker.totalContainers
                      })
                    : t('overview.notInstalled')}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('overview.quickActions')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTuningModal({ open: true, tab: 'swap' })}
                className="text-xs justify-start gap-2 h-8"
              >
                <Sliders className="w-3.5 h-3.5 text-[var(--accent)]" />
                {t('overview.vpsTuning')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!!ctx.quickActionRunning}
                onClick={() => ctx.runQuickAction(t('overview.reloadNginx'), 'nginx -t 2>&1 && { systemctl reload nginx 2>/dev/null || nginx -s reload; } && echo "Nginx reloaded OK"', { sudo: true })}
                className="text-xs justify-start gap-2 h-8"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t('overview.reloadNginx')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!!ctx.quickActionRunning}
                onClick={() => ctx.runQuickAction(t('overview.clearRamCache'), 'sync; echo 3 > /proc/sys/vm/drop_caches && free -m', { sudo: true })}
                className="text-xs justify-start gap-2 h-8"
              >
                <Database className="w-3.5 h-3.5" />
                {t('overview.clearRamCache')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!!ctx.quickActionRunning}
                onClick={() => ctx.runQuickAction(t('overview.diskLogSize'), 'df -h && echo "--- Top /var/log ---" && du -sh /var/log/* 2>/dev/null | sort -hr | head -n 8')}
                className="text-xs justify-start gap-2 h-8"
              >
                <HardDrive className="w-3.5 h-3.5" />
                {t('overview.diskLogSize')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={!!ctx.quickActionRunning}
                onClick={() => ctx.runQuickAction(t('overview.trimLogs'), 'journalctl --vacuum-size=100M 2>&1', { sudo: true })}
                className="text-xs justify-start gap-2 h-8"
              >
                <FileText className="w-3.5 h-3.5" />
                {t('overview.trimLogs')}
              </Button>

              <Button
                variant="destructive"
                size="sm"
                disabled={!!ctx.quickActionRunning}
                onClick={() => ctx.runQuickAction(t('overview.rebootNode'), 'reboot', { sudo: true })}
                className="text-xs justify-start gap-2 h-8"
              >
                <Power className="w-3.5 h-3.5" />
                {t('overview.rebootNode')}
              </Button>
            </div>

            {/* Quick 1-liner command input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customCmd.trim()) return;
                ctx.runQuickAction(customCmd, customCmd);
              }}
              className="pt-2 flex gap-1.5"
            >
              <Input
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder={t('overview.quickCmdPlaceholder')}
                className="h-8 text-xs font-mono"
              />
              <Button type="submit" size="sm" disabled={!!ctx.quickActionRunning || !customCmd.trim()} className="h-8 gap-1">
                <Send className="w-3 h-3" /> {t('overview.run')}
              </Button>
            </form>
          </Card>
        </div>

        {/* Real-Time Telemetry Area Chart */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('overview.telemetryTitle')}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => ctx.setActiveTab('topology')} className="h-7 text-xs gap-1.5 text-sky-400">
              <Network className="w-3.5 h-3.5" /> {t('overview.openTopology')}
            </Button>
          </div>
          <TelemetryChart points={ctx.history} thresholds={ctx.thresholds} height={220} />
        </Card>
      </div>

      {/* VPS System & Swap Tuning Modal */}
      <VpsTuningModal
        serverId={server.id}
        serverName={server.name}
        serverHost={server.host}
        isOpen={tuningModal.open}
        initialTab={tuningModal.tab}
        onClose={() => setTuningModal((prev) => ({ ...prev, open: false }))}
        onSuccess={() => ctx.refreshMetrics()}
      />
    </>
  );
}
