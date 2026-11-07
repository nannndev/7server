import { useEffect, useRef, useState } from 'react';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';
import { fetchServers, fetchServerMetrics, fetchHistory, reorderServers, type HistoryPoint } from '@/features/servers/api';

const REFRESH_KEY = 'vps_hub_refresh';
const readRefresh = () => {
  try { return Number(localStorage.getItem(REFRESH_KEY) ?? 30); } catch { return 30; }
};

/** Server list, per-server metric history, manual + interval metrics refresh. */
export function useServers() {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [refreshSec, setRefreshSec] = useState<number>(readRefresh);

  const loadHistory = async (ids: string[]) => {
    const entries = await Promise.all(ids.map(async (id) => [id, await fetchHistory(id).catch(() => [])] as const));
    setHistory((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  };

  const reload = async () => {
    try {
      const data = await fetchServers();
      setServers(data);
      loadHistory(data.map((s) => s.id));
    } catch (err) {
      console.error('Error fetching servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const refreshAll = async (list: ServerItem[] = servers) => {
    if (list.length === 0) return;
    setIsRefreshingAll(true);
    try {
      const updated = await Promise.all(
        list.map(async (s) => {
          try {
            return { ...s, status: 'online' as const, metrics: await fetchServerMetrics(s.id) };
          } catch {
            return { ...s, status: 'offline' as const };
          }
        })
      );
      // Merge by id so servers added/removed during the refresh aren't clobbered.
      setServers((prev) => prev.map((s) => updated.find((u) => u.id === s.id) || s));
      loadHistory(updated.map((s) => s.id));
    } finally {
      setIsRefreshingAll(false);
    }
  };

  // Interval refresh reads the latest list through a ref so the timer isn't reset on every update.
  const serversRef = useRef(servers);
  serversRef.current = servers;
  useEffect(() => {
    try { localStorage.setItem(REFRESH_KEY, String(refreshSec)); } catch { /* private mode */ }
    if (!refreshSec) return;
    const t = setInterval(() => { if (!document.hidden) refreshAll(serversRef.current); }, refreshSec * 1000);
    return () => clearInterval(t);
  }, [refreshSec]);

  const onMetricsUpdated = (id: string, m: ServerMetrics) => {
    setServers((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'online', metrics: m } : s)));
    loadHistory([id]);
  };

  const reorder = async (orderedIds: string[]) => {
    const idMap = new Map(servers.map((s) => [s.id, s]));
    const next: ServerItem[] = [];
    for (const id of orderedIds) {
      const s = idMap.get(id);
      if (s) {
        next.push(s);
        idMap.delete(id);
      }
    }
    for (const remaining of idMap.values()) {
      next.push(remaining);
    }
    setServers(next);
    try {
      await reorderServers(orderedIds);
    } catch (err) {
      console.error('Failed to persist server order:', err);
      reload();
    }
  };

  return { servers, loading, history, reload, refreshAll, isRefreshingAll, refreshSec, setRefreshSec, onMetricsUpdated, reorder };
}
