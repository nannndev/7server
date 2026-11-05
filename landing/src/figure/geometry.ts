// Fig 1, "Agentless bench": one probe carriage on a gantry visits three server units and plugs an
// SSH pin into each one's port. Nothing sits inside the units: that is the point.
// Static art is built once here as SVG strings; live.tsx only moves the carriage, the pin and the needle.
import * as k from '../iso/iso-kit';
import { FLEET, angleOf } from './model';

export const WIDTH = 660;
export const HEIGHT = 420;

// ---- world layout (x along the bench, +y toward the viewer, z up; the camera looks from +x/+y)
const PLATE = { x: -170, y: -70, w: 340, d: 150, r: 9 };
const PLATE_H = 12;
const FOOT_H = 5;

/** Server units: 1U-style chassis standing on the plate, ports on the back top edge. */
export const UNIT_X = [-110, 0, 110];
const UNIT = { w: 78, d: 58, h: 22 };
const unitPlan = (cx: number): k.Plan => ({ x: cx - UNIT.w / 2, y: -8, w: UNIT.w, d: UNIT.d, r: 3 });
/** Where the probe pin lands: the SSH port socket on each unit's top, near the back. */
export const PORT_Y = 0;
export const PORT_Z = UNIT.h;

// Gantry: two posts at the ends carrying a beam along x behind the units.
const POST_X = [-160, 160];
const BEAM_Y = -24;
const BEAM_Z = 64;
const BEAM_H = 9;

/** Carriage hangs off the beam; its pin drops along z onto PORT (x = carriage x, y = PORT_Y). */
export const PIN_UP = 24; // pin travel: how far it lifts above the port
const ARM_Z = BEAM_Z + BEAM_H; // underside of the forward arm that carries the pin bushing
export const PIN_LEN = ARM_Z + 3 - PORT_Z - 2.2; // rest: tip in the port, top hidden inside the arm

const DIAL_R = 15;
const DIAL_X = 9; // dial mast sits right of the pin so the pin never passes behind the dial face
const DIAL_Z = BEAM_Z + BEAM_H + 22;

const corners3 = [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [UNIT_X[2] + DIAL_X + DIAL_R, BEAM_Y, DIAL_Z + 8] as k.Point3, [UNIT_X[0] + DIAL_X - DIAL_R, BEAM_Y, DIAL_Z + 8] as k.Point3, [POST_X[0], BEAM_Y, BEAM_Z + BEAM_H + 3] as k.Point3, [POST_X[1], BEAM_Y, BEAM_Z + BEAM_H + 3] as k.Point3];
export const P = k.fitProjection(corners3, WIDTH, HEIGHT, { pad: 26, azimuth: 38 });

const at = (p: k.Point3) => k.iso(p, P);
const S = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const L = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (pts: Array<k.Flat | [number, number, number]>, style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(pts, style);
const byDepth = (pts: k.Plane[]) => [...pts].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

// ---------------------------------------------------------------- base
function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: 'lo' }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: 'mid' }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: 'mid' }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: 'lo' }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(''), { tone: 'lo' }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // ruler strip along the front edge: one tick every 5 units, major every 25
  const strip = { x: -150, y: PLATE.y + PLATE.d - 15, w: 300, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: 'lo', crease: 'none' }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));

  // label plate at the front right: three rule lines stand for printed text
  const label = { x: -150, y: PLATE.y + 8, w: 50, d: 16, r: 1.4 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 4), { tone: 'lo', crease: 'none' }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), 0.8, P, 4), { tone: 'faint' }));
  [[30, 0], [22, 4.5], [26, 9]].forEach(([len, dy]) => out.push(L(k.lineOnTop([label.x + 5, label.y + 4 + dy], [label.x + 5 + len, label.y + 4 + dy], 0.8, P), { tone: 'lo', free: true })));
  out.push(D([at([label.x + 2.4, label.y + 3, 0.8]), at([label.x + label.w - 2.4, label.y + label.d - 3, 0.8])], { size: 0.4 }));
  return out.join('');
}

// ---------------------------------------------------------------- server units
function unit(cx: number, index: number) {
  const plan = unitPlan(cx);
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, 2), 0, 0.1, P)}" style="filter:blur(5px)"/>`];
  // four rubber pads under the chassis
  for (const [x, y] of byDepth(k.corners(plan, 8))) out.push(S(k.cylinder(x, y, 2.6, 0, 1.4, P, 16), { tone: 'lo' }));
  // chassis body with a lid seam 4 under the top
  const seam = k.lineSvg(k.sideSeam(plan, UNIT.h - 4, P, 4), { tone: 'faint' });
  out.push(S(k.slabOf(plan, 1.4, UNIT.h - 1.4, P, 4, 0.6), { tone: 'hi', crease: 'lo', inner: seam }));
  // lid: vent slots (closed outlines) in two rows, and four lid screws
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      const slot = { x: plan.x + 10 + i * 9.6, y: plan.y + 26 + row * 7, w: 6.4, d: 3, r: 1.4 };
      out.push(L(k.planOutline(slot, UNIT.h, P, 3), { tone: 'lo' }));
    }
  }
  out.push(D(k.corners(plan, 4).map(([x, y]) => at([x, y, UNIT.h])), { size: 0.45 }));
  // front bezel: power button ring, two status LEDs (the lit one is the "connected" lamp)
  const front = plan.y + plan.d;
  out.push(L(k.sideRing([plan.x + 10, front, UNIT.h / 2 + 1], 3, 'y', P), { tone: 'mid' }));
  out.push(L(k.sideRing([plan.x + 10, front, UNIT.h / 2 + 1], 1.4, 'y', P), { tone: 'lo' }));
  out.push(`<g data-led="${index}">${L(k.sideRing([plan.x + 20, front, UNIT.h / 2 + 1], 1.2, 'y', P), { tone: 'lit' })}</g>`);
  out.push(L(k.sideRing([plan.x + 26, front, UNIT.h / 2 + 1], 1.2, 'y', P), { tone: 'lo' }));
  // drive bays: three closed slots across the right half of the bezel
  for (let i = 0; i < 3; i++) {
    const x0 = plan.x + 36 + i * 13;
    out.push(L(k.pathOf([at([x0, front, 6]), at([x0 + 10, front, 6]), at([x0 + 10, front, UNIT.h - 7]), at([x0, front, UNIT.h - 7])], true), { tone: 'lo' }));
  }
  // SSH port socket on the lid, near the back: a raised boss with a bore
  out.push(S(k.slabOf({ x: cx - 7, y: PORT_Y - 5, w: 14, d: 10, r: 2 }, UNIT.h, 2.2, P, 3, 0.4), { tone: 'mid' }));
  out.push(L(k.ring(cx, PORT_Y, 2.4, UNIT.h + 2.2, P, 18), { tone: 'hi' }));
  out.push(D([at([cx - 4.6, PORT_Y, UNIT.h + 2.2]), at([cx + 4.6, PORT_Y, UNIT.h + 2.2])], { size: 0.4 }));
  // one engraved label per unit is the figure's only text
  out.push(k.faceTextSvg(k.topMatrix([plan.x + plan.w - 6, plan.y + plan.d - 6], UNIT.h, P, 'x'), FLEET[index].name, { size: 3.2, tone: 'lo', anchor: 'end' }));
  return out.join('');
}

// ---------------------------------------------------------------- gantry
function post(x: number) {
  const out: string[] = [];
  const foot = { x: x - 9, y: BEAM_Y - 9, w: 18, d: 18, r: 2.5 };
  out.push(S(k.slabOf(foot, 0, 4, P, 4, 0.6), { tone: 'mid' }));
  out.push(D(k.corners(foot, 3).map(([px, py]) => at([px, py, 4])), { size: 0.45 }));
  out.push(S(k.cylinder(x, BEAM_Y, 4.2, 4, BEAM_Z - 4, P, 28), { tone: 'mid', crease: 'none', inner: L([22, 44].map((z) => k.sideArc(x, BEAM_Y, 4.2, z, P, 16)).join(''), { tone: 'faint' }) }));
  const clamp = { x: x - 8, y: BEAM_Y - 8, w: 16, d: 16, r: 2.5 };
  out.push(S(k.slabOf(clamp, BEAM_Z - 3, BEAM_H + 6, P, 4, 0.6), { tone: 'mid' }));
  out.push(D([at([x - 4.5, BEAM_Y - 4.5, BEAM_Z + BEAM_H + 3]), at([x + 4.5, BEAM_Y + 4.5, BEAM_Z + BEAM_H + 3])], { size: 0.45 }));
  return out.join('');
}

function beam() {
  const out: string[] = [];
  const bar = { x: POST_X[0] + 8, y: BEAM_Y - 5, w: POST_X[1] - POST_X[0] - 16, d: 10, r: 1.5 };
  out.push(S(k.slabOf(bar, BEAM_Z, BEAM_H, P, 3, 0.5), { tone: 'mid' }));
  // linear rail on top of the beam with a tick scale on its front edge, stopping at each unit's centre
  const rail = { x: bar.x + 6, y: BEAM_Y - 2, w: bar.w - 12, d: 4, r: 0.8 };
  out.push(S(k.slabOf(rail, BEAM_Z + BEAM_H, 1.8, P, 3, 0.3), { tone: 'mid' }));
  const ticks = k.sideTicks(bar.x + 4, bar.x + bar.w - 4, 5, 5, bar.y + bar.d, BEAM_Z + BEAM_H, [1.6, 3], P, 'x');
  out.push(L(ticks.minor, { tone: 'lo' }), L(ticks.major, { tone: 'mid' }));
  // detents: a small dot above each unit, where the carriage stops
  out.push(D(UNIT_X.map((x) => at([x, BEAM_Y, BEAM_Z + BEAM_H + 1.8])), { size: 0.7, tone: 'hi' }));
  return out.join('');
}

// ---------------------------------------------------------------- carriage (built at x = 0, moved by live.tsx)
function carriage() {
  const out: string[] = [];
  const block = { x: -14, y: BEAM_Y - 9, w: 28, d: 18, r: 2.5 };
  out.push(S(k.slabOf(block, BEAM_Z + BEAM_H - 2, 9, P, 4, 0.6), { tone: 'mid' }));
  out.push(D(k.corners(block, 3).map(([x, y]) => at([x, y, BEAM_Z + BEAM_H + 7])), { size: 0.45 }));
  // forward arm from the block over the units to the pin line; the pin passes through its bore
  const arm = { x: -6, y: BEAM_Y + 9, w: 12, d: PORT_Y + 6 - (BEAM_Y + 9), r: 2 };
  out.push(S(k.slabOf(arm, ARM_Z, 5, P, 3, 0.4), { tone: 'mid' }));
  out.push(D([at([0, BEAM_Y + 12, ARM_Z + 5])], { size: 0.45 }));
  // pin bushing hanging under the arm's tip
  out.push(S(k.cylinder(0, PORT_Y, 4.2, ARM_Z - 6, 6, P, 24), { tone: 'mid', inner: L(k.sideArc(0, PORT_Y, 4.2, ARM_Z - 3, P, 16), { tone: 'faint' }) }));
  out.push(L(k.ring(0, PORT_Y, 2, ARM_Z + 5, P, 16), { tone: 'lo' }));
  // dial gauge on a short mast at the back of the block
  out.push(S(k.cylinder(DIAL_X, BEAM_Y, 2.4, BEAM_Z + BEAM_H + 7, DIAL_Z - BEAM_Z - BEAM_H - 7, P, 16), { tone: 'mid', crease: 'none' }));
  out.push(S(k.cylinder(DIAL_X, BEAM_Y, DIAL_R, DIAL_Z, 7, P, 56, 0.8), { tone: 'hi', crease: 'lo' }));
  out.push(L(k.knurl(DIAL_X, BEAM_Y, DIAL_R, DIAL_Z + 3.6, DIAL_Z + 7, 64, P, 0.3), { tone: 'lo' }));
  out.push(L(k.sideArc(DIAL_X, BEAM_Y, DIAL_R, DIAL_Z + 3.6, P, 40), { tone: 'faint' }));
  out.push(L(k.ring(DIAL_X, BEAM_Y, DIAL_R - 2, DIAL_Z + 7, P, 56), { tone: 'lo' }));
  const dt = k.radialTicks(DIAL_X, BEAM_Y, DIAL_R - 2, 20, 5, DIAL_Z + 7, [1.1, 2.4], P, angleOf(0), angleOf(100) - angleOf(0));
  out.push(L(dt.minor, { tone: 'lo' }), L(dt.major, { tone: 'mid' }));
  out.push(L(k.ring(DIAL_X, BEAM_Y, 1.4, DIAL_Z + 7, P, 14), { tone: 'mid' }));
  // knurled locking knob on the carriage's right side
  out.push(S(k.slabOf({ x: 14, y: BEAM_Y - 1.4, w: 4, d: 2.8, r: 0.8 }, BEAM_Z + BEAM_H + 2, 3, P, 2), { tone: 'mid', crease: 'none' }));
  out.push(S(k.cylinder(20.5, BEAM_Y, 3, BEAM_Z + BEAM_H, 6, P, 20), { tone: 'mid' }));
  out.push(L(k.knurl(20.5, BEAM_Y, 3, BEAM_Z + BEAM_H, BEAM_Z + BEAM_H + 6, 18, P), { tone: 'lo' }));
  return out.join('');
}

/** The probe pin, built resting in the port (x = 0); live.tsx lifts it by up to PIN_UP. */
function pin() {
  const out: string[] = [];
  out.push(S(k.cylinder(0, PORT_Y, 1.5, PORT_Z + 2.2, PIN_LEN, P, 16), { tone: 'hi', crease: 'none', lit: true }));
  out.push(S(k.cylinder(0, PORT_Y, 2.8, PORT_Z + 10, 5, P, 20), { tone: 'hi', lit: true }));
  out.push(L(k.knurl(0, PORT_Y, 2.8, PORT_Z + 10, PORT_Z + 15, 14, P), { tone: 'lo' }));
  return out.join('');
}

/** Cable from the carriage back to the hub at the left post: a dotted line that flows while connected. */
function cable() {
  return { from: at([-14, BEAM_Y - 5, BEAM_Z + BEAM_H + 3]), to: at([POST_X[0] + 8, BEAM_Y - 5, BEAM_Z + BEAM_H + 3]) };
}

export const DIAL = { cx: DIAL_X, cy: BEAM_Y, z: DIAL_Z + 7.2, r: DIAL_R - 4.4 };

/** Needle for a reading, relative to the carriage (moved with it). */
export function needleOf(percent: number) {
  const a = angleOf(percent);
  const sx = Math.sin(a), sy = -Math.cos(a);
  return k.lineOnTop([DIAL.cx - sx * 2.6, DIAL.cy - sy * 2.6], [DIAL.cx + sx * DIAL.r, DIAL.cy + sy * DIAL.r], DIAL.z, P);
}

export const carriageAt = (x: number) => k.translateAlong(P, [x, 0, 0]);
export const pinAt = (x: number, lift: number) => k.translateAlong(P, [x, 0, lift]);

const hub = cable();

// Painter's order (viewer at +x/+y): base, posts and beam (behind the units), units, then the pin,
// then the carriage. The pin goes before the carriage so the arm and bushing cover the length that
// runs through their bore; above the arm it stays visible when lifted.
export const ART = {
  base: base(),
  postBack: post(POST_X[0]) + post(POST_X[1]),
  beam: beam(),
  units: UNIT_X.map((x, i) => unit(x, i)).join(''),
  carriage: carriage(),
  pin: pin(),
  cableFrom: hub.from,
  cableTo: hub.to
};

export const LABEL =
  'A test bench: three server units stand on a base plate. Behind them a gantry beam carries one probe carriage with a dial gauge. ' +
  'The carriage slides to a unit, lowers a single pin into its port and the needle reads that server, then lifts and moves on. Nothing is installed inside the units.';
