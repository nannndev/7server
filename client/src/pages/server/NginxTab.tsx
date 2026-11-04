import React, { useState, useLayoutEffect } from 'react';
import { swr } from '@/shared/lib/cache';
import {
  RefreshCw,
  ExternalLink,
  Server as ServerIcon,
  Edit2
} from 'lucide-react';
import type { NginxSiteInfo } from '@/features/webapps/types';
import { fetchNginxSites } from '@/features/webapps/api';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage } from './context';
import { useT } from '@/shared/i18n';

export default function NginxTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [nginxSites, setNginxSites] = useState<NginxSiteInfo[]>([]);
  const [nginxTestOutput, setNginxTestOutput] = useState('');
  const [loadingNginx, setLoadingNginx] = useState(false);
  const loadNginxData = async (manual?: unknown) => {
    try {
      await swr(`nginx:${server.id}`, () => fetchNginxSites(server.id), (res) => {
        setNginxSites(res.sites || []);
        setNginxTestOutput(res.configTest || '');
      }, setLoadingNginx, !!manual);
    } catch (e) {
      console.error(e);
    }
  };

  // Layout effect: cached data is applied before the first paint, so there's no empty-state flash.
  useLayoutEffect(() => { loadNginxData(); }, [server.id]);

  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <ServerIcon className="w-4 h-4" /> {t('nginx.title', { count: nginxSites.length })}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('nginx.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => ctx.runQuickAction('Test Nginx Config', 'nginx -t 2>&1')}
              className="gap-1.5 text-xs"
            >
              {t('nginx.testConfig')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => ctx.runQuickAction(t('nginx.reload'), 'nginx -t && systemctl reload nginx && echo "Nginx reloaded OK"')}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('nginx.reload')}
            </Button>
            <Button variant="ghost" size="sm" onClick={loadNginxData} disabled={loadingNginx} title={t('common.refresh')}>
              <RefreshCw className={`w-3.5 h-3.5 ${loadingNginx ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {nginxTestOutput && (
          <div
            className={`px-3 py-2 rounded-lg border text-xs font-mono ${
              nginxTestOutput.includes('successful')
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
          >
            {nginxTestOutput}
          </div>
        )}

        {loadingNginx && nginxSites.length === 0 ? (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <TableSkeleton rows={4} cols={5} colWidths={['w-1/4', 'w-1/3', 'w-1/4', 'w-20', 'w-24']} />
          </div>
        ) : nginxSites.length === 0 ? (
          <div className="py-12 text-center text-xs text-[var(--muted-foreground)] border border-[var(--border)] rounded-lg">
            {t('nginx.empty')}
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-3">{t('nginx.thVhost')}</th>
                  <th className="py-2.5 px-3">{t('nginx.thDomains')}</th>
                  <th className="py-2.5 px-3">{t('nginx.thRootProxy')}</th>
                  <th className="py-2.5 px-3">{t('nginx.thSsl')}</th>
                  <th className="py-2.5 px-3 text-right">{t('nginx.thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--card)] font-mono">
                {nginxSites.map((site) => (
                  <tr key={site.configPath} className="hover:bg-[var(--muted)]/50 transition">
                    <td className="py-2.5 px-3 font-semibold text-[var(--foreground)]">{site.name}</td>
                    <td className="py-2.5 px-3">
                      {site.domains.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {site.domains
                            .filter((d) => !d.startsWith('www.'))
                            .map((d) => (
                              <a
                                key={d}
                                href={`${site.ssl ? 'https' : 'http'}://${d}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sky-500 hover:underline"
                              >
                                <span className="sensitive">{d}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">{t('nginx.defaultIp')}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--muted-foreground)]">
                      {site.proxyPort ? (
                        <span className="text-amber-500">proxy → {site.proxyPort}</span>
                      ) : (
                        <span className="sensitive">{site.rootPath || '-'}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {site.ssl ? (
                        <Badge variant="success" className="text-[10px]">
                          SSL / 443
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          HTTP (80)
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => ctx.openFiles(undefined, site.configPath)}
                        className="h-6 px-2 text-[10px] gap-1 font-sans"
                      >
                        <Edit2 className="w-3 h-3" /> {t('nginx.editConfig')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
