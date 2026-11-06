// Live layer for the rack figure: blades slide on a spring, LEDs and the CPU dial follow real metrics.
// Static art is rebuilt only when the server list (count or names) changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen,
  Settings2,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Cpu,
  Database,
  HardDrive,
  Clock,
  Activity,
  Server,
  Box as BoxIcon,
  CheckCircle2,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import type { ServerItem } from '@/features/servers/types';
import type { ServerTab } from '@/app/router';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { useT } from '@/shared/i18n';
import '@/shared/iso/iso.css';
import { bladeOf, levelOf, rackUnits, readoutOf, type BladeState } from './model';
import { HEIGHT, LABEL, MAX_U, WIDTH, blankArt, bladeArt, frameBack, frameFront, layoutOf, ledPoint, needlePath, pullAt } from './geometry';

interface Props {
  servers: ServerItem[];
  alertsFor: (s: ServerItem) => string[];
  onManage: (s: ServerItem, tab?: ServerTab) => void;
  onOpenTerminal?: (s: ServerItem) => void;
  onOpenFiles?: (s: ServerItem) => void;
}

const html = (s: string) => ({ __html: s });
const LED_CLASS: Record<string, string> = { ok: 'rack-led-ok', warn: 'rack-led-warn', hot: 'rack-led-hot', off: 'rack-led-off' };

export default function ServerRack({ servers, alertsFor, onManage, onOpenTerminal, onOpenFiles }: Props) {
  const t = useT();
  const shown = servers.slice(0, MAX_U);
  const blades: BladeState[] = shown.map((s) => bladeOf(s, alertsFor(s).length));
  const shape = shown.map((s) => `${s.id}:${s.name}`).join('|');

  // Static art per layout (server count and names); metrics changes don't rebuild paths.
  const art = useMemo(() => {
    const L = layoutOf(rackUnits(shown.length));
    const bladesArt = shown.map((s, u) => bladeArt(L, u, s.name));
    const blanks = Array.from({ length: L.units - shown.length }, (_, i) => blankArt(L, shown.length + i)).join('');
    return { L, back: frameBack(L), front: frameFront(L), blades: bladesArt, blanks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape]);

  const [selected, setSelected] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);
  const dragStart = useRef<{ x: number; y: number; startPanX: number; startPanY: number; moved: boolean } | null>(null);

  const sel = blades[selected];
  const selServer = shown[selected];
  const stage = useRef<HTMLDivElement>(null);
  const groups = useRef<(SVGGElement | null)[]>([]);
  const needles = useRef<(SVGPathElement | null)[]>([]);
  const readout = useRef<HTMLSpanElement>(null);
  const target = useRef(selected);
  target.current = selected;

  // Wheel zoom handler on stage
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setZoom((z) => Math.min(2.5, Math.max(0.5, +(z + delta).toFixed(2))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Pull animation: each blade has its own spring toward 1 (selected) or 0.
  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const pos = shown.map((_, i) => (i === target.current ? 1 : 0));
    const vel = shown.map(() => 0);
    const cpuShown = blades.map((b) => b.cpu ?? 0);
    let frame = 0, last = 0, visible = false;
    const draw = () => {
      shown.forEach((_, i) => {
        groups.current[i]?.setAttribute('transform', pullAt(art.L, pos[i]));
        needles.current[i]?.setAttribute('d', needlePath(art.L, art.blades[i].dial, cpuShown[i]));
      });
    };
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      let moving = false;
      shown.forEach((_, i) => {
        const want = i === target.current ? 1 : 0;
        if (still.matches) { pos[i] = want; vel[i] = 0; }
        else for (let s = 0; s < 4; s++) { vel[i] += ((want - pos[i]) * 140 - vel[i] * 22) * (dt / 4); pos[i] += vel[i] * (dt / 4); }
        if (Math.abs(want - pos[i]) > 0.001 || Math.abs(vel[i]) > 0.001) moving = true; else { pos[i] = want; vel[i] = 0; }
        const goal = blades[i]?.cpu ?? 0;
        cpuShown[i] += (goal - cpuShown[i]) * (still.matches ? 1 : 1 - Math.exp(-dt / 0.5));
        if (Math.abs(goal - cpuShown[i]) > 0.05) moving = true;
      });
      draw();
      frame = visible && moving ? requestAnimationFrame(tick) : 0;
    };
    const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); });
    if (stage.current) io.observe(stage.current);
    draw();
    (stage.current as any).__kick = run;
    return () => { io.disconnect(); cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [art, blades.map((b) => b.cpu).join(',')]);

  useEffect(() => {
    (stage.current as any)?.__kick?.();
    if (readout.current) readout.current.textContent = readoutOf(sel, true);
  }, [selected, sel]);

  const pick = (i: number) => setSelected(Math.max(0, Math.min(blades.length - 1, i)));
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowUp: selected - 1, ArrowDown: selected + 1, Home: 0, End: blades.length - 1 };
    if (e.key in map) { e.preventDefault(); pick(map[e.key]); }
    if (e.key === 'Enter' && shown[selected]) onManage(shown[selected], 'overview');
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.hypot(dx, dy) > 4) {
      dragStart.current.moved = true;
      setIsDragging(true);
    }
    if (dragStart.current.moved) {
      setPan({
        x: Math.round(dragStart.current.startPanX + dx),
        y: Math.round(dragStart.current.startPanY + dy)
      });
    }
  };

  const onPointerUp = () => {
    setTimeout(() => {
      dragStart.current = null;
      setIsDragging(false);
    }, 10);
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleCopyHost = (str: string) => {
    navigator.clipboard.writeText(str);
    setCopiedHost(true);
    setTimeout(() => setCopiedHost(false), 2000);
  };

  const formatMB = (mb?: number) => {
    if (mb === undefined || mb === null) return '—';
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
  };

  // Painter's order: frame back, blanks, blades bottom-up, then the front posts and side panel. The
  // selected blade only eases out a few units, so it stays behind the posts like the others.
  const order = shown.map((_, i) => i).sort((a, b) => b - a);

  return (
    <div className="iso grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] items-start" data-theme="auto">
      {/* 3D Interactive Rack Visualizer */}
      <figure className="iso-figure relative">
        <div className="iso-plate rounded-xl relative overflow-hidden">
          <div className="iso-plate-corners" aria-hidden="true">
            <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
            <span className="iso-plate-corner" data-corner="title">{t('rack.title')}</span>
            <span className="iso-plate-corner" data-corner="hint">Scroll to Zoom · Drag to Pan · Click Blade to Slide Out</span>
            <span className="iso-plate-corner" data-corner="readout" ref={readout}>{readoutOf(sel, true)}</span>
          </div>

          {/* Floating Zoom & Pan Controls */}
          <div className="absolute top-3.5 right-4 z-20 flex items-center gap-1.5 bg-zinc-950/80 backdrop-blur-md border border-zinc-800 rounded-lg p-1 text-xs shadow-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}
              title="Zoom Out (or mouse wheel down)"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              title="Click to reset zoom to 100%"
              className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition cursor-pointer min-w-[42px] text-center"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(2)))}
              title="Zoom In (or mouse wheel up)"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-3.5 bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset View (Fit)"
              className="px-2 py-0.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition flex items-center gap-1 text-[11px] font-medium cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Fit</span>
            </button>
          </div>

          {/* Interactive Stage Canvas */}
          <div
            ref={stage}
            className="iso-stage rack-stage rounded-lg relative overflow-hidden select-none"
            style={{
              cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
              touchAction: 'none'
            }}
            tabIndex={0}
            role="listbox"
            aria-label={t('rack.aria')}
            aria-activedescendant={sel ? `rack-blade-${sel.id}` : undefined}
            onKeyDown={onKey}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onDoubleClick={handleResetZoom}
          >
            <div
              className="w-full h-full flex items-center justify-center transition-transform ease-out"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: '50% 50%',
                transitionDuration: isDragging ? '0ms' : '120ms'
              }}
            >
              <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={LABEL}>
                <g dangerouslySetInnerHTML={html(art.back)} />
                <g dangerouslySetInnerHTML={html(art.blanks)} />
                {order.map((i) => <Blade key={shown[i].id} i={i} />)}
                <g dangerouslySetInnerHTML={html(art.front)} />
              </svg>
            </div>
          </div>
        </div>

        <figcaption className="iso-legend">
          <span className="iso-caption">{t('rack.caption')}</span>
        </figcaption>
      </figure>

      {/* Right: High-Density Blade Telemetry & Chassis Control Center */}
      <aside className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl">
        {sel && selServer ? (
          <>
            {/* Header / Identity Card */}
            <div className="pb-3 border-b border-[var(--border)]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-semibold flex items-center gap-1.5">
                  <Server className="w-3 h-3" />
                  SLOT {selected + 1}U OF {art.L.units}U
                </span>
                <Badge variant={selServer.status === 'online' ? 'success' : 'destructive'} className="text-[10px] font-mono">
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${selServer.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  {selServer.status.toUpperCase()}
                </Badge>
              </div>

              <h3 className="text-base font-bold text-[var(--foreground)] truncate" title={sel.name}>
                {sel.name}
              </h3>

              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs font-mono text-[var(--muted-foreground)] truncate sensitive">
                  {selServer.username}@{selServer.host}:{selServer.port || 22}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyHost(`${selServer.username}@${selServer.host}`)}
                  className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition shrink-0 cursor-pointer"
                  title="Copy SSH connection string"
                >
                  {copiedHost ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* OS & Architecture Tags */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)]">
                  {selServer.metrics?.os || 'Linux'}
                </span>
                {selServer.metrics?.kernel && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--muted-foreground)] truncate max-w-[150px]" title={selServer.metrics.kernel}>
                    {selServer.metrics.kernel}
                  </span>
                )}
                {selServer.metrics?.uptime && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {selServer.metrics.uptime}
                  </span>
                )}
              </div>
            </div>

            {/* Live Hardware Telemetry Bars */}
            <div className="space-y-3 bg-[var(--background)]/60 border border-[var(--border)]/70 rounded-xl p-3.5">
              <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center justify-between">
                <span>Hardware Telemetry</span>
                <span className="font-mono text-emerald-400 text-[9px] flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                </span>
              </div>

              {/* CPU */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-sky-400" />
                    <span>CPU ({selServer.metrics?.cpuCores || 1} vCPU)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {selServer.metrics?.loadAverage && (
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)] hidden sm:inline" title="Load average 1m, 5m, 15m">
                        [{selServer.metrics.loadAverage.map(n => n.toFixed(2)).join(', ')}]
                      </span>
                    )}
                    <span className="font-mono font-bold text-[var(--foreground)]">{sel.cpu != null ? `${sel.cpu}%` : '—'}</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      levelOf(sel.cpu) === 'hot'
                        ? 'bg-red-500 shadow-[0_0_8px_#ef4444]'
                        : levelOf(sel.cpu) === 'warn'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{ width: `${sel.cpu ?? 0}%` }}
                  />
                </div>
              </div>

              {/* RAM */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-purple-400" />
                    <span>RAM Memory</span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--foreground)]">
                    {formatMB(selServer.metrics?.memory?.usedMB)} / {formatMB(selServer.metrics?.memory?.totalMB)} ({sel.ram != null ? `${sel.ram}%` : '—'})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      levelOf(sel.ram) === 'hot' ? 'bg-red-500' : levelOf(sel.ram) === 'warn' ? 'bg-amber-400' : 'bg-purple-400'
                    }`}
                    style={{ width: `${sel.ram ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--muted-foreground)] flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                    <span>Storage (Root /)</span>
                  </span>
                  <span className="font-mono text-[11px] text-[var(--foreground)]">
                    {formatMB(selServer.metrics?.disk?.usedMB)} / {formatMB(selServer.metrics?.disk?.totalMB)} ({sel.disk != null ? `${sel.disk}%` : '—'})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      levelOf(sel.disk) === 'hot' ? 'bg-red-500' : levelOf(sel.disk) === 'warn' ? 'bg-amber-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${sel.disk ?? 0}%` }}
                  />
                </div>
              </div>

              {/* Swap & Workloads row */}
              <div className="pt-1 flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono border-t border-[var(--border)]/50">
                <span>Swap: {selServer.metrics?.swap ? `${selServer.metrics.swap.usedPercent}% (${formatMB(selServer.metrics.swap.usedMB)})` : 'None'}</span>
                <span>{sel.containers} container{sel.containers === 1 ? '' : 's'} running</span>
              </div>
            </div>

            {/* Chassis Blade Selector (Quick Switcher) */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center justify-between">
                <span>Chassis Blade Units ({shown.length} Nodes)</span>
                <span className="text-[10px] font-mono text-zinc-500">Click to slide out</span>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                {shown.map((s, idx) => {
                  const isCurrent = idx === selected;
                  const b = blades[idx];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => pick(idx)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between border transition text-xs cursor-pointer ${
                        isCurrent
                          ? 'bg-sky-500/10 border-sky-500/40 text-zinc-100 shadow-sm'
                          : 'bg-[var(--background)] hover:bg-[var(--muted)]/50 border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            b.online ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500'
                          }`}
                        />
                        <span className="font-mono text-[10px] font-semibold text-sky-400 shrink-0">{idx + 1}U</span>
                        <span className="font-medium truncate">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                        <span className={levelOf(b.cpu) === 'hot' ? 'text-red-400' : 'text-zinc-400'}>
                          {b.cpu != null ? `${b.cpu}%` : '—'}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isCurrent ? 'text-sky-400 translate-x-0.5' : 'text-zinc-600'}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Action Navigation Grid */}
            <div className="space-y-2 pt-1 border-t border-[var(--border)]">
              <Button
                size="sm"
                onClick={() => onManage(selServer, 'overview')}
                className="w-full justify-center gap-1.5 font-semibold text-xs h-9 bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md cursor-pointer"
              >
                <Settings2 className="w-4 h-4" />
                <span>Buka Control Panel ({sel.name})</span>
              </Button>

              <div className="grid grid-cols-2 gap-1.5">
                {onOpenTerminal && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenTerminal(selServer)}
                    className="text-xs gap-1.5 h-8 justify-start cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    <span>SSH Terminal</span>
                  </Button>
                )}
                {onOpenFiles && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenFiles(selServer)}
                    className="text-xs gap-1.5 h-8 justify-start cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                    <span>SFTP Files</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onManage(selServer, 'docker')}
                  className="text-xs gap-1.5 h-8 justify-start cursor-pointer"
                >
                  <BoxIcon className="w-3.5 h-3.5 text-sky-400" />
                  <span>Docker</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onManage(selServer, 'services')}
                  className="text-xs gap-1.5 h-8 justify-start cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-purple-400" />
                  <span>Services</span>
                </Button>
              </div>
            </div>

            {/* Fleet Rack Health Summary Footer */}
            <div className="p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[10px] text-[var(--muted-foreground)] flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>Rack Health: Normal</span>
              </span>
              <span>{servers.filter(s => s.status === 'online').length}/{servers.length} Online</span>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-xs text-[var(--muted-foreground)]">
            {t('rack.empty')}
          </div>
        )}
        {servers.length > MAX_U && (
          <p className="text-[10px] text-[var(--muted-foreground)] text-center">
            {t('rack.more', { n: servers.length - MAX_U })}
          </p>
        )}
      </aside>
    </div>
  );

  function Blade({ i }: { i: number }) {
    const b = blades[i];
    const a = art.blades[i];
    const leds = [b.cpu, b.ram, b.disk].map((v, j) => ({ p: ledPoint(art.L, a.ledX[j], a.ledZ), lvl: b.online ? levelOf(v) : 'off' }));
    return (
      <g
        ref={(el) => { groups.current[i] = el; }}
        id={`rack-blade-${b.id}`}
        role="option"
        aria-selected={i === selected}
        aria-label={readoutOf(b, i === selected)}
        className="cursor-pointer rack-blade"
        data-selected={i === selected ? '' : undefined}
        onClick={() => {
          if (dragStart.current?.moved) return;
          pick(i);
        }}
        onDoubleClick={() => onManage(shown[i], 'overview')}
      >
        <g dangerouslySetInnerHTML={html(a.body)} />
        {leds.map(({ p, lvl }, j) => <circle key={j} cx={p[0]} cy={p[1]} r={1.15} className={LED_CLASS[lvl]} />)}
        <path ref={(el) => { needles.current[i] = el; }} className="iso-line" data-tone="lit" data-free="" style={{ strokeWidth: 0.9 }} />
      </g>
    );
  }
}
