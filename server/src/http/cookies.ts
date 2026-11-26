// Helpers for setting and clearing secure HttpOnly session cookies.
// Adapts dynamically between localhost, local IP network, and HTTPS reverse proxy.
import type { Request, Response } from 'express';
import { config } from '../config.js';

export const SESSION_COOKIE_NAME = '7s_sid';

/**
 * Returns cookie options adapted for current request context.
 */
export function getSessionCookieOptions(req: Request) {
  // Determine if connection is genuinely HTTPS (either direct or via trusted reverse proxy)
  const isSecure = Boolean(req.secure);

  return {
    httpOnly: true,
    sameSite: 'lax' as const, // 'lax' permits smooth top-level navigation while protecting against CSRF
    secure: isSecure, // Must NOT be true on plain HTTP (e.g. LAN IP 192.168.x.x), or browsers reject cookie
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  };
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const options = getSessionCookieOptions(req);
  res.cookie(SESSION_COOKIE_NAME, token, options);
}

export function clearSessionCookie(req: Request, res: Response): void {
  const options = getSessionCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    sameSite: options.sameSite,
    secure: options.secure,
    path: options.path
  });
}

/**
 * Simple cookie header parser (no external cookie-parser dependency required).
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [name, ...val] = part.trim().split('=');
    if (name && val.length > 0) {
      cookies[decodeURIComponent(name)] = decodeURIComponent(val.join('='));
    }
  }
  return cookies;
}
