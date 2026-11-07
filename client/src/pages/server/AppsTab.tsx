import React, { useState, useEffect, useLayoutEffect } from 'react';
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
  ChevronDown,
  Plus,
  Trash2,
  Radio,
  X,
  Sparkles,
  Server as ServerIcon,
  Shield
} from 'lucide-react';
import NewAppModal from '@/features/deployments/components/NewAppModal';
import { useTaskManager } from '@/shared/tasks/TaskContext';
import { updateServer } from '@/features/servers/api';
import { SudoPasswordModal } from '@/features/servers/components/SudoPasswordModal';
import { BrandIcon } from '@/shared/ui/brand-icon';
import type { WebAppInfo } from '@/features/deployments/types';
import { fetchWebApps } from '@/features/deployments/api';
import { fetchCloudflareTunnelStatus, addCloudflareRoute } from '@/features/tunnels/api';
import type { CloudflareTunnelStatus } from '@/features/tunnels/types';
import { getBaseDomain } from '@/features/tunnels/components/CloudflareTunnelView';
import { isPrivateOrTailscaleIp } from '@/features/deployments/lib/requirements';
import DnsPreFlightBadge from '@/features/tunnels/components/DnsPreFlightBadge';
import { toast } from '@/shared/ui/toast';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { TableSkeleton } from '@/shared/ui/skeleton';
import { useServerPage, sq } from './context';
import { useT } from '@/shared/i18n';
import { confirmModal } from '@/shared/ui/confirm-dialog';

export default function AppsTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;
  const [webApps, setWebApps] = useState<WebAppInfo[]>([]);
  const [loadingWebApps, setLoadingWebApps] = useState(false);
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [appTypeFilter, setAppTypeFilter] = useState<string>('ALL');
  const [appMenu, setAppMenu] = useState<string | null>(null);
  // Fixed position from the button: the table's overflow-x-auto wrapper would clip an absolute dropdown.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; up: boolean }>({ top: 0, right: 0, up: false });
  const { tasks, runStreamTask } = useTaskManager();
  const [sudoFor, setSudoFor] = useState<WebAppInfo | null>(null);

  // Pointing state (Nginx Domain & Cloudflare Tunnel)
  const [tunnelStatus, setTunnelStatus] = useState<CloudflareTunnelStatus | null>(null);
  const [tunnelBaseDomain, setTunnelBaseDomain] = useState<string>('');
  const [pointModalApp, setPointModalApp] = useState<WebAppInfo | null>(null);
  const [pointMode, setPointMode] = useState<'nginx' | 'tunnel'>('nginx');
  const [pointHostname, setPointHostname] = useState('');
  const [pointService, setPointService] = useState('');
  const [pointEnableSsl, setPointEnableSsl] = useState(true);
  const [pointAutoDns, setPointAutoDns] = useState(true);
  const [pointingLoading, setPointingLoading] = useState(false);

  const isPrivate = isPrivateOrTailscaleIp(server.host);
  const hasActiveTunnel = Boolean(tunnelStatus?.installed && tunnelStatus?.active);
  const tunnelInstalled = Boolean(tunnelStatus?.installed);

  useEffect(() => {
    fetchCloudflareTunnelStatus(server.id)
      .then((st) => {
        setTunnelStatus(st);
        if (st?.routes) {
          const base = getBaseDomain(st.routes);
          if (base) setTunnelBaseDomain(base);
        }
      })
      .catch(() => {});
  }, [server.id]);

  const openPointModal = (app: WebAppInfo, mode?: 'nginx' | 'tunnel') => {
    setPointModalApp(app);
    const chosenMode = mode || (hasActiveTunnel ? 'tunnel' : 'nginx');
    setPointMode(chosenMode);

    const appPort = app.ports ? app.ports.split(',')[0].trim() : '';
    const isStatic = app.type.includes('Frontend') || app.type.includes('SPA') || app.type.includes('Web App');
    const targetPort = isStatic ? '80' : (appPort || '80');
    setPointService(`http://localhost:${targetPort}`);
    setPointEnableSsl(true);
    setPointAutoDns(true);

    if (chosenMode === 'tunnel') {
      const base = tunnelBaseDomain || 'supraairways.space';
      setPointHostname(`${app.name}.${base}`);
    } else {
      setPointHostname('');
    }
  };

  const handleSavePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointModalApp) return;
    const cleanHost = pointHostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanHost || !cleanHost.includes('.')) {
      toast.error('Please enter a valid hostname (e.g. myapp.domain.com)');
      return;
    }

    if (pointMode === 'tunnel') {
      const cleanSvc = pointService.trim();
      if (!cleanSvc) {
        toast.error('Please enter a target service (e.g. http://localhost:3000)');
        return;
      }

      try {
        setPointingLoading(true);
        await addCloudflareRoute(server.id, {
          hostname: cleanHost,
          service: cleanSvc,
          autoDns: pointAutoDns
        });
        toast.success(`App ${pointModalApp.name} successfully pointed to https://${cleanHost}!`);
        setPointModalApp(null);
        loadWebAppsData(true);
      } catch (err: any) {
        toast.error(err.message || 'Failed to point app');
      } finally {
        setPointingLoading(false);
      }
    } else {
      // Nginx mode
      const rawPort = pointModalApp.ports ? pointModalApp.ports.split(',')[0].trim() : '';
      const numPort = rawPort && !isNaN(Number(rawPort)) && rawPort !== '80' ? Number(rawPort) : undefined;
      const appToPoint = pointModalApp;
      setPointModalApp(null);

      runStreamTask({
        serverId: server.id,
        serverName: server.name,
        title: `Point ${appToPoint.name} to ${cleanHost}`,
        category: 'nginx',
        url: `/api/servers/${server.id}/webapps/point-domain?stream=1`,
        body: {
          appName: appToPoint.name,
          domain: cleanHost,
          port: numPort,
          enableSsl: pointEnableSsl
        },
        onDone: () => {
          toast.success(`App ${appToPoint.name} pointed to ${cleanHost}!`);
          loadWebAppsData(true);
        },
        onError: (err: any) => {
          toast.error(err.message || 'Failed to point domain');
        }
      });
    }
  };

  // Real removal (folder + PM2/Docker/Nginx/SSL that point at it) runs as a background task.
  const removeApp = (app: WebAppInfo, sudoPassword?: string) =>
    runStreamTask({
      serverId: server.id,
      serverName: server.name,
      title: t('webapps.removeTitle', { name: app.name }),
      category: 'git',
      url: `/api/servers/${server.id}/webapps/remove?stream=1`,
      body: { name: app.name, sudoPassword },
      onDone: () => {
        try { localStorage.setItem(mockKey, JSON.stringify(getLocalMocks().filter((m) => m.path !== app.path))); } catch {}
        setWebApps((prev) => prev.filter((a) => a.path !== app.path));
        loadWebAppsData(true);
      },
      onError: (err: any) => {
        if (err.sudoRequired) setSudoFor(app);
      }
    });

  const confirmRemove = async (app: WebAppInfo) => {
    setAppMenu(null);
    const ok = await confirmModal({
      title: t('webapps.removeTitle', { name: app.name }),
      message: t('webapps.removeConfirm', { path: app.path, domain: app.domain || '—' }),
      variant: 'danger',
      confirmText: t('webapps.removeAction')
    });
    if (ok) removeApp(app);
  };
  // Leaving the tab unmounts the wizard; reopen it if this server still has a deploy running.
  const [showNewAppModal, setShowNewAppModal] = useState(() =>
    tasks.some((tk) => tk.serverId === server.id && tk.metadata?.kind === 'deploy' && tk.status === 'running')
  );
  const mockKey = `7server_mock_webapps_${server.id}`;
  const getLocalMocks = (): WebAppInfo[] => {
    try { return JSON.parse(localStorage.getItem(mockKey) || '[]'); } catch { return []; }
  };

  const appActions = (app: WebAppInfo) => {
    const cd = `cd ${sq(app.path)} && `;
    const list: { label: string; cmd: string; confirm?: boolean; action?: () => void }[] = [];
    if (app.gitBranch) {
      list.push({ label: t('webapps.gitStatusLog'), cmd: `${cd}git status -sb && echo "---" && git log --oneline -5` });
      list.push({ label: t('webapps.gitPull'), cmd: `${cd}git pull 2>&1`, confirm: true });
    }
    if (app.type.includes('Laravel')) {
      list.push({ label: t('webapps.laravelLog'), cmd: `${cd}tail -n 100 storage/logs/laravel.log 2>&1` });
      list.push({ label: t('webapps.artisanClear'), cmd: `${cd}php artisan optimize:clear 2>&1`, confirm: true });
      list.push({ label: t('webapps.artisanMigrate'), cmd: `${cd}php artisan migrate:status 2>&1` });
    }
    if (app.type.includes('Node') || app.type.includes('Next') || app.type.includes('Vite') || app.type.includes('Nuxt')) {
      list.push({ label: t('webapps.pm2Restart'), cmd: `${cd}set -a; [ -f .env ] && . ./.env; set +a; pm2 restart ${sq(app.name)} --update-env 2>&1`, confirm: true });
      list.push({ label: t('webapps.npmBuildAndRestart'), cmd: `${cd}set -a; [ -f .env ] && . ./.env; set +a; npm run build 2>&1 && pm2 restart ${sq(app.name)} --update-env 2>&1`, confirm: true });
      list.push({ label: t('webapps.npmBuild'), cmd: `${cd}set -a; [ -f .env ] && . ./.env; set +a; npm run build 2>&1 | tail -n 40`, confirm: true });
    }
    if (app.type.includes('Docker')) {
      list.push({ label: t('webapps.dockerRestart'), cmd: `docker restart ${sq(`7server-${app.name}`)} 2>&1`, confirm: true });
    }
    list.push({ label: t('webapps.folderSize'), cmd: `du -sh ${sq(app.path)} 2>&1` });
    if (hasActiveTunnel) {
      list.push({
        label: '🚇 ' + t('webapps.pointTunnel'),
        cmd: '',
        action: () => openPointModal(app, 'tunnel')
      });
      list.push({
        label: '🌐 ' + t('webapps.pointDomain'),
        cmd: '',
        action: () => openPointModal(app, 'nginx')
      });
    } else {
      list.push({
        label: '🌐 ' + t('webapps.pointDomain'),
        cmd: '',
        action: () => openPointModal(app, 'nginx')
      });
      if (tunnelInstalled) {
        list.push({
          label: '🚇 ' + t('webapps.pointTunnel'),
          cmd: '',
          action: () => openPointModal(app, 'tunnel')
        });
      }
    }

    // Allow deleting mock/locally added apps
    const mocks = getLocalMocks();
    if (mocks.some((m) => m.path === app.path)) {
      list.push({
        label: t('webapps.removeDemo'),
        cmd: '',
        confirm: true,
        action: () => {
          const updated = mocks.filter((m) => m.path !== app.path);
          localStorage.setItem(mockKey, JSON.stringify(updated));
          setWebApps((prev) => prev.filter((a) => a.path !== app.path));
        }
      });
    }

    return list;
  };
  const runAppAction = async (app: WebAppInfo, a: { label: string; cmd: string; confirm?: boolean; action?: () => void }) => {
    setAppMenu(null);
    if (a.confirm) {
      const ok = await confirmModal({
        title: a.label,
        message: t('webapps.confirmRun', { label: a.label, path: app.path }),
        variant: 'warning',
        confirmText: t('webapps.continue')
      });
      if (!ok) return;
    }
    if (a.action) {
      a.action();
      return;
    }
    // Deployed apps are root-owned: as the SSH user git refuses them ("dubious ownership") and npm can't write.
    ctx.runQuickAction(`${app.name}: ${a.label}`, a.cmd, { sudo: true });
  };
  const loadWebAppsData = async (manual?: unknown) => {
    try {
      const localMocks = getLocalMocks();
      await swr(
        `webapps:${server.id}`,
        async () => {
          const remote = await fetchWebApps(server.id);
          const remotePaths = new Set(remote.map((r) => r.path));
          return [...localMocks.filter((m) => !remotePaths.has(m.path)), ...remote];
        },
        (merged) => {
          const paths = new Set(merged.map((m) => m.path));
          setWebApps([...localMocks.filter((m) => !paths.has(m.path)), ...merged]);
        },
        setLoadingWebApps,
        !!manual
      );
    } catch (e) {
      console.error(e);
      const fallback = getLocalMocks();
      if (fallback.length > 0) setWebApps(fallback);
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

  if (showNewAppModal) {
    return (
      <NewAppModal
        isOpen={true}
        onClose={() => setShowNewAppModal(false)}
        server={server}
        onAppCreated={() => loadWebAppsData(true)}
        onOpenIntegrations={() => {
          window.location.hash = '#/settings/integrations';
        }}
      />
    );
  }

  return (
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
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowNewAppModal(true)}
              className="gap-1.5 h-8"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('webapps.newApp')}</span>
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
                          <span className="font-semibold text-[var(--foreground)] sensitive">{app.name}</span>
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
                      {app.domain ? (
                        <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                          {app.domain
                            .split(',')
                            .filter(Boolean)
                            .filter((d) => !d.startsWith('www.'))
                            .map((d) => (
                              <a
                                key={d}
                                href={`https://${d}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold sensitive"
                              >
                                <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="sensitive">{d}</span>
                                <ExternalLink className="w-2.5 h-2.5 text-[var(--muted-foreground)]" />
                              </a>
                            ))}
                          {app.ports && (
                            <span className="text-[10px] text-[var(--muted-foreground)] sensitive">
                              (:{app.ports})
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
                          {app.ports ? (
                            <span className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] sensitive">
                              :{app.ports}
                            </span>
                          ) : (
                            <span className="text-[var(--muted-foreground)]">-</span>
                          )}
                          {hasActiveTunnel ? (
                            <button
                              type="button"
                              onClick={() => openPointModal(app, 'tunnel')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 transition shadow-sm"
                              title={t('webapps.pointTunnelDesc')}
                            >
                              <Radio className="w-2.5 h-2.5" /> + Point Tunnel
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPointModal(app, 'nginx')}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20 transition shadow-sm"
                              title={t('webapps.pointDomainDesc')}
                            >
                              <Globe className="w-2.5 h-2.5" /> + Point Domain
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {app.gitBranch ? (
                        <span className="inline-flex items-center gap-1 text-[var(--foreground)] bg-[var(--muted)] px-1.5 py-0.5 rounded border border-[var(--border)] sensitive">
                          <FolderGit2 className="w-3 h-3 text-[var(--muted-foreground)]" />
                          {app.gitBranch}
                        </span>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--muted-foreground)] font-mono text-[11px] sensitive">
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
                            onClick={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              const up = r.bottom + 280 > window.innerHeight;
                              setMenuPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
                              setAppMenu(appMenu === app.path ? null : app.path);
                            }}
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
                              <div
                                className="fixed w-52 z-30 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl py-1 text-left"
                                style={{ top: menuPos.top, right: menuPos.right, transform: menuPos.up ? 'translateY(-100%)' : undefined }}
                              >
                                {(
                                  <button
                                    onClick={() => confirmRemove(app)}
                                    className="w-full px-3 py-1.5 text-[11px] text-left text-red-600 dark:text-red-400 hover:bg-red-500/10 flex items-center gap-2 border-b border-[var(--border)]"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    {t('webapps.removeAction')}
                                  </button>
                                )}
                                {appActions(app).map((a) => (
                                  <button
                                    key={a.label}
                                    onClick={() => runAppAction(app, a)}
                                    className="w-full px-3 py-1.5 text-[11px] text-left text-[var(--foreground)] hover:bg-[var(--muted)] flex items-center gap-2"
                                  >
                                    {a.label.startsWith('Git') ? (
                                      <GitPullRequest className="w-3 h-3" />
                                    ) : a.label.includes('Tunnel') ? (
                                      <Radio className="w-3 h-3 text-amber-400" />
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
      <SudoPasswordModal
        isOpen={!!sudoFor}
        onClose={() => setSudoFor(null)}
        onConfirm={async (pw, remember) => {
          const app = sudoFor!;
          setSudoFor(null);
          if (remember) await updateServer(server.id, { sudoPassword: pw }).catch(() => {});
          removeApp(app, pw);
        }}
        serverName={server.name}
        username={server.username}
        hasExistingPassword={server.hasSudoPassword}
        reason={t('webapps.removeSudo')}
      />

      {/* Point App to Domain or Cloudflare Tunnel Modal */}
      {pointModalApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                {pointMode === 'tunnel' ? (
                  <Radio className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                )}
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Point <span className="sensitive">{pointModalApp.name}</span> {pointMode === 'tunnel' ? 'to Cloudflare Tunnel' : 'to Domain'}
                  </h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {pointMode === 'tunnel'
                      ? 'Secure NAT traversal without opening public firewall ports'
                      : <>Standard Nginx VirtualHost & SSL on public IP (<span className="sensitive">{server.host}</span>)</>}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPointModalApp(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePoint} className="p-5 space-y-4">
              {tunnelInstalled && (
                <div className="flex items-center gap-1.5 p-1 bg-[var(--muted)]/50 border border-[var(--border)] rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPointMode('nginx');
                      setPointHostname('');
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition ${
                      pointMode === 'nginx'
                        ? 'bg-[var(--card)] text-sky-400 shadow-sm border border-[var(--border)] font-semibold'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Nginx (Public Domain)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPointMode('tunnel');
                      const base = tunnelBaseDomain || 'supraairways.space';
                      setPointHostname(`${pointModalApp.name}.${base}`);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md font-medium transition ${
                      pointMode === 'tunnel'
                        ? 'bg-[var(--card)] text-amber-400 shadow-sm border border-[var(--border)] font-semibold'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>Cloudflare Tunnel</span>
                  </button>
                </div>
              )}

              <div className="p-3 rounded-lg bg-[var(--muted)]/50 border border-[var(--border)] flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    <span className="sensitive">{pointModalApp.name}</span>
                    <Badge variant="secondary" className="text-[10px] py-0">{pointModalApp.type}</Badge>
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] font-mono mt-0.5 truncate max-w-[240px] sensitive">
                    {pointModalApp.path}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider block">Port</span>
                  <span className="font-mono font-semibold text-emerald-400 sensitive">:{pointModalApp.ports || '80'}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)] flex items-center justify-between">
                  <span>Public Hostname (Domain / Subdomain)</span>
                  {pointMode === 'nginx' && (
                    <span className="text-[11px] text-[var(--muted-foreground)]">Points to <span className="sensitive">{server.host}</span></span>
                  )}
                </label>
                <Input
                  placeholder={pointMode === 'tunnel' ? `e.g. ${pointModalApp.name}.yourdomain.com` : 'e.g. app.yourdomain.com'}
                  value={pointHostname}
                  onChange={(e) => {
                    const clean = e.target.value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                    setPointHostname(clean);
                  }}
                  className="font-mono text-xs sensitive"
                  required
                />
                {pointMode === 'nginx' && (
                  <DnsPreFlightBadge domain={pointHostname} serverIp={server.host} />
                )}
                {pointMode === 'tunnel' && (
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Visitors will securely access your app through Cloudflare edge proxy.
                  </p>
                )}
              </div>

              {pointMode === 'tunnel' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--foreground)]">
                      Target Service (Local URL)
                    </label>
                    <Input
                      placeholder="http://localhost:3000"
                      value={pointService}
                      onChange={(e) => setPointService(e.target.value)}
                      className="font-mono text-xs sensitive"
                      required
                    />
                  </div>

                  <div className="pt-1">
                    <label className="flex items-start gap-2.5 text-xs text-[var(--foreground)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pointAutoDns}
                        onChange={(e) => setPointAutoDns(e.target.checked)}
                        className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
                      />
                      <div>
                        <span className="font-medium text-[var(--foreground)]">Auto-create Cloudflare DNS route</span>
                        <p className="text-[11px] text-[var(--muted-foreground)]">
                          Executes <code>cloudflared tunnel route dns</code> to automatically register the CNAME record in Cloudflare.
                        </p>
                      </div>
                    </label>
                  </div>
                </>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] text-xs space-y-1">
                    <div className="text-[var(--muted-foreground)]">Target Upstream:</div>
                    <div className="font-mono text-[11px] text-[var(--foreground)] sensitive">
                      {pointModalApp.ports && pointModalApp.ports !== '80'
                        ? `proxy_pass http://127.0.0.1:${pointModalApp.ports.split(',')[0].trim()}`
                        : `root ${pointModalApp.path} (static web)`}
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-[var(--foreground)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pointEnableSsl}
                      onChange={(e) => setPointEnableSsl(e.target.checked)}
                      className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-0"
                    />
                    <div>
                      <span className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        Enable HTTPS with Let's Encrypt SSL (Certbot)
                      </span>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Automatically requests a free SSL certificate once DNS resolves to <span className="sensitive">{server.host}</span>.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPointModalApp(null)}
                  disabled={pointingLoading}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={pointingLoading}
                  className={`text-xs text-white ${
                    pointMode === 'tunnel'
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {pointingLoading
                    ? 'Pointing App...'
                    : pointMode === 'tunnel'
                    ? 'Save & Point Tunnel'
                    : 'Save & Point Domain'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
