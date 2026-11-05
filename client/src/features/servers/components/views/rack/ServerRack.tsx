// Live layer for the rack figure: blades slide on a spring, LEDs and the CPU dial follow real metrics.
// Static art is rebuilt only when the server list (count or names) changes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FolderOpen, Settings2, Terminal } from 'lucide-react';
import type { ServerItem } from '@/features/servers/types';
import { Button } from '@/shared/ui/button';
import { useT } from '@/shared/i18n';
import '@/shared/iso/iso.css';
import { bladeOf, levelOf, rackUnits, readoutOf, type BladeState } from './model';
import { HEIGHT, LABEL, MAX_U, WIDTH, blankArt, bladeArt, frameBack, frameFront, layoutOf, ledPoint, needlePath, pullAt } from './geometry';

interface Props {
  servers: ServerItem[];
  alertsFor: (s: ServerItem) => string[];
  onManage: (s: ServerItem) => void;
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
  const sel = blades[selected];
  const stage = useRef<HTMLDivElement>(null);
  const groups = useRef<(SVGGElement | null)[]>([]);
  const needles = useRef<(SVGPathElement | null)[]>([]);
  const readout = useRef<HTMLSpanElement>(null);
  const target = useRef(selected);
  target.current = selected;

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
    if (e.key === 'Enter' && shown[selected]) onManage(shown[selected]);
  };

  // Painter's order: frame back, blanks, blades bottom-up, then the front posts and side panel. The
  // selected blade only eases out a few units, so it stays behind the posts like the others.
  const order = shown.map((_, i) => i).sort((a, b) => b - a);

  return (
    <div className="iso grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" data-theme="auto">
      <figure className="iso-figure">
        <div className="iso-plate rounded-xl">
          <div className="iso-plate-corners" aria-hidden="true">
            <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
            <span className="iso-plate-corner" data-corner="title">{t('rack.title')}</span>
            <span className="iso-plate-corner" data-corner="hint">{t('rack.hint')}</span>
            <span className="iso-plate-corner" data-corner="readout" ref={readout}>{readoutOf(sel, true)}</span>
          </div>
          <div
            ref={stage}
            className="iso-stage rack-stage rounded-lg"
            tabIndex={0}
            role="listbox"
            aria-label={t('rack.aria')}
            aria-activedescendant={sel ? `rack-blade-${sel.id}` : undefined}
            onKeyDown={onKey}
          >
            <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={LABEL}>
              <g dangerouslySetInnerHTML={html(art.back)} />
              <g dangerouslySetInnerHTML={html(art.blanks)} />
              {order.map((i) => <Blade key={shown[i].id} i={i} />)}
              <g dangerouslySetInnerHTML={html(art.front)} />
            </svg>
          </div>
        </div>
        <figcaption className="iso-legend">
          <span className="iso-caption">{t('rack.caption')}</span>
        </figcaption>
      </figure>

      <aside className="metal rounded-xl border p-4 space-y-3 self-start">
        {sel ? (
          <>
            <div>
              <div className="text-sm font-semibold">{sel.name}</div>
              <div className="text-[11px] font-mono text-[var(--muted-foreground)] sensitive">{shown[selected].host}</div>
            </div>
            {([['CPU', sel.cpu], ['RAM', sel.ram], [t('rack.disk'), sel.disk]] as const).map(([label, v]) => (
              <div key={label}>
                <div className="flex justify-between text-[11px]"><span>{label}</span><span className="font-mono">{v == null ? '—' : `${v}%`}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v ?? 0}>
                  <div className={`h-full rounded-full transition-[width] duration-700 ${levelOf(v) === 'hot' ? 'bg-red-500' : levelOf(v) === 'warn' ? 'bg-amber-500' : 'bg-[var(--ok)]'}`} style={{ width: `${v ?? 0}%` }} />
                </div>
              </div>
            ))}
            <div className="text-[11px] text-[var(--muted-foreground)]">
              {t('rack.containers', { n: sel.containers })}{sel.alerts ? ` · ${t('rack.alerts', { n: sel.alerts })}` : ''}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => onManage(shown[selected])}><Settings2 className="w-3.5 h-3.5 mr-1" />{t('rack.manage')}</Button>
              {onOpenTerminal && <Button size="sm" variant="outline" onClick={() => onOpenTerminal(shown[selected])}><Terminal className="w-3.5 h-3.5 mr-1" />SSH</Button>}
              {onOpenFiles && <Button size="sm" variant="outline" onClick={() => onOpenFiles(shown[selected])}><FolderOpen className="w-3.5 h-3.5 mr-1" />{t('rack.files')}</Button>}
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">{t('rack.empty')}</p>
        )}
        {servers.length > MAX_U && <p className="text-[10px] text-[var(--muted-foreground)]">{t('rack.more', { n: servers.length - MAX_U })}</p>}
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
        onClick={() => pick(i)}
        onDoubleClick={() => onManage(shown[i])}
      >
        <g dangerouslySetInnerHTML={html(a.body)} />
        {leds.map(({ p, lvl }, j) => <circle key={j} cx={p[0]} cy={p[1]} r={1.15} className={LED_CLASS[lvl]} />)}
        <path ref={(el) => { needles.current[i] = el; }} className="iso-line" data-tone="lit" data-free="" style={{ strokeWidth: 0.9 }} />
      </g>
    );
  }
}
