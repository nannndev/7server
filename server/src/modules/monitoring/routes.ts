import { Router, Request, Response } from 'express';
import { getHistory, getSettings as getMonitorSettings, getStatus as getMonitorStatus, getUptime, runUptimeChecks, sendDiscord, updateSettings as updateMonitorSettings } from './monitor.js';
import { readAudit } from '../../infra/audit.js';

export const monitoringRoutes = Router();
monitoringRoutes.get('/audit', (req: Request, res: Response) => {
  res.json({ success: true, data: readAudit(Math.min(Number(req.query.limit) || 200, 2000)) });
});


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
    await sendDiscord('✅ **VPS Hub**: notifikasi Discord berhasil terhubung.', 'ok');
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
