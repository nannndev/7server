// Dashboard auth: one shared password, a stateless HMAC token, and a per-IP login rate limit.
import crypto from 'crypto';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { config, dataFile } from '../config.js';

const PW_FILE = dataFile('dashboard.password');

function loadPassword(): string {
  if (config.dashboardPassword) return config.dashboardPassword;
  if (!fs.existsSync(PW_FILE)) fs.writeFileSync(PW_FILE, crypto.randomBytes(12).toString('base64url'), { mode: 0o600 });
  console.log(`[auth] DASHBOARD_PASSWORD not set; using password from ${PW_FILE}`);
  return fs.readFileSync(PW_FILE, 'utf8').trim();
}

const DASHBOARD_PASSWORD = loadPassword();
// Stateless token: survives restarts, invalidated by changing the password.
export const AUTH_TOKEN = crypto.createHmac('sha256', DASHBOARD_PASSWORD).update('vps-hub-token').digest('hex');

/** Constant-time compare of arbitrary-length strings (hash first so lengths always match). */
export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const loginAttempts = new Map<string, { count: number; until: number }>();

export function loginHandler(req: Request, res: Response) {
  const ip = req.ip || 'unknown';
  const att = loginAttempts.get(ip);
  if (att && att.until > Date.now()) {
    return res.status(429).json({ success: false, error: 'Terlalu banyak percobaan, tunggu 1 menit' });
  }
  if (!safeEqual(String(req.body?.password || ''), DASHBOARD_PASSWORD)) {
    const count = (att?.count || 0) + 1;
    loginAttempts.set(ip, { count, until: count >= 5 ? Date.now() + 60000 : 0 });
    return res.status(401).json({ success: false, error: 'Password salah' });
  }
  loginAttempts.delete(ip);
  res.json({ success: true, token: AUTH_TOKEN });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(token, AUTH_TOKEN)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}
