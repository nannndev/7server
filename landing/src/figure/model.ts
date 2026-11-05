// The truth the figure shows: a demo fleet, and how a probe visit maps to a reading.
// One 7Server hub reads every server over SSH. Nothing is installed on the servers.

export interface Node {
  name: string;
  role: string;
  cpu: number; // percent
  ram: number; // percent
  disk: number; // percent
}

/** Demo values (not a live fleet); the caption says so. */
export const FLEET: Node[] = [
  { name: 'vps-1', role: 'web', cpu: 24, ram: 42, disk: 38 },
  { name: 'vps-2', role: 'api', cpu: 76, ram: 89, disk: 64 },
  { name: 'vps-3', role: 'db', cpu: 31, ram: 54, disk: 72 }
];

/** Dial: 0–100 % over 270°, starting at the lower left (kit angles: 0 = −y, clockwise). */
export const DIAL_FROM = (-135 * Math.PI) / 180;
export const DIAL_SPAN = (270 * Math.PI) / 180;
export const angleOf = (percent: number) => DIAL_FROM + (Math.max(0, Math.min(100, percent)) / 100) * DIAL_SPAN;

export type Phase = 'lifting' | 'travelling' | 'lowering' | 'connected';

export function readoutOf(phase: Phase, from: Node, to: Node, cpu: number): string {
  if (phase === 'connected') return `${to.name} · ssh open · cpu ${Math.round(cpu)}% · ram ${to.ram}%`;
  if (phase === 'lowering') return `${to.name} · connecting over ssh`;
  return `${from.name} → ${to.name} · probe lifted`;
}
