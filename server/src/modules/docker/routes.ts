import { Router } from 'express';
import { composeCommand, containerCommand, fetchDockerOverview, imageRemoveCommand, inspectContainer, pruneCommand } from './service.js';
import { executeCommand } from '../../infra/ssh.js';
import { withServer } from '../../http/handlers.js';

export const dockerRoutes = Router();


// Run a prebuilt (already validated) docker command and return its output.
const runDocker = async (target: any, cmd: string, timeoutMs = 60000) => {
  const r = await executeCommand(target, cmd, timeoutMs);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
  return (r.stdout + r.stderr).trim();
};

dockerRoutes.get('/servers/:id/docker', withServer((t, req) => fetchDockerOverview(t, req.query.stats !== '0')));
dockerRoutes.get('/servers/:id/docker/inspect/:cid', withServer((t, req) => inspectContainer(t, req.params.cid)));
dockerRoutes.post('/servers/:id/docker/container', withServer((t, req) =>
  runDocker(t, `${containerCommand(req.body?.containerId, String(req.body?.action))} 2>&1`, 30000)));
dockerRoutes.post('/servers/:id/docker/compose', withServer((t, req) =>
  // pull/up can download images: allow up to 5 minutes
  runDocker(t, composeCommand(req.body?.project, req.body?.workingDir, String(req.body?.action), req.body?.configFiles), 300000)));
dockerRoutes.post('/servers/:id/docker/prune', withServer((t, req) => runDocker(t, pruneCommand(String(req.body?.what)), 120000)));
dockerRoutes.post('/servers/:id/docker/image/rm', withServer((t, req) => runDocker(t, imageRemoveCommand(req.body?.image), 60000)));
