import { Router, Request, Response } from 'express';
import { createServer, deleteServer, getAllServers, getServerById, updateServer } from './store.js';

export const serversRoutes = Router();

serversRoutes.get('/servers', (_req: Request, res: Response) => {
  const servers = getAllServers(false);
  res.json({ success: true, data: servers });
});

serversRoutes.get('/servers/:id', (req: Request, res: Response) => {
  const serverItem = getServerById(req.params.id as string, false);
  if (!serverItem) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, data: serverItem });
});

serversRoutes.post('/servers', (req: Request, res: Response) => {
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

serversRoutes.put('/servers/:id', (req: Request, res: Response) => {
  const updated = updateServer(req.params.id as string, req.body);
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, data: updated });
});

serversRoutes.delete('/servers/:id', (req: Request, res: Response) => {
  const success = deleteServer(req.params.id as string);
  if (!success) {
    return res.status(404).json({ success: false, error: 'Server not found' });
  }
  res.json({ success: true, message: 'Server deleted successfully' });
});
