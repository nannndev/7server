import { Router, Request, Response } from 'express';
import { getHistory, getSettings as getMonitorSettings, getStatus as getMonitorStatus, getUptime, runUptimeChecks, sendDiscord, updateSettings as updateMonitorSettings } from './monitor.js';
import { readAudit } from '../../infra/audit.js';
import { withServer } from '../../http/handlers.js';

export const monitoringRoutes = Router();
monitoringRoutes.get('/audit', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 200, 2000);
  const user = req.query.user ? String(req.query.user) : undefined;
  const search = req.query.search ? String(req.query.search) : undefined;
  res.json({ success: true, data: readAudit({ limit, user, search }) });
});

monitoringRoutes.get('/servers/:id/audit', withServer(async (target, req: Request) => {
  const limit = Math.min(Number(req.query.limit) || 150, 1000);
  const serverId = target.id;
  const host = target.host;
  const all = readAudit({ limit: 2000, server: serverId });
  return all
    .filter((entry) => entry.path.includes(serverId) || entry.detail.includes(serverId) || entry.detail.includes(host))
    .slice(0, limit);
}));


monitoringRoutes.get('/servers/:id/history', (req: Request, res: Response) => {
  res.json({ success: true, data: getHistory(req.params.id as string) });
});

monitoringRoutes.get('/monitor', (_req: Request, res: Response) => {
  res.json({ success: true, data: { settings: getMonitorSettings(), status: getMonitorStatus() } });
});

monitoringRoutes.put('/monitor', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: updateMonitorSettings(req.body) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.post('/monitor/discord-test', async (_req: Request, res: Response) => {
  try {
    await sendDiscord('✅ **7Server**: notifikasi Discord berhasil terhubung.', 'ok');
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.get('/uptime', (_req: Request, res: Response) => {
  res.json({ success: true, data: getUptime() });
});

monitoringRoutes.post('/uptime/run', async (_req: Request, res: Response) => {
  await runUptimeChecks();
  res.json({ success: true, data: getUptime() });
});
