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
  withServer(async (t, req, res) => {
    const isStream = req.query.stream === '1' || req.headers.accept?.includes('text/event-stream');
    const { script, sudoPassword } = req.body || {};

    if (isStream) {
      res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const send = (type: string, payload: any) => {
        res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
        if (typeof (res as any).flush === 'function') (res as any).flush();
      };

      try {
        const result = await executeSoftwareScript(
          t,
          String(script || ''),
          sudoPassword ? String(sudoPassword) : undefined,
          (chunk) => {
            send('chunk', { chunk });
          }
        );
        send('done', result);
        res.end();
      } catch (err: any) {
        send('error', { error: err.message || 'Execution failed' });
        res.end();
      }
      return;
    }

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
