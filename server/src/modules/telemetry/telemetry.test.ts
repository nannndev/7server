import assert from 'node:assert';
import { getOrCreateInstanceId, isTelemetryDisabled } from './telemetry.js';

console.log('Testing 7Server anonymous telemetry module...');

// 1. Instance ID is created and returns a valid UUID
const id1 = getOrCreateInstanceId();
assert.ok(typeof id1 === 'string', 'Instance ID must be string');
assert.ok(/^[0-9a-fA-F-]{36}$/.test(id1), `Instance ID must be a valid UUID format, got: ${id1}`);

// 2. Second retrieval returns the exact same instance ID (persisted)
const id2 = getOrCreateInstanceId();
assert.strictEqual(id1, id2, 'Instance ID must remain stable across calls');

// 3. Honors DO_NOT_TRACK
const origDnt = process.env.DO_NOT_TRACK;
process.env.DO_NOT_TRACK = '1';
assert.strictEqual(isTelemetryDisabled(), true, 'Must disable telemetry when DO_NOT_TRACK=1');
if (origDnt !== undefined) process.env.DO_NOT_TRACK = origDnt;
else delete process.env.DO_NOT_TRACK;

// 4. Honors SEVENSERVER_TELEMETRY=0
const origTelemetry = process.env.SEVENSERVER_TELEMETRY;
process.env.SEVENSERVER_TELEMETRY = '0';
assert.strictEqual(isTelemetryDisabled(), true, 'Must disable telemetry when SEVENSERVER_TELEMETRY=0');
if (origTelemetry !== undefined) process.env.SEVENSERVER_TELEMETRY = origTelemetry;
else delete process.env.SEVENSERVER_TELEMETRY;

console.log('Telemetry tests passed successfully.');

