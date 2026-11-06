import { Router } from 'express';
import {
  composeCommand,
  containerCommand,
  fetchDockerOverview,
  imageRemoveCommand,
  pullImageCommand,
  volumeCreateCommand,
  volumeRemoveCommand,
  inspectVolume,
  networkCreateCommand,
  networkRemoveCommand,
  inspectNetwork,
  runContainerCommand,
  getContainerLogs,
  readComposeFile,
  deployComposeStack,
  inspectContainer,
  pruneCommand,
  executeDockerCommand
} from './service.js';
import { executeCommand } from '../../infra/ssh.js';
import { withServer } from '../../http/handlers.js';
import { need } from '../../http/auth.js';

export const dockerRoutes = Router();

// Run a prebuilt (already validated) docker command and return its output.
const runDocker = async (target: any, cmd: string, timeoutMs = 60000) => {
  const r = await executeDockerCommand(target, cmd, timeoutMs);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || `exit ${r.code}`).trim());
  return (r.stdout + r.stderr).trim();
};

// 1. Overview & Inspections
dockerRoutes.get('/servers/:id/docker', withServer((t, req) => fetchDockerOverview(t, req.query.stats !== '0')));
dockerRoutes.get('/servers/:id/docker/inspect/:cid', withServer((t, req) => inspectContainer(t, req.params.cid)));

// 2. Container Lifecycle & Run
dockerRoutes.post('/servers/:id/docker/container', need('service.control'), withServer((t, req) =>
  runDocker(t, `${containerCommand(req.body?.containerId, String(req.body?.action))} 2>&1`, 30000)));

dockerRoutes.post('/servers/:id/docker/run', need('service.control'), withServer((t, req) =>
  runDocker(t, runContainerCommand(req.body), 60000)));

dockerRoutes.get('/servers/:id/docker/logs/:cid', withServer((t, req) =>
  getContainerLogs(t, req.params.cid, Number(req.query.tail) || 200, req.query.timestamps === '1')));

// 3. Images: Pull & Remove
dockerRoutes.post('/servers/:id/docker/image/pull', need('service.control'), withServer((t, req) =>
  runDocker(t, pullImageCommand(req.body?.image), 180000)));

dockerRoutes.post('/servers/:id/docker/image/rm', need('service.control'), withServer((t, req) =>
  runDocker(t, imageRemoveCommand(req.body?.image), 60000)));

// 4. Volumes: Create, Remove, Inspect
dockerRoutes.post('/servers/:id/docker/volume/create', need('service.control'), withServer((t, req) =>
  runDocker(t, volumeCreateCommand(req.body?.name, req.body?.driver), 30000)));

dockerRoutes.post('/servers/:id/docker/volume/rm', need('service.control'), withServer((t, req) =>
  runDocker(t, volumeRemoveCommand(req.body?.name), 30000)));

dockerRoutes.get('/servers/:id/docker/volume/inspect/:name', withServer((t, req) =>
  inspectVolume(t, req.params.name)));

// 5. Networks: Create, Remove, Inspect
dockerRoutes.post('/servers/:id/docker/network/create', need('service.control'), withServer((t, req) =>
  runDocker(t, networkCreateCommand(req.body?.name, req.body?.driver, req.body?.subnet), 30000)));

dockerRoutes.post('/servers/:id/docker/network/rm', need('service.control'), withServer((t, req) =>
  runDocker(t, networkRemoveCommand(req.body?.name), 30000)));

dockerRoutes.get('/servers/:id/docker/network/inspect/:name', withServer((t, req) =>
  inspectNetwork(t, req.params.name)));

// 6. Docker Compose: Actions, File Read, Full Stack Deploy
dockerRoutes.post('/servers/:id/docker/compose', need('service.control'), withServer((t, req) =>
  // pull/up can download images: allow up to 5 minutes
  runDocker(t, composeCommand(req.body?.project, req.body?.workingDir, String(req.body?.action), req.body?.configFiles), 300000)));

dockerRoutes.get('/servers/:id/docker/compose/file', withServer((t, req) =>
  readComposeFile(t, String(req.query.workingDir || ''), String(req.query.configFile || 'docker-compose.yml'))));

dockerRoutes.post('/servers/:id/docker/compose/deploy', need('service.control'), withServer((t, req) =>
  deployComposeStack(t, req.body)));

// 7. Prune & Disk Cleanup
dockerRoutes.post('/servers/:id/docker/prune', need('service.control'), withServer((t, req) =>
  runDocker(t, pruneCommand(String(req.body?.what)), 120000)));
