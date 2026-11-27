import { Router, type Request, type Response, type NextFunction } from 'express';
import { need } from '../../http/auth.js';
import { badRequest } from '../../http/errors.js';
import {
  deleteCloudflareIntegration,
  getSafeCloudflareIntegration
} from './store.js';
import {
  executeCloudflareAction,
  isReadOnlyCloudflareAction,
  syncCloudflareZones,
  verifyAndSaveCloudflareToken
} from './service.js';

export const cloudflareRoutes = Router();

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

cloudflareRoutes.get('/integrations/cloudflare', (_req, res) => {
  res.json({ success: true, data: getSafeCloudflareIntegration() });
});

cloudflareRoutes.post('/integrations/cloudflare/token', need('service.control'), wrap(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const saved = await verifyAndSaveCloudflareToken(token);
  res.json({ success: true, data: saved });
}));

cloudflareRoutes.post('/integrations/cloudflare/sync', need('service.control'), wrap(async (_req, res) => {
  const updated = await syncCloudflareZones();
  res.json({ success: true, data: updated });
}));

cloudflareRoutes.delete('/integrations/cloudflare', need('service.control'), (_req, res) => {
  deleteCloudflareIntegration();
  res.json({ success: true, data: { ok: true } });
});

cloudflareRoutes.post('/integrations/cloudflare/action', (req, res, next) => {
  const payload = typeof req.body?.command === 'string'
    ? (() => { try { return JSON.parse(req.body.command); } catch { return null; } })()
    : req.body;

  if (!payload || typeof payload.action !== 'string') {
    next(badRequest('Cloudflare action JSON must contain an "action" string'));
    return;
  }

  const run = () => {
    executeCloudflareAction(payload)
      .then((result) => res.json({ success: true, data: { ok: true, action: payload.action, result } }))
      .catch(next);
  };

  if (!isReadOnlyCloudflareAction(payload)) {
    need('service.control')(req, res, (err?: unknown) => {
      if (err) { next(err); return; }
      run();
    });
    return;
  }
  run();
});
