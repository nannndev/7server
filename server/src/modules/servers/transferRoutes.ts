import { Router, Request, Response } from 'express';
import { exportServers, importServers } from './store.js';

export const transferRoutes = Router();

transferRoutes.get('/export', (_req: Request, res: Response) => {
  res.setHeader('Content-Disposition', 'attachment; filename="7server-servers.json"');
  res.json(exportServers());
});

transferRoutes.post('/import', (req: Request, res: Response) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ success: false, error: 'Expected JSON array' });
  res.json({ success: true, imported: importServers(req.body) });
});
