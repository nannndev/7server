// Isometric server rack for the login screen (anatomy kit). Geometry is built once at
// module load as SVG strings; only the LEDs and screen glow move, driven by login state.
import React, { useEffect, useRef } from 'react';
import * as k from '@/shared/iso/iso-kit';
import { ISO_CSS } from '@/shared/iso/iso-kit';

export type RackState = 'idle' | 'typing' | 'busy' | 'error' | 'success';

const WIDTH = 520;
const HEIGHT = 480;

// ---------------- world layout (units ~ px of the real thing) ----------------
const FLOOR = { x: -86, y: -62, w: 180, d: 132, r: 8 };
const FLOOR_H = 10;
const FOOT_H = 5;

const RACK = { x: -34, y: -34, w: 72, d: 62, r: 3 };
const RACK_H = 104;
const PLINTH_H = 6;
const FACE_INSET = 5; // recess for the blade bay
const BLades = 6;
const BLADE_H = 11;
const BLADE_GAP = 3.2;
const BAY_Z0 = PLINTH_H + 6;

const CONSOLE = { x: -78, y: 22, w: 34, d: 26, r: 2.5 };
const CONSOLE_H = 16;

const P = k.fitProjection(
  [
    ...k.boxCorners(FLOOR, -FLOOR_H - FOOT_H, 0),
    [RACK.x, RACK.y, RACK_H + 10],
    [RACK.x + RACK.w, RACK.y + RACK.d, RACK_H + 10]
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 42 }
);

const at = (p: [number, number, number]) => k.iso(p, P);
const S = (paths: any, style: any) => k.solidSvg(paths, style);
const L = (d: string, style: any = {}) => k.lineSvg(d, style);
const D = (pts: [number, number][], style: any = {}) => k.dotsSvg(pts, style);

function floor(): string {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(FLOOR, -FLOOR_H - FOOT_H, FLOOR_H, P)}"/>`];
  // feet under the corners
  for (const [x, y] of k.corners(FLOOR, 18)) {
    out.push(S(k.cylinder(x, y, 6, -FLOOR_H - FOOT_H, FOOT_H, P, 24), { tone: 'lo' }));
  }
  out.push(S(k.slabOf(FLOOR, -FLOOR_H, FLOOR_H, P, 8, 1.4), { tone: 'lo' }));
  // raised-floor tile grooves
  for (let gx = FLOOR.x + 30; gx < FLOOR.x + FLOOR.w - 10; gx += 36) {
    out.push(L(k.lineOnTop([gx, FLOOR.y + 5], [gx, FLOOR.y + FLOOR.d - 5], 0, P), { tone: 'faint' }));
  }
  for (let gy = FLOOR.y + 33; gy < FLOOR.y + FLOOR.d - 10; gy += 33) {
    out.push(L(k.lineOnTop([FLOOR.x + 5, gy], [FLOOR.x + FLOOR.w - 5, gy], 0, P), { tone: 'faint' }));
  }
  // corner screws with rings
  const screws = k.corners(FLOOR, 8);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 14)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join('');
}

function cableTray(): string {
  // cable conduit from the console to the rack along the floor
  const out: string[] = [];
  const tray = { x: CONSOLE.x + CONSOLE.w - 2, y: 30, w: RACK.x - CONSOLE.x - CONSOLE.w + 4, d: 7, r: 1.5 };
  out.push(S(k.slabOf(tray, 0, 2.2, P, 3, 0.4), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(tray, 1.4), 2.2, P, 3), { tone: 'faint' }));
  out.push(D([at([tray.x + 3, tray.y + 3.5, 2.2]), at([tray.x + tray.w - 3, tray.y + 3.5, 2.2])], { size: 0.45 }));
  return out.join('');
}

function rack(): string {
  const out: string[] = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(RACK, 0, 1, P)}" style="filter:blur(6px)"/>`);
  // plinth
  out.push(S(k.slabOf(RACK, 0, PLINTH_H, P, 4, 0.8), { tone: 'lo' }));
  // cabinet shell
  out.push(S(k.slabOf(k.insetPlan(RACK, 1), PLINTH_H, RACK_H - PLINTH_H, P, 4, 1.2), { tone: 'mid' }));
  // side door on the big left face: seam, hinge dots, handle, and a label plate with rule lines
  const doorX = RACK.x + 1 - 0.01;
  const seam = (y: number) => L(k.segment([doorX, y, PLINTH_H + 4], [doorX, y, RACK_H - 4], P), { tone: 'faint' });
  out.push(seam(RACK.y + 6), seam(RACK.y + RACK.d - 7));
  out.push(D([at([doorX, RACK.y + 6, PLINTH_H + 8]), at([doorX, RACK.y + 6, RACK_H - 8])], { size: 0.45 }));
  // handle: a short vertical bar standing just off the face, both ends tied with dots
  out.push(L(k.segment([doorX, RACK.y + RACK.d - 11, RACK_H / 2 - 7], [doorX, RACK.y + RACK.d - 11, RACK_H / 2 + 7], P), { tone: 'hi' }));
  out.push(D([at([doorX, RACK.y + RACK.d - 11, RACK_H / 2 - 7]), at([doorX, RACK.y + RACK.d - 11, RACK_H / 2 + 7])], { size: 0.5, tone: 'hi' }));
  // label plate: a frame of four segments with three rule lines ending on the frame
  const lp = { y0: RACK.y + 14, y1: RACK.y + 40, z0: RACK_H - 30, z1: RACK_H - 14 };
  out.push(
    L(k.segment([doorX, lp.y0, lp.z0], [doorX, lp.y1, lp.z0], P), { tone: 'lo' }),
    L(k.segment([doorX, lp.y0, lp.z1], [doorX, lp.y1, lp.z1], P), { tone: 'lo' }),
    L(k.segment([doorX, lp.y0, lp.z0], [doorX, lp.y0, lp.z1], P), { tone: 'lo' }),
    L(k.segment([doorX, lp.y1, lp.z0], [doorX, lp.y1, lp.z1], P), { tone: 'lo' })
  );
  for (let i = 1; i <= 3; i++) {
    const z = lp.z0 + ((lp.z1 - lp.z0) / 4) * i;
    out.push(L(k.segment([doorX, lp.y0 + 2.5, z], [doorX, lp.y1 - 2.5 - (i === 3 ? 7 : 0), z], P), { tone: 'faint', free: 'end' }));
  }
  // recessed front bay (dark inner face drawn as inset slab on the front)
  const bay = { x: RACK.x + FACE_INSET, y: RACK.y - 0.01, w: RACK.w - FACE_INSET * 2, d: 2, r: 1 };
  out.push(S(k.slabOf(bay, BAY_Z0 - 2.5, BLades * (BLADE_H + BLADE_GAP) + 4, P, 3), { tone: 'lo', crease: 'none' }));
  return out.join('');
}

function blades(): string {
  const out: string[] = [];
  for (let i = 0; i < BLades; i++) {
    const z = BAY_Z0 + i * (BLADE_H + BLADE_GAP);
    const plan = { x: RACK.x + FACE_INSET + 1.6, y: RACK.y - 3.4, w: RACK.w - (FACE_INSET + 1.6) * 2, d: 4.4, r: 1 };
    out.push(S(k.slabOf(plan, z, BLADE_H, P, 3, 0.6), { tone: 'hi', crease: 'lo' }));
    // handle bar on the left of the face
    out.push(L(k.rise([plan.x + 3.2, plan.y - 0.01], z + 2, z + BLADE_H - 2, P), { tone: 'mid' }));
    // vent panel: a frame on the face, slot lines ending on the frame's sides
    const ventY = plan.y - 0.02;
    const vx0 = plan.x + 8, vx1 = plan.x + plan.w - 16, vz0 = z + 2.2, vz1 = z + BLADE_H - 2.2;
    out.push(
      L(k.segment([vx0, ventY, vz0], [vx1, ventY, vz0], P), { tone: 'lo' }),
      L(k.segment([vx0, ventY, vz1], [vx1, ventY, vz1], P), { tone: 'lo' }),
      L(k.segment([vx0, ventY, vz0], [vx0, ventY, vz1], P), { tone: 'lo' }),
      L(k.segment([vx1, ventY, vz0], [vx1, ventY, vz1], P), { tone: 'lo' })
    );
    for (let vz = vz0 + 2.4; vz < vz1 - 1; vz += 2.4) {
      out.push(L(k.segment([vx0, ventY, vz], [vx1, ventY, vz], P), { tone: 'faint' }));
    }
    // two LED holes drawn as live circles, controlled from the component
    const ledA = at([plan.x + plan.w - 11, ventY, z + BLADE_H / 2 + 1.6]);
    const ledB = at([plan.x + plan.w - 6.5, ventY, z + BLADE_H / 2 + 1.6]);
    out.push(
      `<circle class="rack-led" data-blade="${i}" data-slot="0" cx="${ledA[0].toFixed(2)}" cy="${ledA[1].toFixed(2)}" r="1.15"/>`,
      `<circle class="rack-led" data-blade="${i}" data-slot="1" cx="${ledB[0].toFixed(2)}" cy="${ledB[1].toFixed(2)}" r="1.15"/>`
    );
  }
  return out.join('');
}

function topUnit(): string {
  // cooling unit on the rack roof: low slab + fan ring + knurled hub
  const out: string[] = [];
  const cap = k.insetPlan(RACK, 6);
  out.push(S(k.slabOf(cap, RACK_H, 5, P, 4, 0.8), { tone: 'mid' }));
  const fan: [number, number] = [RACK.x + RACK.w / 2, RACK.y + RACK.d / 2];
  out.push(L(k.ring(fan[0], fan[1], 16, RACK_H + 5, P, 48), { tone: 'lo' }));
  out.push(L(k.ring(fan[0], fan[1], 12.5, RACK_H + 5, P, 40), { tone: 'faint' }));
  out.push(S(k.cylinder(fan[0], fan[1], 4, RACK_H + 5, 2.2, P, 24), { tone: 'hi' }));
  out.push(L(k.knurl(fan[0], fan[1], 4, RACK_H + 5, RACK_H + 7.2, 20, P), { tone: 'lo' }));
  // four fan guard spokes, each ending on the two rings
  for (const a of [0.4, 1.97, 3.54, 5.11]) {
    const sx = fan[0] + Math.cos(a) * 4.6, sy = fan[1] + Math.sin(a) * 4.6;
    const ex = fan[0] + Math.cos(a) * 15.6, ey = fan[1] + Math.sin(a) * 15.6;
    out.push(L(k.lineOnTop([sx, sy], [ex, ey], RACK_H + 5, P), { tone: 'faint' }));
  }
  // corner screws on the cap
  const caps = k.corners(cap, 4);
  out.push(D(caps.map(([x, y]) => at([x, y, RACK_H + 5])), { size: 0.45 }));
  return out.join('');
}

function console_(): string {
  // small operator console on the floor: body, sloped face suggestion, status lamp
  const out: string[] = [];
  out.push(`<path class="iso-halo" d="${k.haloOf(CONSOLE, 0, 1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(CONSOLE, 0, CONSOLE_H, P, 4, 0.8), { tone: 'mid' }));
  out.push(S(k.slabOf(k.insetPlan(CONSOLE, 2.5), CONSOLE_H, 2, P, 3, 0.5), { tone: 'hi', crease: 'lo' }));
  // screen inlay on top: live glow rectangle, plus three rule lines standing for text (free ends allowed)
  const scr = k.insetPlan(CONSOLE, 5);
  out.push(L(k.planOutline(scr, CONSOLE_H + 2, P, 3), { tone: 'lo' }));
  const sPts = k.pointsAt(
    [
      [scr.x, scr.y, CONSOLE_H + 2], [scr.x + scr.w, scr.y, CONSOLE_H + 2],
      [scr.x + scr.w, scr.y + scr.d, CONSOLE_H + 2], [scr.x, scr.y + scr.d, CONSOLE_H + 2]
    ] as [number, number, number][],
    P
  );
  out.push(`<path class="rack-screen" d="${k.pathOf(sPts, true)}"/>`);
  for (let i = 0; i < 3; i++) {
    const ly = scr.y + 5 + i * 5.5;
    out.push(
      L(k.lineOnTop([scr.x + 3, ly], [scr.x + scr.w - 3 - i * 6, ly], CONSOLE_H + 2.1, P), {
        tone: 'mid',
        free: 'end'
      })
    );
  }
  // status lamp on a short post beside the console
  const lamp: [number, number] = [CONSOLE.x + CONSOLE.w + 7, CONSOLE.y + 6];
  out.push(S(k.cylinder(lamp[0], lamp[1], 1.6, 0, 14, P, 14), { tone: 'mid', crease: 'none' }));
  out.push(S(k.cylinder(lamp[0], lamp[1], 3, 14, 3.4, P, 18), { tone: 'hi' }));
  const lampTop = at([lamp[0], lamp[1], 17.4]);
  out.push(`<circle class="rack-lamp" cx="${lampTop[0].toFixed(2)}" cy="${lampTop[1].toFixed(2)}" r="2.1"/>`);
  return out.join('');
}

const SVG = `<svg class="iso-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="An isometric server rack with six blades whose LEDs respond to the sign-in form: they flicker as you type, sweep while credentials are checked, turn red on a failure and green when the door opens.">${
  [floor(), cableTray(), console_(), rack(), blades(), topUnit()].join('')
}</svg>`;

const FIGURE_CSS = `
.rack-led{fill:var(--anatomy-lo);transition:fill .25s ease}
.rack-led[data-on]{fill:var(--anatomy-green)}
.rack-led[data-red]{fill:var(--anatomy-red)}
.rack-led[data-amber]{fill:#f59e0b}
.rack-lamp{fill:var(--anatomy-lo);transition:fill .3s ease}
.rack-lamp[data-on]{fill:var(--anatomy-green);filter:drop-shadow(0 0 3px var(--anatomy-green))}
.rack-lamp[data-red]{fill:var(--anatomy-red);filter:drop-shadow(0 0 3px var(--anatomy-red))}
.rack-screen{fill:var(--anatomy-blue);opacity:.08;transition:opacity .4s ease}
.rack-screen[data-on]{opacity:.3}
`;

export default function ServerRackFigure({ state, theme }: { state: RackState; theme: 'dark' | 'light' }) {
  const ref = useRef<HTMLDivElement>(null);
  const stateRef = useRef<RackState>(state);
  stateRef.current = state;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const leds = Array.from(root.querySelectorAll<SVGCircleElement>('.rack-led'));
    const lamp = root.querySelector<SVGCircleElement>('.rack-lamp');
    const screen = root.querySelector<SVGPathElement>('.rack-screen');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer = 0;
    let step = 0;

    const clear = () => leds.forEach((l) => { l.removeAttribute('data-on'); l.removeAttribute('data-red'); l.removeAttribute('data-amber'); });
    const setLamp = (attr: 'data-on' | 'data-red' | null) => {
      if (!lamp) return;
      lamp.removeAttribute('data-on');
      lamp.removeAttribute('data-red');
      if (attr) lamp.setAttribute(attr, '');
    };

    const tick = () => {
      const s = stateRef.current;
      step++;
      if (s === 'idle') {
        // one breathing LED wandering slowly up the rack
        clear();
        const i = Math.floor(step / 3) % BLades;
        if (step % 3 !== 2) leds[i * 2]?.setAttribute('data-on', '');
        setLamp('data-on');
        screen?.removeAttribute('data-on');
      } else if (s === 'typing') {
        // random flicker, like traffic hitting the machines
        clear();
        for (const l of leds) if (Math.random() < 0.4) l.setAttribute('data-on', '');
        setLamp('data-on');
        screen?.setAttribute('data-on', '');
      } else if (s === 'busy') {
        // a scan sweeping down the bay, amber
        clear();
        const i = step % BLades;
        leds[i * 2]?.setAttribute('data-amber', '');
        leds[i * 2 + 1]?.setAttribute('data-amber', '');
        setLamp(null);
        screen?.setAttribute('data-on', '');
      } else if (s === 'error') {
        // everything blinks red twice a second
        const on = step % 2 === 0;
        clear();
        if (on) for (const l of leds) l.setAttribute('data-red', '');
        setLamp('data-red');
        screen?.removeAttribute('data-on');
      } else {
        // success: all green, lamp green, screen bright
        clear();
        for (const l of leds) l.setAttribute('data-on', '');
        setLamp('data-on');
        screen?.setAttribute('data-on', '');
      }
    };

    tick();
    if (!still) timer = window.setInterval(tick, state === 'typing' ? 160 : state === 'busy' ? 220 : state === 'error' ? 300 : 700);
    return () => window.clearInterval(timer);
  }, [state]);

  return (
    <div ref={ref} className="iso select-none" data-theme={theme} aria-hidden>
      <style>{ISO_CSS + FIGURE_CSS}</style>
      {/* eslint-disable-next-line react/no-danger */}
      <div dangerouslySetInnerHTML={{ __html: SVG }} />
    </div>
  );
}
