// Run (from client/): npx --prefix ../server tsx src/features/servers/lib/telemetry.test.ts
import assert from 'node:assert/strict';
import { inRange, medianStep, segments, seriesStats, nearestIdx, fmtDuration } from './telemetry';

const M = 60_000;
const pt = (min: number, cpu: number) => ({ t: min * M, cpu, mem: 50, disk: 10 });

// 1-minute samples with a 10-minute outage between minute 3 and 13.
const pts = [pt(0, 10), pt(1, 20), pt(2, 95), pt(3, 92), pt(13, 30), pt(14, 40)];

assert.equal(medianStep(pts), M);
assert.equal(medianStep([pt(0, 1)]), M); // too few points: assume the monitor default

assert.deepEqual(segments(pts).map((s) => s.length), [4, 2], 'outage splits the line');
assert.deepEqual(segments([]), []);

const s = seriesStats(pts, 'cpu', 90)!;
assert.equal(s.max, 95);
assert.equal(s.maxAt, 2 * M);
assert.equal(s.min, 10);
assert.equal(s.delta, 30);
assert.equal(Math.round(s.avg), 48);
assert.equal(s.aboveMs, 2 * M, 'minutes 2 and 3 are >= 90; the outage gap is not counted');
assert.equal(seriesStats(pts, 'cpu')!.aboveMs, 0, 'no threshold, nothing counted');
assert.equal(seriesStats([], 'cpu'), null);

assert.equal(nearestIdx(pts, 0), 0);
assert.equal(nearestIdx(pts, 1.4 * M), 1);
assert.equal(nearestIdx(pts, 1.6 * M), 2);
assert.equal(nearestIdx(pts, 9 * M), 4); // closer to minute 13 than minute 3
assert.equal(nearestIdx(pts, 99 * M), 5);

assert.deepEqual(inRange(pts, 2 * M, 14 * M).map((p) => p.t / M), [13, 14]);

assert.equal(fmtDuration(5 * M), '5m');
assert.equal(fmtDuration(125 * M), '2h 5m');

console.log('telemetry tests ok');
