// Dashboard auth & RBAC: user credentials, session tokens, rate limiting, and permission gates.
import crypto from 'crypto';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { config, dataFile } from '../config.js';
import { 
  initUsersStore, 
  getSessionByToken, 
  getUserById, 
  touchSession,
  getUserByUsername
} from '../modules/users/store.js';
import { loginService, verifyMfaLoginService } from '../modules/users/service.js';
import { 
  AuthContextUser, 
  Permission, 
  ROLE_PERMISSIONS 
} from '../modules/users/types.js';
import { 
  checkRateLimit, 
  recordFailure, 
  clearRateLimit 
} from './rateLimiter.js';
import { 
  SESSION_COOKIE_NAME, 
  setSessionCookie, 
  clearSessionCookie, 
  parseCookies 
} from './cookies.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContextUser;
    }
  }
}

// Older installs wrote a random password here; it still seeds the admin for them if no user exists.
// New installs never create it: the first visitor sets up the admin (modules/users/setup.ts).
const PW_FILE = dataFile('dashboard.password');
const legacyPassword = () => (fs.existsSync(PW_FILE) ? fs.readFileSync(PW_FILE, 'utf8').trim() : '');

export const DASHBOARD_PASSWORD = config.dashboardPassword || legacyPassword();
// Stateless master token (HMAC of the password), kept for scripts and the contract test. Only when a
// password was set explicitly via DASHBOARD_PASSWORD: otherwise anyone holding the password file
// would have a session-less admin login.
export const AUTH_TOKEN = config.dashboardPassword
  ? crypto.createHmac('sha256', config.dashboardPassword).update('vps-hub-token').digest('hex')
  : '';

export const usersReady = initUsersStore(DASHBOARD_PASSWORD || undefined).catch((err) => {
  console.error('[auth] Failed to initialize users store:', err);
});

/** Constant-time compare of arbitrary-length strings (hash first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

let warnedMissingTrustProxy = false;

export async function loginHandler(req: Request, res: Response) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const username = String(req.body?.username || 'admin').trim().toLowerCase();

  // Warn operators running behind reverse proxies if TRUST_PROXY is omitted
  if (!config.trustProxy && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) && !warnedMissingTrustProxy) {
    warnedMissingTrustProxy = true;
    console.warn(
      '[security] Received X-Forwarded-For header but TRUST_PROXY is not configured! ' +
      'Set TRUST_PROXY=loopback (or reverse proxy IP) in environment to avoid all clients sharing 127.0.0.1 rate limits.'
    );
  }

  const userKey = `user:${ip}:${username}`;
  const ipKey = `ip:${ip}`;

  // Check rate limit: user+ip limit or broad IP limit
  const lockedUserSec = checkRateLimit(userKey);
  const lockedIpSec = checkRateLimit(ipKey);
  const lockSec = Math.max(lockedUserSec, lockedIpSec);

  if (lockSec > 0) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      error: `Terlalu banyak percobaan login, silakan tunggu ${lockSec} detik`
    });
  }

  try {
    const result = await loginService({
      username: req.body?.username,
      password: req.body?.password,
      ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    if (result.requiresMfa) {
      return res.json({
        success: true,
        requiresMfa: true,
        mfaTicket: result.mfaTicket,
        user: result.user
      });
    }

    clearRateLimit(userKey);
    clearRateLimit(ipKey);

    // Set secure HttpOnly cookie for browser sessions
    setSessionCookie(req, res, result.token);

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      permissions: result.permissions,
      session: result.session
    });
  } catch (err: any) {
    recordFailure(userKey);
    recordFailure(ipKey);

    const isAccountDisabled = err.code === 'ACCOUNT_DISABLED' || err.message?.includes('dinonaktifkan');
    const status = isAccountDisabled ? 403 : 401;
    res.status(status).json({
      success: false,
      code: isAccountDisabled ? 'ACCOUNT_DISABLED' : 'INVALID_CREDENTIALS',
      error: err.message || 'Login gagal'
    });
  }
}

export async function loginTotpHandler(req: Request, res: Response) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const mfaTicket = String(req.body?.mfaTicket || '').trim();
  const code = String(req.body?.code || '').trim();

  const ipKey = `ip:${ip}`;
  const mfaKey = `mfa:${ip}`;

  const lockedSec = checkRateLimit(mfaKey);
  if (lockedSec > 0) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      error: `Terlalu banyak percobaan 2FA, silakan tunggu ${lockedSec} detik`
    });
  }

  try {
    const result = await verifyMfaLoginService({
      mfaTicket,
      code,
      ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    clearRateLimit(mfaKey);
    clearRateLimit(ipKey);

    setSessionCookie(req, res, result.token);

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      permissions: result.permissions,
      session: result.session
    });
  } catch (err: any) {
    recordFailure(mfaKey);
    res.status(401).json({
      success: false,
      code: 'INVALID_2FA',
      error: err.message || 'Verifikasi 2FA gagal'
    });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Hybrid authentication: Check Authorization header first, then fallback to HttpOnly session cookie
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || '';
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Token diperlukan' });
  }

  // 1. Session-based token check (Primary RBAC)
  const session = getSessionByToken(token);
  if (session) {
    const user = getUserById(session.userId);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User tidak ditemukan' });
    }
    if (user.disabled) {
      return res.status(403).json({ success: false, error: 'Forbidden: Akun dinonaktifkan' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || [],
      servers: user.servers,
      sessionId: session.id
    };

    touchSession(session.id);
    return next();
  }

  // 2. Master token (only when DASHBOARD_PASSWORD is set): scripts and the contract test
  if (AUTH_TOKEN && safeEqual(token, AUTH_TOKEN)) {
    const adminUser = getUserByUsername('admin');
    req.user = {
      id: adminUser?.id || 'admin-root',
      username: adminUser?.username || 'admin',
      role: 'admin',
      permissions: ROLE_PERMISSIONS.admin,
      servers: '*',
      sessionId: 'master-token'
    };
    return next();
  }

  return res.status(401).json({ success: false, error: 'Unauthorized: Token tidak valid atau kedaluwarsa' });
}

/**
 * Middleware to gate routes by required permission.
 * Usage: router.post('/servers/:id/restart', need('service.control'), handler);
 */
export function need(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (req.user.role === 'admin' || (req.user.permissions && req.user.permissions.includes(permission))) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: `Forbidden: Memerlukan izin '${permission}'`
    });
  };
}
