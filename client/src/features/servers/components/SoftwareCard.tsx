// What's installed on the server: search, category filters, live service states, and template CTA.
import React, { useEffect, useState, useMemo } from 'react';
import {
  RefreshCw,
  Check,
  Minus,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Activity,
  ArrowUpRight
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { fetchSoftware, fetchSoftwareUpgrades, type SoftwareItem, type SoftwareUpgradeItem } from '../api';
import { formatTerminalCommand } from '../lib/templates';
import { swr } from '@/shared/lib/cache';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { useT, type MessageKey } from '@/shared/i18n';

const CATEGORIES: { id: SoftwareItem['category']; label: MessageKey }[] = [
  { id: 'runtime', label: 'software.cat.runtime' },
  { id: 'web', label: 'software.cat.web' },
  { id: 'database', label: 'software.cat.database' },
  { id: 'container', label: 'software.cat.container' },
  { id: 'tooling', label: 'software.cat.tooling' },
  { id: 'security', label: 'software.cat.security' }
];

interface SoftwareCardProps {
  serverId: string;
  onOpenTemplates?: () => void;
  onOpenTerminal?: (cmd: string) => void;
}

export default function SoftwareCard({ serverId, onOpenTemplates, onOpenTerminal }: SoftwareCardProps) {
  const t = useT();
  const [items, setItems] = useState<SoftwareItem[] | null>(null);
  const [upgrades, setUpgrades] = useState<Record<string, SoftwareUpgradeItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | SoftwareItem['category']>('all');
  const [showMissing, setShowMissing] = useState(false);

  const load = async (force = false) => {
    setError(null);
    try {
      await Promise.all([
        swr(`software:${serverId}`, () => fetchSoftware(serverId), setItems, setLoading, force),
        swr(`software-upgrades:${serverId}`, () => fetchSoftwareUpgrades(serverId), setUpgrades, () => {}, force).catch(() => {})
      ]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [serverId]);

  const getUpgrade = (toolId: string) => {
    if (!upgrades) return null;
    if (upgrades[toolId]) return upgrades[toolId];
    const aliasMap: Record<string, string[]> = {
      node: ['nodejs'],
      docker: ['docker-ce', 'docker.io'],
      compose: ['docker-compose-plugin', 'docker-compose'],
      php: ['php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm', 'php-fpm'],
      nginx: ['nginx', 'nginx-core', 'nginx-full', 'nginx-light'],
      mysql: ['mysql-server', 'mysql-community-server'],
      mariadb: ['mariadb-server'],
      postgres: ['postgresql', 'postgresql-common'],
      redis: ['redis-server', 'redis'],
      fail2ban: ['fail2ban'],
      ufw: ['ufw'],
      supervisor: ['supervisor'],
      autoupdates: ['unattended-upgrades']
    };
    const aliases = aliasMap[toolId] || [];
    for (const a of aliases) {
      if (upgrades[a]) return upgrades[a];
    }
    return null;
  };

  const installed = useMemo(() => items?.filter((i) => i.installed) ?? [], [items]);
  const missing = useMemo(() => items?.filter((i) => !i.installed) ?? [], [items]);
  const runningServicesCount = useMemo(
    () => installed.filter((i) => i.service === 'active').length,
    [installed]
  );

  const filteredInstalled = useMemo(() => {
    return installed.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.version && item.version.toLowerCase().includes(q)) ||
        (item.service && item.service.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [installed, selectedCategory, searchQuery]);

  return (
    <Card className="p-5 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--primary)]" />
              {t('software.title')}
            </h3>
            {items && (
              <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 h-4">
                {installed.length} / {items.length}
              </Badge>
            )}
            {runningServicesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {runningServicesCount} {t('software.serviceRunning').toLowerCase()}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {t('software.summary', { installed: installed.length, total: items?.length ?? 0 })}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenTemplates && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTemplates}
              className="h-8 text-xs gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 font-semibold shadow-sm"
              title={t('templates.btnSetup')}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('templates.btnSetup')}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(true)}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
            title={t('software.rescan')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('software.rescan')}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{t('software.failed', { error })}</span>
          <Button variant="ghost" size="sm" onClick={() => load(true)} className="h-6 text-[10px]">
            {t('software.rescan')}
          </Button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      {items && installed.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-[var(--border)]">
          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                selectedCategory === 'all'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-sm'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
              }`}
            >
              {t('software.filterAll', { n: installed.length })}
            </button>
            {CATEGORIES.map((c) => {
              const count = installed.filter((i) => i.category === c.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                    selectedCategory === c.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-sm'
                      : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  {t(c.label)} ({count})
                </button>
              );
            })}
          </div>

          {/* Quick Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              type="text"
              placeholder={t('software.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs w-full bg-[var(--background)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {!items && !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items && (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Empty / Fresh Server Callout */}
          {installed.length === 0 && (
            <div className="p-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">
                  {t('templates.quickCtaTitle')}
                </h4>
                <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto leading-relaxed">
                  {t('software.none')} {t('templates.quickCtaDesc')}
                </p>
              </div>
              {onOpenTemplates && (
                <Button
                  size="sm"
                  onClick={onOpenTemplates}
                  className="h-8 text-xs gap-1.5 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('templates.openSetup')}</span>
                </Button>
              )}
            </div>
          )}

          {/* No search matches */}
          {installed.length > 0 && filteredInstalled.length === 0 && (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl">
              {t('software.noFilterMatch')}
            </div>
          )}

          {/* Installed Tools Grid by Category */}
          {installed.length > 0 && filteredInstalled.length > 0 && (
            <div className="space-y-4">
              {CATEGORIES.map((c) => {
                const list = filteredInstalled.filter((i) => i.category === c.id);
                if (!list.length) return null;

                return (
                  <section key={c.id} className="space-y-2">
                    <h4 className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                      {t(c.label)}
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {list.map((tool) => {
                        const isServiceActive = tool.service === 'active';
                        const isServiceFailed = tool.service === 'failed';

                        return (
                          <div
                            key={tool.id}
                            className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted-foreground)]/30 hover:bg-[var(--muted)]/20 transition-all flex flex-col justify-between space-y-2.5 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <BrandIcon
                                  name={tool.id}
                                  className="w-4 h-4 shrink-0"
                                  fallback={
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden />
                                  }
                                />
                                <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                                  {tool.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {tool.version && (
                                  <span
                                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)] font-medium truncate max-w-[100px]"
                                    title={tool.version}
                                  >
                                    v{tool.version}
                                  </span>
                                )}

                                {(() => {
                                  const up = getUpgrade(tool.id);
                                  if (!up) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onOpenTerminal) {
                                          onOpenTerminal(
                                            formatTerminalCommand(
                                              `apt-get update && apt-get --only-upgrade install -y ${up.package}`,
                                              `/tmp/vpshub-upgrade-${up.package}.sh`
                                            )
                                          );
                                        }
                                      }}
                                      className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer"
                                      title={`Update tersedia: v${up.newVersion}. Klik untuk perbarui di terminal.`}
                                    >
                                      <ArrowUpRight className="w-2.5 h-2.5 text-amber-500" />
                                      <span>v{up.newVersion}</span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Service Status Row */}
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border)]/60 text-[var(--muted-foreground)]">
                              <span className="font-mono text-[10px] text-[var(--muted-foreground)]/80">
                                {tool.id}
                              </span>

                              {tool.service ? (
                                <span
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                                    isServiceActive
                                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                      : isServiceFailed
                                      ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                      : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      isServiceActive
                                        ? 'bg-emerald-500 animate-pulse'
                                        : isServiceFailed
                                        ? 'bg-red-500'
                                        : 'bg-zinc-400'
                                    }`}
                                  />
                                  {isServiceActive
                                    ? t('software.serviceRunning')
                                    : isServiceFailed
                                    ? t('software.serviceFailed')
                                    : t('software.serviceStopped')}
                                </span>
                              ) : (
                                <span className="text-[10px] text-emerald-500/80 font-mono flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-500" /> CLI Tool
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* Quick CTA to Setup Templates */}
          {onOpenTemplates && installed.length > 0 && (
            <div className="p-4 rounded-xl border border-[var(--primary)]/20 bg-gradient-to-r from-[var(--primary)]/5 via-transparent to-[var(--primary)]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
                  {t('templates.quickCtaTitle')}
                </span>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  {t('templates.quickCtaDesc')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenTemplates}
                className="h-7 text-xs gap-1.5 font-semibold border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 shrink-0"
              >
                <span>{t('templates.openSetup')}</span>
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          )}

          {/* Missing / Uninstalled Software Drawer */}
          {missing.length > 0 && (
            <div className="pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowMissing((v) => !v)}
                aria-expanded={showMissing}
                className="text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1.5 transition"
              >
                {showMissing ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {t(showMissing ? 'software.hideMissing' : 'software.showMissing', { n: missing.length })}
              </button>

              {showMissing && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 animate-in fade-in">
                  {missing.map((tool) => (
                    <div
                      key={tool.id}
                      className="p-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] opacity-75 hover:opacity-100 transition"
                    >
                      <BrandIcon
                        name={tool.id}
                        mono
                        className="w-3.5 h-3.5 opacity-50 shrink-0"
                        fallback={<Minus className="w-3.5 h-3.5 text-zinc-500 shrink-0" aria-hidden />}
                      />
                      <span className="truncate text-[11px]">{tool.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
