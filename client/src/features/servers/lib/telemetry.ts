// Pure helpers behind the resource charts: series colors, time ranges, gap detection, per-series summary.
import type { HistoryPoint } from '../api';

export type Metric = 'cpu' | 'mem' | 'disk';

// Checked with the dataviz palette validator against both card surfaces (#121215 dark, #ffffff light):
// lightness band, chroma, colorblind separation and contrast all pass. Change them only by re-running it.
export const SERIES: readonly { key: Metric; label: string; color: string }[] = [
  { key: 'cpu', label: 'CPU', color: '#0284c7' },
  { key: 'mem', label: 'RAM', color: '#db2777' },
  { key: 'disk', label: 'Disk', color: '#b45309' }
];

export const RANGES = [
  { id: '1h', ms: 3_600_000 },
  { id: '6h', ms: 21_600_000 },
  { id: '24h', ms: 86_400_000 }
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

export const inRange = (points: HistoryPoint[], ms: number, now = Date.now()) => points.filter((p) => p.t >= now - ms);

/** Typical sampling step (median gap), so "missing data" is judged against the monitor's real interval. */
export function medianStep(points: HistoryPoint[]): number {
  if (points.length < 2) return 60_000;
  const gaps = points.slice(1).map((p, i) => p.t - points[i].t).sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Split the series where samples are missing (server or monitor down) so the line doesn't bridge an outage. */
export function segments(points: HistoryPoint[]): HistoryPoint[][] {
  const maxGap = medianStep(points) * 3;
  const out: HistoryPoint[][] = [];
  points.forEach((p, i) => {
    if (i === 0 || p.t - points[i - 1].t > maxGap) out.push([p]);
    else out[out.length - 1].push(p);
  });
  return out;
}

export interface SeriesStats {
  avg: number;
  min: number;
  max: number;
  maxAt: number;
  /** last - first value within the range */
  delta: number;
  /** time spent at or above the alert threshold (gaps capped, so an outage isn't counted) */
  aboveMs: number;
}

export function seriesStats(points: HistoryPoint[], k: Metric, threshold?: number): SeriesStats | null {
  if (!points.length) return null;
  const cap = medianStep(points) * 3;
  let sum = 0, min = Infinity, max = -Infinity, maxAt = points[0].t, aboveMs = 0;
  points.forEach((p, i) => {
    const v = p[k];
    sum += v;
    if (v < min) min = v;
    if (v > max) { max = v; maxAt = p.t; }
    if (i > 0 && threshold != null && v >= threshold) aboveMs += Math.min(p.t - points[i - 1].t, cap);
  });
  return { avg: sum / points.length, min, max, maxAt, delta: points[points.length - 1][k] - points[0][k], aboveMs };
}

/** Index of the sample closest in time to `t` (points sorted by t). */
export function nearestIdx(points: HistoryPoint[], t: number): number {
  let lo = 0, hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - points[lo - 1].t < points[lo].t - t ? lo - 1 : lo;
}

export const fmtDuration = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
