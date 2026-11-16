import { Router, Request, Response } from 'express';
import { fetchListeningPorts, fetchNginxSites, fetchWebApps } from '../deployments/service.js';
import { fetchPm2AndSupervisor, fetchRunningProcesses, fetchServices, managePm2Process, manageProcess, manageService, manageSupervisorProcess } from './service.js';
import { getServerById } from '../servers/store.js';
import { manageDockerContainer } from '../docker/service.js';
import { need } from '../../http/auth.js';
import { isServerAllowed, withServer } from '../../http/handlers.js';
import { parseDeploySpec, buildRemoveScript, buildPointDomainScript, formatDotenvValue } from '../deployments/deploy.js';
import {
  deleteDeployConfig,
  getDeployConfig,
  listDeployConfigs,
  listDeployHistory,
  saveDeployConfig,
  updateDeployMeta
} from '../deployments/store.js';
import { handleDeployWebhook, runStreamTrackedDeploy } from '../deployments/runner.js';
import { runScript } from '../software/routes.js';
import { executeCommand } from '../../infra/ssh.js';
import { sq } from '../../databases/shell.js';
import { badRequest, notFound } from '../../http/errors.js';

export const deployWebhookRoutes = Router();

deployWebhookRoutes.post('/webhooks/deploy/:serverId/:appName', (req: Request, res: Response) => {
  const serverId = String(req.params.serverId || '');
  const appName = String(req.params.appName || '');
  const rawBody = (req as any).rawBody || JSON.stringify(req.body || {});
  const sig = typeof req.headers['x-hub-signature-256'] === 'string' ? req.headers['x-hub-signature-256'] : undefined;
  const result = handleDeployWebhook(serverId, appName, rawBody, req.body, sig);
  res.status(result.status).json(result.payload);
});

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
  // Optional install script for missing software (from the install catalog), run in the same task so sudo is asked once.
  const preScript = typeof req.body?.preScript === 'string' ? req.body.preScript : undefined;
  return runStreamTrackedDeploy(t, req, res, spec, {
    trigger: 'manual',
    triggeredBy: req.user?.username,
    preScript
  });
}));

processesRoutes.get('/servers/:id/webapps/configs', withServer(async (t) => listDeployConfigs(t.id)));

processesRoutes.get('/servers/:id/webapps/:appName/history', withServer(async (t, req) =>
  listDeployHistory(t.id, String(req.params.appName || ''))
));

processesRoutes.get('/servers/:id/webapps/:appName/webhook', need('service.control'), withServer(async (t, req) => {
  const cfg = getDeployConfig(t.id, String(req.params.appName || ''));
  if (!cfg) throw notFound('Deploy configuration not found for this app');
  return { autoDeploy: cfg.autoDeploy, webhookSecret: cfg.webhookSecret };
}));

processesRoutes.patch('/servers/:id/webapps/:appName/config', need('service.control'), withServer(async (t, req) => {
  const appName = String(req.params.appName || '');
  const existing = getDeployConfig(t.id, appName);
  if (!existing) throw notFound('Deploy configuration not found for this app');
  const { autoDeploy, regenerateWebhook, specPatch } = req.body || {};
  if (specPatch && typeof specPatch === 'object') {
    const merged = parseDeploySpec({ ...existing.spec, ...specPatch, appName });
    saveDeployConfig(t.id, merged, {
      ...(typeof autoDeploy === 'boolean' ? { autoDeploy } : {}),
      regenerateWebhook: regenerateWebhook === true
    });
  } else {
    updateDeployMeta(t.id, appName, {
      ...(typeof autoDeploy === 'boolean' ? { autoDeploy } : {}),
      regenerateWebhook: regenerateWebhook === true
    });
  }
  const updated = getDeployConfig(t.id, appName)!;
  return { ...updated, webhookSecret: undefined, hasWebhookSecret: !!updated.webhookSecret };
}));

processesRoutes.post('/servers/:id/webapps/:appName/redeploy', need('service.control'), withServer((t, req, res) => {
  const appName = String(req.params.appName || '');
  const cfg = getDeployConfig(t.id, appName);
  if (!cfg) throw notFound('No saved deploy config found for this app. Deploy it via the wizard once first.');
  const commitSha = typeof req.body?.commitSha === 'string' && req.body.commitSha.trim() ? req.body.commitSha.trim() : undefined;
  const branch = typeof req.body?.branch === 'string' && req.body.branch.trim() ? req.body.branch.trim() : cfg.spec.branch;
  const spec = parseDeploySpec({ ...cfg.spec, branch, ...(commitSha ? { commitSha } : {}) });
  return runStreamTrackedDeploy(t, req, res, spec, {
    trigger: commitSha ? 'rollback' : 'redeploy',
    triggeredBy: req.user?.username,
    persistSpec: !commitSha
  });
}));

const safeAppName = (raw: string) => {
  const name = raw.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(name)) throw badRequest('Invalid app name');
  return name;
};

processesRoutes.get('/servers/:id/webapps/:appName/logs', withServer(async (t, req) => {
  const appName = safeAppName(String(req.params.appName || ''));
  const lines = Math.min(300, Math.max(20, Number(req.query.lines) || 120));
  const cfg = getDeployConfig(t.id, appName);
  const appDir = `/var/www/${appName}`;
  const workDir = cfg?.spec.rootDir && cfg.spec.rootDir !== '/'
    ? `${appDir}/${cfg.spec.rootDir.replace(/^\/+|\/+$/g, '')}`
    : appDir;
  const cmd = `
    if command -v docker >/dev/null 2>&1 && (docker ps -a --format '{{.Names}}' | grep -qE "^7server-${appName}|^${appName}" || [ -f ${sq(workDir)}/docker-compose.yml ] || [ -f ${sq(workDir)}/compose.yml ]); then
      if [ -f ${sq(workDir)}/docker-compose.yml ] || [ -f ${sq(workDir)}/compose.yml ]; then
        cd ${sq(workDir)} && docker compose -p ${sq('7server-' + appName)} logs --tail ${lines} --no-color 2>&1 || docker compose logs --tail ${lines} --no-color 2>&1
      else
        docker logs --tail ${lines} ${sq('7server-' + appName)} 2>&1
      fi
    elif command -v pm2 >/dev/null 2>&1; then
      pm2 logs ${sq(appName)} --lines ${lines} --nostream --raw 2>&1 || true
    else
      echo "No Docker or PM2 logs found for ${appName}"
    fi
  `;
  const r = await executeCommand(t, cmd);
  return { logs: r.stdout || r.stderr || '' };
}));

processesRoutes.get('/servers/:id/webapps/:appName/env', need('service.control'), withServer(async (t, req) => {
  const appName = safeAppName(String(req.params.appName || ''));
  const cfg = getDeployConfig(t.id, appName);
  const appDir = `/var/www/${appName}`;
  const workDir = cfg?.spec.rootDir && cfg.spec.rootDir !== '/'
    ? `${appDir}/${cfg.spec.rootDir.replace(/^\/+|\/+$/g, '')}`
    : appDir;
  const r = await executeCommand(t, `cat ${sq(workDir + '/.env')} 2>/dev/null || true`);
  return { content: r.stdout || '', path: `${workDir}/.env` };
}));

processesRoutes.put('/servers/:id/webapps/:appName/env', need('service.control'), withServer(async (t, req) => {
  const appName = safeAppName(String(req.params.appName || ''));
  const content: string = typeof req.body?.content === 'string' ? req.body.content : '';
  const cfg = getDeployConfig(t.id, appName);
  const appDir = `/var/www/${appName}`;
  const workDir = cfg?.spec.rootDir && cfg.spec.rootDir !== '/'
    ? `${appDir}/${cfg.spec.rootDir.replace(/^\/+|\/+$/g, '')}`
    : appDir;
  const b64 = Buffer.from(content.replace(/\r\n/g, '\n'), 'utf8').toString('base64');
  await executeCommand(t, `printf '%s' ${sq(b64)} | base64 -d > ${sq(workDir + '/.env')} && chmod 644 ${sq(workDir + '/.env')}`);
  // Sync env array back into saved deploy config if present
  if (cfg) {
    const parsedEnv = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        return { key: line.slice(0, idx).trim(), value: formatDotenvValue(line.slice(idx + 1).trim()) };
      })
      .filter((e) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key));
    saveDeployConfig(t.id, { ...cfg.spec, env: parsedEnv });
  }
  return { saved: true, path: `${workDir}/.env` };
}));

// Delete an app folder plus the PM2/Docker/Nginx/SSL setup that points at it.
processesRoutes.post('/servers/:id/webapps/remove', need('service.control'), withServer((t, req, res) => {
  const name = String(req.body?.name || '');
  if (name) deleteDeployConfig(t.id, name);
  return runScript(t, req, res, buildRemoveScript(name));
}));

// Point an existing webapp to a public domain via Nginx + optional Let's Encrypt SSL
processesRoutes.post('/servers/:id/webapps/point-domain', need('service.control'), withServer((t, req, res) => {
  const { appName, domain, port, enableSsl } = req.body || {};
  const script = buildPointDomainScript({
    appName: String(appName || ''),
    domain: String(domain || ''),
    port: port ? Number(port) : undefined,
    enableSsl: enableSsl !== false
  });
  return runScript(t, req, res, script);
}));

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
