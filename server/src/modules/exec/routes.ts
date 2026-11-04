import { Router, Request, Response } from 'express';
import { BatchResultItem } from './types.js';
import { executeCommand } from '../../infra/ssh.js';
import { getAllServers, getServerById } from '../servers/store.js';

export const execRoutes = Router();

execRoutes.post('/servers/:id/exec', async (req: Request, res: Response) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command is required' });

  const target = getServerById(req.params.id as string, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  const result = await executeCommand(target, command, 30000);
  res.json({ success: true, data: result });
});

execRoutes.post('/servers/batch-exec', async (req: Request, res: Response) => {
  const { serverIds, command } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command is required' });
  if (!Array.isArray(serverIds) || serverIds.length === 0) {
    return res.status(400).json({ success: false, error: 'serverIds array is required' });
  }

  const allServers = getAllServers(true);
  const targetServers = allServers.filter((s) => serverIds.includes(s.id));

  const results = await Promise.allSettled(
    targetServers.map(async (serverItem): Promise<BatchResultItem> => {
      const start = Date.now();
      try {
        const resCmd = await executeCommand(serverItem, command, 45000);
        return {
          serverId: serverItem.id,
          serverName: serverItem.name,
          host: serverItem.host,
          durationMs: Date.now() - start,
          success: resCmd.code === 0,
          stdout: resCmd.stdout,
          stderr: resCmd.stderr,
          code: resCmd.code
        };
      } catch (execErr: any) {
        return {
          serverId: serverItem.id,
          serverName: serverItem.name,
          host: serverItem.host,
          durationMs: Date.now() - start,
          success: false,
          error: execErr.message
        };
      }
    })
  );

  const formatted: BatchResultItem[] = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          serverId: 'unknown',
          serverName: 'unknown',
          host: 'unknown',
          durationMs: 0,
          success: false,
          error: String(r.reason)
        }
  );

  res.json({ success: true, data: formatted });
});
