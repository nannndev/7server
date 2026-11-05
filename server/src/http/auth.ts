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
import { loginService } from '../modules/users/service.js';
import { 
  AuthContextUser, 
  Permission, 
  ROLE_PERMISSIONS 
} from '../modules/users/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthContextUser;
    }
  }
}

const PW_FILE = dataFile('dashboard.password');

function loadPassword(): string {
  if (config.dashboardPassword) return config.dashboardPassword;
  if (!fs.existsSync(PW_FILE)) fs.writeFileSync(PW_FILE, crypto.randomBytes(12).toString('base64url'), { mode: 0o600 });
  console.log(`[auth] DASHBOARD_PASSWORD not set; using password from ${PW_FILE}`);
  return fs.readFileSync(PW_FILE, 'utf8').trim();
}

export const DASHBOARD_PASSWORD = loadPassword();
// Legacy stateless token fallback: survives restarts, acts as master fallback.
export const AUTH_TOKEN = crypto.createHmac('sha256', DASHBOARD_PASSWORD).update('vps-hub-token').digest('hex');

// Initialize user store with admin user on boot
initUsersStore(DASHBOARD_PASSWORD).catch((err) => {
  console.error('[auth] Failed to initialize users store:', err);
});

/** Constant-time compare of arbitrary-length strings (hash first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const loginAttempts = new Map<string, { count: number; until: number }>();

export async function loginHandler(req: Request, res: Response) {
  const ip = req.ip || 'unknown';
  const username = String(req.body?.username || 'admin').trim().toLowerCase();
  const rateLimitKey = `${ip}:${username}`;

  const att = loginAttempts.get(rateLimitKey) || loginAttempts.get(ip);
  if (att && att.until > Date.now()) {
    const remainingSec = Math.ceil((att.until - Date.now()) / 1000);
    return res.status(429).json({ 
      success: false, 
      error: `Terlalu banyak percobaan login, silakan tunggu ${remainingSec} detik` 
    });
  }

  try {
    const result = await loginService({
      username: req.body?.username,
      password: req.body?.password,
      ip,
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    loginAttempts.delete(rateLimitKey);
    loginAttempts.delete(ip);

    res.json({
      success: true,
      token: result.token,
      user: result.user,
      permissions: result.permissions,
      session: result.session
    });
  } catch (err: any) {
    const count = (att?.count || 0) + 1;
    const lockDuration = count >= 5 ? 60000 : 0;
    loginAttempts.set(rateLimitKey, { count, until: lockDuration ? Date.now() + lockDuration : 0 });
    loginAttempts.set(ip, { count, until: lockDuration ? Date.now() + lockDuration : 0 });

    const status = err.message.includes('dinonaktifkan') ? 403 : 401;
    res.status(status).json({ success: false, error: err.message || 'Login gagal' });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
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

  // 2. Legacy token fallback (e.g. for contract tests or direct master script calls)
  if (safeEqual(token, AUTH_TOKEN)) {
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
