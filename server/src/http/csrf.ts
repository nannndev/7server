// CSRF protection for cookie-based state-changing requests (POST, PUT, DELETE, PATCH).
// Bearer-token requests (scripts, CLI, API keys) are exempt because browsers do not attach Bearer headers automatically.
import type { Request, Response, NextFunction } from 'express';
import { isOriginAllowed } from '../modules/terminal/ws.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  // Safe read-only HTTP methods are not subject to CSRF
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // If request uses Authorization: Bearer, it's not a browser automatic cookie request
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return next();
  }

  // Public webhook / API key routes are exempt (e.g. AI gateway, deploy webhooks, git webhooks)
  if (req.path.startsWith('/api/ai/') || req.path.startsWith('/api/deploy/') || req.path.startsWith('/api/git/webhook')) {
    return next();
  }

  // If browser sent an Origin or Referer header, verify it matches our host or allowed origins
  const origin = req.headers.origin;
  if (origin) {
    if (!isOriginAllowed(req)) {
      return res.status(403).json({
        success: false,
        code: 'CSRF_BLOCKED',
        error: 'Forbidden: Request origin does not match server domain (CSRF check failed)'
      });
    }
    return next();
  }

  const referer = req.headers.referer;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const fakeReq = {
        ...req,
        headers: {
          ...req.headers,
          origin: refUrl.origin
        }
      };
      if (!isOriginAllowed(fakeReq as any)) {
        return res.status(403).json({
          success: false,
          code: 'CSRF_BLOCKED',
          error: 'Forbidden: Referer origin does not match server domain (CSRF check failed)'
        });
      }
    } catch {
      return res.status(403).json({
        success: false,
        code: 'CSRF_BLOCKED',
        error: 'Forbidden: Malformed Referer header'
      });
    }
  }

  // In non-browser environments or when no Origin/Referer is present, proceed
  next();
}
