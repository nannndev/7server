import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchSoftware, fetchUpgradablePackages } from './service.js';
import { need } from '../../http/auth.js';

export const softwareRoutes = Router();

softwareRoutes.get('/servers/:id/software', withServer((t) => fetchSoftware(t)));
softwareRoutes.get('/servers/:id/software/upgrades', withServer((t) => fetchUpgradablePackages(t)));

// Log template setup execution into Audit log
softwareRoutes.post('/servers/:id/templates/run', need('service.control'), withServer(async () => {
  return { timestamp: new Date().toISOString() };
}));
