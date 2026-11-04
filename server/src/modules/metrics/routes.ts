import { Router, Request, Response } from 'express';
import { fetchServerMetrics } from './service.js';
import { getServerById, updateServer } from '../servers/store.js';
import { recordHistory } from '../monitoring/monitor.js';

export const metricsRoutes = Router();

metricsRoutes.get('/servers/:id/metrics', async (req: Request, res: Response) => {
  try {
    const target = getServerById(req.params.id as string, true);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }
    const metrics = await fetchServerMetrics(target);
    recordHistory(target.id, metrics);
    updateServer(req.params.id as string, {
      status: 'online',
      lastChecked: new Date().toISOString(),
      metrics
    });
    res.json({ success: true, data: metrics });
  } catch (err: any) {
    updateServer(req.params.id as string, {
      status: 'offline',
      lastChecked: new Date().toISOString()
    });
    res.status(500).json({ success: false, error: err.message });
  }
});
