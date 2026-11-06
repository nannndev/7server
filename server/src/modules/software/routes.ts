import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import {
  fetchSoftware,
  fetchUpgradablePackages,
  controlSoftwareService,
  executeSoftwareScript
} from './service.js';
import { need } from '../../http/auth.js';

export const softwareRoutes = Router();

softwareRoutes.get('/servers/:id/software', withServer((t) => fetchSoftware(t)));
softwareRoutes.get('/servers/:id/software/upgrades', withServer((t) => fetchUpgradablePackages(t)));

softwareRoutes.post(
  '/servers/:id/software/service',
  need('service.control'),
  withServer((t, req) => {
    const { toolId, action } = req.body || {};
    return controlSoftwareService(t, String(toolId || ''), action);
  })
);

softwareRoutes.post(
  '/servers/:id/software/execute',
  need('service.control'),
  withServer((t, req) => {
    const { script, sudoPassword } = req.body || {};
    return executeSoftwareScript(
      t,
      String(script || ''),
      sudoPassword ? String(sudoPassword) : undefined
    );
  })
);

// Log template setup execution into Audit log
softwareRoutes.post('/servers/:id/templates/run', need('service.control'), withServer(async () => {
  return { timestamp: new Date().toISOString() };
}));
