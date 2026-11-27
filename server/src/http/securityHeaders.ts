// Security headers middleware for 7Server.
// Works seamlessly in all deploy environments (localhost, local IP, reverse proxy with TLS).
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Strict Referrer Policy: only send origin on same-origin requests
  res.setHeader('Referrer-Policy', 'same-origin');

  // Legacy anti-clickjacking header (modern browsers prefer CSP frame-ancestors)
  if (!config.frameAncestors) {
    res.setHeader('X-Frame-Options', 'DENY');
  }

  // Cross-Origin policies
  res.setHeader('X-XSS-Protection', '0'); // Explicitly disable broken legacy auditor

  // Content Security Policy
  // Note: 'unsafe-inline' style is needed by xterm.js dynamic styles and React inline styling.
  // connect-src includes 'self' and ws: wss: (some Safari versions don't treat ws as self).
  const frameAncestorsValue = config.frameAncestors ? config.frameAncestors : "'none'";
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestorsValue}`
  ];
  res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

  // Strict-Transport-Security ONLY when the connection is genuinely HTTPS / behind trusted TLS proxy.
  // If sent over plain HTTP (e.g. LAN IP), browsers either ignore it or can permanently lock the domain.
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}
