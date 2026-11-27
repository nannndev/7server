// Short-lived single-use ticket store for authenticated WebSocket handshakes (Terminal etc).
// Eliminates long-lived session tokens from query parameters and access logs.
import crypto from 'crypto';

interface TicketData {
  userId: string;
  username: string;
  role: string;
  serverId?: string;
  sessionId: string;
  expiresAt: number;
}

// In-memory single-use tickets. Lifetime: 30 seconds.
const tickets = new Map<string, TicketData>();

// Periodic cleanup of expired tickets
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, ticket] of tickets.entries()) {
    if (ticket.expiresAt <= now) {
      tickets.delete(id);
    }
  }
}, 30_000);
cleanupInterval.unref?.();

/**
 * Creates a one-time 30-second ticket for WebSocket connection.
 */
export function createWsTicket(data: Omit<TicketData, 'expiresAt'>, ttlMs = 30_000): string {
  const ticketId = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticketId, {
    ...data,
    expiresAt: Date.now() + ttlMs
  });
  return ticketId;
}

/**
 * Consumes a ticket. Returns the TicketData if valid, or null if invalid/expired.
 * Deletes immediately on first access (strictly single-use).
 */
export function consumeWsTicket(ticketId: string): TicketData | null {
  if (!ticketId) return null;
  const data = tickets.get(ticketId);
  if (!data) return null;

  tickets.delete(ticketId);

  if (data.expiresAt < Date.now()) {
    return null;
  }
  return data;
}
