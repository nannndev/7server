import React, { useState } from 'react';
import { HistoryPoint } from '@/features/servers/api';

const SERIES = [
  { key: 'cpu', label: 'CPU', color: '#0284c7', gradId: 'grad-cpu' },
  { key: 'mem', label: 'RAM', color: '#db2777', gradId: 'grad-mem' },
  { key: 'disk', label: 'Disk', color: '#b45309', gradId: 'grad-disk' }
] as const;

interface SparklineProps {
  points: HistoryPoint[];
  currentMetrics?: { cpu?: number; mem?: number; disk?: number };
  height?: number;
  interactive?: boolean;
}

export default function Sparkline({
  points,
  currentMetrics,
  height = 48,
  interactive = true
}: SparklineProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [activeSeries, setActiveSeries] = useState<'all' | 'cpu' | 'mem' | 'disk'>('all');

  // If fewer than 2 points exist yet, synthesize a 2-point flat line from current metrics or first point so the chart is always visible.
  const effectivePoints: HistoryPoint[] = React.useMemo(() => {
    if (points.length >= 2) return points;
    if (points.length === 1) {
      return [{ ...points[0], t: points[0].t - 30000 }, points[0]];
    }
    const now = Date.now();
    const cpu = currentMetrics?.cpu ?? 0;
    const mem = currentMetrics?.mem ?? 0;
    const disk = currentMetrics?.disk ?? 0;
    return [
      { t: now - 30000, cpu, mem, disk },
      { t: now, cpu, mem, disk }
    ];
  }, [points, currentMetrics]);

  const w = 320;
  const padY = 4;
  const innerH = height - padY * 2;
  const t0 = effectivePoints[0].t;
  const span = effectivePoints[effectivePoints.length - 1].t - t0 || 1;

  const getCoords = (k: 'cpu' | 'mem' | 'disk') =>
    effectivePoints.map((p) => ({
      x: ((p.t - t0) / span) * w,
      y: padY + innerH - (Math.min(100, Math.max(0, p[k])) / 100) * innerH
    }));

  const linePath = (k: 'cpu' | 'mem' | 'disk') =>
    getCoords(k)
      .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(' ');

  const areaPath = (k: 'cpu' | 'mem' | 'disk') => {
    const coords = getCoords(k);
    if (!coords.length) return '';
    return `${linePath(k)} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;
  };

  const displayedPoint =
    hoverIdx !== null && effectivePoints[hoverIdx]
      ? effectivePoints[hoverIdx]
      : effectivePoints[effectivePoints.length - 1];

  const minutes = Math.max(1, Math.round(span / 60000));
  const visibleSeries = SERIES.filter((s) => activeSeries === 'all' || activeSeries === s.key);

  return (
    <div className="select-none">
      <div
        className="relative"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          if (!interactive) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const idx = Math.round(relX * (effectivePoints.length - 1));
          setHoverIdx(idx);
        }}
      >
        <svg
          viewBox={`0 0 ${w} ${height}`}
          preserveAspectRatio="none"
          className="w-full overflow-visible rounded"
          style={{ height }}
          role="img"
          aria-label={`Riwayat ${minutes} menit: CPU ${displayedPoint.cpu}%, RAM ${displayedPoint.mem}%, Disk ${displayedPoint.disk}%`}
        >
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.gradId} id={s.gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.0" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal reference grid lines (25%, 50%, 75%) */}
          {[0.25, 0.5, 0.75].map((r) => (
            <line
              key={r}
              x1={0}
              x2={w}
              y1={padY + innerH * r}
              y2={padY + innerH * r}
              stroke="currentColor"
              className="text-[var(--border)]"
              strokeDasharray="2 3"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Area fills */}
          {visibleSeries.map((s) => (
            <path key={`area-${s.key}`} d={areaPath(s.key)} fill={`url(#${s.gradId})`} />
          ))}

          {/* Stroke lines */}
          {visibleSeries.map((s) => (
            <path
              key={s.key}
              d={linePath(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Hover vertical indicator */}
          {hoverIdx !== null && effectivePoints[hoverIdx] && (
            <line
              x1={((effectivePoints[hoverIdx].t - t0) / span) * w}
              x2={((effectivePoints[hoverIdx].t - t0) / span) * w}
              y1={0}
              y2={height}
              stroke="currentColor"
              className="text-[var(--foreground)]/40"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className="flex items-center gap-2.5 mt-1.5 text-[10px] text-[var(--muted-foreground)] font-mono flex-wrap">
        {SERIES.map((s) => {
          const isMuted = activeSeries !== 'all' && activeSeries !== s.key;
          return (
            <button
              key={s.key}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveSeries((prev) => (prev === s.key ? 'all' : s.key));
              }}
              className={`flex items-center gap-1 transition hover:text-[var(--foreground)] ${
                isMuted ? 'opacity-35' : ''
              }`}
              title={`Filter grafik ${s.label}`}
            >
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
              <span>
                {s.label} <strong className="text-[var(--foreground)]">{displayedPoint[s.key]}%</strong>
              </span>
            </button>
          );
        })}
        <span className="ml-auto text-[9px]">
          {hoverIdx !== null
            ? new Date(displayedPoint.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : `${points.length > 1 ? `${minutes}m` : 'live'}`}
        </span>
      </div>
    </div>
  );
}
