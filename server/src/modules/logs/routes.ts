import { Router, Request, Response } from 'express';
import { executeCommand } from '../../infra/ssh.js';
import { getServerById } from '../servers/store.js';

export const logsRoutes = Router();

logsRoutes.get('/servers/:id/logs', async (req: Request, res: Response) => {
  const type = String(req.query.type || 'service');
  const name = String(req.query.name || '').replace(/[^a-zA-Z0-9_\-@.:]/g, '');
  const lines = Math.min(Math.max(parseInt(String(req.query.lines), 10) || 200, 1), 2000);
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  let cmd = `journalctl -u ${name} -n ${lines} --no-pager 2>&1`;
  if (type === 'docker') {
    cmd = `docker logs --tail ${lines} ${name} 2>&1`;
  } else if (type === 'pm2') {
    cmd = `export PATH=$PATH:/usr/local/bin:/usr/bin:/bin; if [ -d "$HOME/.nvm/versions/node" ]; then NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1); [ -n "$NVM_LATEST" ] && export PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"; fi; pm2 logs ${name} --lines ${lines} --nostream 2>&1`;
  } else if (type === 'supervisor') {
    cmd = `supervisorctl tail -${lines * 80} ${name} 2>&1`;
  }
  const result = await executeCommand(target, cmd, 20000);
  res.json({ success: true, data: result.stdout || result.stderr });
});
