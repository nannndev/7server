// Fleet overview: aggregate KPIs, search/tag/view bar, and the server list in the chosen view.
import React, { useState } from 'react';
import { Server, Plus, Search, Filter, LayoutGrid, Box as BoxIcon, Cpu, Database, HardDrive, Network, Activity, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';
import type { HistoryPoint } from '@/features/servers/api';
import type { FleetView, ServerTab } from '@/app/router';
import ServerCard from '@/features/servers/components/ServerCard';
import ServerRack from '@/features/servers/components/views/rack/ServerRack';
import TopologyVisualizer from '@/features/servers/components/views/TopologyVisualizer';
import CyberMatrixVisualizer from '@/features/servers/components/views/CyberMatrixVisualizer';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Card } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';
import { ServerCardSkeleton } from '@/shared/ui/skeleton';
import { useT } from '@/shared/i18n';

interface FleetPageProps {
  servers: ServerItem[];
  loading: boolean;
  history: Record<string, HistoryPoint[]>;
  view: FleetView;
  setView: (v: FleetView) => void;
  alertsFor: (s: ServerItem) => string[];
  openManageServer: (s: ServerItem, tab?: ServerTab) => void;
  onAddServer: () => void;
  onEditServer: (s: ServerItem) => void;
  onDeleteServer: (id: string) => void;
  onMetricsUpdated: (id: string, m: ServerMetrics) => void;
  setTerminalServer: (s: ServerItem) => void;
  setProcessServer: (s: ServerItem) => void;
  setFilesServer: (s: ServerItem) => void;
  onReorder?: (ids: string[]) => void;
}

const formatGB = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

export default function FleetPage(p: FleetPageProps) {
  const { servers, loading, history, view, setView, alertsFor, openManageServer, setTerminalServer, setProcessServer, setFilesServer, onMetricsUpdated } = p;
  const [searchQuery, setSearchQuery] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const t = useT();
  const [selectedTag, setSelectedTag] = useState('ALL');

  const moveFleetServer = (index: number, direction: 'left' | 'right') => {
    if (!p.onReorder) return;
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= p.servers.length) return;
    const next = [...p.servers];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    p.onReorder(next.map((s) => s.id));
  };

  const allTags = Array.from(new Set(servers.flatMap((s) => s.tags || []).filter(Boolean)));
  const filteredServers = servers.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = s.name?.toLowerCase().includes(q) || s.host?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
    const matchesTag = selectedTag === 'ALL' || (s.tags && s.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  const totalServers = servers.length;
  const onlineServers = servers.filter((s) => s.status === 'online').length;
  const offlineServers = servers.filter((s) => s.status === 'offline').length;
  const withMetrics = servers.filter((s) => s.metrics);
  const totalCores = withMetrics.reduce((acc, s) => acc + (s.metrics?.cpuCores || 0), 0);
  const avgCpu = withMetrics.length ? Math.round(withMetrics.reduce((acc, s) => acc + (s.metrics?.cpuUsagePercent || 0), 0) / withMetrics.length) : 0;
  const totalRamUsedMB = withMetrics.reduce((acc, s) => acc + (s.metrics?.memory?.usedMB || 0), 0);
  const totalRamCapMB = withMetrics.reduce((acc, s) => acc + (s.metrics?.memory?.totalMB || 0), 0);
  const fleetRamPct = totalRamCapMB > 0 ? Math.round((totalRamUsedMB / totalRamCapMB) * 100) : 0;
  const totalDiskUsedMB = withMetrics.reduce((acc, s) => acc + (s.metrics?.disk?.usedMB || 0), 0);
  const totalDiskCapMB = withMetrics.reduce((acc, s) => acc + (s.metrics?.disk?.totalMB || 0), 0);
  const fleetDiskPct = totalDiskCapMB > 0 ? Math.round((totalDiskUsedMB / totalDiskCapMB) * 100) : 0;

  const handleDeleteServer = p.onDeleteServer;
  const handleMetricsUpdated = onMetricsUpdated;

  return (
    <>
        {/* Metric Overview Cards */}
        {servers.length > 0 && (
          <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
              <div className="flex items-center justify-between text-[var(--muted-foreground)] text-xs">
                <span>{t('fleet.totalNodes')}</span>
                <Server className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold tracking-tight mt-1 font-mono">{totalServers}</div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                {t('fleet.onlineOffline', { online: onlineServers, offline: offlineServers })}
              </div>
            </Card>

            <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
              <div className="flex items-center justify-between text-[var(--muted-foreground)] text-xs">
                <span>{t('fleet.cpu', { cores: totalCores })}</span>
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <div className="text-2xl font-bold tracking-tight mt-1 font-mono">{avgCpu}%</div>
              <Progress value={avgCpu} className="mt-2 h-1" />
            </Card>

            <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
              <div className="flex items-center justify-between text-[var(--muted-foreground)] text-xs">
                <span>{t('fleet.ram', { pct: fleetRamPct })}</span>
                <Database className="w-3.5 h-3.5" />
              </div>
              <div className="text-lg font-bold tracking-tight mt-1 font-mono">
                {formatGB(totalRamUsedMB)} / {formatGB(totalRamCapMB)}
              </div>
              <Progress value={fleetRamPct} className="mt-2 h-1" />
            </Card>

            <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
              <div className="flex items-center justify-between text-[var(--muted-foreground)] text-xs">
                <span>{t('fleet.storage', { pct: fleetDiskPct })}</span>
                <HardDrive className="w-3.5 h-3.5" />
              </div>
              <div className="text-lg font-bold tracking-tight mt-1 font-mono">
                {formatGB(totalDiskUsedMB)} / {formatGB(totalDiskCapMB)}
              </div>
              <Progress value={fleetDiskPct} className="mt-2 h-1" />
            </Card>
          </div>
        )}

        {/* Search & Tag Filter Bar */}
        {servers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--card)] p-2.5 rounded-xl border border-[var(--border)]">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                type="text"
                placeholder={t('fleet.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-xs bg-[var(--background)] border-[var(--border)]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              <div
                className="flex rounded-md border border-[var(--border)] mr-2 shrink-0"
                role="group"
                aria-label={t('view.label')}
              >
                {(
                  [
                    ['grid', LayoutGrid, t('view.grid')],
                    ['rack', BoxIcon, t('view.rack')],
                    ['topology', Network, t('view.topology')],
                    ['matrix', Activity, t('view.matrix')]
                  ] as const
                ).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={`px-2 py-1 text-[11px] flex items-center gap-1 transition ${view === v
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                  >
                    <Icon className="w-3 h-3" /> {label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-[var(--muted-foreground)] flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> {t('fleet.tags')}
              </span>
              <button
                onClick={() => setSelectedTag('ALL')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${selectedTag === 'ALL'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                  }`}
              >
                {t('common.all')}
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition ${selectedTag === tag
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
                    }`}
                >
                  #{tag}
                </button>
              ))}

              {p.onReorder && p.servers.length > 1 && view === 'grid' && (
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={`ml-auto px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1.5 border ${
                    reorderMode
                      ? 'bg-primary text-primary-foreground border-transparent shadow-sm'
                      : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                  }`}
                  title={reorderMode ? t('server.doneReordering') : t('server.reorder')}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{reorderMode ? t('server.doneReordering') : t('server.reorder')}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Server Cards Grid */}
        {loading ? (
          <div role="status" aria-label={t('fleet.loading')} className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => <ServerCardSkeleton key={i} />)}
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-20 bg-[var(--card)] border border-dashed border-[var(--border)] rounded-xl p-8 max-w-md mx-auto">
            <div className="w-12 h-12 bg-[var(--muted)] rounded-xl flex items-center justify-center mx-auto mb-4 border border-[var(--border)]">
              <Server className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-sm mb-1">
              {servers.length === 0 ? t('fleet.emptyTitle') : t('fleet.noMatchTitle')}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] max-w-xs mx-auto mb-5 leading-relaxed">
              {servers.length === 0
                ? t('fleet.emptyBody')
                : t('fleet.noMatchBody')}
            </p>
            {servers.length === 0 && (
              <Button
                variant="default"
                size="sm"
                onClick={p.onAddServer}
                className="gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('fleet.addFirst')}
              </Button>
            )}
          </div>
        ) : view === 'rack' ? (
          <ServerRack
            servers={filteredServers}
            alertsFor={(s) => alertsFor(s)}
            onManage={(s, tab) => openManageServer(s, tab || 'overview')}
            onOpenTerminal={(s) => openManageServer(s, 'terminal')}
            onOpenFiles={(s) => setFilesServer(s)}
          />
        ) : view === 'topology' ? (
          <TopologyVisualizer
            servers={filteredServers}
            onSelectServer={(s) => openManageServer(s, 'overview')}
            onOpenTerminal={(s) => openManageServer(s, 'terminal')}
          />
        ) : view === 'matrix' ? (
          <CyberMatrixVisualizer
            servers={filteredServers}
            onManage={(s, tab) => openManageServer(s, tab || 'overview')}
            onOpenTerminal={(s) => openManageServer(s, 'terminal')}
          />
        ) : (
          <div key={`${view}:${selectedTag}`} className="stagger grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {filteredServers.map((server, idx) => (
              <div key={server.id} className="relative group/reorder">
                {reorderMode && (
                  <div className="absolute top-3 right-12 z-20 flex items-center gap-1 bg-[var(--card)]/95 backdrop-blur-sm border border-[var(--border)] rounded-lg p-1 shadow-md">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={(e) => { e.stopPropagation(); moveFleetServer(idx, 'left'); }}
                      className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-20 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      title={t('server.moveLeft')}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] font-mono font-bold px-1 text-[var(--muted-foreground)]">#{idx + 1}</span>
                    <button
                      type="button"
                      disabled={idx === filteredServers.length - 1}
                      onClick={(e) => { e.stopPropagation(); moveFleetServer(idx, 'right'); }}
                      className="p-1 rounded hover:bg-[var(--muted)] disabled:opacity-20 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      title={t('server.moveRight')}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <ServerCard
                  server={server}
                  onManage={(s, tab) => openManageServer(s, tab || 'overview')}
                  onOpenTerminal={(s) => openManageServer(s, 'terminal')}
                  onOpenProcesses={(s) => setProcessServer(s)}
                  onEdit={p.onEditServer}
                  onDelete={handleDeleteServer}
                  onMetricsUpdated={handleMetricsUpdated}
                  onOpenFiles={(s) => setFilesServer(s)}
                  history={history[server.id] || []}
                  alerts={alertsFor(server)}
                />
              </div>
            ))}
          </div>
        )}
    </>
  );
}
