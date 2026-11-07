import { Router, Request, Response } from 'express';
import { createServer, deleteServer, getAllServers, getServerById, updateServer, reorderServers } from './store.js';
import { need } from '../../http/auth.js';
import { isServerAllowed } from '../../http/handlers.js';

export const serversRoutes = Router();

serversRoutes.get('/servers', (req: Request, res: Response) => {
  let servers = getAllServers(false);
  if (req.user && req.user.servers !== '*') {
    servers = servers.filter((s) => isServerAllowed(req.user?.servers, s.id));
  }
  res.json({ success: true, data: servers });
});

serversRoutes.get('/servers/:id', (req: Request, res: Response) => {
  const serverId = req.params.id as string;
  if (req.user && !isServerAllowed(req.user.servers, serverId)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Akses ke server ini dibatasi' });
  }

  const serverItem = getServerById(serverId, false);
  if (!serverItem) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, data: serverItem });
});

serversRoutes.post('/servers', need('server.manage'), (req: Request, res: Response) => {
  const { name, host, port, username, authType, password, privateKey, passphrase, tags, description } = req.body;
  if (!host) {
    return res.status(400).json({ success: false, error: 'Host IP/Domain is required' });
  }
  const created = createServer({
    name,
    host,
    port,
    username,
    authType,
    password,
    privateKey,
    passphrase,
    tags,
    description
  });
  res.status(201).json({ success: true, data: created });
});

serversRoutes.put('/servers/reorder', need('server.manage'), (req: Request, res: Response) => {
  const { serverIds } = req.body;
  if (!Array.isArray(serverIds)) {
    return res.status(400).json({ success: false, error: 'serverIds array is required' });
  }
  const updated = reorderServers(serverIds);
  res.json({ success: true, data: updated });
});

serversRoutes.put('/servers/:id', need('server.manage'), (req: Request, res: Response) => {
  const updated = updateServer(req.params.id as string, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, data: updated });
});

serversRoutes.delete('/servers/:id', need('server.manage'), (req: Request, res: Response) => {
  const success = deleteServer(req.params.id as string);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, message: 'Server deleted successfully' });
});
