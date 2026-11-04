import React, { useState, useLayoutEffect } from 'react';
import { swr } from '@/shared/lib/cache';
import {
  Terminal as TermIcon,
  RefreshCw,
  Globe,
  FolderGit2,
  ExternalLink,
  FileCode,
  FolderOpen,
  GitPullRequest,
  Wrench,
  ChevronDown
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import type { WebAppInfo } from '@/features/webapps/types';
import { fetchWebApps } from '@/features/webapps/api';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage, sq } from './context';
import { useT } from '@/shared/i18n';

export default function WebAppsTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [webApps, setWebApps] = useState<WebAppInfo[]>([]);
  const [loadingWebApps, setLoadingWebApps] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [appTypeFilter, setAppTypeFilter] = useState<string>('ALL');
  const [appMenu, setAppMenu] = useState<string | null>(null);
  const appActions = (app: WebAppInfo) => {
    const cd = `cd ${sq(app.path)} && `;
    const list: { label: string; cmd: string; confirm?: boolean }[] = [];
    if (app.gitBranch) {
      list.push({ label: t('webapps.gitStatusLog'), cmd: `${cd}git status -sb && echo "---" && git log --oneline -5` });
      list.push({ label: t('webapps.gitPull'), cmd: `${cd}git pull 2>&1`, confirm: true });
    }
    if (app.type.includes('Laravel')) {
      list.push({ label: t('webapps.laravelLog'), cmd: `${cd}tail -n 100 storage/logs/laravel.log 2>&1` });
      list.push({ label: t('webapps.artisanClear'), cmd: `${cd}php artisan optimize:clear 2>&1`, confirm: true });
      list.push({ label: t('webapps.artisanMigrate'), cmd: `${cd}php artisan migrate:status 2>&1` });
    }
    if (app.type.includes('Node')) {
      list.push({ label: t('webapps.npmBuild'), cmd: `${cd}npm run build 2>&1 | tail -n 40`, confirm: true });
    }
    list.push({ label: t('webapps.folderSize'), cmd: `du -sh ${sq(app.path)} 2>&1` });
    return list;
  };
  const runAppAction = (app: WebAppInfo, a: { label: string; cmd: string; confirm?: boolean }) => {
    setAppMenu(null);
    if (a.confirm && !window.confirm(t('webapps.confirmRun', { label: a.label, path: app.path }))) return;
    ctx.runQuickAction(`${app.name}: ${a.label}`, a.cmd);
  };
  const loadWebAppsData = async (manual?: unknown) => {
    try {
      await swr(`webapps:${server.id}`, () => fetchWebApps(server.id), setWebApps, setLoadingWebApps, !!manual);
    } catch (e) {
      console.error(e);
    }
  };
  const filteredApps = webApps.filter((a) => {
    if (appTypeFilter !== 'ALL' && !a.type.toLowerCase().includes(appTypeFilter.toLowerCase())) {
      return false;
    }
    const q = appSearchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      (a.domain && a.domain.toLowerCase().includes(q)) ||
      (a.ports && a.ports.toLowerCase().includes(q))
    );
  });

  // Layout effect: cached data is applied before the first paint, so there's no empty-state flash.
  useLayoutEffect(() => { loadWebAppsData(); }, [server.id]);

  return (
    <>
      <Card className="p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Globe className="w-4 h-4" /> {t('webapps.title')}
              <Badge variant="secondary" className="text-[10px]">
                {t('webapps.projectCount', { filtered: filteredApps.length, total: webApps.length })}
              </Badge>
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('webapps.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="text"
              placeholder={t('webapps.searchPlaceholder')}
              value={appSearchQuery}
              onChange={(e) => setAppSearchQuery(e.target.value)}
              className="w-56 h-8 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={loadWebAppsData}
              disabled={loadingWebApps}
              className="gap-1.5 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingWebApps ? 'animate-spin' : ''}`} />
              <span>{t('webapps.rescan')}</span>
            </Button>
          </div>
        </div>

        {/* Framework Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { key: 'ALL', label: t('webapps.filterAll', { n: webApps.length }) },
            { key: 'Laravel', label: t('webapps.filterLaravel', { n: webApps.filter((a) => a.type.includes('Laravel')).length }) },
            { key: 'Node', label: t('webapps.filterNode', { n: webApps.filter((a) => a.type.includes('Node')).length }) },
            { key: 'Frontend', label: t('webapps.filterFrontend', { n: webApps.filter((a) => a.type.includes('Frontend')).length }) },
            { key: 'Web App', label: t('webapps.filterOther', { n: webApps.filter((a) => a.type === 'Web App' || a.type.includes('PHP Application')).length }) }
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setAppTypeFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition border ${
                appTypeFilter === f.key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loadingWebApps && webApps.length === 0 ? (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)] px-3 py-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold">{t('webapps.scanning')}</span>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            </div>
            <TableSkeleton rows={5} cols={6} colWidths={['w-1/3', 'w-20', 'w-1/4', 'w-20', 'w-24', 'w-28']} />
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted-foreground)] space-y-1">
            <FolderGit2 className="w-8 h-8 mx-auto opacity-30" />
            <p className="text-xs font-semibold">{t('webapps.noMatches')}</p>
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-3">{t('webapps.thProject')}</th>
                  <th className="py-2.5 px-3">{t('webapps.thFramework')}</th>
                  <th className="py-2.5 px-3">{t('webapps.thDomainPort')}</th>
                  <th className="py-2.5 px-3">{t('webapps.thGitBranch')}</th>
                  <th className="py-2.5 px-3">{t('webapps.thModified')}</th>
                  <th className="py-2.5 px-3 text-right">{t('webapps.thActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                {filteredApps.map((app) => (
                  <tr key={app.path} className="hover:bg-[var(--muted)]/50 transition">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
                        <div>
                          <span className="font-semibold text-[var(--foreground)]">{app.name}</span>
                          <div className="text-[10px] text-[var(--muted-foreground)] font-mono sensitive">{app.path}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={
                          app.type.includes('Laravel')
                            ? 'destructive'
                            : app.type.includes('Node')
                            ? 'success'
                            : app.type.includes('SPA')
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-[10px] gap-1"
                      >
                        <BrandIcon name={app.type} mono className="w-3 h-3" />
                        {app.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      {app.domain || app.ports ? (
                        <div className="flex flex-col gap-0.5 font-mono text-[11px]">
                          {(app.domain || '')
                            .split(',')
                            .filter(Boolean)
                            .filter((d) => !d.startsWith('www.'))
                            .map((d) => (
                              <a
                                key={d}
                                href={`http://${d}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sky-500 hover:underline"
                              >
                                <span className="sensitive">{d}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          {app.ports && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {app.ports.split(',').map((p) => (
                                <a
                                  key={p}
                                  href={`http://${server.host}:${p}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-1.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] hover:underline"
                                >
                                  :{p}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)] italic font-mono text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {app.gitBranch ? (
                        <span className="inline-flex items-center gap-1 text-[var(--foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                          <FolderGit2 className="w-3 h-3 text-[var(--muted-foreground)]" />
                          {app.gitBranch}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--muted-foreground)] font-mono text-[11px]">
                      {app.modified || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => ctx.openFiles(app.path)}
                          className="h-6 px-2 text-[10px] gap-1"
                          title={t('webapps.openFolder')}
                        >
                          <FolderOpen className="w-3 h-3" />
                          {t('common.files')}
                        </Button>

                        {(app.type.includes('Laravel') || app.type.includes('Node')) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => ctx.openFiles(app.path, `${app.path}/.env`)}
                            className="h-6 px-2 text-[10px] gap-1 font-mono"
                            title={t('webapps.editEnv')}
                          >
                            .env
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            ctx.openTerminal(`cd ${sq(app.path)}`);
                          }}
                          className="h-6 px-2 text-[10px] gap-1"
                          title={t('webapps.openTerminal')}
                        >
                          <TermIcon className="w-3 h-3" />
                          SSH
                        </Button>

                        <div className="relative">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAppMenu(appMenu === app.path ? null : app.path)}
                            disabled={!!ctx.quickActionRunning}
                            className="h-6 px-2 text-[10px] gap-1"
                          >
                            <Wrench className="w-3 h-3" />
                            {ctx.quickActionRunning?.startsWith(`${app.name}:`) ? t('webapps.running') : t('webapps.actions')}
                            <ChevronDown className="w-3 h-3" />
                          </Button>
                          {appMenu === app.path && (
                            <>
                              <div className="fixed inset-0 z-20" onClick={() => setAppMenu(null)} />
                              <div className="absolute right-0 mt-1 w-52 z-30 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl py-1 text-left">
                                {appActions(app).map((a) => (
                                  <button
                                    key={a.label}
                                    onClick={() => runAppAction(app, a)}
                                    className="w-full px-3 py-1.5 text-[11px] text-left text-[var(--foreground)] hover:bg-[var(--muted)] flex items-center gap-2"
                                  >
                                    {a.label.startsWith('Git') ? (
                                      <GitPullRequest className="w-3 h-3" />
                                    ) : (
                                      <TermIcon className="w-3 h-3" />
                                    )}
                                    {a.label}
                                    {a.confirm && <span className="ml-auto text-[9px] text-amber-500">{t('webapps.mutating')}</span>}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
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
