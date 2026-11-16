import { Router } from 'express';
import { fetchSystemStatus, configureSwap, configureSystem } from './service.js';
import { checkLatestVersion } from './version.js';
import { withServer } from '../../http/handlers.js';
import { need } from '../../http/auth.js';

export const systemRoutes = Router();

// GET running version & latest release check (cached 6h; pass ?refresh=1 to re-check)
systemRoutes.get('/system/version', async (req, res, next) => {
  try {
    const force = req.query.refresh === '1';
    const info = await checkLatestVersion(force);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

// GET status
systemRoutes.get('/servers/:id/system/tuning', withServer((t) => fetchSystemStatus(t)));

// POST configure swap (requires server.manage)
systemRoutes.post('/servers/:id/system/swap', need('server.manage'), withServer((t, req) =>
  configureSwap(t, req.body || {})));

// POST configure system tuning: hostname, timezone, BBR, limits
systemRoutes.post('/servers/:id/system/tuning', need('server.manage'), withServer((t, req) =>
  configureSystem(t, req.body || {})));

