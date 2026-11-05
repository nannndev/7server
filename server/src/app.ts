// Express app: middleware + routers, no listen() (so tests can boot it on any port).
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { loginHandler, requireAuth } from './http/auth.js';
import { needsSetup, setupNeedsCode, completeSetup } from './modules/users/setup.js';
import { auditMiddleware } from './http/audit.js';
import { errorHandler } from './http/errors.js';
import { monitoringRoutes } from './modules/monitoring/routes.js';
import { transferRoutes } from './modules/servers/transferRoutes.js';
import { serversRoutes } from './modules/servers/routes.js';
import { diagnosticsRoutes } from './modules/servers/diagnosticsRoutes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { processesRoutes } from './modules/processes/routes.js';
import { logsRoutes } from './modules/logs/routes.js';
import { filesRoutes } from './modules/files/routes.js';
import { dockerRoutes } from './modules/docker/routes.js';
import { databasesRoutes } from './modules/databases/routes.js';
import { execRoutes } from './modules/exec/routes.js';
import { softwareRoutes } from './modules/software/routes.js';
import { cronRoutes } from './modules/cron/routes.js';
import { certificateRoutes } from './modules/certificates/routes.js';
import { securityRoutes } from './modules/security/routes.js';
import { backupRoutes } from './modules/backups/routes.js';
import { aiGatewayPublicRoutes, aiGatewayManagementRoutes } from './modules/ai-gateway/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { firewallRoutes } from './modules/firewall/routes.js';

export function createApp() {
  const app = express();
  // Behind nginx every request comes from 127.0.0.1; with TRUST_PROXY set, req.ip is the real client
  // (taken from X-Forwarded-For only when the hop that sent it is a listed proxy).
  if (config.trustProxy) app.set('trust proxy', config.trustProxy.split(',').map((s) => s.trim()).filter(Boolean));

  // Same-origin via Vite proxy; set CORS_ORIGIN only if the UI is served elsewhere.
  if (config.corsOrigin) app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '5mb' }));

  // Public AI Gateway endpoints (authenticated via Virtual API Key)
  app.use('/api/ai', aiGatewayPublicRoutes);

  app.post('/api/login', loginHandler);
  // First run: no user exists yet -> the UI shows "create admin" (see modules/users/setup.ts).
  app.get('/api/setup', (req, res) => res.json({ needsSetup: needsSetup(), needsCode: needsSetup() && setupNeedsCode(req.ip || req.socket.remoteAddress || '') }));
  app.post('/api/setup', async (req, res) => {
    try {
      const ip = req.ip || req.socket.remoteAddress || '';
      await completeSetup(req.body || {}, ip);
      // Sign the new admin in right away.
      req.body = { username: String(req.body?.username || '').trim().toLowerCase(), password: req.body?.password };
      return loginHandler(req, res);
    } catch (e: any) {
      res.status(e.status || 400).json({ success: false, error: e.message });
    }
  });
  // Everything under /api below this line requires the token; keep routers after requireAuth.
  app.use('/api', requireAuth, auditMiddleware);

  // Order matters where paths overlap (e.g. /servers/test and /servers/batch-exec vs /servers/:id):
  // this is the order the routes had in the old single-file server.
  app.use('/api', usersRoutes, firewallRoutes, aiGatewayManagementRoutes, monitoringRoutes, transferRoutes, serversRoutes, diagnosticsRoutes, metricsRoutes, processesRoutes,
    logsRoutes, filesRoutes, dockerRoutes, databasesRoutes, execRoutes, softwareRoutes, cronRoutes, certificateRoutes, securityRoutes, backupRoutes);

  app.use(errorHandler);

  // Production / Docker: one port serves the API above and the built dashboard. Unknown /api paths
  // already ended in the routers or the error handler, so everything left is the SPA.
  if (fs.existsSync(path.join(config.staticDir, 'index.html'))) {
    app.use(express.static(config.staticDir, { index: false, maxAge: '1h', setHeaders: noCacheHtml }));
    app.get(/^\/(?!api\/|ws\/).*/, (_req, res) => res.sendFile(path.join(config.staticDir, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
  }
  return app;
}

// Hashed assets can be cached; index.html must not be, or a new release keeps loading old chunks.
const noCacheHtml = (res: express.Response, file: string) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); };
