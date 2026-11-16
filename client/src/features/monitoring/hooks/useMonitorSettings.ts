import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerItem, ServerMetrics } from '@/features/servers';
import { acknowledgeAlertApi, fetchMonitor, type ActiveAlert, type AlertHistoryEntry, type Thresholds } from '@/features/monitoring/api';

export const DEFAULT_THRESHOLDS: Thresholds = { cpu: 90, mem: 90, disk: 90 };

export function getAlerts(m: ServerMetrics | null | undefined, t: Thresholds): string[] {
  if (!m) return [];
  const out: string[] = [];
  if (m.cpuUsagePercent >= t.cpu) out.push(`CPU ${m.cpuUsagePercent}%`);
  if ((m.memory?.usedPercent || 0) >= t.mem) out.push(`RAM ${m.memory.usedPercent}%`);
  if ((m.disk?.usedPercent || 0) >= t.disk) out.push(`Disk ${m.disk.usedPercent}%`);
  return out;
}

/**
 * Alert thresholds + active alert count from the server (the background monitor owns them), and a
 * browser notification once per server+metric when it crosses a threshold.
 */
export function useMonitorSettings(servers: ServerItem[]) {
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertHistoryEntry[]>([]);
  const notified = useRef<Set<string>>(new Set());

  const sync = useCallback(() => {
    fetchMonitor()
      .then((d) => {
        setThresholds(d.settings.thresholds);
        setActiveAlerts(d.status.activeAlerts || []);
        setActiveAlertCount(d.status.activeAlerts.filter((a) => !a.acknowledged).length);
        setAlertHistory(d.history || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    sync();
    const t = setInterval(sync, 60000);
    return () => clearInterval(t);
  }, [sync]);

  const ackAlert = useCallback(async (key: string) => {
    try {
      const nextStatus = await acknowledgeAlertApi(key);
      setActiveAlerts(nextStatus.activeAlerts || []);
      setActiveAlertCount((nextStatus.activeAlerts || []).filter((a) => !a.acknowledged).length);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    for (const s of servers) {
      const alerts = getAlerts(s.metrics, thresholds);
      for (const a of alerts) {
        const key = `${s.id}:${a.split(' ')[0]}`;
        if (notified.current.has(key)) continue;
        notified.current.add(key);
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(`7Server: ${s.name}`, { body: `${a} melewati batas` });
        }
      }
      const active = new Set(alerts.map((a) => `${s.id}:${a.split(' ')[0]}`));
      for (const k of [...notified.current]) if (k.startsWith(`${s.id}:`) && !active.has(k)) notified.current.delete(k);
    }
  }, [servers, thresholds]);

  return {
    thresholds,
    setThresholds,
    activeAlertCount,
    setActiveAlertCount,
    activeAlerts,
    alertHistory,
    ackAlert,
    syncMonitor: sync,
    alertsFor: (s: ServerItem) => getAlerts(s.metrics, thresholds)
  };
}
