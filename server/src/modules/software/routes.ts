import { Router, type Request, type Response } from 'express';
import type { ServerCredentials } from '../servers/types.js';
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
  withServer((t, req, res) => runScript(t, req, res, String(req.body?.script || '')))
);

/** Runs a script with sudo handling; streams SSE chunks when the client asks for it (?stream=1). */
export async function runScript(t: ServerCredentials, req: Request, res: Response, script: string, timeoutMs?: number) {
  const isStream = req.query.stream === '1' || req.headers.accept?.includes('text/event-stream');
  const sudoPassword = req.body?.sudoPassword ? String(req.body.sudoPassword) : undefined;
  if (!isStream) return executeSoftwareScript(t, script, sudoPassword, undefined, timeoutMs);

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
    send('done', await executeSoftwareScript(t, script, sudoPassword, (chunk) => send('chunk', { chunk }), timeoutMs));
  } catch (err: any) {
    send('error', { error: err.message || 'Execution failed' });
  }
  res.end();
}

// Log template setup execution into Audit log
softwareRoutes.post('/servers/:id/templates/run', need('service.control'), withServer(async () => {
  return { timestamp: new Date().toISOString() };
}));
