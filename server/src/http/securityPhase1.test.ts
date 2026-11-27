// Tests for Security Headers, Rate Limiter, and Terminal WebSocket Tickets
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLockDurationMs, checkRateLimit, recordFailure, clearRateLimit, _resetAttempts } from './rateLimiter.js';
import { createWsTicket, consumeWsTicket } from '../modules/terminal/ticket.js';
import { isOriginAllowed } from '../modules/terminal/ws.js';

test('Rate limiter progressive backoff calculation', () => {
  assert.equal(calculateLockDurationMs(1), 0);
  assert.equal(calculateLockDurationMs(4), 0);
  assert.equal(calculateLockDurationMs(5), 30_000);  // 30s
  assert.equal(calculateLockDurationMs(6), 60_000);  // 60s
  assert.equal(calculateLockDurationMs(7), 120_000); // 120s
  assert.equal(calculateLockDurationMs(8), 240_000); // 240s
  assert.equal(calculateLockDurationMs(15), 15 * 60_000); // capped at 15m
});

test('Rate limiter record failure and lockout cycle', () => {
  _resetAttempts();
  const key = 'test:ip:user';
  const t0 = 1000000;

  for (let i = 1; i <= 4; i++) {
    const res = recordFailure(key, t0);
    assert.equal(res.lockSec, 0);
    assert.equal(checkRateLimit(key, t0), 0);
  }

  // 5th failure locks for 30s
  const res5 = recordFailure(key, t0);
  assert.equal(res5.lockSec, 30);
  assert.equal(checkRateLimit(key, t0), 30);
  assert.equal(checkRateLimit(key, t0 + 10_000), 20);

  // After 30s lock expires, checkRateLimit resets state
  assert.equal(checkRateLimit(key, t0 + 31_000), 0);

  // Clear works
  recordFailure(key, t0);
  clearRateLimit(key);
  assert.equal(checkRateLimit(key, t0), 0);
});

test('Terminal WebSocket ticket lifecycle (single-use & expiry)', () => {
  const ticketId = createWsTicket({
    userId: 'u1',
    username: 'alice',
    role: 'operator',
    serverId: 'srv1',
    sessionId: 'sess1'
  }, 1000); // 1s TTL

  assert.ok(ticketId.length > 20);

  // First consumption succeeds
  const data = consumeWsTicket(ticketId);
  assert.ok(data);
  assert.equal(data.username, 'alice');
  assert.equal(data.serverId, 'srv1');

  // Second consumption fails (strictly single-use)
  const reuse = consumeWsTicket(ticketId);
  assert.equal(reuse, null);

  // Expired ticket fails
  const expTicketId = createWsTicket({
    userId: 'u2',
    username: 'bob',
    role: 'viewer',
    sessionId: 'sess2'
  }, -10); // already expired

  const expData = consumeWsTicket(expTicketId);
  assert.equal(expData, null);
});

test('WebSocket isOriginAllowed logic', () => {
  // Non-browser client (no Origin header) -> allowed
  assert.equal(isOriginAllowed({ headers: {} } as any), true);

  // Matching Host -> allowed
  assert.equal(isOriginAllowed({
    headers: { origin: 'http://localhost:5001', host: 'localhost:5001' }
  } as any), true);

  assert.equal(isOriginAllowed({
    headers: { origin: 'https://panel.example.com', host: 'panel.example.com' }
  } as any), true);

  // Host mismatch (CSWSH attack attempt) -> rejected
  assert.equal(isOriginAllowed({
    headers: { origin: 'https://evil-attacker.com', host: 'panel.example.com' }
  } as any), false);
});
