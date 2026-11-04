import React, { useState, useLayoutEffect } from 'react';
import { swr } from '@/shared/lib/cache';
import {
  RefreshCw,
  Radio,
  ExternalLink,
  Shield,
  Network
} from 'lucide-react';
import type { ListeningPortInfo } from '@/features/webapps/types';
import { fetchListeningPorts } from '@/features/webapps/api';
import { killProcess } from '@/features/processes/api';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage } from './context';
import { useT } from '@/shared/i18n';

export default function PortsTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [portsList, setPortsList] = useState<ListeningPortInfo[]>([]);
  const [ufwStatus, setUfwStatus] = useState('');
  const [portsRaw, setPortsRaw] = useState('');
  const [showRawPorts, setShowRawPorts] = useState(false);
  const [portSearch, setPortSearch] = useState('');
  const [loadingPorts, setLoadingPorts] = useState(false);
  const loadPorts = async (manual?: unknown) => {
    try {
      await swr(`ports:${server.id}`, () => fetchListeningPorts(server.id), (res) => {
        setPortsList(res.ports || []);
        setUfwStatus(res.ufwStatus || '');
        setPortsRaw(res.raw || '');
      }, setLoadingPorts, !!manual);
    } catch (e) {
      console.error(e);
    }
  };
  const filteredPorts = portsList.filter((p) => {
    const q = portSearch.toLowerCase();
    return (
      p.port.toLowerCase().includes(q) ||
      p.process.toLowerCase().includes(q) ||
      p.localAddress.toLowerCase().includes(q) ||
      p.pid.includes(q)
    );
  });
  const handleKillProcess = async (pid: number | string, comm: string) => {
    if (!window.confirm(t('ports.killConfirm', { comm, pid }))) return;
    try {
      await killProcess(server.id, pid, 'kill');
      loadPorts();
    } catch (err: any) {
      ctx.setQuickActionOutput(`Kill Error: ${err.message}`);
    }
  };

  // Layout effect: cached data is applied before the first paint, so there's no empty-state flash.
  useLayoutEffect(() => { loadPorts(); }, [server.id]);

  return (
    <>
      <div className="space-y-4">
        <Card className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Radio className="w-4 h-4" /> {t('ports.title', { count: filteredPorts.length })}
              </h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('ports.subtitle', { server: server.name })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={portSearch}
                onChange={(e) => setPortSearch(e.target.value)}
                placeholder={t('ports.searchPlaceholder')}
                className="w-48 h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRawPorts(!showRawPorts)}
                className="text-xs h-8"
              >
                {showRawPorts ? t('ports.viewStructured') : t('ports.viewRaw')}
              </Button>
              <Button variant="outline" size="sm" onClick={loadPorts} disabled={loadingPorts} className="gap-1.5 h-8">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingPorts ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </Button>
            </div>
          </div>

          {ufwStatus && (
            <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--border)] flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                <Shield className="w-4 h-4 text-emerald-500" /> {t('ports.firewall')}
              </span>
              <span className="font-mono text-[var(--muted-foreground)] truncate max-w-xl">{ufwStatus}</span>
            </div>
          )}

          {showRawPorts ? (
            <div className="bg-[#09090b] border border-[var(--border)] rounded-lg p-3 font-mono text-xs text-zinc-200 overflow-x-auto max-h-[60vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap">{portsRaw || t('ports.scanning')}</pre>
            </div>
          ) : loadingPorts && portsList.length === 0 ? (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden">
              <TableSkeleton rows={6} cols={6} colWidths={['w-16', 'w-20', 'w-1/3', 'w-1/4', 'w-16', 'w-24']} />
            </div>
          ) : filteredPorts.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg">
              {t('ports.empty')}
            </div>
          ) : (
            <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3">{t('ports.thProto')}</th>
                    <th className="py-2 px-3">{t('ports.thPort')}</th>
                    <th className="py-2 px-3">{t('ports.thBind')}</th>
                    <th className="py-2 px-3">{t('ports.thProcess')}</th>
                    <th className="py-2 px-3">{t('ports.thPid')}</th>
                    <th className="py-2 px-3 text-right">{t('ports.thAction')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                  {filteredPorts.map((item, idx) => (
                    <tr key={`${item.proto}-${item.port}-${idx}`} className="hover:bg-[var(--muted)]/50 transition">
                      <td className="py-2 px-3 uppercase text-[var(--muted-foreground)]">{item.proto}</td>
                      <td className="py-2 px-3 font-semibold text-[var(--foreground)]">:{item.port}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)] sensitive">{item.localAddress}</td>
                      <td className="py-2 px-3 text-[var(--foreground)]">{item.process}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{item.pid}</td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {item.proto.startsWith('tcp') &&
                            !['22', '3306', '6379'].includes(item.port) &&
                            !item.localAddress.startsWith('127.') && (
                              <a
                                href={`http://${server.host}:${item.port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[10px] text-sky-500 hover:underline inline-flex items-center gap-1 font-sans"
                              >
                                {t('ports.open')} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          {item.pid !== '-' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleKillProcess(item.pid, item.process)}
                              className="h-5 px-1.5 text-[10px] font-sans"
                            >
                              {t('ports.killPid')}
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
