// Fig 1 live layer: the carriage glides to a unit, the pin drops into its port, the dial reads it.
// Static art comes as SVG strings from geometry.ts; per frame we only write transforms and one path.
import { useEffect, useRef } from 'react';
import { ART, LABEL, WIDTH, HEIGHT, UNIT_X, PIN_UP, carriageAt, pinAt, needleOf } from './geometry';
import { FLEET, readoutOf, type Phase } from './model';

const html = (s: string) => ({ __html: s });

export function AgentlessBench() {
  const stage = useRef<HTMLDivElement>(null);
  const carriage = useRef<SVGGElement>(null);
  const pin = useRef<SVGGElement>(null);
  const needle = useRef<SVGPathElement>(null);
  const cable = useRef<SVGPathElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const units = useRef<SVGGElement>(null);

  useEffect(() => {
    const root = stage.current!;
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    // state
    let x = UNIT_X[0], lift = 0, liftRate = 0, cpu = FLEET[0].cpu;
    let current = 0, target = 0, phase: Phase = 'connected';
    let touring = !still.matches, holdUntil = 0, idleTimer = 0, frame = 0, last = 0, visible = false;

    const draw = () => {
      carriage.current!.setAttribute('transform', carriageAt(x));
      pin.current!.setAttribute('transform', pinAt(x, lift));
      needle.current!.setAttribute('d', needleOf(cpu));
      const text = readoutOf(phase, FLEET[current], FLEET[target], cpu);
      if (readout.current!.textContent !== text) readout.current!.textContent = text;
      root.setAttribute('aria-valuenow', String(target + 1));
      root.setAttribute('aria-valuetext', text);
      // only the connected unit's LED is lit; the cable flows only while a session is open
      units.current!.querySelectorAll<SVGGElement>('[data-led]').forEach((g) => {
        g.style.opacity = phase === 'connected' && Number(g.dataset.led) === target ? '1' : '0.15';
      });
      cable.current!.toggleAttribute('data-flow', phase === 'connected');
    };

    const go = (index: number) => {
      if (index === target && phase === 'connected') return;
      current = target === index ? current : target;
      target = index;
      phase = 'lifting';
      run();
    };

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      const calm = still.matches;
      const goalX = UNIT_X[target];

      if (calm) {
        x = goalX; lift = 0; liftRate = 0; cpu = FLEET[target].cpu; phase = 'connected';
      } else {
        // pin: a damped spring toward up or down; carriage: exponential follow, only with the pin up
        const wantLift = phase === 'lifting' || phase === 'travelling' ? PIN_UP : 0;
        for (let i = 0; i < 4; i++) {
          liftRate += ((wantLift - lift) * 260 - liftRate * 30) * (dt / 4);
          lift += liftRate * (dt / 4);
        }
        if (phase === 'lifting' && lift > PIN_UP * 0.92) phase = 'travelling';
        if (phase === 'travelling') {
          x += (goalX - x) * (1 - Math.exp(-dt / 0.32));
          if (Math.abs(goalX - x) < 0.4) { x = goalX; phase = 'lowering'; }
        }
        if (phase === 'lowering' && lift < 0.6 && Math.abs(liftRate) < 6) {
          lift = 0; liftRate = 0; phase = 'connected'; current = target; holdUntil = now + 2600;
        }
        // needle: rests at 0 while lifted, settles on the reading once connected
        const wantCpu = phase === 'connected' ? FLEET[target].cpu : 0;
        cpu += (wantCpu - cpu) * (1 - Math.exp(-dt / (phase === 'connected' ? 0.45 : 0.18)));
      }
      draw();

      if (touring && phase === 'connected' && now > holdUntil) go((target + 1) % FLEET.length);
      const settled = phase === 'connected' && Math.abs(cpu - FLEET[target].cpu) < 0.05 && !touring;
      frame = visible && !settled ? requestAnimationFrame(tick) : 0;
    };
    const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

    // user control pauses the tour; it resumes after a quiet spell
    const steer = (index: number) => {
      touring = false;
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => { touring = !still.matches; run(); }, 6000);
      go(index);
    };
    const onPointer = (e: PointerEvent) => {
      const box = root.getBoundingClientRect();
      const f = (e.clientX - box.left) / box.width;
      steer(f < 0.4 ? 0 : f < 0.62 ? 1 : 2);
    };
    const onKey = (e: KeyboardEvent) => {
      let to: number | null = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = Math.min(FLEET.length - 1, target + 1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = Math.max(0, target - 1);
      if (e.key === 'Home') to = 0;
      if (e.key === 'End') to = FLEET.length - 1;
      if (to === null) return;
      e.preventDefault();
      steer(to);
    };
    const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: '120px 0px' });
    io.observe(root);
    root.addEventListener('pointerdown', onPointer);
    root.addEventListener('keydown', onKey);
    draw();
    return () => {
      io.disconnect();
      root.removeEventListener('pointerdown', onPointer);
      root.removeEventListener('keydown', onKey);
      cancelAnimationFrame(frame);
      clearTimeout(idleTimer);
    };
  }, []);

  return (
    <figure className="iso-figure">
      <div className="iso-plate">
        <div className="iso-plate-corners" aria-hidden="true">
          <span className="iso-plate-corner" data-corner="fig">Fig 1</span>
          <span className="iso-plate-corner" data-corner="title">Agentless bench</span>
          <span className="iso-plate-corner" data-corner="hint">Click a unit · ← → keys</span>
          <span className="iso-plate-corner" data-corner="readout" data-readout ref={readout}>
            {readoutOf('connected', FLEET[0], FLEET[0], FLEET[0].cpu)}
          </span>
        </div>
        <div
          ref={stage}
          className="iso-stage"
          tabIndex={0}
          role="slider"
          aria-label="Agentless bench: arrow keys move the probe from server to server"
          aria-valuemin={1}
          aria-valuemax={FLEET.length}
          aria-valuenow={1}
        >
          <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={LABEL}>
            <g dangerouslySetInnerHTML={html(ART.base)} />
            <g dangerouslySetInnerHTML={html(ART.postBack)} />
            <g dangerouslySetInnerHTML={html(ART.beam)} />
            <path ref={cable} className="iso-line" data-tone="mid" d={`M${ART.cableFrom[0]} ${ART.cableFrom[1]}L${ART.cableTo[0]} ${ART.cableTo[1]}`} />
            <g ref={units} dangerouslySetInnerHTML={html(ART.units)} />
            <g ref={pin} dangerouslySetInnerHTML={html(ART.pin)} />
            <g ref={carriage}>
              <g dangerouslySetInnerHTML={html(ART.carriage)} />
              <path ref={needle} className="iso-line" data-tone="lit" data-free="" style={{ strokeWidth: 1.1 }} />
            </g>
          </svg>
        </div>
      </div>
      <figcaption className="iso-legend">
        <span className="iso-keys">
          <span className="iso-key"><Swatch mark="lit" />Probe pin and needle: one SSH session at a time</span>
          <span className="iso-key"><Swatch mark="raised" />Server units: nothing installed inside</span>
        </span>
        <span className="iso-caption">
          7Server reads each server over the SSH access you already have. No agent, no daemon, no port to open.
          The bench shows a demo fleet; the needle is that unit's CPU.
        </span>
      </figcaption>
    </figure>
  );
}

function Swatch({ mark }: { mark: 'lit' | 'raised' }) {
  return (
    <svg className="iso-swatch" data-mark={mark} viewBox="0 0 16 10" aria-hidden="true">
      <path d="M1 7 L8 3 L15 7" />
    </svg>
  );
}
