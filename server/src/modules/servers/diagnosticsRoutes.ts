import { Router, Request, Response } from 'express';
import { getServerById, updateServer } from './store.js';
import { testConnection } from '../../infra/ssh.js';

export const diagnosticsRoutes = Router();

diagnosticsRoutes.post('/servers/test', async (req: Request, res: Response) => {
  try {
    const result = await testConnection(req.body);
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, message: err.message });
  }
});

diagnosticsRoutes.get('/servers/:id/ping', async (req: Request, res: Response) => {
  const target = getServerById(req.params.id as string, true);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  const startTime = Date.now();
  const result = await testConnection(target);
  const latencyMs = Date.now() - startTime;

  updateServer(req.params.id as string, {
    status: result.success ? 'online' : 'offline',
    lastChecked: new Date().toISOString()
  });

  res.json({
    success: result.success,
    latencyMs: result.success ? latencyMs : null,
    message: result.message
  });
});
