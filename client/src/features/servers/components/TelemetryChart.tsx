// Resource usage over time for one server: summary per series, range picker, alert line, crosshair tooltip.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryPoint } from '../api';
import type { Thresholds } from '@/features/monitoring/api';
import { SERIES, RANGES, inRange, segments, seriesStats, nearestIdx, fmtDuration, type Metric, type RangeId } from '../lib/telemetry';
import { useT } from '@/shared/i18n';

interface Props {
  points: HistoryPoint[];
  thresholds?: Thresholds;
  height?: number;
}

const PAD = { top: 8, right: 8, bottom: 22, left: 34 };
const time = (t: number, sec = false) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(sec ? { second: '2-digit' } : {}) });

export default function TelemetryChart({ points, thresholds, height = 200 }: Props) {
  const t = useT();
  const [range, setRange] = useState<RangeId>('1h');
  const [hidden, setHidden] = useState<Set<Metric>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  // Real pixel width so text and strokes aren't stretched by a viewBox.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ms = RANGES.find((r) => r.id === range)!.ms;
  const data = useMemo(() => inRange(points, ms), [points, ms]);
  const segs = useMemo(() => segments(data), [data]);
  const stats = useMemo(
    () => Object.fromEntries(SERIES.map((s) => [s.key, seriesStats(data, s.key, thresholds?.[s.key])])),
    [data, thresholds]
  ) as Record<Metric, ReturnType<typeof seriesStats>>;

  const visible = SERIES.filter((s) => !hidden.has(s.key));
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const tEnd = data.length ? data[data.length - 1].t : Date.now();
  const tStart = Math.min(data.length ? data[0].t : tEnd, tEnd - 60_000);
  const x = (tt: number) => PAD.left + ((tt - tStart) / (tEnd - tStart || 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (Math.min(100, Math.max(0, v)) / 100) * innerH;
  const line = (seg: HistoryPoint[], k: Metric) => seg.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join('');
  const area = (seg: HistoryPoint[], k: Metric) =>
    `${line(seg, k)}L${x(seg[seg.length - 1].t).toFixed(1)},${y(0)}L${x(seg[0].t).toFixed(1)},${y(0)}Z`;

  const last = data[data.length - 1];
  const hp = hover != null ? data[hover] : null;
  const alertLines = [...new Set(visible.map((s) => thresholds?.[s.key]).filter((v): v is number => v != null))];
  const ticks = Array.from({ length: 4 }, (_, i) => tStart + ((tEnd - tStart) * (i + 0.5)) / 4);

  const onMove = (e: React.PointerEvent) => {
    if (!data.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const tt = tStart + ((e.clientX - r.left - PAD.left) / innerW) * (tEnd - tStart);
    setHover(nearestIdx(data, tt));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (!data.length) return;
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    setHover((h) => Math.min(data.length - 1, Math.max(0, (h ?? data.length - 1) + step)));
  };
  const toggle = (k: Metric) =>
    setHidden((prev) => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n.size === SERIES.length ? prev : n; // keep at least one series on
    });

  return (
    <div className="space-y-4">
      {/* Summary: one tile per series; clicking it shows/hides the series. Values are readable without hovering. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {SERIES.map((s) => {
          const st = stats[s.key];
          const th = thresholds?.[s.key];
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={!off}
              title={t(off ? 'telemetry.show' : 'telemetry.hide', { name: s.label })}
              className={`text-left rounded-lg border border-[var(--border)] px-3 py-2.5 transition hover:bg-[var(--muted)] ${off ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <span className="w-3 h-[3px] rounded-full" style={{ background: s.color }} />
                {s.label}
                {st && th != null && st.max >= th && (
                  <span className="ml-auto text-[10px] font-medium text-red-500">⚠ {t('telemetry.hitAlert')}</span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-xl font-semibold tabular-nums text-[var(--foreground)]">{last ? Math.round(last[s.key]) : '–'}%</span>
                {st && Math.round(st.delta) !== 0 && (
                  <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {st.delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(st.delta))} {t('telemetry.vsStart')}
                  </span>
                )}
              </div>
              {st ? (
                <dl className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-[var(--muted-foreground)]">
                  <div><dt>{t('telemetry.avg')}</dt><dd className="font-mono text-[var(--foreground)]">{Math.round(st.avg)}%</dd></div>
                  <div><dt>{t('telemetry.peak')}</dt><dd className="font-mono text-[var(--foreground)]" title={time(st.maxAt)}>{Math.round(st.max)}% <span className="text-[var(--muted-foreground)]">{time(st.maxAt)}</span></dd></div>
                  <div><dt>{th != null ? t('telemetry.above', { n: th }) : t('telemetry.min')}</dt>
                    <dd className="font-mono text-[var(--foreground)]">{th != null ? (st.aboveMs ? fmtDuration(st.aboveMs) : '0m') : `${Math.round(st.min)}%`}</dd></div>
                </dl>
              ) : (
                <div className="mt-1.5 text-[10px] text-[var(--muted-foreground)]">{t('telemetry.noData')}</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Range picker */}
      <div className="flex items-center gap-2 text-xs">
        <div role="group" aria-label={t('telemetry.range')} className="inline-flex rounded-md border border-[var(--border)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => { setRange(r.id); setHover(null); }}
              className={`px-2.5 py-1 rounded font-mono transition ${range === r.id ? 'bg-[var(--muted)] text-[var(--foreground)] font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}
            >
              {r.id}
            </button>
          ))}
        </div>
        <span className="text-[var(--muted-foreground)]">{t('telemetry.samples', { n: data.length })}</span>
      </div>

      {/* Chart */}
      <div ref={boxRef} className="relative">
        {data.length < 2 ? (
          <div style={{ height }} className="flex items-center justify-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-lg">
            {t('telemetry.collecting')}
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            className="block outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded touch-none"
            tabIndex={0}
            role="img"
            aria-label={t('telemetry.aria', {
              range,
              summary: visible.map((s) => `${s.label} ${Math.round(last[s.key])}%, ${t('telemetry.avg')} ${Math.round(stats[s.key]!.avg)}%, ${t('telemetry.peak')} ${Math.round(stats[s.key]!.max)}%`).join('; ')
            })}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {/* Recessive grid + y labels */}
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} strokeDasharray={v ? '2 4' : undefined} />
                <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted-foreground)" className="font-mono">{v}%</text>
              </g>
            ))}
            {ticks.map((tt) => (
              <text key={tt} x={x(tt)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)" className="font-mono">{time(tt)}</text>
            ))}

            {/* Alert threshold(s) */}
            {alertLines.map((v) => (
              <g key={`th-${v}`}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="#ef4444" strokeOpacity={0.6} strokeWidth={1} strokeDasharray="5 4" />
                <text x={width - PAD.right} y={y(v) - 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">{t('telemetry.alertAt', { n: v })}</text>
              </g>
            ))}

            {/* Area only when one series is shown; three overlapping fills turn to mud. */}
            {visible.length === 1 && segs.filter((s) => s.length > 1).map((seg, i) => (
              <path key={`a${i}`} d={area(seg, visible[0].key)} fill={visible[0].color} fillOpacity={0.12} />
            ))}
            {visible.map((s) =>
              segs.map((seg, i) =>
                seg.length > 1 ? (
                  <path key={`${s.key}${i}`} d={line(seg, s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ) : (
                  <circle key={`${s.key}${i}`} cx={x(seg[0].t)} cy={y(seg[0][s.key])} r={2} fill={s.color} />
                )
              )
            )}

            {/* Crosshair */}
            {hp && (
              <g pointerEvents="none">
                <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--foreground)" strokeOpacity={0.35} />
                {visible.map((s) => (
                  <circle key={s.key} cx={x(hp.t)} cy={y(hp[s.key])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}

        {hp && (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-[128px] rounded-md border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-xs shadow-lg"
            style={x(hp.t) > width - 160 ? { right: width - x(hp.t) + 10 } : { left: x(hp.t) + 10 }}
          >
            <div className="mb-1 font-mono text-[10px] text-[var(--muted-foreground)]">{time(hp.t, true)}</div>
            {visible.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-2.5 h-[2px] rounded-full" style={{ background: s.color }} />
                <strong className="font-mono tabular-nums text-[var(--foreground)]">{Math.round(hp[s.key])}%</strong>
                <span className="text-[var(--muted-foreground)]">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
