import React, { useState, useEffect, useMemo } from 'react';
import {
  Globe,
  Radio,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  FolderOpen,
  CheckCircle2,
  X,
  LayoutGrid,
  List,
  Network,
  ArrowRight,
  Sparkles,
  Layers
} from 'lucide-react';
import type { CloudflareTunnelStatus, CloudflareTunnelRoute } from '../types';
import { addCloudflareRoute, removeCloudflareRoute } from '../api';
import { fetchWebApps } from '@/features/deployments/api';
import type { WebAppInfo } from '@/features/deployments/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';

interface CloudflareTunnelViewProps {
  serverId: string;
  serverIp?: string;
  status: CloudflareTunnelStatus | null;
  loading: boolean;
  onRefresh: () => void;
  onInstall?: () => void;
  apps?: WebAppInfo[];
}

export function getBaseDomain(routes?: CloudflareTunnelRoute[]): string {
  if (!routes || routes.length === 0) return '';
  const hostnames = routes.map((r) => r.hostname?.toLowerCase().trim()).filter(Boolean);
  // Find apex domain (e.g. supraairways.space)
  const apex = hostnames.find((h) => !h.startsWith('www.') && h.split('.').length === 2);
  if (apex) return apex;
  const www = hostnames.find((h) => h.startsWith('www.'));
  if (www) return www.replace(/^www\./, '');
  const first = hostnames.find((h) => h.includes('.'));
  if (first) {
    const parts = first.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : first;
  }
  return '';
}

export function isAppPointed(app: WebAppInfo, routes?: CloudflareTunnelRoute[]): boolean {
  if (!routes || routes.length === 0) return false;
  const appPort = app.ports ? app.ports.split(',')[0].trim() : '';
  const isStatic = app.type.includes('Frontend') || app.type.includes('SPA') || app.type.includes('Web App');
  const targetPort = isStatic ? '80' : appPort;

  return routes.some((r) => {
    if (!r.hostname) return false;
    const host = r.hostname.toLowerCase();
    if (app.domain && host === app.domain.toLowerCase()) return true;
    if (host.startsWith(`${app.name.toLowerCase()}.`)) return true;
    if (targetPort && targetPort !== '80' && r.service.includes(`:${targetPort}`)) return true;
    return false;
  });
}

export default function CloudflareTunnelView({
  serverId,
  serverIp,
  status,
  loading,
  onRefresh,
  onInstall,
  apps: initialApps
}: CloudflareTunnelViewProps) {
  const [viewMode, setViewMode] = useState<'map' | 'table'>('map');
  const [modalOpen, setModalOpen] = useState(false);
  const [hostname, setHostname] = useState('');
  const [service, setService] = useState('http://localhost:80');
  const [autoDns, setAutoDns] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingHost, setDeletingHost] = useState<string | null>(null);
  const [apps, setApps] = useState<WebAppInfo[]>(initialApps || []);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  useEffect(() => {
    if (initialApps) {
      setApps(initialApps);
    } else if (serverId) {
      fetchWebApps(serverId)
        .then(setApps)
        .catch(() => {});
    }
  }, [serverId, initialApps]);

  const baseDomain = useMemo(() => getBaseDomain(status?.routes), [status?.routes]);

  const unpointedApps = useMemo(() => {
    return apps.filter((app) => !isAppPointed(app, status?.routes));
  }, [apps, status?.routes]);

  const openModalForApp = (app: WebAppInfo) => {
    setSelectedApp(app.name);
    const appPort = app.ports ? app.ports.split(',')[0].trim() : '';
    const isStatic = app.type.includes('Frontend') || app.type.includes('SPA') || app.type.includes('Web App');
    const targetPort = isStatic ? '80' : (appPort || '80');
    setService(`http://localhost:${targetPort}`);

    if (baseDomain) {
      setHostname(`${app.name}.${baseDomain}`);
    } else {
      setHostname(`${app.name}.yourdomain.com`);
    }
    setModalOpen(true);
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHost = hostname.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cleanSvc = service.trim();
    if (!cleanHost || !cleanHost.includes('.')) {
      toast.error('Please enter a valid hostname (e.g. myapp.domain.com)');
      return;
    }
    if (!cleanSvc) {
      toast.error('Please enter a target service (e.g. http://localhost:3000)');
      return;
    }

    try {
      setSubmitting(true);
      await addCloudflareRoute(serverId, {
        hostname: cleanHost,
        service: cleanSvc,
        autoDns
      });
      toast.success(`Ingress route for ${cleanHost} successfully configured!`);
      setModalOpen(false);
      setHostname('');
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add route');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoute = async (routeHost: string) => {
    const ok = await confirmModal({
      title: 'Remove Ingress Route',
      message: `Are you sure you want to remove the route for ${routeHost}? It will no longer be accessible via this tunnel.`,
      confirmText: 'Remove Route',
      variant: 'danger'
    });
    if (!ok) return;

    try {
      setDeletingHost(routeHost);
      await removeCloudflareRoute(serverId, routeHost);
      toast.success(`Route ${routeHost} removed`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove route');
    } finally {
      setDeletingHost(null);
    }
  };

  if (!status?.installed && !loading) {
    return (
      <Card className="p-8 text-center space-y-4 border-dashed border-[var(--border)]">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <Radio className="w-6 h-6" />
        </div>
        <div className="max-w-md mx-auto space-y-2">
          <h4 className="text-base font-semibold text-[var(--foreground)]">Cloudflare Tunnel Not Installed</h4>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            Cloudflare Tunnel (<code>cloudflared</code>) lets you securely expose local servers, homelabs, or private VPS to the internet without a public IPv4 address or open firewall ports.
          </p>
        </div>
        {onInstall && (
          <Button variant="default" size="sm" onClick={onInstall} className="gap-2 text-xs">
            <Plus className="w-4 h-4" /> Install cloudflared on Server
          </Button>
        )}
      </Card>
    );
  }

  const activeRoutes = status?.routes.filter(r => r.hostname) || [];
  const fallbackRoute = status?.routes.find(r => !r.hostname);

  return (
    <div className="space-y-4">
      {/* Tunnel Meta Card */}
      <Card className="p-4 bg-[var(--card)] border-[var(--border)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${status?.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-500/10 text-zinc-400'}`}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {status?.tunnelName || status?.tunnelId || 'Cloudflare Tunnel'}
                </span>
                <Badge variant={status?.active ? 'success' : 'secondary'} className="text-[10px]">
                  {status?.active ? '● Healthy / Active' : '● Inactive'}
                </Badge>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] font-mono flex items-center gap-1.5 mt-0.5">
                <FolderOpen className="w-3 h-3" />
                {status?.configPath || 'Locally managed tunnel'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 bg-[var(--muted)]/60 rounded-md text-xs border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition ${
                  viewMode === 'map'
                    ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-xs'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <Network className="w-3.5 h-3.5 text-emerald-400" />
                <span>Visual Map</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition ${
                  viewMode === 'table'
                    ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-xs'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Tunnel Route
            </Button>
          </div>
        </div>
      </Card>

      {/* Unpointed Apps Quick-Action Banner */}
      {unpointedApps.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            <div>
              <span className="font-semibold text-[var(--foreground)]">
                {unpointedApps.length} deployed {unpointedApps.length === 1 ? 'app is' : 'apps are'} not exposed to the internet yet:
              </span>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Select an app to automatically populate port & domain for Cloudflare Tunnel ingress.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {unpointedApps.map((app) => (
              <button
                key={app.name}
                type="button"
                onClick={() => openModalForApp(app)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)] hover:border-amber-500/50 font-mono text-[11px] transition shadow-sm"
              >
                <span className="font-semibold text-emerald-400 font-sans">{app.name}</span>
                <span className="text-[var(--muted-foreground)]">(:{app.ports || '80'})</span>
                <Plus className="w-3 h-3 text-amber-400 ml-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Visual Flow Topology Map */}
      {viewMode === 'map' && (
        <div className="relative p-6 rounded-xl border border-[var(--border)] bg-[var(--card)]/90 backdrop-blur-sm overflow-hidden">
          {/* Subtle grid background like Cloudflare Zero Trust */}
          <div className="absolute inset-0 bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-4">
            {/* Left Column: Public Ingress Hostnames */}
            <div className="flex flex-col gap-2.5 w-full md:w-5/12">
              <div className="text-[11px] font-semibold text-[var(--muted-foreground)] tracking-wider uppercase flex items-center justify-between">
                <span>Public Hostnames ({activeRoutes.length})</span>
                <span className="text-[10px] text-zinc-500 font-normal">Edge HTTPS</span>
              </div>

              {activeRoutes.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg">
                  No public routes configured yet.
                </div>
              ) : (
                activeRoutes.map((r) => (
                  <div
                    key={r.hostname}
                    className="group relative flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-emerald-500/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                        <Globe className="w-3.5 h-3.5" />
                      </div>
                      <a
                        href={`https://${r.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono font-medium text-emerald-400 hover:underline truncate flex items-center gap-1"
                        title={r.hostname}
                      >
                        {r.hostname}
                        <ExternalLink className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-zinc-300 bg-[var(--muted)] px-2 py-0.5 rounded font-mono">
                        {r.service}
                      </span>
                      <button
                        onClick={() => handleDeleteRoute(r.hostname)}
                        disabled={deletingHost === r.hostname}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-1 transition-opacity"
                        title="Delete route"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Middle Connecting Bridge */}
            <div className="hidden md:flex flex-col items-center justify-center shrink-0 w-2/12 px-2 text-center space-y-2">
              <div className="h-0.5 w-full bg-gradient-to-r from-emerald-500/40 via-cyan-500/40 to-emerald-500/40 relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <Badge variant="outline" className="text-[9px] text-zinc-400 border-zinc-700 bg-zinc-900/60 font-mono py-0 flex items-center gap-1">
                <span>Published Application</span>
                <ArrowRight className="w-2.5 h-2.5 text-emerald-400" />
              </Badge>
            </div>

            {/* Right Column: Tunnel Gateway Node */}
            <div className="w-full md:w-5/12 flex flex-col items-center md:items-end">
              <div className="text-[11px] font-semibold text-[var(--muted-foreground)] tracking-wider uppercase mb-2">
                Tunnel Gateway
              </div>
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 w-full max-w-sm space-y-2.5 shadow-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Radio className="w-4 h-4 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--foreground)]">
                        {status?.tunnelName || status?.tunnelId || 'Cloudflare Tunnel'}
                      </h4>
                      <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[170px]">
                        {status?.tunnelId}
                      </p>
                    </div>
                  </div>
                  <Badge variant="success" className="text-[10px]">
                    ● Connected
                  </Badge>
                </div>

                <div className="pt-2 border-t border-emerald-500/10 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Server Host:</span>
                  <span className="font-mono text-[var(--foreground)]">{serverIp || '127.0.0.1'}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Daemon Engine:</span>
                  <span className="text-emerald-400 font-medium">cloudflared (locally managed)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ingress Routes Table */}
      {viewMode === 'table' && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden bg-[var(--card)]">
          <div className="px-4 py-2.5 bg-[var(--muted)]/40 border-b border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted-foreground)] font-medium">
            <span>PUBLIC INGRESS ROUTES ({activeRoutes.length})</span>
            <span>TARGET SERVICE</span>
          </div>

          {activeRoutes.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted-foreground)]">
              No public ingress routes configured in <code>config.yml</code> yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {activeRoutes.map((r) => (
                <div key={r.hostname} className="px-4 py-3 flex items-center justify-between gap-3 text-xs hover:bg-[var(--muted)]/30 transition-colors">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://${r.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-emerald-400 hover:underline flex items-center gap-1 truncate"
                      >
                        {r.hostname}
                        <ExternalLink className="w-3 h-3 text-[var(--muted-foreground)]" />
                      </a>
                      <Badge variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                        HTTPS via Cloudflare
                      </Badge>
                    </div>
                    {r.path && (
                      <span className="text-[11px] text-[var(--muted-foreground)]">Path: {r.path}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-zinc-300 bg-[var(--muted)] px-2 py-0.5 rounded text-[11px]">
                      {r.service}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteRoute(r.hostname)}
                      disabled={deletingHost === r.hostname}
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      title="Delete route"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {fallbackRoute && (
            <div className="px-4 py-2 bg-[var(--muted)]/20 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
              <span>Catch-all fallback</span>
              <span className="font-mono text-zinc-400">{fallbackRoute.service}</span>
            </div>
          )}
        </div>
      )}

      {/* Add Route Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">Add Cloudflare Ingress Route</h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRoute} className="p-5 space-y-4">
              {apps.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--foreground)] flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Select Deployed App
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">Click to auto-fill port & domain</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-0.5">
                    {apps.map((app) => {
                      const pointed = isAppPointed(app, status?.routes);
                      const isSelected = selectedApp === app.name;
                      return (
                        <button
                          key={app.name}
                          type="button"
                          onClick={() => openModalForApp(app)}
                          className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/10 text-[var(--foreground)] font-medium shadow-sm'
                              : 'border-[var(--border)] bg-[var(--muted)]/40 hover:bg-[var(--muted)] text-[var(--foreground)]'
                          }`}
                        >
                          <div className="min-w-0 pr-1">
                            <div className="font-semibold truncate flex items-center gap-1">
                              <span>{app.name}</span>
                              <span className="text-[10px] font-mono text-[var(--muted-foreground)]">(:{app.ports || '80'})</span>
                            </div>
                            <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                              {app.type}
                            </div>
                          </div>
                          {pointed ? (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-mono font-medium">
                              Pointed
                            </span>
                          ) : (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                              + Select
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  Public Hostname (Domain / Subdomain)
                </label>
                <Input
                  placeholder="e.g. mainwarewolf.supraairways.space"
                  value={hostname}
                  onChange={(e) => {
                    const clean = e.target.value.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
                    setHostname(clean);
                  }}
                  className="font-mono text-xs"
                  required
                />
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  The domain or subdomain that visitors will access over the internet.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  Target Service (Local URL)
                </label>
                <Input
                  placeholder="http://localhost:3004 or http://localhost:80"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className="font-mono text-xs"
                  required
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-[var(--muted-foreground)]">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setService('http://localhost:80')}
                    className="text-[10px] bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-zinc-300 px-1.5 py-0.5 rounded"
                  >
                    Nginx (port 80)
                  </button>
                  {apps.map((a) => {
                    const p = a.ports ? a.ports.split(',')[0].trim() : '';
                    if (!p || p === '80') return null;
                    return (
                      <button
                        key={a.name}
                        type="button"
                        onClick={() => {
                          setSelectedApp(a.name);
                          setService(`http://localhost:${p}`);
                          if (baseDomain) setHostname(`${a.name}.${baseDomain}`);
                        }}
                        className="text-[10px] bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-emerald-400 px-1.5 py-0.5 rounded font-mono"
                      >
                        {a.name} (:{p})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-2.5 text-xs text-[var(--foreground)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoDns}
                    onChange={(e) => setAutoDns(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-medium">Auto-create Cloudflare DNS route</span>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Executes <code>cloudflared tunnel route dns</code> on the server so the CNAME record is created automatically in Cloudflare.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                  disabled={submitting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="default"
                  size="sm"
                  disabled={submitting}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {submitting ? 'Applying Route...' : 'Save & Reload Tunnel'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
