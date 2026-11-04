import React, { useState, useLayoutEffect } from 'react';
import { swr } from '@/shared/lib/cache';
import {
  Layers,
  RotateCcw,
  RefreshCw,
  Play,
  Square,
  FileText,
  Zap
} from 'lucide-react';
import type { Pm2ProcessInfo, SupervisorProcessInfo } from '@/features/processes/types';
import { fetchPm2AndSupervisor, controlPm2, controlSupervisor } from '@/features/processes/api';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage, formatDurationMs } from './context';
import { useT } from '@/shared/i18n';

export default function Pm2Tab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [pm2List, setPm2List] = useState<Pm2ProcessInfo[]>([]);
  const [supervisorList, setSupervisorList] = useState<SupervisorProcessInfo[]>([]);
  const [loadingPm2, setLoadingPm2] = useState(false);
  const loadPm2Data = async (manual?: unknown) => {
    try {
      await swr(`pm2:${server.id}`, () => fetchPm2AndSupervisor(server.id), (res) => {
        setPm2List(res.pm2 || []);
        setSupervisorList(res.supervisor || []);
      }, setLoadingPm2, !!manual);
    } catch (e) {
      console.error(e);
    }
  };
  const handlePm2Control = async (target: string | number, action: 'restart' | 'stop' | 'start' | 'reload' | 'flush') => {
    try {
      await controlPm2(server.id, target, action);
      loadPm2Data();
    } catch (err: any) {
      ctx.setQuickActionOutput(`PM2 Error: ${err.message}`);
    }
  };
  const handleSupervisorControl = async (target: string, action: 'restart' | 'stop' | 'start') => {
    try {
      await controlSupervisor(server.id, target, action);
      loadPm2Data();
    } catch (err: any) {
      ctx.setQuickActionOutput(`Supervisor Error: ${err.message}`);
    }
  };

  // Layout effect: cached data is applied before the first paint, so there's no empty-state flash.
  useLayoutEffect(() => { loadPm2Data(); }, [server.id]);

  return (
    <>
      <div className="space-y-6">
        {/* PM2 Section */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" /> {t('pm2.title', { count: pm2List.length })}
              </h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('pm2.subtitle', { server: server.name })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadPm2Data} disabled={loadingPm2} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loadingPm2 ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>

          {loadingPm2 && pm2List.length === 0 ? (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <TableSkeleton
                rows={4}
                cols={9}
                colWidths={['w-10', 'w-1/4', 'w-20', 'w-16', 'w-16', 'w-16', 'w-16', 'w-20', 'w-24']}
              />
            </div>
          ) : pm2List.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--muted-foreground)]">
              {t('pm2.empty')}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3">{t('pm2.thId')}</th>
                    <th className="py-2 px-3">{t('pm2.thName')}</th>
                    <th className="py-2 px-3">{t('pm2.thStatus')}</th>
                    <th className="py-2 px-3">{t('pm2.thPid')}</th>
                    <th className="py-2 px-3">{t('pm2.thCpu')}</th>
                    <th className="py-2 px-3">{t('pm2.thRam')}</th>
                    <th className="py-2 px-3">{t('pm2.thRestarts')}</th>
                    <th className="py-2 px-3">{t('pm2.thUptime')}</th>
                    <th className="py-2 px-3 text-right">{t('pm2.thControl')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                  {pm2List.map((proc) => (
                    <tr key={proc.pm_id} className="hover:bg-[var(--muted)]/50 transition">
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{proc.pm_id}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[var(--foreground)]">{proc.name}</div>
                        {proc.cwd && <div className="text-[10px] text-[var(--muted-foreground)] sensitive">{proc.cwd}</div>}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={proc.status === 'online' ? 'success' : 'destructive'}
                          className="text-[10px] py-0 px-1.5 h-4"
                        >
                          {proc.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{proc.pid || '-'}</td>
                      <td className="py-2 px-3 text-[var(--foreground)]">{proc.cpu}%</td>
                      <td className="py-2 px-3 text-[var(--foreground)]">{proc.memoryMB} MB</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{proc.restarts}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{formatDurationMs(proc.uptimeMs)}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ctx.openLogs({ type: 'pm2', name: String(proc.pm_id) })}
                            className="h-6 px-2 text-[10px] gap-1"
                            title={t('pm2.viewLogs')}
                          >
                            <FileText className="w-3 h-3" /> {t('pm2.viewLogs')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePm2Control(proc.pm_id, 'restart')}
                            className="h-6 w-6"
                            title={t('pm2.restart')}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                          {proc.status === 'online' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePm2Control(proc.pm_id, 'stop')}
                              className="h-6 w-6 text-red-500"
                              title={t('pm2.stop')}
                            >
                              <Square className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handlePm2Control(proc.pm_id, 'start')}
                              className="h-6 w-6 text-emerald-500"
                              title={t('pm2.start')}
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
        </Card>

        {/* Supervisor Section */}
        <Card className="p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-500" /> {t('pm2.supervisorTitle', { count: supervisorList.length })}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('pm2.supervisorSubtitle')}
            </p>
          </div>

          {loadingPm2 && supervisorList.length === 0 ? (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <TableSkeleton
                rows={3}
                cols={5}
                colWidths={['w-1/3', 'w-20', 'w-16', 'w-24', 'w-28']}
              />
            </div>
          ) : supervisorList.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--muted-foreground)]">
              {t('pm2.supervisorEmpty')}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3">{t('pm2.thWorker')}</th>
                    <th className="py-2 px-3">{t('pm2.thStatus')}</th>
                    <th className="py-2 px-3">{t('pm2.thPid')}</th>
                    <th className="py-2 px-3">{t('pm2.thUptime')}</th>
                    <th className="py-2 px-3 text-right">{t('pm2.thControl')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                  {supervisorList.map((sup) => (
                    <tr key={sup.name} className="hover:bg-[var(--muted)]/50 transition">
                      <td className="py-2 px-3 font-semibold text-[var(--foreground)]">{sup.name}</td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={sup.status === 'RUNNING' ? 'success' : 'destructive'}
                          className="text-[10px] py-0 px-1.5 h-4"
                        >
                          {sup.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{sup.pid}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{sup.uptime}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ctx.openLogs({ type: 'supervisor', name: sup.name })}
                            className="h-6 px-2 text-[10px] gap-1"
                            title={t('pm2.viewLogs')}
                          >
                            <FileText className="w-3 h-3" /> {t('pm2.viewLogs')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSupervisorControl(sup.name, 'restart')}
                            className="h-6 w-6"
                            title={t('pm2.restart')}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                          {sup.status === 'RUNNING' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSupervisorControl(sup.name, 'stop')}
                              className="h-6 w-6 text-red-500"
                              title={t('pm2.stop')}
                            >
                              <Square className="w-3 h-3" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSupervisorControl(sup.name, 'start')}
                              className="h-6 w-6 text-emerald-500"
                              title={t('pm2.start')}
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
        </Card>
      </div>
    </>
  );
}
