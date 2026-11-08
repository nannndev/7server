import fs from 'node:fs';
import crypto from 'node:crypto';
import { dataFile } from '../../config.js';

const TELEMETRY_URL = process.env.SEVENSERVER_TELEMETRY_URL || 'https://sevenserver-telemetry.ekaprasetya2244.workers.dev/api/v1/ping';
const APP_VERSION = process.env.npm_package_version || '0.2.0';

/**
 * Returns or generates a persistent anonymous UUID for this 7Server instance.
 * Stored in dataFile('instance.id') (e.g. ~/.7server/instance.id).
 * Contains no PII, hardware serials, server names, or credentials.
 */
export function getOrCreateInstanceId(): string {
  const file = dataFile('instance.id');
  try {
    if (fs.existsSync(file)) {
      const id = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-fA-F-]{16,64}$/.test(id)) return id;
    }
  } catch {
    // Ignore read errors
  }

  const newId = crypto.randomUUID();
  try {
    fs.writeFileSync(file, newId, { encoding: 'utf8', mode: 0o600 });
  } catch {
    // Ignore write errors (e.g. read-only filesystem)
  }
  return newId;
}

/**
 * Checks if telemetry is disabled by environment variables or test environment.
 * Honors industry standard DO_NOT_TRACK as well as SEVENSERVER_TELEMETRY=0.
 */
export function isTelemetryDisabled(): boolean {
  return (
    process.env.SEVENSERVER_TELEMETRY === '0' ||
    process.env.DO_NOT_TRACK === '1' ||
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true'
  );
}

/**
 * Sends an anonymous heartbeat ping to the telemetry collector.
 * Never throws, never blocks startup, times out after 4 seconds.
 */
export async function sendTelemetryPing(overrideUrl?: string): Promise<boolean> {
  if (isTelemetryDisabled() && !overrideUrl) return false;

  const instanceId = getOrCreateInstanceId();
  const payload = {
    id: instanceId,
    version: APP_VERSION,
    os: process.platform,
    arch: process.arch,
    node: process.version
  };

  const targetUrl = overrideUrl || TELEMETRY_URL;

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `7Server/${APP_VERSION} (${process.platform}; ${process.arch})`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    });
    return res.ok;
  } catch {
    // Silent fail on network down, offline mode, or collector unreachable
    return false;
  }
}

let timer: NodeJS.Timeout | null = null;

/**
 * Starts the telemetry scheduler.
 * Performs a single silent ping 5 seconds after launch, then schedules every 24h.
 */
export function startTelemetry() {
  if (isTelemetryDisabled()) return;

  const initialTimer = setTimeout(() => {
    sendTelemetryPing().catch(() => {});
    timer = setInterval(() => {
      sendTelemetryPing().catch(() => {});
    }, 24 * 60 * 60 * 1000);
    timer.unref();
  }, 5000);
  initialTimer.unref();
}

