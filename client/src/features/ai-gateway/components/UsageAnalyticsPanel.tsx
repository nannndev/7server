import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Cpu,
  DollarSign,
  Download,
  Filter,
  KeyRound,
  Layers,
  LayoutGrid,
  RefreshCw,
  Rows3,
  Sparkles,
  TrendingUp,
  X
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useI18n } from '@/shared/i18n';
import type { UsageAnalytics, UsageGroupRow, UsageRange, UsageSeriesPoint } from '../types';

type ChartMetric = 'tokens' | 'io' | 'requests' | 'cost' | 'latency';

const GROUP_PALETTE = [
  '#10b981', // emerald
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#f59e0b', // amber
  '#fb7185', // rose
  '#22d3ee' // cyan
];

interface UsageAnalyticsPanelProps {
  analytics: UsageAnalytics | null;
  loading: boolean;
  range: UsageRange;
  onRangeChange: (range: UsageRange) => void;
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  selectedKeyId?: string;
  onSelectKeyId?: (keyId: string) => void;
  availableKeys?: { id: string; name: string }[];
  onRefresh: () => void;
}

export function formatCostUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatCompactNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString();
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 ms';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)} ms`;
}

/** Monotone cubic spline (Fritsch-Carlson) so curves are smooth and never overshoot below baseline. */
function buildMonotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;

  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = new Array(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    const ddx = pts[i + 1].x - pts[i].x || 1;
    const ddy = pts[i + 1].y - pts[i].y;
    dx.push(ddx);
    dy.push(ddy / ddx);
  }

  m[0] = dy[0];
  m[n - 1] = dy[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dy[i - 1] * dy[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (dy[i - 1] + dy[i]) * 0.5;
    }
  }

  // Clamp slopes to maintain strict monotonicity (no overshoots past min/max)
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(dy[i]) < 1e-6) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / dy[i];
    const beta = m[i + 1] / dy[i];
    const sumSq = alpha * alpha + beta * beta;
    if (sumSq > 9) {
      const tau = 3 / Math.sqrt(sumSq);
      m[i] = tau * alpha * dy[i];
      m[i + 1] = tau * beta * dy[i];
    }
  }

  let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const cp1x = pts[i].x + h;
    const cp1y = pts[i].y + m[i] * h;
    const cp2x = pts[i + 1].x - h;
    const cp2y = pts[i + 1].y - m[i + 1] * h;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
  }
  return path;
}

function niceCeil(val: number): number {
  if (val <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / pow;
  const step = norm <= 1.2 ? 1.2 : norm <= 2 ? 2 : norm <= 3 ? 3 : norm <= 5 ? 5 : norm <= 8 ? 8 : 10;
  return step * pow;
}

function getMetricValue(p: UsageSeriesPoint, metric: ChartMetric): number {
  if (metric === 'requests') return p.requests;
  if (metric === 'cost') return p.costUsd || 0;
  if (metric === 'latency') return p.avgDurationMs;
  if (metric === 'io') return p.inputTokens;
  return p.totalTokens;
}

/**
 * Full-width edge-to-edge architectural SVG telemetry chart:
 * - ResizeObserver-driven 1:1 pixel coordinate system (true full width on any screen size)
 * - Dual-layer composition: subtle volume pulse bars + dotted architectural mesh area + glowing monotone spline
 * - Automatic Peak beacon, active-bucket Average reference guide, and rich crosshair HUD tooltip
 */
function SmoothUsageChart({
  series,
  metric,
  isId,
  compact
}: {
  series: UsageSeriesPoint[];
  metric: ChartMetric;
  isId: boolean;
  compact: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerW, setContainerW] = useState<number>(960);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w >= 260) setContainerW(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = containerW;
  const H = compact ? 184 : 264;
  const PAD_L = 52;
  const PAD_R = 14;
  const PAD_T = 26;
  const PAD_B = 30;
  const plotW = Math.max(120, W - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const baseY = PAD_T + plotH;

  const {
    maxVal,
    maxReq,
    avgVal,
    avgY,
    peakIdx,
    peakVal,
    primaryPts,
    secondaryPts,
    ticks,
    slotW
  } = useMemo(() => {
    const vals = series.map((p) =>
      metric === 'io' ? Math.max(p.inputTokens, p.outputTokens) : getMetricValue(p, metric)
    );
    const rawMax = Math.max(metric === 'cost' ? 0.001 : 1, ...vals);
    const nice = niceCeil(rawMax);
    const n = series.length;
    const stepX = n > 1 ? plotW / (n - 1) : plotW;
    const computedSlotW = n > 1 ? Math.max(4, Math.min(22, (plotW / n) * 0.56)) : 18;

    const toPt = (i: number, v: number) => ({
      x: n > 1 ? PAD_L + i * stepX : PAD_L + plotW / 2,
      y: baseY - Math.max(0, Math.min(1, v / nice)) * plotH
    });

    const p1 = series.map((p, i) => toPt(i, getMetricValue(p, metric)));
    const p2 = metric === 'io' ? series.map((p, i) => toPt(i, p.outputTokens)) : [];

    // Average over active buckets so sparse histories remain meaningful
    const activeVals = vals.filter((v) => v > 0);
    const avg = activeVals.length > 0 ? activeVals.reduce((a, b) => a + b, 0) / activeVals.length : 0;
    const computedAvgY = avg > 0 ? baseY - Math.max(0, Math.min(1, avg / nice)) * plotH : null;

    let bestIdx = -1;
    let bestV = 0;
    series.forEach((p, i) => {
      const v = metric === 'io' ? Math.max(p.inputTokens, p.outputTokens) : getMetricValue(p, metric);
      if (v > bestV) {
        bestV = v;
        bestIdx = i;
      }
    });

    const tickVals = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
      y: baseY - r * plotH,
      value: Math.round(nice * r)
    }));

    return {
      maxVal: nice,
      maxReq: Math.max(1, ...series.map((s) => s.requests)),
      avgVal: avg,
      avgY: computedAvgY,
      peakIdx: bestIdx,
      peakVal: bestV,
      primaryPts: p1,
      secondaryPts: p2,
      ticks: tickVals,
      slotW: computedSlotW
    };
  }, [series, metric, plotW, plotH, baseY]);

  const primaryLine = useMemo(() => buildMonotonePath(primaryPts), [primaryPts]);
  const primaryArea = useMemo(() => {
    if (!primaryLine || primaryPts.length === 0) return '';
    const first = primaryPts[0];
    const last = primaryPts[primaryPts.length - 1];
    return `${primaryLine} L ${last.x.toFixed(2)} ${baseY} L ${first.x.toFixed(2)} ${baseY} Z`;
  }, [primaryLine, primaryPts, baseY]);

  const secondaryLine = useMemo(() => buildMonotonePath(secondaryPts), [secondaryPts]);
  const secondaryArea = useMemo(() => {
    if (!secondaryLine || secondaryPts.length === 0) return '';
    const first = secondaryPts[0];
    const last = secondaryPts[secondaryPts.length - 1];
    return `${secondaryLine} L ${last.x.toFixed(2)} ${baseY} L ${first.x.toFixed(2)} ${baseY} Z`;
  }, [secondaryLine, secondaryPts, baseY]);

  const primaryStroke =
    metric === 'io'
      ? '#38bdf8'
      : metric === 'requests'
      ? '#818cf8'
      : metric === 'cost'
      ? '#34d399'
      : metric === 'latency'
      ? '#f59e0b'
      : '#10b981';
  const primaryHighlight =
    metric === 'io'
      ? '#7dd3fc'
      : metric === 'requests'
      ? '#a5b4fc'
      : metric === 'cost'
      ? '#6ee7b7'
      : metric === 'latency'
      ? '#fcd34d'
      : '#6ee7b7';
  const secondaryStroke = '#10b981';

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || series.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * W;
    const clamped = Math.max(PAD_L, Math.min(W - PAD_R, relX));
    if (series.length === 1) {
      setHoverIdx(0);
      return;
    }
    const idx = Math.round(((clamped - PAD_L) / plotW) * (series.length - 1));
    setHoverIdx(Math.max(0, Math.min(series.length - 1, idx)));
  };

  const activePoint = hoverIdx !== null ? series[hoverIdx] : null;
  const activeCoord = hoverIdx !== null ? primaryPts[hoverIdx] : null;
  const activeCoord2 = hoverIdx !== null && secondaryPts.length > 0 ? secondaryPts[hoverIdx] : null;
  const peakPt = peakIdx >= 0 ? primaryPts[peakIdx] : null;

  // Dynamic X-axis label density based on available pixel width
  const maxLabels = Math.max(4, Math.floor(plotW / 92));
  const xLabelStep = series.length <= maxLabels ? 1 : Math.ceil(series.length / maxLabels);

  const gradPrimaryId = `aiGradP-${uid}`;
  const gradSecondaryId = `aiGradS-${uid}`;
  const dotPatternId = `aiDots-${uid}`;
  const glowFilterId = `aiGlow-${uid}`;

  const formatMetricVal = (v: number) =>
    metric === 'latency'
      ? formatLatency(v)
      : metric === 'cost'
      ? formatCostUsd(v)
      : metric === 'requests'
      ? Math.round(v).toLocaleString()
      : formatCompactNum(v);

  if (series.length === 0 || (maxVal <= 1 && series.every((s) => s.requests === 0))) {
    return (
      <div
        ref={wrapRef}
        style={{ height: H }}
        className="w-full flex flex-col items-center justify-center text-center gap-2 text-[var(--muted-foreground)]"
      >
        <BarChart3 className="w-7 h-7 opacity-35" />
        <p className="text-xs">
          {isId ? 'Belum ada traffic AI di rentang waktu ini.' : 'No AI traffic recorded in this time range yet.'}
        </p>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ height: H }}
        className="block w-full overflow-visible touch-none cursor-crosshair"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradPrimaryId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primaryStroke} stopOpacity="0.34" />
            <stop offset="55%" stopColor={primaryStroke} stopOpacity="0.11" />
            <stop offset="100%" stopColor={primaryStroke} stopOpacity="0.01" />
          </linearGradient>

          <linearGradient id={gradSecondaryId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={secondaryStroke} stopOpacity="0.28" />
            <stop offset="70%" stopColor={secondaryStroke} stopOpacity="0.06" />
            <stop offset="100%" stopColor={secondaryStroke} stopOpacity="0" />
          </linearGradient>

          {/* Subtle architectural dot-matrix pattern layered inside the curve area */}
          <pattern id={dotPatternId} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.85" fill={primaryStroke} fillOpacity="0.18" />
          </pattern>

          <filter id={glowFilterId} x="-15%" y="-25%" width="130%" height="150%">
            <feGaussianBlur stdDeviation="3.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Horizontal telemetry grid lines & Y-axis labels */}
        {ticks.map((tk, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={tk.y}
              x2={W - PAD_R}
              y2={tk.y}
              stroke="var(--border)"
              strokeDasharray={i === 0 ? undefined : '2 5'}
              strokeOpacity={i === 0 ? 0.95 : 0.6}
            />
            <text
              x={PAD_L - 8}
              y={tk.y + 3.5}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {formatMetricVal(tk.value)}
            </text>
          </g>
        ))}

        {/* Underlay micro-histogram bars: request pulse (or error spikes) beneath the main spline */}
        {series.map((p, i) => {
          const x = primaryPts[i]?.x;
          if (x === undefined || p.requests === 0) return null;
          const barMaxH = metric === 'requests' ? plotH : plotH * 0.34;
          const h = Math.max(3, (p.requests / maxReq) * barMaxH);
          const isHovered = hoverIdx === i;
          const hasErr = p.errors > 0;
          const barColor = hasErr ? '#f43f5e' : primaryStroke;
          return (
            <rect
              key={`bar-${p.bucket}`}
              x={x - slotW / 2}
              y={baseY - h}
              width={slotW}
              height={h}
              rx={Math.min(3, slotW / 2)}
              fill={barColor}
              fillOpacity={
                metric === 'requests'
                  ? isHovered
                    ? 0.28
                    : 0.12
                  : isHovered
                  ? 0.32
                  : hasErr
                  ? 0.26
                  : 0.11
              }
            />
          );
        })}

        {/* Hover column highlight band */}
        {activeCoord && (
          <rect
            x={activeCoord.x - Math.max(slotW, 14) / 2}
            y={PAD_T}
            width={Math.max(slotW, 14)}
            height={plotH}
            rx="4"
            fill="var(--foreground)"
            fillOpacity="0.035"
          />
        )}

        {/* Area gradient + dot-matrix architectural texture */}
        {primaryArea && (
          <>
            <path d={primaryArea} fill={`url(#${gradPrimaryId})`} />
            <path d={primaryArea} fill={`url(#${dotPatternId})`} opacity="0.7" />
          </>
        )}
        {secondaryArea && <path d={secondaryArea} fill={`url(#${gradSecondaryId})`} />}

        {/* Active-bucket Average baseline reference */}
        {avgY !== null && avgVal > 0 && (
          <g>
            <line
              x1={PAD_L}
              y1={avgY}
              x2={W - PAD_R}
              y2={avgY}
              stroke={primaryStroke}
              strokeOpacity="0.38"
              strokeWidth="1"
              strokeDasharray="5 4"
            />
            <g transform={`translate(${W - PAD_R - 72}, ${Math.max(PAD_T, avgY - 16)})`}>
              <rect
                width="72"
                height="15"
                rx="4"
                fill="var(--card)"
                fillOpacity="0.92"
                stroke={primaryStroke}
                strokeOpacity="0.45"
                strokeWidth="0.8"
              />
              <text
                x="36"
                y="10.5"
                textAnchor="middle"
                fill={primaryStroke}
                fontSize="9"
                fontWeight="600"
                fontFamily="ui-monospace, SFMono-Regular, monospace"
              >
                avg {formatMetricVal(avgVal)}
              </text>
            </g>
          </g>
        )}

        {/* Secondary smooth spline (Output tokens in Prompt vs Output mode) */}
        {secondaryLine && (
          <path
            d={secondaryLine}
            fill="none"
            stroke={secondaryStroke}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Primary glowing monotone spline + crisp bright highlight core */}
        {primaryLine && (
          <>
            <path
              d={primaryLine}
              fill="none"
              stroke={primaryStroke}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#${glowFilterId})`}
            />
            <path
              d={primaryLine}
              fill="none"
              stroke={primaryHighlight}
              strokeOpacity="0.55"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {/* Subtle knot dots on every active point when buckets are <= 31 */}
        {series.length <= 32 &&
          series.map((p, i) => {
            const pt = primaryPts[i];
            if (!pt || getMetricValue(p, metric) <= 0 || i === peakIdx || i === hoverIdx) return null;
            return (
              <circle
                key={`dot-${p.bucket}`}
                cx={pt.x}
                cy={pt.y}
                r="2.1"
                fill="var(--card)"
                stroke={primaryStroke}
                strokeWidth="1.4"
              />
            );
          })}

        {/* Automatic Peak Beacon callout */}
        {peakPt && peakVal > 0 && (
          <g>
            <circle cx={peakPt.x} cy={peakPt.y} r="7" fill={primaryStroke} fillOpacity="0.18" />
            <circle
              cx={peakPt.x}
              cy={peakPt.y}
              r="3.2"
              fill={primaryStroke}
              stroke="var(--card)"
              strokeWidth="1.5"
            />
            {hoverIdx !== peakIdx && (
              <g
                transform={`translate(${Math.min(
                  W - PAD_R - 74,
                  Math.max(PAD_L + 4, peakPt.x - 35)
                )}, ${Math.max(2, peakPt.y - 21)})`}
              >
                <rect
                  width="70"
                  height="16"
                  rx="8"
                  fill="var(--card)"
                  stroke={primaryStroke}
                  strokeOpacity="0.55"
                  strokeWidth="0.9"
                />
                <text
                  x="35"
                  y="11"
                  textAnchor="middle"
                  fill="var(--foreground)"
                  fontSize="9"
                  fontWeight="700"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                >
                  ▲ {formatMetricVal(peakVal)}
                </text>
              </g>
            )}
          </g>
        )}

        {/* X-axis labels */}
        {series.map((p, i) => {
          const isLast = i === series.length - 1;
          if (i % xLabelStep !== 0 && !isLast) return null;
          if (!isLast && series.length - 1 - i < Math.ceil(xLabelStep / 2)) return null;
          const x = primaryPts[i]?.x ?? PAD_L;
          return (
            <text
              key={`lbl-${p.bucket}`}
              x={x}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : isLast ? 'end' : 'middle'}
              fill={hoverIdx === i ? 'var(--foreground)' : 'var(--muted-foreground)'}
              fontWeight={hoverIdx === i ? '700' : '400'}
              fontSize="10"
              fontFamily="ui-monospace, SFMono-Regular, monospace"
            >
              {p.label}
            </text>
          );
        })}

        {/* Hover Laser Crosshair & Halo Points */}
        {activeCoord && (
          <g>
            <line
              x1={activeCoord.x}
              y1={PAD_T - 4}
              x2={activeCoord.x}
              y2={baseY}
              stroke={primaryStroke}
              strokeOpacity="0.55"
              strokeWidth="1.1"
              strokeDasharray="3 3"
            />
            <circle cx={activeCoord.x} cy={activeCoord.y} r="7.5" fill={primaryStroke} opacity="0.22" />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="3.8"
              fill="var(--card)"
              stroke={primaryStroke}
              strokeWidth="2.2"
            />
            {activeCoord2 && (
              <>
                <circle cx={activeCoord2.x} cy={activeCoord2.y} r="7" fill={secondaryStroke} opacity="0.22" />
                <circle
                  cx={activeCoord2.x}
                  cy={activeCoord2.y}
                  r="3.6"
                  fill="var(--card)"
                  stroke={secondaryStroke}
                  strokeWidth="2.2"
                />
              </>
            )}
          </g>
        )}
      </svg>

      {/* Rich Floating HUD Tooltip */}
      {activePoint && activeCoord && (() => {
        const tot = Math.max(1, activePoint.totalTokens);
        const promptShare = Math.round((activePoint.inputTokens / tot) * 100);
        return (
          <div
            style={{
              left: `${(activeCoord.x / W) * 100}%`,
              transform: activeCoord.x > W * 0.72 ? 'translate(-104%, 0)' : 'translate(12px, 0)'
            }}
            className="pointer-events-none absolute top-3 z-20 min-w-[205px] rounded-xl border border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md px-3.5 py-2.5 shadow-xl text-[11px] space-y-1.5"
          >
            <div className="font-mono font-semibold text-[var(--foreground)] border-b border-[var(--border)]/60 pb-1 flex items-center justify-between gap-2">
              <span>{activePoint.bucket}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-normal">
                {activePoint.requests} req
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">Total tokens</span>
              <span className="font-mono font-bold tabular-nums text-[var(--foreground)]">
                {formatCompactNum(activePoint.totalTokens)}
              </span>
            </div>

            {/* Prompt vs Output split mini-bar */}
            <div className="h-1.5 w-full rounded-full bg-[var(--muted)] overflow-hidden flex">
              <div style={{ width: `${promptShare}%` }} className="h-full bg-sky-400" />
              <div style={{ width: `${100 - promptShare}%` }} className="h-full bg-emerald-500" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Prompt ({promptShare}%)
              </span>
              <span className="font-mono tabular-nums text-[var(--foreground)]">
                {formatCompactNum(activePoint.inputTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Output ({100 - promptShare}%)
              </span>
              <span className="font-mono tabular-nums text-[var(--foreground)]">
                {formatCompactNum(activePoint.outputTokens)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-[var(--border)]/50">
              <span className="text-[var(--muted-foreground)]">{isId ? 'Latensi rata-rata' : 'Avg latency'}</span>
              <span className="font-mono tabular-nums text-[var(--foreground)]">
                {formatLatency(activePoint.avgDurationMs)}
              </span>
            </div>

            {activePoint.errors > 0 && (
              <div className="flex items-center justify-between gap-3 text-rose-500 font-semibold">
                <span>Errors</span>
                <span className="font-mono tabular-nums">{activePoint.errors}</span>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function GroupBreakdownCard({
  title,
  countLabel,
  rows,
  kind,
  selectedKey,
  onSelect,
  emptyLabel,
  compact
}: {
  title: string;
  countLabel: string;
  rows: UsageGroupRow[];
  kind: 'model' | 'provider' | 'key';
  selectedKey: string;
  onSelect: (key: string) => void;
  emptyLabel: string;
  compact: boolean;
}) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'p-3 gap-2' : 'p-4 gap-3'} flex flex-col`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {kind === 'model' ? (
            <Cpu className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : kind === 'key' ? (
            <KeyRound className="w-4 h-4 text-violet-500 shrink-0" />
          ) : (
            <Layers className="w-4 h-4 text-sky-500 shrink-0" />
          )}
          <h3 className="text-xs font-semibold text-[var(--foreground)] truncate">{title}</h3>
        </div>
        <span className="text-[10.5px] font-mono tabular-nums px-2 py-0.5 rounded-full bg-[var(--muted)] border border-[var(--border)] text-[var(--muted-foreground)] shrink-0">
          {countLabel}
        </span>
      </div>

      {/* Unified Multi-Segment Distribution Strip */}
      {rows.length > 0 && (
        <div className="h-1.5 w-full rounded-full bg-[var(--muted)] overflow-hidden flex gap-px p-[1px]">
          {rows.slice(0, 6).map((row, idx) => (
            <div
              key={`seg-${row.key}`}
              title={`${row.key}: ${row.sharePct.toFixed(1)}%`}
              style={{
                width: `${Math.max(3, row.sharePct)}%`,
                backgroundColor: GROUP_PALETTE[idx % GROUP_PALETTE.length]
              }}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
            />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="py-6 text-center text-xs text-[var(--muted-foreground)]">{emptyLabel}</div>
      ) : (
        <div className={`${compact ? 'space-y-1 max-h-[240px]' : 'space-y-2 max-h-[300px]'} overflow-y-auto pr-0.5`}>
          {rows.map((row, idx) => {
            const active = selectedKey !== 'all' && selectedKey.toLowerCase() === row.key.toLowerCase();
            const inPct = row.totalTokens > 0 ? Math.round((row.inputTokens / row.totalTokens) * 100) : 50;
            const iconBrand = kind === 'provider' ? row.key : row.provider || row.key.split('/')[0] || 'openai';
            const dotColor = GROUP_PALETTE[idx % GROUP_PALETTE.length];
            const displayLabel = row.label || row.key;

            if (compact) {
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => onSelect(active ? 'all' : row.key)}
                  className={`w-full text-left rounded-lg border px-2.5 py-1.5 transition-colors cursor-pointer flex items-center justify-between gap-2 text-[11px] ${
                    active
                      ? 'border-emerald-500/60 bg-emerald-500/[0.06]'
                      : 'border-[var(--border)]/70 bg-[var(--background)]/40 hover:border-[var(--rim)] hover:bg-[var(--muted)]/40'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span style={{ backgroundColor: dotColor }} className="w-1.5 h-1.5 rounded-full shrink-0" />
                    {kind === 'key' ? (
                      <KeyRound className="w-3 h-3 text-violet-400 shrink-0" />
                    ) : (
                      <BrandIcon
                        name={iconBrand}
                        className="w-3 h-3 shrink-0"
                        fallback={displayLabel.slice(0, 1).toUpperCase()}
                      />
                    )}
                    <span className={`truncate font-medium ${kind === 'model' ? 'font-mono text-[11px]' : kind === 'provider' ? 'capitalize' : ''}`}>
                      {displayLabel}
                    </span>
                    {kind === 'model' && row.provider && (
                      <span className="shrink-0 text-[9px] font-mono uppercase px-1 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                        {row.provider}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-[10.5px] tabular-nums">
                    <span className="text-[var(--muted-foreground)] hidden sm:inline">{formatCostUsd(row.costUsd || 0)}</span>
                    <span className="font-semibold text-[var(--foreground)]">{formatCompactNum(row.totalTokens)}</span>
                    <span className="text-[var(--muted-foreground)] w-10 text-right">{row.sharePct.toFixed(1)}%</span>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onSelect(active ? 'all' : row.key)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                  active
                    ? 'border-emerald-500/60 bg-emerald-500/[0.06]'
                    : 'border-[var(--border)]/80 bg-[var(--background)]/40 hover:border-[var(--rim)] hover:bg-[var(--muted)]/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      style={{ backgroundColor: dotColor }}
                      className="w-2 h-2 rounded-full shrink-0"
                    />
                    {kind === 'key' ? (
                      <KeyRound className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                    ) : (
                      <BrandIcon
                        name={iconBrand}
                        className="w-3.5 h-3.5 shrink-0"
                        fallback={displayLabel.slice(0, 1).toUpperCase()}
                      />
                    )}
                    <span className={`truncate font-medium ${kind === 'model' ? 'font-mono text-[11.5px]' : kind === 'provider' ? 'capitalize' : ''}`}>
                      {displayLabel}
                    </span>
                    {kind === 'model' && row.provider && (
                      <span className="shrink-0 text-[9.5px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] border border-[var(--border)]/70">
                        {row.provider}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">{formatCostUsd(row.costUsd || 0)}</span>
                    <span className="font-semibold text-[var(--foreground)]">{formatCompactNum(row.totalTokens)}</span>
                    <span className="text-[var(--muted-foreground)] w-11 text-right">{row.sharePct.toFixed(1)}%</span>
                  </div>
                </div>

                {/* Proportional Input vs Output Bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--muted)] overflow-hidden flex">
                  <div
                    style={{ width: `${Math.max(2, row.sharePct)}%` }}
                    className="h-full flex overflow-hidden rounded-full transition-all duration-300"
                  >
                    <div style={{ width: `${inPct}%` }} className="h-full bg-sky-400" />
                    <div style={{ width: `${100 - inPct}%` }} className="h-full bg-emerald-500" />
                  </div>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-[var(--muted-foreground)]">
                  <span>
                    {row.requests.toLocaleString()} req · {formatLatency(row.avgDurationMs)}
                    {row.errors > 0 && <span className="text-rose-500 ml-1.5">· {row.errors} err</span>}
                  </span>
                  <span>
                    In {formatCompactNum(row.inputTokens)} / Out {formatCompactNum(row.outputTokens)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UsageAnalyticsPanel({
  analytics,
  loading,
  range,
  onRangeChange,
  selectedProvider,
  onSelectProvider,
  selectedModel,
  onSelectModel,
  selectedKeyId = 'all',
  onSelectKeyId,
  availableKeys = [],
  onRefresh
}: UsageAnalyticsPanelProps) {
  const { locale } = useI18n();
  const isId = locale === 'id';
  const [metric, setMetric] = useState<ChartMetric>('tokens');
  const [compact, setCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem('7s.usageAnalytics.compact') === '1';
    } catch {
      return false;
    }
  });
  const toggleCompact = (next: boolean) => {
    setCompact(next);
    try {
      localStorage.setItem('7s.usageAnalytics.compact', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const ranges: { id: UsageRange; label: string }[] = [
    { id: '1d', label: isId ? 'Hari Ini (24j)' : 'Today (24h)' },
    { id: '7d', label: isId ? '7 Hari' : '7 Days' },
    { id: '30d', label: isId ? '30 Hari' : '30 Days' },
    { id: 'all', label: isId ? 'Semua' : 'All Time' }
  ];

  const metrics: { id: ChartMetric; label: string }[] = [
    { id: 'tokens', label: isId ? 'Total Token' : 'Total Tokens' },
    { id: 'io', label: 'Prompt vs Output' },
    { id: 'requests', label: isId ? 'Request' : 'Requests' },
    { id: 'cost', label: isId ? 'Biaya (USD)' : 'Est. Cost' },
    { id: 'latency', label: isId ? 'Latensi' : 'Latency' }
  ];

  const summary = analytics?.summary;
  const topModel = analytics?.byModel?.[0];
  const hasFilter = selectedProvider !== 'all' || selectedModel !== 'all' || selectedKeyId !== 'all';

  const keyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const k of availableKeys) map.set(k.id, k.name);
    for (const row of analytics?.byKey || []) {
      if (!map.has(row.key)) map.set(row.key, row.label || row.key);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [availableKeys, analytics?.byKey]);

  const exportAnalytics = (format: 'json' | 'csv') => {
    if (!analytics) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(analytics, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `7server-ai-usage-${analytics.range}-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const headers = ['bucket', 'label', 'requests', 'errors', 'input_tokens', 'output_tokens', 'total_tokens', 'cost_usd', 'avg_duration_ms'];
    const lines = [
      headers.join(','),
      ...analytics.series.map((s) =>
        [s.bucket, `"${String(s.label).replace(/"/g, '""')}"`, s.requests, s.errors, s.inputTokens, s.outputTokens, s.totalTokens, s.costUsd ?? 0, s.avgDurationMs].join(',')
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `7server-ai-usage-${analytics.range}-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute live peak summary pill for the chart header
  const chartPeak = useMemo(() => {
    const pts = analytics?.series || [];
    let best = 0;
    let bestLabel = '';
    for (const p of pts) {
      const v = metric === 'io' ? Math.max(p.inputTokens, p.outputTokens) : getMetricValue(p, metric);
      if (v > best) {
        best = v;
        bestLabel = p.label;
      }
    }
    return { best, bestLabel };
  }, [analytics, metric]);

  return (
    <div className="space-y-4">
      {/* Range Switcher & Active Cross-Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
          {ranges.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onRangeChange(r.id)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                range === r.id
                  ? 'btn-metal'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onSelectKeyId && keyOptions.length > 0 && (
            <select
              value={selectedKeyId}
              onChange={(e) => onSelectKeyId(e.target.value)}
              aria-label={isId ? 'Filter Virtual Key' : 'Filter by Virtual Key'}
              className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">{isId ? 'Semua Virtual Key' : 'All Virtual Keys'}</option>
              {keyOptions.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          )}
          {hasFilter && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-[var(--foreground)]">
              <Filter className="w-3 h-3 text-emerald-500" />
              <span className="font-mono">
                {[
                  selectedProvider !== 'all' ? selectedProvider : '',
                  selectedModel !== 'all' ? selectedModel : '',
                  selectedKeyId !== 'all' ? (keyOptions.find((k) => k.id === selectedKeyId)?.name || selectedKeyId) : ''
                ].filter(Boolean).join(' · ')}
              </span>
              <button
                type="button"
                onClick={() => {
                  onSelectProvider('all');
                  onSelectModel('all');
                  onSelectKeyId?.('all');
                }}
                className="ml-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] cursor-pointer"
                title={isId ? 'Hapus filter' : 'Clear filter'}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {analytics && (
            <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <button
                type="button"
                onClick={() => exportAnalytics('csv')}
                className="h-8 px-2.5 hover:bg-[var(--muted)] text-xs text-[var(--foreground)] inline-flex items-center gap-1 transition-colors cursor-pointer"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <div className="w-px h-4 bg-[var(--border)]" />
              <button
                type="button"
                onClick={() => exportAnalytics('json')}
                className="h-8 px-2.5 hover:bg-[var(--muted)] text-xs text-[var(--foreground)] inline-flex items-center gap-1 transition-colors cursor-pointer"
                title="Export JSON"
              >
                <span>JSON</span>
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)] text-xs text-[var(--foreground)] inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isId ? 'Muat ulang' : 'Refresh'}</span>
          </button>
          <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--card)] p-0.5">
            <button
              type="button"
              onClick={() => toggleCompact(true)}
              className={`h-7 px-2 rounded-md text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer ${
                compact ? 'btn-metal font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title={isId ? 'Tampilan ringkas' : 'Compact view'}
            >
              <Rows3 className="w-3 h-3" />
              <span className="hidden sm:inline">Compact</span>
            </button>
            <button
              type="button"
              onClick={() => toggleCompact(false)}
              className={`h-7 px-2 rounded-md text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer ${
                !compact ? 'btn-metal font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
              title={isId ? 'Tampilan lengkap' : 'Detailed view'}
            >
              <LayoutGrid className="w-3 h-3" />
              <span className="hidden sm:inline">Detailed</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className={`grid grid-cols-2 lg:grid-cols-5 ${compact ? 'gap-2' : 'gap-3'}`}>
        <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'px-3 py-2 flex items-center justify-between gap-2' : 'p-3.5'}`}>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{isId ? 'Total Token' : 'Total Tokens'}</span>
            </div>
            {!compact && (
              <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                {formatCompactNum(summary?.totalTokens || 0)}
              </div>
            )}
            <div className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--muted-foreground)] truncate">
              In {formatCompactNum(summary?.inputTokens || 0)} · Out {formatCompactNum(summary?.outputTokens || 0)}
            </div>
          </div>
          {compact && (
            <div className="text-base font-bold font-mono tabular-nums text-[var(--foreground)] shrink-0">
              {formatCompactNum(summary?.totalTokens || 0)}
            </div>
          )}
        </div>

        <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'px-3 py-2 flex items-center justify-between gap-2' : 'p-3.5'}`}>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <Activity className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>{isId ? 'Total Request' : 'Requests'}</span>
            </div>
            {!compact && (
              <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                {(summary?.requests || 0).toLocaleString()}
              </div>
            )}
            <div className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--muted-foreground)]">
              {summary?.requests ? `${summary.successRate}% ok` : isId ? 'Belum ada request' : 'No requests'}
              {summary && summary.errorCount > 0 && <span className="text-rose-500 ml-1">· {summary.errorCount} err</span>}
            </div>
          </div>
          {compact && (
            <div className="text-base font-bold font-mono tabular-nums text-[var(--foreground)] shrink-0">
              {(summary?.requests || 0).toLocaleString()}
            </div>
          )}
        </div>

        <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'px-3 py-2 flex items-center justify-between gap-2' : 'p-3.5'}`}>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{isId ? 'Rata-rata Latensi' : 'Avg Latency'}</span>
            </div>
            {!compact && (
              <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                {formatLatency(summary?.avgDurationMs || 0)}
              </div>
            )}
            <div className="mt-0.5 text-[10px] text-[var(--muted-foreground)] truncate">
              {summary?.uniqueModels || 0} model · {summary?.uniqueProviders || 0} provider
            </div>
          </div>
          {compact && (
            <div className="text-base font-bold font-mono tabular-nums text-[var(--foreground)] shrink-0">
              {formatLatency(summary?.avgDurationMs || 0)}
            </div>
          )}
        </div>

        <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'px-3 py-2 flex items-center justify-between gap-2' : 'p-3.5'}`}>
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{isId ? 'Estimasi Biaya' : 'Est. Cost'}</span>
            </div>
            {!compact && (
              <div className="mt-1.5 text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                {formatCostUsd(summary?.costUsd || 0)}
              </div>
            )}
            <div className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--muted-foreground)] truncate">
              {isId ? 'Berdasarkan harga token' : 'Token catalog est.'}
            </div>
          </div>
          {compact && (
            <div className="text-base font-bold font-mono tabular-nums text-[var(--foreground)] shrink-0">
              {formatCostUsd(summary?.costUsd || 0)}
            </div>
          )}
        </div>

        <div className={`rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'px-3 py-2 flex items-center justify-between gap-2' : 'p-3.5'}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <Cpu className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{isId ? 'Model Terbanyak' : 'Top Model'}</span>
            </div>
            <div className={`font-bold font-mono text-[var(--foreground)] truncate ${compact ? 'text-xs mt-0.5' : 'text-sm mt-1.5 pt-1'}`}>
              {topModel ? topModel.key : '—'}
            </div>
            <div className="mt-0.5 text-[10px] font-mono tabular-nums text-[var(--muted-foreground)] truncate">
              {topModel
                ? `${topModel.sharePct.toFixed(1)}% · ${formatCompactNum(topModel.totalTokens)} tok`
                : isId
                ? 'Belum ada data'
                : 'No usage yet'}
            </div>
          </div>
        </div>
      </div>

      {/* Full-Width Architectural Telemetry Chart */}
      <div className={`w-full rounded-xl border border-[var(--border)] bg-[var(--card)] ${compact ? 'p-3 sm:p-4 space-y-2' : 'p-4 sm:p-5 space-y-3'} overflow-hidden`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <h3 className="text-xs font-semibold text-[var(--foreground)]">
                {isId ? 'Telemetri Penggunaan AI' : 'AI Telemetry & Token Flow'}
              </h3>
            </div>

            {chartPeak.best > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--muted)]/80 border border-[var(--border)] text-[10px] font-mono tabular-nums text-[var(--muted-foreground)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Peak {metric === 'latency' ? formatLatency(chartPeak.best) : metric === 'cost' ? formatCostUsd(chartPeak.best) : metric === 'requests' ? `${chartPeak.best} req` : formatCompactNum(chartPeak.best)}
                {chartPeak.bestLabel ? ` (${chartPeak.bestLabel})` : ''}
              </span>
            )}

            {metric === 'io' ? (
              <div className="flex items-center gap-3 text-[10.5px] text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" /> Prompt
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Output
                </span>
              </div>
            ) : (
              <span className="hidden md:inline-flex items-center gap-1.5 text-[10.5px] text-[var(--muted-foreground)]">
                <span className="w-2 h-2 rounded-sm bg-[var(--foreground)]/20" />
                {isId ? 'Bar bawah = volume request' : 'Bottom bars = request pulse'}
              </span>
            )}
          </div>

          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
            {metrics.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer ${
                  metric === m.id
                    ? 'btn-metal'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <SmoothUsageChart series={analytics?.series || []} metric={metric} isId={isId} compact={compact} />
      </div>

      {/* Grouped Breakdown: Per Model, Per Provider & Per Virtual Key */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 ${compact ? 'gap-3' : 'gap-4'}`}>
        <GroupBreakdownCard
          title={isId ? 'Penggunaan per Model' : 'Usage by Model'}
          countLabel={`${analytics?.byModel.length || 0} model`}
          rows={analytics?.byModel || []}
          kind="model"
          selectedKey={selectedModel}
          onSelect={onSelectModel}
          emptyLabel={isId ? 'Belum ada penggunaan model di periode ini.' : 'No model usage in this period.'}
          compact={compact}
        />
        <GroupBreakdownCard
          title={isId ? 'Penggunaan per Provider' : 'Usage by Provider'}
          countLabel={`${analytics?.byProvider.length || 0} provider`}
          rows={analytics?.byProvider || []}
          kind="provider"
          selectedKey={selectedProvider}
          onSelect={onSelectProvider}
          emptyLabel={isId ? 'Belum ada penggunaan provider di periode ini.' : 'No provider usage in this period.'}
          compact={compact}
        />
        <GroupBreakdownCard
          title={isId ? 'Penggunaan per Virtual Key' : 'Usage by Virtual Key'}
          countLabel={`${analytics?.byKey?.length || 0} key`}
          rows={analytics?.byKey || []}
          kind="key"
          selectedKey={selectedKeyId}
          onSelect={(val) => onSelectKeyId?.(val)}
          emptyLabel={isId ? 'Belum ada penggunaan key di periode ini.' : 'No key usage in this period.'}
          compact={compact}
        />
      </div>
    </div>
  );
}
