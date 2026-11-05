// The truth Fig "Server rack" shows: one 1U blade per server, its lamps and gauges from real metrics.
import type { ServerItem } from '@/features/servers/types';

export interface BladeState {
  id: string;
  name: string;
  online: boolean;
  /** 0–100, or null when the server has not reported yet */
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  containers: number;
  alerts: number;
}

export const bladeOf = (s: ServerItem, alerts: number): BladeState => {
  const m = s.metrics;
  return {
    id: s.id,
    name: s.name,
    online: s.status === 'online',
    cpu: m ? Math.round(m.cpuUsagePercent) : null,
    ram: m ? Math.round(m.memory.usedPercent) : null,
    disk: m ? Math.round(m.disk.usedPercent) : null,
    containers: m?.docker?.installed ? m.docker.runningContainers : 0,
    alerts
  };
};

/** Lamp level for a reading: green under 70, amber under 90, red above. */
export const levelOf = (v: number | null): 'ok' | 'warn' | 'hot' | 'off' => (v == null ? 'off' : v >= 90 ? 'hot' : v >= 70 ? 'warn' : 'ok');

/** Rack height in U: every server plus at least two empty slots, 6U minimum, 12U maximum shown. */
export const RACK_MIN_U = 10;
export const RACK_MAX_U = 16;
export const rackUnits = (count: number) => Math.min(RACK_MAX_U, Math.max(RACK_MIN_U, count + 2));

export function readoutOf(b: BladeState | undefined, pulled: boolean): string {
  if (!b) return 'empty rack';
  if (!b.online) return `${b.name} · offline`;
  const parts = [b.name, pulled ? 'selected' : 'in rack'];
  if (b.cpu != null) parts.push(`cpu ${b.cpu}%`, `ram ${b.ram}%`, `disk ${b.disk}%`);
  return parts.join(' · ');
}
