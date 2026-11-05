// First-run setup: while no user exists, the dashboard shows "create the admin account" instead of
// a login. No default password ships. To stop a stranger from claiming a freshly started instance:
// - a request from this machine (loopback) may create the admin directly;
// - any other caller must also send the one-time setup code printed in the server log.
// The code lives only in memory and dies with the first admin. DASHBOARD_PASSWORD still seeds the
// admin non-interactively (Docker/CI), in which case setup never opens.
import crypto from 'crypto';
import { getUsers, createUser } from './store.js';
import { isPrivateIp, normalizeIp } from '../ai-gateway/internalOnly.js';

let code: string | null = null;

export const needsSetup = () => getUsers().length === 0;

/** Called once at boot; returns the code to print, or null when setup isn't needed. */
export function openSetup(): string | null {
  if (!needsSetup()) { code = null; return null; }
  code ??= String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  return code;
}

const isLoopback = (ip: string) => { const a = normalizeIp(ip); return a === '127.0.0.1' || a === '::1' || a.startsWith('127.'); };

export interface SetupInput { username?: unknown; password?: unknown; code?: unknown }

/** Creates the first admin. Throws with a user-facing message; `status` says how to answer. */
export async function completeSetup(input: SetupInput, ip: string) {
  if (!needsSetup()) throw Object.assign(new Error('Setup is already done. Sign in instead.'), { status: 409 });
  if (!isLoopback(ip)) {
    const given = String(input.code ?? '').trim();
    const ok = !!code && given.length === code.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(code));
    if (!ok) throw Object.assign(new Error('Wrong or missing setup code. It is printed in the 7server log.'), { status: 403 });
  }
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) throw Object.assign(new Error('Username: 2–32 characters, letters, digits, . _ -'), { status: 400 });
  if (password.length < 8) throw Object.assign(new Error('Password needs at least 8 characters'), { status: 400 });
  // Re-check right before writing: two setup requests racing must not create two admins.
  if (!needsSetup()) throw Object.assign(new Error('Setup is already done. Sign in instead.'), { status: 409 });
  const user = await createUser({ username, password, role: 'admin', servers: '*' });
  code = null;
  return user;
}

/** Whether this caller may skip the code (shown to the UI so it can hide the code field). */
export const setupNeedsCode = (ip: string) => !isLoopback(ip);
export const __setupCode = () => code;
export { isPrivateIp };
