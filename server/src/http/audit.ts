import type { Request, Response, NextFunction } from 'express';
import { writeAudit, auditSummary } from '../infra/audit.js';

// Records every state-changing call after it finishes (status included). GET/HEAD are reads, not logged.
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  res.on('finish', () => {
    writeAudit({
      t: new Date().toISOString(),
      ip: req.ip || '',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      detail: [auditSummary(req.body), req.query.path ? `path=${req.query.path}` : ''].filter(Boolean).join(' '),
      status: res.statusCode,
      user: (req as any).user?.username || 'anonymous',
      role: (req as any).user?.role,
      sessionId: (req as any).user?.sessionId
    });
  });
  next();
}
