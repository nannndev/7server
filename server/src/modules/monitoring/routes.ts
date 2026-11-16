import { Router, Request, Response } from 'express';
import {
  acknowledgeAlert,
  clearAlertHistory,
  getAlertHistory,
  getHistory,
  getSettings as getMonitorSettings,
  getStatus as getMonitorStatus,
  getUptime,
  runMetricsPollNow,
  runUptimeChecks,
  sendCustomWebhook,
  sendDiscord,
  sendTelegram,
  updateSettings as updateMonitorSettings
} from './monitor.js';
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
  res.json({ success: true, data: { settings: getMonitorSettings(), status: getMonitorStatus(), history: getAlertHistory(60) } });
});

monitoringRoutes.put('/monitor', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: updateMonitorSettings(req.body) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.post('/monitor/run', async (_req: Request, res: Response) => {
  await runMetricsPollNow();
  res.json({ success: true, data: { settings: getMonitorSettings(), status: getMonitorStatus(), history: getAlertHistory(60) } });
});

monitoringRoutes.post('/monitor/discord-test', async (_req: Request, res: Response) => {
  try {
    await sendDiscord('✅ **7Server**: notifikasi Discord berhasil terhubung.', 'ok');
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.post('/monitor/telegram-test', async (_req: Request, res: Response) => {
  try {
    await sendTelegram('✅ 7Server: notifikasi Telegram berhasil terhubung.');
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.post('/monitor/webhook-test', async (_req: Request, res: Response) => {
  try {
    await sendCustomWebhook('✅ 7Server: notifikasi Custom Webhook berhasil terhubung.', 'ok');
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitoringRoutes.post('/monitor/alerts/:key/ack', (req: Request, res: Response) => {
  const ok = acknowledgeAlert(decodeURIComponent(String(req.params.key || '')));
  res.json({ success: ok, data: getMonitorStatus() });
});

monitoringRoutes.get('/monitor/history', (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  res.json({ success: true, data: getAlertHistory(limit) });
});

monitoringRoutes.delete('/monitor/history', (_req: Request, res: Response) => {
  clearAlertHistory();
  res.json({ success: true });
});

monitoringRoutes.get('/uptime', (_req: Request, res: Response) => {
  res.json({ success: true, data: getUptime() });
});

monitoringRoutes.post('/uptime/run', async (_req: Request, res: Response) => {
  await runUptimeChecks();
  res.json({ success: true, data: getUptime() });
});
