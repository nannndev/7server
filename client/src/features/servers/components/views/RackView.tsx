import React, { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Play,
  Pause,
  Layers,
  Terminal,
  FolderOpen,
  Globe,
  Activity,
  Cpu,
  Database,
  HardDrive,
  Clock,
  ZoomIn,
  ZoomOut,
  Eye
} from 'lucide-react';
import { ServerItem } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Progress } from '@/shared/ui/progress';

const U = 62; // height of one 1U server blade (px)
const GAP = 8;
const PAD = 24;
const MIN_SLOTS = 6;

interface RackViewProps {
  servers: ServerItem[];
  alertsFor: (s: ServerItem) => string[];
  onManage: (s: ServerItem, tab?: 'overview' | 'webapps' | 'pm2' | 'services' | 'nginx' | 'ports' | 'terminal') => void;
  onOpenTerminal?: (s: ServerItem) => void;
  onOpenFiles?: (s: ServerItem) => void;
}

// 6-face CSS 3D Box with optional custom Front and Top faces
function Box({
  w,
  h,
  d,
  faceClass,
  front,
  topFace
}: {
  w: number;
  h: number;
  d: number;
  faceClass: string;
  front?: React.ReactNode;
  topFace?: React.ReactNode;
}) {
  const face = (style: React.CSSProperties, shade: number, content?: React.ReactNode) => (
    <div className={`absolute ${faceClass}`} style={style}>
      <div className="absolute inset-0 bg-black pointer-events-none" style={{ opacity: shade }} />
      {content}
    </div>
  );
  return (
    <div className="relative" style={{ width: w, height: h, transformStyle: 'preserve-3d' }}>
      {/* Back */}
      {face({ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` }, 0.45)}
      {/* Right */}
      {face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)` }, 0.32)}
      {/* Left */}
      {face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }, 0.32)}
      {/* Top */}
      {face(
        { width: w, height: d, top: (h - d) / 2, transform: `rotateX(90deg) translateZ(${h / 2}px)` },
        0.12,
        topFace
      )}
      {/* Bottom */}
      {face({ width: w, height: d, top: (h - d) / 2, transform: `rotateX(-90deg) translateZ(${h / 2}px)` }, 0.55)}
      {/* Front */}
      {front && (
        <div className="absolute inset-0" style={{ transform: `translateZ(${d / 2}px)` }}>
          {front}
        </div>
      )}
    </div>
  );
}

const barColor = (v: number) => (v >= 90 ? 'bg-red-500' : v >= 70 ? 'bg-amber-400' : 'bg-emerald-400');

function Bay({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={`${label} ${value}%`}>
      <div className="w-2.5 h-7 rounded-sm bg-zinc-950 border border-zinc-700 flex items-end overflow-hidden">
        <div className={`w-full ${barColor(value)} transition-all duration-700`} style={{ height: `${value}%` }} />
      </div>
      <span className="text-[8px] font-mono text-zinc-400 leading-none">{label}</span>
    </div>
  );
}

export default function RackView({
  servers,
  alertsFor,
  onManage,
  onOpenTerminal,
  onOpenFiles
}: RackViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [rot, setRot] = useState({ x: -14, y: -28 });
  const [zoom, setZoom] = useState(1);
  const [autoRotate, setAutoRotate] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => servers[0]?.id || null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const ro = new ResizeObserver(([e]) => setWidth(Math.min(540, Math.max(280, e.contentRect.width - 80))));
    ro.observe(el);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.min(1.85, Math.max(0.45, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  // Auto-orbit turntable animation
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    const tick = () => {
      setRot((r) => ({ ...r, y: ((r.y + 0.35 + 180) % 360) - 180 }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  const W = Math.max(260, width);
  const DEPTH = Math.round(W * 0.48);
  const compact = W < 400;
  const slots = Math.max(MIN_SLOTS, servers.length);
  const H = PAD * 2 + slots * U + (slots - 1) * GAP;
  const unitW = W - 28;
  const unitD = DEPTH - 20;

  const onPointerDown = (e: React.PointerEvent) => {
    setAutoRotate(false);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    d.x = e.clientX;
    d.y = e.clientY;
    setRot((r) => ({
      x: Math.max(-60, Math.min(45, r.x - dy * 0.35)),
      y: Math.max(-180, Math.min(180, r.y + dx * 0.45))
    }));
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current?.moved) e.stopPropagation();
    drag.current = null;
  };

  const selectedServer = servers.find((s) => s.id === selectedId) || servers[0] || null;

  const formatMB = (mb?: number) => {
    if (!mb) return '0 MB';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 space-y-4">
      {/* Top 3D Camera & Preset Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-[var(--foreground)] mr-2 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-sky-500" /> 3D Data Center Rack Studio
          </span>
          {(
            [
              { label: 'Isometric', x: -14, y: -28 },
              { label: 'Front', x: 0, y: 0 },
              { label: 'Side', x: -8, y: -68 },
              { label: 'Top-Down', x: -52, y: -20 }
            ] as const
          ).map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setAutoRotate(false);
                setRot({ x: preset.x, y: preset.y });
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-[var(--background)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] transition"
            >
              {preset.label}
            </button>
          ))}

          <button
            onClick={() => {
              setExploded((v) => !v);
              if (!exploded) setRot({ x: -26, y: -32 });
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition flex items-center gap-1 ${
              exploded
                ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
            }`}
            title="Tarik keluar seluruh blade server untuk melihat komponen internal"
          >
            <Eye className="w-3 h-3" /> Exploded Blade View
          </button>

          <button
            onClick={() => setAutoRotate((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition flex items-center gap-1 ${
              autoRotate
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
            }`}
          >
            {autoRotate ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            Orbit 360°
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] bg-[var(--background)] px-2.5 py-1 rounded-lg border border-[var(--border)]">
          <button
            onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={0.45}
            max={1.85}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20 accent-sky-400 cursor-pointer"
            aria-label="Zoom Rack 3D"
          />
          <button
            onClick={() => setZoom(1)}
            className="font-mono text-[11px] w-11 text-center hover:text-[var(--foreground)]"
            title="Klik untuk reset zoom 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(1.85, +(z + 0.1).toFixed(2)))}
            className="p-1 rounded hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-[var(--border)] mx-1" />
          <button
            onClick={() => {
              setAutoRotate(false);
              setExploded(false);
              setZoom(1);
              setRot({ x: -14, y: -28 });
            }}
            className="flex items-center gap-1 hover:text-[var(--foreground)] text-[11px]"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout: 3D Stage + Holographic Blade Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left/Center: 3D Interactive Viewport */}
        <div
          ref={stageRef}
          className="lg:col-span-7 flex flex-col items-center justify-center py-12 select-none cursor-grab active:cursor-grabbing relative overflow-hidden rounded-xl bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.07)_0%,transparent_70%)] border border-[var(--border)]/60"
          style={{ perspective: 1600, touchAction: 'pan-y', minHeight: 470 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => setTimeout(() => (drag.current = null), 0)}
          onPointerLeave={() => (drag.current = null)}
          onClickCapture={onClickCapture}
        >
          <div
            className="relative transition-transform duration-150"
            style={{
              transformStyle: 'preserve-3d',
              transform: `scale(${zoom}) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`
            }}
          >
            {/* 3D Data Center Floor Grid */}
            <div
              className="absolute pointer-events-none rounded-full"
              style={{
                width: W * 1.6,
                height: DEPTH * 1.8,
                left: -(W * 0.3),
                top: H - (DEPTH * 1.8) / 2 + 12,
                transform: 'rotateX(90deg)',
                backgroundImage:
                  'linear-gradient(to right, rgba(161,161,170,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(161,161,170,0.12) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                boxShadow: '0 0 80px rgba(0,0,0,0.6) inset'
              }}
            />

            {/* Rack cabinet (open front) */}
            <Box w={W} h={H} d={DEPTH} faceClass="bg-zinc-900/95 border border-zinc-700/80" />

            {/* Front EIA-310 19-inch mounting rails with U numbers */}
            {[0, W - 14].map((left, railIdx) => (
              <div
                key={left}
                className="absolute top-0 bg-zinc-800 border border-zinc-600 flex flex-col justify-around items-center py-4"
                style={{ left, width: 14, height: H, transform: `translateZ(${DEPTH / 2}px)` }}
              >
                {Array.from({ length: slots }).map((_, i) => (
                  <span key={i} className="text-[7px] font-mono text-zinc-400 leading-none">
                    {railIdx === 0 ? `${i + 1}U` : '•'}
                  </span>
                ))}
              </div>
            ))}

            {/* Server Units */}
            {Array.from({ length: slots }).map((_, i) => {
              const s = servers[i];
              const top = PAD + i * (U + GAP);
              if (!s) {
                return (
                  <div
                    key={`blank-${i}`}
                    className="absolute bg-zinc-900/90 border border-zinc-800 flex items-center justify-between px-4"
                    style={{
                      top,
                      left: 14,
                      width: unitW,
                      height: U,
                      transform: `translateZ(${DEPTH / 2 - 10}px)`
                    }}
                  >
                    <span className="text-[9px] font-mono text-zinc-600">SLOT {i + 1}U · EMPTY BAY</span>
                    <div className="w-1/2 h-1.5 bg-[repeating-linear-gradient(90deg,#27272a_0_6px,transparent_6px_10px)]" />
                  </div>
                );
              }

              const m = s.metrics;
              const alerts = alertsFor(s);
              const online = s.status === 'online';
              const cpu = m?.cpuUsagePercent || 0;
              const memPct = m?.memory?.usedPercent || 0;
              const isHover = hovered === s.id;
              const isSelected = selectedServer?.id === s.id;
              const pullOutZ = exploded ? 55 + i * 18 : isSelected ? 52 : isHover ? 28 : 0;

              return (
                <div
                  key={s.id}
                  className="absolute transition-transform duration-300 ease-out"
                  style={{
                    top,
                    left: 14,
                    transformStyle: 'preserve-3d',
                    transform: `translateZ(${pullOutZ}px)`
                  }}
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <Box
                    w={unitW}
                    h={U}
                    d={unitD}
                    faceClass="bg-zinc-800 border border-zinc-600"
                    /* Internal Blade Hardware View on Top Face */
                    topFace={
                      <div className="w-full h-full p-2.5 flex items-center justify-between bg-zinc-900/95 border border-zinc-700 text-[9px] font-mono text-zinc-400 overflow-hidden">
                        {/* Cooling Fans Row */}
                        <div className="flex flex-col gap-1.5 pr-2 border-r border-zinc-700">
                          {[0, 1, 2].map((fan) => (
                            <div
                              key={fan}
                              className="w-5 h-5 rounded-full border border-zinc-600 bg-zinc-950 flex items-center justify-center"
                            >
                              <div
                                className={`w-3.5 h-0.5 bg-sky-400/70 ${online ? 'animate-spin' : ''}`}
                                style={{ animationDuration: `${Math.max(0.2, 1.5 - cpu / 80)}s` }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* CPU Socket & RAM DIMM Slots */}
                        <div className="flex-1 px-3 flex items-center justify-around">
                          <div className="p-2 rounded bg-zinc-950 border border-sky-500/40 text-center">
                            <div className="text-[8px] text-sky-400 font-bold">CPU {m?.cpuCores || 1}C</div>
                            <div className="text-[9px] text-zinc-200">{cpu}%</div>
                          </div>
                          <div className="flex gap-1">
                            {[20, 40, 60, 80].map((thresh, idx) => (
                              <div
                                key={idx}
                                className={`w-1.5 h-10 rounded-xs ${
                                  memPct >= thresh ? 'bg-purple-400 shadow-[0_0_6px_#c084fc]' : 'bg-zinc-800'
                                }`}
                              />
                            ))}
                          </div>
                        </div>

                        {/* Dual PSU */}
                        <div className="pl-2 border-l border-zinc-700 text-right">
                          <div className="text-emerald-400 text-[8px]">PSU OK</div>
                          <div className="text-[8px] text-zinc-500">750W</div>
                        </div>
                      </div>
                    }
                    front={
                      <button
                        onClick={() => setSelectedId(s.id)}
                        onDoubleClick={() => onManage(s, 'overview')}
                        aria-label={`${s.name}, ${s.status}`}
                        className={`w-full h-full flex items-center gap-3 px-3 text-left bg-zinc-900 border-2 rounded-[3px] transition ${
                          alerts.length
                            ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                            : isSelected
                            ? 'border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.45)]'
                            : 'border-zinc-600 hover:border-zinc-400'
                        }`}
                      >
                        {/* Status LEDs */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              online
                                ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]'
                                : s.status === 'offline'
                                ? 'bg-red-500 shadow-[0_0_6px_#ef4444]'
                                : 'bg-zinc-500'
                            }`}
                          />
                          <span
                            className={`w-2 h-2 rounded-full ${
                              online ? 'bg-sky-400 motion-safe:animate-pulse' : 'bg-zinc-600'
                            }`}
                            style={{ animationDuration: `${Math.max(0.3, 2 - cpu / 50)}s` }}
                          />
                        </div>

                        {/* Mini OLED Display */}
                        <div className="min-w-0 flex-1 bg-zinc-950/90 border border-zinc-800 rounded px-2.5 py-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-100 truncate">{s.name}</span>
                            <span className="text-[9px] font-mono text-sky-400 shrink-0">
                              {m?.cpuCores || 1}vCPU
                            </span>
                          </div>
                          <div className="text-[10px] font-mono text-zinc-400 truncate">
                            <span className="sensitive">{s.host}</span>
                            {alerts.length > 0 && (
                              <span className="text-red-400 ml-2">⚠ {alerts.join(' · ')}</span>
                            )}
                          </div>
                        </div>

                        {!compact && m && (
                          <div className="flex gap-1.5 shrink-0">
                            <Bay label="CPU" value={cpu} />
                            <Bay label="RAM" value={m.memory?.usedPercent || 0} />
                            <Bay label="DSK" value={m.disk?.usedPercent || 0} />
                          </div>
                        )}

                        {/* Hot-Swap NVMe Drive Bays */}
                        {!compact && (
                          <div className="hidden sm:grid grid-cols-4 gap-1 shrink-0">
                            {Array.from({ length: 8 }).map((_, k) => (
                              <span
                                key={k}
                                className="w-3.5 h-2.5 rounded-[1px] bg-zinc-800 border border-zinc-700 flex items-center justify-end pr-0.5"
                              >
                                <span
                                  className={`w-0.5 h-0.5 rounded-full ${
                                    online && k < 4 ? 'bg-emerald-400' : 'bg-zinc-600'
                                  }`}
                                />
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="absolute bottom-2.5 left-4 right-4 flex items-center justify-between text-[10px] text-[var(--muted-foreground)] pointer-events-none">
            <span>Drag untuk rotasi 3D · Klik unit untuk inspeksi · Double-klik untuk buka panel</span>
            <span className="font-mono">
              Pitch {Math.round(rot.x)}° · Yaw {Math.round(rot.y)}°
            </span>
          </div>
        </div>

        {/* Right: Holographic 3D Blade Inspector Panel */}
        <div className="lg:col-span-5">
          {selectedServer ? (
            <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-lg">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-[var(--border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-[10px] text-sky-400 border-sky-500/30">
                      SLOTS {servers.findIndex((x) => x.id === selectedServer.id) + 1}U
                    </Badge>
                    <h3 className="text-base font-semibold text-[var(--foreground)]">{selectedServer.name}</h3>
                    <Badge variant={selectedServer.status === 'online' ? 'success' : 'destructive'}>
                      {selectedServer.status}
                    </Badge>
                  </div>
                  <p className="text-xs font-mono text-[var(--muted-foreground)] mt-1 sensitive">
                    {selectedServer.username}@{selectedServer.host}:{selectedServer.port || 22}
                  </p>
                </div>
              </div>

              {/* Telemetry Bars */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-sky-400" /> CPU ({selectedServer.metrics?.cpuCores || 1} Cores)
                    </span>
                    <span className="font-mono font-semibold text-[var(--foreground)]">
                      {selectedServer.metrics?.cpuUsagePercent ?? 0}%
                    </span>
                  </div>
                  <Progress value={selectedServer.metrics?.cpuUsagePercent ?? 0} />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-purple-400" /> RAM Memory
                    </span>
                    <span className="font-mono text-[var(--foreground)]">
                      {formatMB(selectedServer.metrics?.memory?.usedMB)} /{' '}
                      {formatMB(selectedServer.metrics?.memory?.totalMB)} (
                      {selectedServer.metrics?.memory?.usedPercent ?? 0}%)
                    </span>
                  </div>
                  <Progress value={selectedServer.metrics?.memory?.usedPercent ?? 0} />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-amber-400" /> Storage (Root /)
                    </span>
                    <span className="font-mono text-[var(--foreground)]">
                      {formatMB(selectedServer.metrics?.disk?.usedMB)} /{' '}
                      {formatMB(selectedServer.metrics?.disk?.totalMB)} (
                      {selectedServer.metrics?.disk?.usedPercent ?? 0}%)
                    </span>
                  </div>
                  <Progress value={selectedServer.metrics?.disk?.usedPercent ?? 0} />
                </div>
              </div>

              {/* Hardware Specs Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[var(--card)] p-3 rounded-lg border border-[var(--border)]">
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block font-sans">OS Distro</span>
                  <span className="text-[var(--foreground)] truncate block">
                    {selectedServer.metrics?.os || 'Linux'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block font-sans">Kernel</span>
                  <span className="text-[var(--foreground)] truncate block">
                    {selectedServer.metrics?.kernel || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block font-sans">Uptime</span>
                  <span className="text-[var(--foreground)] truncate flex items-center gap-1">
                    <Clock className="w-3 h-3 text-emerald-400" /> {selectedServer.metrics?.uptime || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--muted-foreground)] block font-sans">Swap / Docker</span>
                  <span className="text-[var(--foreground)] truncate block">
                    Swap {selectedServer.metrics?.swap?.usedPercent ?? 0}% ·{' '}
                    {selectedServer.metrics?.docker?.runningContainers ?? 0} Docker
                  </span>
                </div>
              </div>

              {/* Quick Blade Actions */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onManage(selectedServer, 'overview')}
                  className="gap-1.5 text-xs"
                >
                  <Activity className="w-3.5 h-3.5" /> Buka Control Panel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onManage(selectedServer, 'webapps')}
                  className="gap-1.5 text-xs"
                >
                  <Globe className="w-3.5 h-3.5" /> Apps (/var/www)
                </Button>
                {onOpenTerminal && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenTerminal(selectedServer)}
                    className="gap-1.5 text-xs"
                  >
                    <Terminal className="w-3.5 h-3.5" /> Web SSH Terminal
                  </Button>
                )}
                {onOpenFiles && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenFiles(selectedServer)}
                    className="gap-1.5 text-xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> SFTP File Manager
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-xs text-[var(--muted-foreground)]">
              Pilih unit server pada rak 3D untuk melihat telemetri detail.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
