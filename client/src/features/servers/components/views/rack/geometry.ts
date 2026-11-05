// Fig: a 19" server rack on casters. Each server is a 1U blade on slide rails; the selected one
// slides out toward the viewer. Static art is built once per layout as SVG strings (kit), the live
// layer only moves blades and redraws LEDs and the dial needle.
import * as k from '@/shared/iso/iso-kit';
import { RACK_MAX_U } from './model';

export const WIDTH = 640;
export const HEIGHT = 600;

// World: x across the rack face, y depth (+y toward the viewer), z up. 1 unit ≈ 1 px.
const RACK_W = 190;          // outside width
const RACK_D = 118;          // depth
const POST = 8;              // corner post square
const U_H = 14;              // one rack unit
const BASE_Z = 26;           // top of the plinth (casters below)
const TOP_PAD = 10;
const BLADE_W = RACK_W - POST * 2 - 6;
const BLADE_D = RACK_D - 18;
export const PULL = 6;       // the selected blade eases out of its slot by this much (stays in the rack)

export interface Layout { units: number; P: k.Projection; frontY: number }

export function layoutOf(units: number): Layout {
  const height = BASE_Z + units * U_H + TOP_PAD;
  const plan = { x: -RACK_W / 2, y: -RACK_D / 2, w: RACK_W, d: RACK_D, r: 2 };
  const pts: k.Point3[] = [...k.boxCorners(plan, -2, height + 4), [plan.x, plan.y + plan.d + PULL, BASE_Z], [plan.x + plan.w, plan.y + plan.d + PULL, BASE_Z + units * U_H]];
  const P = k.fitProjection(pts, WIDTH, HEIGHT, { pad: 28, azimuth: 76, elevation: 16 });
  return { units, P, frontY: plan.y + plan.d };
}

/** z of the bottom of slot `u` (0 = lowest). Blades fill from the top down, like a real rack. */
export const slotZ = (L: Layout, u: number) => BASE_Z + (L.units - 1 - u) * U_H;

const S = (paths: k.SolidPaths, style: k.SolidStyle = {}) => k.solidSvg(paths, style);
const Ln = (d: string, style: k.LineStyle = {}) => k.lineSvg(d, style);
const D = (pts: Array<k.Flat | [number, number, number]>, style: { size?: number; tone?: k.Tone } = {}) => k.dotsSvg(pts, style);

// ---------------------------------------------------------------- frame (behind the blades)
export function frameBack(L: Layout) {
  const { P } = L;
  const at = (p: k.Point3) => k.iso(p, P);
  const height = BASE_Z + L.units * U_H + TOP_PAD;
  const plan = { x: -RACK_W / 2, y: -RACK_D / 2, w: RACK_W, d: RACK_D, r: 2 };
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, -6), -2, 2, P)}"/>`];
  // casters: fork, wheel, swivel plate at each corner (back ones first)
  const corners = k.corners(plan, 12).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of corners) {
    out.push(S(k.cylinder(x, y, 6, 0, 5, P, 24), { tone: 'lo' }));
    out.push(S(k.slabOf({ x: x - 4, y: y - 3, w: 8, d: 6, r: 1 }, 5, 6, P, 2), { tone: 'mid' }));
    out.push(S(k.slabOf({ x: x - 7, y: y - 7, w: 14, d: 14, r: 1.5 }, 11, 2, P, 2, 0.3), { tone: 'mid' }));
  }
  // plinth with a kick-plate seam and a ventilation slot row on the front
  const plinth = { x: plan.x, y: plan.y, w: plan.w, d: plan.d, r: 2 };
  out.push(S(k.slabOf(plinth, 13, BASE_Z - 13, P, 3, 0.6), { tone: 'mid', inner: Ln(k.sideSeam(plinth, 19, P, 3), { tone: 'faint' }) }));
  for (let i = 0; i < 9; i++) {
    const x0 = plan.x + 22 + i * 17;
    out.push(Ln(k.pathOf([at([x0, L.frontY, 15.5]), at([x0 + 10, L.frontY, 15.5]), at([x0 + 10, L.frontY, 17.5]), at([x0, L.frontY, 17.5])], true), { tone: 'lo' }));
  }
  // back wall and side panel (left), seen through the open front
  out.push(S(k.slabOf({ x: plan.x + POST, y: plan.y, w: RACK_W - POST * 2, d: 2, r: 0 }, BASE_Z, height - BASE_Z, P, 2), { tone: 'lo', crease: 'none' }));
  const side = { x: plan.x, y: plan.y + POST, w: 2, d: RACK_D - POST * 2, r: 0 };
  out.push(S(k.slabOf(side, BASE_Z, height - BASE_Z, P, 2), { tone: 'lo', crease: 'none' }));
  // perforated vent field on the back wall, faded at its edges by being a closed slot grid
  for (let r = 0; r < Math.min(L.units, 14); r++) {
    for (let c = 0; c < 7; c++) {
      const x0 = plan.x + POST + 12 + c * 21, z0 = BASE_Z + 8 + r * U_H;
      out.push(Ln(k.pathOf([at([x0, plan.y + 2, z0]), at([x0 + 12, plan.y + 2, z0]), at([x0 + 12, plan.y + 2, z0 + 3]), at([x0, plan.y + 2, z0 + 3])], true), { tone: 'faint' }));
    }
  }
  // back posts
  for (const x of [plan.x, plan.x + RACK_W - POST]) {
    out.push(S(k.slabOf({ x, y: plan.y, w: POST, d: POST, r: 0.8 }, BASE_Z, height - BASE_Z, P, 2, 0.3), { tone: 'mid' }));
  }
  // vertical cable manager on the back left post: a channel with fingers
  const cm = { x: plan.x + POST, y: plan.y + POST, w: 6, d: 10, r: 0.6 };
  out.push(S(k.slabOf(cm, BASE_Z, height - BASE_Z - 4, P, 2), { tone: 'mid', crease: 'none' }));
  for (let z = BASE_Z + 7; z < height - 8; z += U_H) out.push(S(k.slabOf({ x: cm.x + cm.w, y: cm.y + 2, w: 4, d: 6, r: 0.5 }, z, 2, P, 2), { tone: 'mid', crease: 'none' }));
  return out.join('');
}

// ---------------------------------------------------------------- frame (in front of the blades)
export function frameFront(L: Layout) {
  const { P } = L;
  const at = (p: k.Point3) => k.iso(p, P);
  const height = BASE_Z + L.units * U_H + TOP_PAD;
  const plan = { x: -RACK_W / 2, y: -RACK_D / 2, w: RACK_W, d: RACK_D, r: 2 };
  const out: string[] = [];
  // right side panel with a lift handle, a vent slot column and four screws; hides the blades' sides
  const side = { x: plan.x + RACK_W - 2, y: plan.y + POST, w: 2, d: RACK_D - POST * 2, r: 0 };
  out.push(S(k.slabOf(side, BASE_Z, height - BASE_Z, P, 2), { tone: 'mid', crease: 'none' }));
  const sx = side.x + 2;
  for (let i = 0; i < Math.min(L.units, 12); i++) {
    const y0 = side.y + 16, z0 = BASE_Z + 10 + i * U_H;
    out.push(Ln(k.pathOf([at([sx, y0, z0]), at([sx, y0 + 26, z0]), at([sx, y0 + 26, z0 + 3]), at([sx, y0, z0 + 3])], true), { tone: 'lo' }));
  }
  const hz = BASE_Z + (height - BASE_Z) * 0.62;
  out.push(Ln(k.pathOf([at([sx, side.y + side.d - 38, hz]), at([sx, side.y + side.d - 14, hz]), at([sx, side.y + side.d - 14, hz + 6]), at([sx, side.y + side.d - 38, hz + 6])], true), { tone: 'mid' }));
  out.push(D([[side.y + 4, BASE_Z + 4], [side.y + side.d - 4, BASE_Z + 4], [side.y + 4, height - 4], [side.y + side.d - 4, height - 4]].map(([y, z]) => at([sx, y, z])), { size: 0.5 }));
  // front posts with mounting rails: cage-nut holes every U (three per U, middle one ringed) and U numbers
  for (const [i, x] of [plan.x, plan.x + RACK_W - POST].entries()) {
    const y = L.frontY - POST;
    out.push(S(k.slabOf({ x, y, w: POST, d: POST, r: 0.8 }, BASE_Z, height - BASE_Z, P, 2, 0.3), { tone: 'mid' }));
    const railX = i === 0 ? x + POST : x - 2;
    out.push(S(k.slabOf({ x: railX, y: L.frontY - 3, w: 2, d: 3, r: 0 }, BASE_Z, L.units * U_H, P, 2), { tone: 'mid', crease: 'none' }));
    const holes: k.Flat[] = [];
    for (let u = 0; u < L.units; u++) for (const dz of [3, 7, 11]) holes.push(at([railX + 1, L.frontY, BASE_Z + u * U_H + dz]));
    out.push(D(holes, { size: 0.55, tone: 'lo' }));
  }
  // top panel with a seam and four screws, a vented roof slot pair and a label plate
  const top = { x: plan.x, y: plan.y, w: plan.w, d: plan.d, r: 2 };
  out.push(S(k.slabOf(top, height, 4, P, 3, 0.8), { tone: 'mid', inner: Ln(k.sideSeam(top, height + 2, P, 3), { tone: 'faint' }) }));
  out.push(D(k.corners(top, 6).map(([x, y]) => at([x, y, height + 4])), { size: 0.5 }));
  for (const dy of [-30, -18]) out.push(Ln(k.planOutline({ x: -50, y: dy, w: 100, d: 5, r: 2.4 }, height + 4, P, 3), { tone: 'lo' }));
  const label = { x: 18, y: 20, w: 52, d: 18, r: 1.4 };
  out.push(S(k.slabOf(label, height + 4, 0.8, P, 3), { tone: 'lo', crease: 'none' }));
  out.push(Ln(k.planOutline(k.insetPlan(label, 1.6), height + 4.8, P, 3), { tone: 'faint' }));
  [[34, 0], [26, 5], [30, 10]].forEach(([len, dy]) => out.push(Ln(k.lineOnTop([label.x + 6, label.y + 4 + dy], [label.x + 6 + len, label.y + 4 + dy], height + 4.8, P), { tone: 'lo', free: true })));
  out.push(k.faceTextSvg(k.topMatrix([-60, 30], height + 4, P, 'x'), '7SERVER · 19" RACK', { size: 3.4, tone: 'lo' }));
  return out.join('');
}

// ---------------------------------------------------------------- one blade (built at its slot, moved by live)
export interface BladeArt { body: string; ledX: number[]; ledZ: number; dial: { cx: number; cz: number; r: number } }

export function bladeArt(L: Layout, u: number, name: string): BladeArt {
  const { P } = L;
  const at = (p: k.Point3) => k.iso(p, P);
  const z = slotZ(L, u) + 1;
  const h = U_H - 2;
  const plan = { x: -BLADE_W / 2, y: L.frontY - BLADE_D - 2, w: BLADE_W, d: BLADE_D, r: 1 };
  const out: string[] = [];
  // slide rails left and right (stay in the rack: drawn in frameBack's slot by the live layer order)
  out.push(S(k.slabOf(plan, z, h, P, 2, 0.5), { tone: 'hi', crease: 'lo', inner: Ln(k.sideSeam(plan, z + h - 3, P, 2), { tone: 'faint' }) }));
  // lid: vent slots in two rows across the back half, and a screw at each corner
  for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
    out.push(Ln(k.planOutline({ x: plan.x + 14 + c * 18, y: plan.y + 12 + r * 8, w: 11, d: 3, r: 1.4 }, z + h, P, 3), { tone: 'lo' }));
  }
  out.push(D(k.corners(plan, 4).map(([x, y]) => at([x, y, z + h])), { size: 0.45 }));
  // front bezel: a raised plate on the blade's face
  const fy = plan.y + plan.d;
  const bezel = { x: plan.x - 3, y: fy, w: plan.w + 6, d: 2, r: 0.6 };
  out.push(S(k.slabOf(bezel, z, h, P, 2, 0.4), { tone: 'hi', crease: 'lo' }));
  const by = fy + 2;
  // handles at both ends (rack ears) with two screws each
  for (const x of [bezel.x + 1, bezel.x + bezel.w - 7]) {
    out.push(S(k.slabOf({ x, y: by, w: 6, d: 3, r: 1 }, z + 2, h - 4, P, 2), { tone: 'mid' }));
    out.push(D([at([x + 3, by, z + 2.5]), at([x + 3, by, z + h - 2.5])], { size: 0.45 }));
  }
  // drive bays: four closed slots, each with a latch line that runs edge to edge
  for (let i = 0; i < 4; i++) {
    const x0 = bezel.x + 64 + i * 22;
    out.push(Ln(k.pathOf([at([x0, by, z + 2.5]), at([x0 + 18, by, z + 2.5]), at([x0 + 18, by, z + h - 2.5]), at([x0, by, z + h - 2.5])], true), { tone: 'lo' }));
    out.push(Ln(k.segment([x0 + 15, by, z + 2.5], [x0 + 15, by, z + h - 2.5], P), { tone: 'faint' }));
  }
  // power button ring and the engraved name
  const pb = [bezel.x + 13, by, z + h / 2] as k.Point3;
  out.push(Ln(k.sideRing(pb, 2.6, 'y', P), { tone: 'mid' }));
  out.push(Ln(k.sideRing(pb, 1.2, 'y', P), { tone: 'lo' }));
  out.push(k.faceTextSvg(k.sideMatrix([bezel.x + 20, by], z + h / 2 + 1.4, P, 'left'), name.slice(0, 14), { size: 3.4, tone: 'mid' }));
  // dial gauge recess on the right of the bezel (needle is live)
  const dial = { cx: bezel.x + bezel.w - 20, cz: z + h / 2, r: 4.6 };
  out.push(Ln(k.sideRing([dial.cx, by, dial.cz], dial.r + 0.8, 'y', P), { tone: 'mid' }));
  const ticks: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (-135 + i * 27) * (Math.PI / 180);
    const r0 = i % 5 === 0 ? dial.r - 1.6 : dial.r - 0.9;
    ticks.push(k.segment([dial.cx + Math.sin(a) * r0, by, dial.cz + Math.cos(a) * r0], [dial.cx + Math.sin(a) * dial.r, by, dial.cz + Math.cos(a) * dial.r], P));
  }
  out.push(Ln(ticks.join(''), { tone: 'lo' }));
  // three status LED seats (CPU, RAM, disk) next to the power button
  const ledX = [bezel.x + 40, bezel.x + 46, bezel.x + 52];
  for (const x of ledX) out.push(Ln(k.sideRing([x, by, z + h / 2], 1.6, 'y', P), { tone: 'lo' }));
  return { body: out.join(''), ledX, ledZ: z + h / 2, dial };
}

/** Empty slot: a blanking panel with two screws and a vent slot. */
export function blankArt(L: Layout, u: number) {
  const { P } = L;
  const at = (p: k.Point3) => k.iso(p, P);
  const z = slotZ(L, u) + 1;
  const plate = { x: -BLADE_W / 2 - 3, y: L.frontY - 1, w: BLADE_W + 6, d: 1.2, r: 0.3 };
  const out = [S(k.slabOf(plate, z, U_H - 2, P, 2, 0.3), { tone: 'mid', crease: 'none' })];
  out.push(D([at([plate.x + 4, L.frontY + 0.2, z + (U_H - 2) / 2]), at([plate.x + plate.w - 4, L.frontY + 0.2, z + (U_H - 2) / 2])], { size: 0.5 }));
  out.push(Ln(k.pathOf([at([-30, L.frontY + 0.2, z + 5]), at([30, L.frontY + 0.2, z + 5]), at([30, L.frontY + 0.2, z + 7]), at([-30, L.frontY + 0.2, z + 7])], true), { tone: 'lo' }));
  return out.join('');
}

/** The pulled-out offset of a blade (world → screen translate). */
export const pullAt = (L: Layout, t: number) => k.translateAlong(L.P, [0, PULL * t, 0]);

/** LED dot and needle path in the blade's rest frame (the blade group carries the pull). */
export function ledPoint(L: Layout, x: number, z: number): k.Flat {
  return k.iso([x, L.frontY + 2.2, z], L.P);
}
export function needlePath(L: Layout, dial: { cx: number; cz: number; r: number }, percent: number) {
  const a = (-135 + (Math.max(0, Math.min(100, percent)) / 100) * 270) * (Math.PI / 180);
  const y = L.frontY + 2.3;
  return k.segment([dial.cx - Math.sin(a) * 1.2, y, dial.cz - Math.cos(a) * 1.2], [dial.cx + Math.sin(a) * (dial.r - 0.8), y, dial.cz + Math.cos(a) * (dial.r - 0.8)], L.P);
}

export const MAX_U = RACK_MAX_U;
export const LABEL = 'A 19-inch server rack on casters. Each managed server is a 1U blade on slide rails with three status lights for CPU, RAM and disk and a dial gauge for CPU. The selected blade slides out of the rack.';
