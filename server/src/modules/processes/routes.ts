import { Router, Request, Response } from 'express';
import { fetchListeningPorts, fetchNginxSites, fetchWebApps } from '../deployments/service.js';
import { fetchPm2AndSupervisor, fetchRunningProcesses, fetchServices, managePm2Process, manageProcess, manageService, manageSupervisorProcess } from './service.js';
import { getServerById } from '../servers/store.js';
import { manageDockerContainer } from '../docker/service.js';
import { need } from '../../http/auth.js';
import { isServerAllowed, withServer } from '../../http/handlers.js';
import { parseDeploySpec, buildDeployScript, buildRemoveScript } from '../deployments/deploy.js';
import { runScript } from '../software/routes.js';
import { getActiveIntegration, getDecryptedAccessToken } from '../git/store.js';

export const processesRoutes = Router();

// Middleware helper to check server scope for legacy routes
const checkServerScope = (req: Request, res: Response) => {
  const serverId = req.params.id as string;
  if (req.user && !isServerAllowed(req.user.servers, serverId)) {
    res.status(403).json({ success: false, error: 'Forbidden: Akses ke server ini dibatasi untuk akun Anda' });
    return false;
  }
  return true;
};

processesRoutes.get('/servers/:id/processes', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  const processes = await fetchRunningProcesses(target);
  res.json({ success: true, data: processes });
});

processesRoutes.post('/servers/:id/processes/kill', need('service.control'), async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const { pid, action } = req.body;
  if (!pid) return res.status(400).json({ success: false, error: 'PID is required' });

  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  const result = await manageProcess(target, pid, action || 'kill');
  res.json({ success: true, data: result });
});

processesRoutes.get('/servers/:id/services', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  const data = await fetchServices(target);
  res.json({ success: true, data });
});

processesRoutes.post('/servers/:id/services/control', need('service.control'), async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const { serviceName, action } = req.body;
  if (!serviceName || !action) {
    return res.status(400).json({ success: false, error: 'serviceName and action are required' });
  }

  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  const result = await manageService(target, serviceName, action);
  res.json({ success: true, data: result });
});

processesRoutes.get('/servers/:id/webapps', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  const apps = await fetchWebApps(target);
  res.json({ success: true, data: apps });
});

// Clone/update a GitHub repo into /var/www/<app>, build, run under PM2/Docker and put Nginx in front.
processesRoutes.post('/servers/:id/webapps/deploy', need('service.control'), withServer((t, req, res) => {
  const spec = parseDeploySpec(req.body);
  const integration = getActiveIntegration('github');
  const token = integration ? getDecryptedAccessToken(integration) : undefined;
  // Optional install script for missing software (from the install catalog), run in the same task so sudo is asked once.
  const pre = typeof req.body?.preScript === 'string' ? `${req.body.preScript}\n` : '';
  // Installs + npm ci + build on a 1-vCPU VPS routinely pass the 5-minute software default.
  return runScript(t, req, res, pre + buildDeployScript(spec, token), 30 * 60 * 1000);
}));

// Delete an app folder plus the PM2/Docker/Nginx/SSL setup that points at it.
processesRoutes.post('/servers/:id/webapps/remove', need('service.control'), withServer((t, req, res) =>
  runScript(t, req, res, buildRemoveScript(req.body?.name))
));

processesRoutes.post('/servers/:id/docker/control', need('service.control'), async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const { containerId, action } = req.body;
  if (!containerId || !action) {
    return res.status(400).json({ success: false, error: 'containerId and action are required' });
  }

  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  const result = await manageDockerContainer(target, containerId, action);
  res.json({ success: true, data: result });
});

processesRoutes.get('/servers/:id/pm2', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
  const data = await fetchPm2AndSupervisor(target);
  res.json({ success: true, data });
});

processesRoutes.post('/servers/:id/pm2/control', need('service.control'), async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const { target: procTarget, action } = req.body;
  if (procTarget === undefined || !action) {
    return res.status(400).json({ success: false, error: 'target and action are required' });
  }
  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
  const result = await managePm2Process(target, procTarget, action);
  res.json({ success: true, data: result });
});

processesRoutes.post('/servers/:id/supervisor/control', need('service.control'), async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const { target: procTarget, action } = req.body;
  if (!procTarget || !action) {
    return res.status(400).json({ success: false, error: 'target and action are required' });
  }
  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
  const result = await manageSupervisorProcess(target, procTarget, action);
  res.json({ success: true, data: result });
});

processesRoutes.get('/servers/:id/nginx', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
  const data = await fetchNginxSites(target);
  res.json({ success: true, data });
});

processesRoutes.get('/servers/:id/ports', async (req: Request, res: Response) => {
  if (!checkServerScope(req, res)) return;
  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
  const data = await fetchListeningPorts(target);
  res.json({ success: true, data });
});
