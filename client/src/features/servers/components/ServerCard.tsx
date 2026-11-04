import React, { useState } from 'react';
import {
  Server,
  Terminal,
  Activity,
  RotateCcw,
  MoreHorizontal,
  Edit2,
  Trash2,
  Copy,
  Check,
  Cpu,
  Database,
  HardDrive,
  Clock,
  Layers,
  ChevronRight,
  FolderOpen,
  AlertTriangle,
  Globe
} from 'lucide-react';
import Sparkline from '@/features/servers/components/Sparkline';
import { fetchServerMetrics, HistoryPoint } from '@/features/servers/api';
import { ServerItem, ServerMetrics } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card, CardHeader, CardContent, CardFooter } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { useT } from '@/shared/i18n';

interface ServerCardProps {
  server: ServerItem;
  onOpenTerminal: (server: ServerItem) => void;
  onOpenProcesses: (server: ServerItem) => void;
  onManage: (server: ServerItem, initialTab?: 'overview' | 'webapps' | 'pm2' | 'services' | 'nginx' | 'ports' | 'terminal') => void;
  onEdit: (server: ServerItem) => void;
  onDelete: (id: string) => void;
  onMetricsUpdated?: (id: string, metrics: ServerMetrics) => void;
  onOpenFiles: (server: ServerItem) => void;
  history: HistoryPoint[];
  alerts: string[];
}

export default function ServerCard({
  server,
  onOpenTerminal,
  onManage,
  onEdit,
  onDelete,
  onMetricsUpdated,
  onOpenFiles,
  history,
  alerts
}: ServerCardProps) {
  const t = useT();
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const metrics = server.metrics;

  const handleRefreshMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const newMetrics = await fetchServerMetrics(server.id);
      if (onMetricsUpdated) {
        onMetricsUpdated(server.id, newMetrics);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMetrics(false);
    }
  };

  const copyHost = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${server.username}@${server.host} -p ${server.port || 22}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatMB = (mb?: number) => {
    if (!mb) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  return (
    <Card
      className={`flex flex-col justify-between transition-all duration-200 ${
        alerts.length ? 'border-red-500/60' : 'hover:border-[var(--muted-foreground)]/40'
      }`}
    >
      <div>
        {/* Card Header - Clickable to open management view */}
        <CardHeader className="p-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div
              className="flex items-start gap-3 cursor-pointer group/title flex-1"
              onClick={() => onManage(server, 'overview')}
            >
              <div className="p-2 rounded-lg bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] shrink-0 group-hover/title:border-[var(--muted-foreground)] transition">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-sm text-[var(--foreground)] tracking-tight flex items-center gap-1">
                    {server.name}
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover/title:opacity-100 group-hover/title:translate-x-0 transition" />
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[var(--muted-foreground)] font-mono text-xs">
                  <span className="sensitive">
                    {server.username}@{server.host}:{server.port || 22}
                  </span>
                  <button
                    onClick={copyHost}
                    title={t('serverCard.copySsh')}
                    className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Badge
                variant={
                  server.status === 'online'
                    ? 'success'
                    : server.status === 'offline'
                    ? 'destructive'
                    : 'secondary'
                }
                className="gap-1.5 font-normal"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    server.status === 'online'
                      ? 'bg-emerald-500'
                      : server.status === 'offline'
                      ? 'bg-red-500'
                      : 'bg-zinc-400'
                  }`}
                />
                {server.status || t('common.unknown')}
              </Badge>

              {/* Menu */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 mt-1 w-36 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl py-1 z-30 text-xs animate-in fade-in">
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onManage(server, 'overview');
                        }}
                        className="w-full px-3 py-1.5 text-left text-[var(--foreground)] hover:bg-[var(--muted)] flex items-center gap-2 transition"
                      >
                        <Activity className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {t('serverCard.manageNode')}
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onManage(server, 'webapps');
                        }}
                        className="w-full px-3 py-1.5 text-left text-[var(--foreground)] hover:bg-[var(--muted)] flex items-center gap-2 transition"
                      >
                        <Globe className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {t('serverCard.apps')}
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onEdit(server);
                        }}
                        className="w-full px-3 py-1.5 text-left text-[var(--foreground)] hover:bg-[var(--muted)] flex items-center gap-2 transition"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {t('serverCard.editServer')}
                      </button>
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onDelete(server.id);
                        }}
                        className="w-full px-3 py-1.5 text-left text-red-500 hover:bg-red-500/10 flex items-center gap-2 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {t('serverCard.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {alerts.length > 0 && (
            <div
              role="alert"
              className="mt-2.5 flex items-center gap-1.5 text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 rounded px-2 py-1"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" /> {alerts.join(' · ')}
            </div>
          )}

          {/* Meta & tags */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            {metrics?.os && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)] font-mono border border-[var(--border)]">
                {metrics.os}
              </span>
            )}
            {metrics?.uptime && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--muted)]/60 text-[var(--muted-foreground)] flex items-center gap-1 border border-[var(--border)]">
                <Clock className="w-2.5 h-2.5" /> {metrics.uptime}
              </span>
            )}
            {server.tags?.map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--muted)]/50 text-[var(--muted-foreground)] font-mono border border-[var(--border)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        </CardHeader>

        {/* Resource Usage Card Content */}
        <CardContent className="p-4 pt-1 space-y-3">
          <div className="bg-[var(--background)] rounded-lg p-3 border border-[var(--border)] space-y-2.5">
            {/* CPU */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--muted-foreground)] flex items-center gap-1.5 text-[11px]">
                  <Cpu className="w-3 h-3" /> CPU Usage
                  {metrics?.cpuCores && (
                    <span className="text-[var(--muted-foreground)] font-mono text-[10px]">
                      ({metrics.cpuCores}c · load {metrics.loadAverage?.[0] ?? 0})
                    </span>
                  )}
                </span>
                <span className="font-mono text-[var(--foreground)] text-xs font-semibold">
                  {metrics ? `${metrics.cpuUsagePercent}%` : '--'}
                </span>
              </div>
              <Progress
                value={metrics?.cpuUsagePercent || 0}
                indicatorClassName={
                  (metrics?.cpuUsagePercent || 0) > 80
                    ? 'bg-red-500'
                    : (metrics?.cpuUsagePercent || 0) > 50
                    ? 'bg-amber-500'
                    : 'bg-[var(--primary)]'
                }
              />
            </div>

            {/* RAM */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--muted-foreground)] flex items-center gap-1.5 text-[11px]">
                  <Database className="w-3 h-3" /> RAM Memory
                </span>
                <span className="font-mono text-[var(--foreground)] text-[11px]">
                  {metrics?.memory?.totalMB
                    ? `${formatMB(metrics.memory.usedMB)} / ${formatMB(metrics.memory.totalMB)} (${metrics.memory.usedPercent}%)`
                    : '--'}
                </span>
              </div>
              <Progress
                value={metrics?.memory?.usedPercent || 0}
                indicatorClassName={
                  (metrics?.memory?.usedPercent || 0) > 85
                    ? 'bg-red-500'
                    : (metrics?.memory?.usedPercent || 0) > 65
                    ? 'bg-amber-500'
                    : 'bg-[var(--primary)]'
                }
              />
            </div>

            {/* Disk */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-[var(--muted-foreground)] flex items-center gap-1.5 text-[11px]">
                  <HardDrive className="w-3 h-3" /> Storage (/)
                </span>
                <span className="font-mono text-[var(--foreground)] text-[11px]">
                  {metrics?.disk?.totalMB
                    ? `${formatMB(metrics.disk.usedMB)} / ${formatMB(metrics.disk.totalMB)} (${metrics.disk.usedPercent}%)`
                    : '--'}
                </span>
              </div>
              <Progress
                value={metrics?.disk?.usedPercent || 0}
                indicatorClassName={
                  (metrics?.disk?.usedPercent || 0) > 90
                    ? 'bg-red-500'
                    : (metrics?.disk?.usedPercent || 0) > 75
                    ? 'bg-amber-500'
                    : 'bg-[var(--primary)]'
                }
              />
            </div>

            <div className="pt-1.5 border-t border-[var(--border)]">
              <Sparkline
                points={history}
                currentMetrics={{
                  cpu: metrics?.cpuUsagePercent || 0,
                  mem: metrics?.memory?.usedPercent || 0,
                  disk: metrics?.disk?.usedPercent || 0
                }}
                height={42}
              />
            </div>

            {/* Swap & Docker footer indicators */}
            <div className="pt-1.5 flex items-center justify-between text-[10px] text-[var(--muted-foreground)] border-t border-[var(--border)] font-mono">
              <span>
                Swap:{' '}
                {metrics?.swap?.totalMB
                  ? `${metrics.swap.usedMB}/${metrics.swap.totalMB} MB (${metrics.swap.usedPercent}%)`
                  : 'None (0 MB)'}
              </span>
              {metrics?.docker?.installed && (
                <span className="flex items-center gap-1 text-[var(--foreground)]">
                  <Layers className="w-3 h-3 text-sky-500" /> {metrics.docker.runningContainers} containers
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </div>

      {/* Card Footer Actions */}
      <CardFooter className="p-4 pt-0 flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onManage(server, 'overview')}
          className="flex-1 gap-1.5 text-xs"
        >
          <Activity className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          {t('serverCard.manage')}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onManage(server, 'webapps')}
          className="gap-1.5 text-xs"
          title={t('serverCard.viewWebapps')}
        >
          <Globe className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
          /var/www
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenTerminal(server)}
          className="gap-1.5 text-xs"
        >
          <Terminal className="w-3.5 h-3.5" />
          SSH
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenFiles(server)}
          title={t('serverCard.fileManager')}
          className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefreshMetrics}
          disabled={loadingMetrics}
          title={t('serverCard.refreshMetrics')}
          className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin text-[var(--foreground)]' : ''}`} />
        </Button>
      </CardFooter>
    </Card>
  );
}
