// Smart in-memory rate limiter with exponential backoff and bounded memory.
// Designed specifically for self-hosted / single-process deployments without Redis.

interface AttemptRecord {
  count: number;
  until: number;
  lastAttempt: number;
}

const attempts = new Map<string, AttemptRecord>();
const MAX_ENTRIES = 10_000;
const ENTRY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Prune stale records every 5 minutes
const cleanupTimer = setInterval(() => {
  pruneStaleAttempts();
}, 5 * 60_000);
cleanupTimer.unref?.();

export function pruneStaleAttempts(now = Date.now()): void {
  for (const [key, record] of attempts.entries()) {
    if (now - record.lastAttempt > ENTRY_TTL_MS && record.until <= now) {
      attempts.delete(key);
    }
  }

  // Bounded memory protection: drop oldest entries if capacity exceeded
  if (attempts.size > MAX_ENTRIES) {
    const entries = Array.from(attempts.entries())
      .sort((a, b) => a[1].lastAttempt - b[1].lastAttempt)
      .slice(0, attempts.size - MAX_ENTRIES);
    for (const [k] of entries) {
      attempts.delete(k);
    }
  }
}

/**
 * Calculates progressive lock duration:
 * 1-4 failures: 0s (no lock)
 * 5 failures: 30s
 * 6 failures: 60s
 * 7 failures: 120s
 * 8 failures: 240s
 * 9 failures: 480s
 * 10+ failures: capped at 900s (15 minutes)
 */
export function calculateLockDurationMs(failCount: number): number {
  if (failCount < 5) return 0;
  const backoff = 30_000 * Math.pow(2, failCount - 5);
  return Math.min(backoff, 15 * 60_000);
}

/**
 * Checks if key is currently locked out.
 * Returns remaining seconds if locked, or 0 if allowed.
 */
export function checkRateLimit(key: string, now = Date.now()): number {
  const record = attempts.get(key);
  if (!record) return 0;

  if (record.until > now) {
    return Math.ceil((record.until - now) / 1000);
  }

  // Served penalty: reset count so next typo doesn't re-lock immediately for max duration
  if (record.until > 0 && record.until <= now) {
    attempts.delete(key);
  }
  return 0;
}

/**
 * Records a failed attempt and updates progressive lock until time.
 */
export function recordFailure(key: string, now = Date.now()): { count: number; lockSec: number } {
  const current = attempts.get(key);
  const count = (current?.count || 0) + 1;
  const lockMs = calculateLockDurationMs(count);
  const until = lockMs > 0 ? now + lockMs : 0;

  attempts.set(key, {
    count,
    until,
    lastAttempt: now
  });

  return { count, lockSec: Math.ceil(lockMs / 1000) };
}

/**
 * Clears rate limiting state for a key on successful authentication.
 */
export function clearRateLimit(key: string): void {
  attempts.delete(key);
}

// For unit testing inspection
export function _getAttempt(key: string) {
  return attempts.get(key);
}
export function _resetAttempts() {
  attempts.clear();
}
