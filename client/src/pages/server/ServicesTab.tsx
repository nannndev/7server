import React, { useState, useLayoutEffect } from 'react';
import { swr } from '@/shared/lib/cache';
import {
  Activity,
  Layers,
  RotateCcw,
  RefreshCw,
  Play,
  Square,
  FileText,
  Box
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import type { ProcessInfo, SystemService, DockerContainerInfo } from '@/features/processes/types';
import { fetchProcesses, fetchServices, killProcess, controlService } from '@/features/processes/api';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage } from './context';
import { useT } from '@/shared/i18n';

export default function ServicesTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [services, setServices] = useState<SystemService[]>([]);
  const [dockerContainers, setDockerContainers] = useState<DockerContainerInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'running' | 'failed'>('all');
  const loadServiceData = async (manual?: unknown) => {
    try {
      await swr(`services:${server.id}`, () => Promise.all([fetchProcesses(server.id), fetchServices(server.id)]), ([procData, srvData]) => {
        setProcesses(procData);
        setServices(srvData.services || []);
        setDockerContainers(srvData.dockerContainers || []);
      }, setLoadingDetails, !!manual);
    } catch (e) {
      console.error(e);
    }
  };
  const handleServiceControl = async (serviceName: string, action: string) => {
    try {
      await controlService(server.id, serviceName, action);
      loadServiceData();
    } catch (err: any) {
      ctx.setQuickActionOutput(`Service Error: ${err.message}`);
    }
  };
  const filteredProcesses = processes.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.comm?.toLowerCase().includes(q) ||
      p.user?.toLowerCase().includes(q) ||
      String(p.pid).includes(q)
    );
  });
  const filteredServices = services.filter((s) => {
    const q = searchQuery.toLowerCase();
    const match = s.unit.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    if (!match) return false;
    if (serviceFilter === 'running') return s.active === 'active';
    if (serviceFilter === 'failed') return s.active === 'failed';
    return true;
  });
  const handleKillProcess = async (pid: number | string, comm: string) => {
    if (!window.confirm(t('services.killConfirm', { comm, pid }))) return;
    try {
      await killProcess(server.id, pid, 'kill');
      loadServiceData();
    } catch (err: any) {
      ctx.setQuickActionOutput(`Kill Error: ${err.message}`);
    }
  };

  // Layout effect: cached data is applied before the first paint, so there's no empty-state flash.
  useLayoutEffect(() => { loadServiceData(); }, [server.id]);

  return (
    <>
      <Card className="p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="text"
              placeholder={t('services.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 h-8 text-xs"
            />
            <div className="flex items-center gap-1">
              {(['all', 'running', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setServiceFilter(st)}
                  className={`px-2.5 py-1 rounded text-[11px] capitalize transition ${
                    serviceFilter === st
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {st === 'all' ? t('services.filterAll') : st === 'running' ? t('services.filterRunning') : t('services.filterFailed')}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadServiceData}
            disabled={loadingDetails}
            className="gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingDetails ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {dockerContainers.length > 0 && (
          <button
            onClick={() => ctx.setActiveTab('docker')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[var(--border)] text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--muted-foreground)] transition"
          >
            <Box className="w-3.5 h-3.5" />
            {t('services.dockerNotice', { count: dockerContainers.length })}
            <span className="ml-auto" aria-hidden>→</span>
          </button>
        )}

        {/* System Services section */}
        <div>
          <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {t('services.systemdTitle', { count: filteredServices.length })}
          </h4>
          {loadingDetails && services.length === 0 ? (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <TableSkeleton rows={5} cols={4} colWidths={['w-1/3', 'w-20', 'w-1/2', 'w-28']} />
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg">
              {t('services.empty')}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto max-h-80">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)] sticky top-0">
                  <tr>
                    <th className="py-2 px-3">{t('services.thService')}</th>
                    <th className="py-2 px-3">{t('services.thStatus')}</th>
                    <th className="py-2 px-3">{t('services.thDescription')}</th>
                    <th className="py-2 px-3 text-right">{t('services.thControl')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--card)] font-mono text-xs">
                  {filteredServices.map((s) => (
                    <tr key={s.unit} className="hover:bg-[var(--muted)]/50 transition">
                      <td className="py-1.5 px-3 text-[var(--foreground)]"><span className="inline-flex items-center gap-1.5"><BrandIcon name={s.unit.replace(/\.service$/, '')} className="w-3.5 h-3.5" fallback={<span className="w-3.5" />} />{s.unit}</span></td>
                      <td className="py-1.5 px-3">
                        <Badge
                          variant={
                            s.active === 'active'
                              ? 'success'
                              : s.active === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px] py-0 px-1.5 h-4"
                        >
                          {s.active}
                        </Badge>
                      </td>
                      <td className="py-1.5 px-3 text-[var(--muted-foreground)] font-sans max-w-xs truncate">
                        {s.description}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ctx.openLogs({ type: 'service', name: s.unit })}
                            className="h-6 px-2 text-[10px] gap-1"
                            title="Journalctl Logs"
                          >
                            <FileText className="w-3 h-3" /> Logs
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleServiceControl(s.unit, 'restart')}
                            className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                            title="Restart"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                          {s.active === 'active' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleServiceControl(s.unit, 'stop')}
                              className="h-6 w-6 text-red-500 hover:text-red-600"
                              title="Stop"
                            >
                              <Square className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleServiceControl(s.unit, 'start')}
                              className="h-6 w-6 text-emerald-500 hover:text-emerald-600"
                              title="Start"
                            >
                              <Play className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Running processes section */}
        <div>
          <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {t('services.processesTitle', { count: filteredProcesses.length })}
          </h4>
          {loadingDetails && processes.length === 0 ? (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <TableSkeleton rows={6} cols={6} colWidths={['w-16', 'w-20', 'w-16', 'w-16', 'w-1/2', 'w-20']} />
            </div>
          ) : filteredProcesses.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg">
              {t('services.empty')}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)] sticky top-0">
                  <tr>
                    <th className="py-2 px-3">{t('services.thPid')}</th>
                    <th className="py-2 px-3">{t('services.thUser')}</th>
                    <th className="py-2 px-3">{t('services.thCpu')}</th>
                    <th className="py-2 px-3">{t('services.thRam')}</th>
                    <th className="py-2 px-3">{t('services.thCommand')}</th>
                    <th className="py-2 px-3 text-right">{t('services.thAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                  {filteredProcesses.map((p) => (
                    <tr key={p.pid} className="hover:bg-[var(--muted)]/50 transition">
                      <td className="py-1.5 px-3 text-[var(--muted-foreground)]">{p.pid}</td>
                      <td className="py-1.5 px-3 text-[var(--foreground)]">{p.user}</td>
                      <td className="py-1.5 px-3 font-semibold text-[var(--foreground)]">{p.cpu}%</td>
                      <td className="py-1.5 px-3 text-[var(--muted-foreground)]">{p.mem}%</td>
                      <td className="py-1.5 px-3 max-w-sm truncate text-[var(--foreground)]">
                        {p.comm} {p.args}
                      </td>
                      <td className="py-1.5 px-3 text-right">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleKillProcess(p.pid, p.comm)}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {t('services.kill')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
