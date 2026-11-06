import { Router } from 'express';
import { fetchSystemStatus, configureSwap, configureSystem } from './service.js';
import { withServer } from '../../http/handlers.js';
import { need } from '../../http/auth.js';

export const systemRoutes = Router();

// GET status
systemRoutes.get('/servers/:id/system/tuning', withServer((t) => fetchSystemStatus(t)));

// POST configure swap (requires server.manage)
systemRoutes.post('/servers/:id/system/swap', need('server.manage'), withServer((t, req) =>
  configureSwap(t, req.body || {})));

// POST configure system tuning: hostname, timezone, BBR, limits
systemRoutes.post('/servers/:id/system/tuning', need('server.manage'), withServer((t, req) =>
  configureSystem(t, req.body || {})));

