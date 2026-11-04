import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  RotateCcw,
  Play,
  Pause,
  Cpu,
  Database,
  HardDrive,
  Layers,
  Terminal,
  Globe,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { ServerItem } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';

interface CyberMatrixVisualizerProps {
  servers: ServerItem[];
  onManage: (s: ServerItem, tab?: 'overview' | 'webapps' | 'pm2' | 'services' | 'nginx' | 'ports' | 'terminal') => void;
  onOpenTerminal?: (s: ServerItem) => void;
}

// Extruded 3D Vertical Pillar (Tower) standing on the X-Z floor plane
function Pillar3D({
  x,
  z,
  width,
  height,
  color,
  topLabel,
  subLabel
}: {
  x: number;
  z: number;
  width: number;
  height: number;
  color: string;
  topLabel: string;
  subLabel: string;
}) {
  const h = Math.max(14, height);
  return (
    <div
      className="absolute transition-all duration-500"
      style={{
        width,
        height: h,
        left: x - width / 2,
        top: -h,
        transformStyle: 'preserve-3d',
        transform: `translateZ(${z}px)`
      }}
    >
      {/* Front Face */}
      <div
        className="absolute inset-0 border border-white/20 flex flex-col justify-end items-center pb-1"
        style={{
          background: `linear-gradient(to top, rgba(9,9,11,0.9), ${color})`,
          transform: `translateZ(${width / 2}px)`
        }}
      >
        <span className="text-[9px] font-mono font-bold text-white drop-shadow">{topLabel}</span>
      </div>
      {/* Back Face */}
      <div
        className="absolute inset-0 border border-white/10"
        style={{
          background: `linear-gradient(to top, rgba(9,9,11,0.95), ${color})`,
          opacity: 0.7,
          transform: `rotateY(180deg) translateZ(${width / 2}px)`
        }}
      />
      {/* Right Face */}
      <div
        className="absolute inset-0 border border-white/15"
        style={{
          background: `linear-gradient(to top, rgba(9,9,11,0.92), ${color})`,
          opacity: 0.85,
          transform: `rotateY(90deg) translateZ(${width / 2}px)`
        }}
      />
      {/* Left Face */}
      <div
        className="absolute inset-0 border border-white/15"
        style={{
          background: `linear-gradient(to top, rgba(9,9,11,0.92), ${color})`,
          opacity: 0.65,
          transform: `rotateY(-90deg) translateZ(${width / 2}px)`
        }}
      />
      {/* Top Glowing Cap */}
      <div
        className="absolute border border-white/40 flex items-center justify-center"
        style={{
          width,
          height: width,
          top: -width / 2,
          background: color,
          boxShadow: `0 0 18px ${color}`,
          transform: 'rotateX(90deg)'
        }}
      >
        <span className="text-[8px] font-mono font-bold text-zinc-950">{subLabel}</span>
      </div>
    </div>
  );
}

const NODE_COLORS = ['#38bdf8', '#10b981', '#a78bfa', '#f59e0b', '#f43f5e'];

export default function CyberMatrixVisualizer({
  servers,
  onManage,
  onOpenTerminal
}: CyberMatrixVisualizerProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [rot, setRot] = useState({ x: -24, y: 34 });
  const [zoom, setZoom] = useState(1);
  const [autoSpin, setAutoSpin] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.min(2.0, Math.max(0.45, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    if (!autoSpin) return;
    let raf = 0;
    const step = () => {
      setRot((r) => ({ ...r, y: (r.y + 0.4) % 360 }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [autoSpin]);

  // 5-Axis Radar Chart Calculation
  const axes = [
    { label: 'CPU %', getVal: (s: ServerItem) => s.metrics?.cpuUsagePercent || 0 },
    { label: 'RAM %', getVal: (s: ServerItem) => s.metrics?.memory?.usedPercent || 0 },
    { label: 'Disk %', getVal: (s: ServerItem) => s.metrics?.disk?.usedPercent || 0 },
    { label: 'Swap %', getVal: (s: ServerItem) => s.metrics?.swap?.usedPercent || 0 },
    {
      label: 'Load Saturation',
      getVal: (s: ServerItem) => {
        const cores = s.metrics?.cpuCores || 1;
        const l1 = s.metrics?.loadAverage?.[0] || 0;
        return Math.min(100, Math.round((l1 / cores) * 100));
      }
    }
  ];

  const cx = 150;
  const cy = 140;
  const radius = 95;

  const getPolygonPoints = (s: ServerItem) =>
    axes
      .map((ax, i) => {
        const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
        const r = (Math.max(8, ax.getVal(s)) / 100) * radius;
        return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
        <div>
          <h3 className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-purple-400" /> 3D Isometric Resource Matrix & Telemetry Radar
          </h3>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Perbandingan tinggi pilar beban 3D (CPU, RAM, Swap, Storage) dan profil radar antar-VPS secara real-time
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAutoSpin((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition flex items-center gap-1 ${
              autoSpin
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] border-[var(--border)]'
            }`}
          >
            {autoSpin ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            Orbit 360°
          </button>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
            <button
              onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.1).toFixed(2)))}
              className="p-0.5 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min={0.45}
              max={2.0}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-20 accent-purple-400 cursor-pointer"
              aria-label="Zoom Matrix 3D"
            />
            <button
              onClick={() => setZoom(1)}
              className="font-mono text-[11px] w-11 text-center hover:text-[var(--foreground)]"
              title="Klik untuk reset zoom 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.1).toFixed(2)))}
              className="p-0.5 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-[var(--border)] mx-0.5" />
            <button
              onClick={() => {
                setAutoSpin(false);
                setZoom(1);
                setRot({ x: -24, y: 34 });
              }}
              className="flex items-center gap-1 hover:text-[var(--foreground)] text-[11px]"
              title="Reset Zoom & Rotation"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: 3D Isometric Cityscape Pillars */}
        <div
          ref={stageRef}
          className="lg:col-span-7 relative overflow-hidden rounded-xl bg-[#09090b] border border-zinc-800/90 flex items-center justify-center select-none cursor-grab active:cursor-grabbing"
          style={{ perspective: 1300, minHeight: 420 }}
          onPointerDown={(e) => {
            setAutoSpin(false);
            drag.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setRot((r) => ({
              x: Math.max(-55, Math.min(-8, r.x - dy * 0.3)),
              y: r.y + dx * 0.45
            }));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <div
            className="relative transition-transform duration-100"
            style={{
              width: 460,
              height: 40,
              marginTop: 140,
              transformStyle: 'preserve-3d',
              transform: `scale(${zoom}) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`
            }}
          >
            {/* Isometric Base Floor Platform */}
            <div
              className="absolute border border-sky-500/30 rounded-xl"
              style={{
                width: 460,
                height: 300,
                left: 0,
                top: -150,
                transform: 'rotateX(90deg)',
                backgroundImage:
                  'linear-gradient(to right, rgba(56,189,248,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.14) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
                backgroundColor: 'rgba(18,18,21,0.88)',
                boxShadow: '0 0 50px rgba(56,189,248,0.12)'
              }}
            />

            {/* Render each Server's 4 3D Resource Towers */}
            {servers.map((srv, sIdx) => {
              const count = Math.max(1, servers.length);
              const baseX = count === 1 ? 230 : 120 + (sIdx / (count - 1)) * 220;
              const m = srv.metrics;
              const pillars = [
                {
                  key: 'CPU',
                  val: m?.cpuUsagePercent || 0,
                  color: '#38bdf8',
                  z: -75
                },
                {
                  key: 'RAM',
                  val: m?.memory?.usedPercent || 0,
                  color: '#a78bfa',
                  z: -25
                },
                {
                  key: 'SWP',
                  val: m?.swap?.usedPercent || 0,
                  color: '#f43f5e',
                  z: 25
                },
                {
                  key: 'DSK',
                  val: m?.disk?.usedPercent || 0,
                  color: '#f59e0b',
                  z: 75
                }
              ];

              return (
                <React.Fragment key={srv.id}>
                  {/* Server Nameplate floating in front */}
                  <div
                    onClick={() => onManage(srv, 'overview')}
                    className="absolute cursor-pointer px-2.5 py-1 rounded bg-zinc-900/95 border border-zinc-700 text-[10px] font-mono text-zinc-100 whitespace-nowrap hover:border-sky-400 transition"
                    style={{
                      left: baseX - 55,
                      top: -12,
                      transform: 'translateZ(125px)'
                    }}
                  >
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                    {srv.name}
                  </div>

                  {pillars.map((p) => (
                    <Pillar3D
                      key={`${srv.id}-${p.key}`}
                      x={baseX}
                      z={p.z}
                      width={34}
                      height={Math.round((p.val / 100) * 165) + 18}
                      color={p.color}
                      topLabel={`${p.val}%`}
                      subLabel={p.key}
                    />
                  ))}
                </React.Fragment>
              );
            })}
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-sky-400 inline-block" /> CPU
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-purple-400 inline-block" /> RAM
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-rose-500 inline-block" /> SWAP
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-amber-400 inline-block" /> DISK
              </span>
            </div>
            <span>Drag untuk memutar matriks 3D</span>
          </div>
        </div>

        {/* Right: Multi-Server Radar Polygon & Comparison Cards */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-4 flex flex-col items-center">
            <span className="text-xs font-semibold text-[var(--foreground)] mb-1">
              Multi-Node Telemetry Radar (0–100%)
            </span>
            <svg viewBox="0 0 300 275" className="w-full max-w-[300px]">
              {/* Concentric Radar Rings */}
              {[0.25, 0.5, 0.75, 1].map((ring) => (
                <polygon
                  key={ring}
                  points={axes
                    .map((_, i) => {
                      const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
                      const r = ring * radius;
                      return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="currentColor"
                  className="text-[var(--border)]"
                  strokeWidth={1}
                />
              ))}

              {/* Axis Spokes & Labels */}
              {axes.map((ax, i) => {
                const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
                const x2 = cx + Math.cos(angle) * radius;
                const y2 = cy + Math.sin(angle) * radius;
                const lx = cx + Math.cos(angle) * (radius + 22);
                const ly = cy + Math.sin(angle) * (radius + 16);
                return (
                  <g key={ax.label}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      className="text-[var(--border)]"
                      strokeWidth={1}
                    />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="currentColor"
                      className="text-[var(--muted-foreground)] font-mono"
                      fontSize="9.5"
                    >
                      {ax.label}
                    </text>
                  </g>
                );
              })}

              {/* Server Polygons */}
              {servers.map((srv, idx) => {
                const color = NODE_COLORS[idx % NODE_COLORS.length];
                return (
                  <polygon
                    key={srv.id}
                    points={getPolygonPoints(srv)}
                    fill={color}
                    fillOpacity={0.22}
                    stroke={color}
                    strokeWidth={2}
                  />
                );
              })}
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 justify-center text-xs">
              {servers.map((srv, idx) => {
                const color = NODE_COLORS[idx % NODE_COLORS.length];
                return (
                  <button
                    key={srv.id}
                    onClick={() => onManage(srv, 'overview')}
                    className="flex items-center gap-1.5 font-mono text-[11px] hover:underline"
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-[var(--foreground)] font-semibold">{srv.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Comparison Table */}
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left font-mono">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] text-[10px]">
                <tr>
                  <th className="py-2 px-3">NODE</th>
                  <th className="py-2 px-2">CPU</th>
                  <th className="py-2 px-2">RAM</th>
                  <th className="py-2 px-2">SWAP</th>
                  <th className="py-2 px-2">DISK</th>
                  <th className="py-2 px-3 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {servers.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--muted)]/50">
                    <td className="py-2 px-3 font-sans font-semibold text-[var(--foreground)]">{s.name}</td>
                    <td className="py-2 px-2 text-sky-400">{s.metrics?.cpuUsagePercent ?? 0}%</td>
                    <td className="py-2 px-2 text-purple-400">{s.metrics?.memory?.usedPercent ?? 0}%</td>
                    <td className="py-2 px-2 text-rose-400">{s.metrics?.swap?.usedPercent ?? 0}%</td>
                    <td className="py-2 px-2 text-amber-400">{s.metrics?.disk?.usedPercent ?? 0}%</td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] font-sans"
                          onClick={() => onManage(s, 'webapps')}
                        >
                          <Globe className="w-3 h-3 mr-1" /> Apps
                        </Button>
                        {onOpenTerminal && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => onOpenTerminal(s)}
                          >
                            <Terminal className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

