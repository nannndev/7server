import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchSoftware, fetchUpgradablePackages } from './service.js';

export const softwareRoutes = Router();

softwareRoutes.get('/servers/:id/software', withServer((t) => fetchSoftware(t)));
softwareRoutes.get('/servers/:id/software/upgrades', withServer((t) => fetchUpgradablePackages(t)));

// Log template setup execution into Audit log
softwareRoutes.post('/servers/:id/templates/run', withServer(async () => {
  return { timestamp: new Date().toISOString() };
}));
