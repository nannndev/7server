import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Activity,
  User,
  Globe,
  Download
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { useServerPage } from './context';
import { fetchServerAudit, type ServerAuditEntry } from '@/features/servers/api';
import { exportAuditCsv } from '@/features/monitoring/api';
import { swr } from '@/shared/lib/cache';
import { useT } from '@/shared/i18n';

export default function AuditTab() {
  const t = useT();
  const { server } = useServerPage();

  const [entries, setEntries] = useState<ServerAuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadAudit = async (force = false) => {
    setError(null);
    try {
      await swr(`server-audit:${server.id}`, () => fetchServerAudit(server.id), setEntries, setLoading, force);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    }
  };

  useEffect(() => {
    loadAudit();
  }, [server.id]);

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.path.toLowerCase().includes(q) ||
        e.detail.toLowerCase().includes(q) ||
        e.method.toLowerCase().includes(q) ||
        (e.user && e.user.toLowerCase().includes(q)) ||
        (e.ip && e.ip.toLowerCase().includes(q))
    );
  }, [entries, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <History className="w-5 h-5 text-sky-400" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('audit.serverTitle')}</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('audit.serverSubtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportAuditCsv(undefined, server.id)}
              className="gap-1.5 h-8 text-xs font-medium"
              title={t('audit.exportCsv')}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('audit.exportCsv')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadAudit(true)}
              disabled={loading}
              className="gap-1.5 h-8 text-xs font-medium"
              title={t('common.refresh')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => loadAudit(true)} className="h-6 text-[10px]">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Search Input Bar */}
      {entries && entries.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              type="text"
              placeholder={t('audit.filterSearch')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-[var(--card)]"
            />
          </div>
          <span className="text-xs font-mono text-[var(--muted-foreground)] hidden sm:inline">
            {t('audit.showingEntries', { count: filteredEntries.length, total: entries.length })}
          </span>
        </div>
      )}

      {/* Timeline List */}
      {!entries && !error ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : entries && filteredEntries.length === 0 ? (
        <Card className="p-12 text-center space-y-2">
          <History className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <p className="text-xs text-[var(--muted-foreground)]">{t('audit.empty')}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredEntries.map((item, idx) => {
            const isSuccess = !item.status || (item.status >= 200 && item.status < 400);

            return (
              <div
                key={`${item.t}-${idx}`}
                className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start md:items-center gap-3 min-w-0">
                  {/* Status Indicator Icon */}
                  <span
                    className={`p-1.5 rounded-lg shrink-0 mt-0.5 md:mt-0 ${
                      isSuccess ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  </span>

                  {/* Method Badge */}
                  <Badge
                    variant={
                      item.method === 'POST'
                        ? 'default'
                        : item.method === 'DELETE'
                        ? 'destructive'
                        : item.method === 'PUT'
                        ? 'warning'
                        : 'secondary'
                    }
                    className="text-[10px] font-mono py-0 px-1.5 h-4 shrink-0 font-semibold"
                  >
                    {item.method}
                  </Badge>

                  {/* Path & Details */}
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-medium text-[var(--foreground)] truncate">
                        {item.path}
                      </span>
                      {item.status && (
                        <span
                          className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                            isSuccess
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}
                        >
                          HTTP {item.status}
                        </span>
                      )}
                      {item.user && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--muted)] font-medium flex items-center gap-1 text-[var(--foreground)]">
                          <User className="w-2.5 h-2.5 text-primary" />
                          <span>{item.user}</span>
                          {item.role && <span className="opacity-60 uppercase text-[9px]">({item.role})</span>}
                        </span>
                      )}
                    </div>

                    {item.detail && (
                      <p className="text-[11px] font-mono text-[var(--muted-foreground)] truncate max-w-xl">
                        {item.detail}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Timestamp & IP */}
                <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] shrink-0 self-end md:self-center font-mono">
                  {item.ip && (
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3 opacity-60" />
                      {item.ip}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 opacity-60" />
                    {new Date(item.t).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

