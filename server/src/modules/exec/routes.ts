import { Router, Request, Response } from 'express';
import { BatchResultItem } from './types.js';
import { executeCommand } from '../../infra/ssh.js';
import { sq } from '../../databases/shell.js';
import { getAllServers, getServerById } from '../servers/store.js';
import { need } from '../../http/auth.js';
import { isServerAllowed } from '../../http/handlers.js';

export const execRoutes = Router();

execRoutes.post('/servers/:id/exec', need('terminal.open'), async (req: Request, res: Response) => {
  const serverId = req.params.id as string;
  if (req.user && !isServerAllowed(req.user.servers, serverId)) {
    return res.status(403).json({ success: false, error: 'Forbidden: Akses ke server ini dibatasi untuk akun Anda' });
  }

  const { command, sudo } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command is required' });

  const target = getServerById(serverId, true);
  if (!target) return res.status(404).json({ success: false, error: 'Server not found' });

  // sudo: run as root with the saved sudo password (nginx -t, reload, drop_caches need it on non-root SSH users).
  const pass = target.sudoPassword || (target.authType === 'password' ? target.password : undefined);
  const result = sudo === true
    ? await executeCommand(target, `if [ "$(id -u)" -eq 0 ]; then sh -c ${sq(command)}; else sudo ${pass ? "-k -S -p ''" : '-n'} sh -c ${sq(command)}; fi`, 30000, pass ? { stdin: `${pass}\n` } : {})
    : await executeCommand(target, command, 30000);
  res.json({ success: true, data: result });
});

execRoutes.post('/servers/batch-exec', need('terminal.open'), async (req: Request, res: Response) => {
  const { serverIds, command } = req.body;
  if (!command) return res.status(400).json({ success: false, error: 'Command is required' });
  if (!Array.isArray(serverIds) || serverIds.length === 0) {
    return res.status(400).json({ success: false, error: 'serverIds array is required' });
  }

  // Filter serverIds by user's permitted server scope
  const permittedIds = req.user && req.user.servers !== '*'
    ? serverIds.filter((id) => isServerAllowed(req.user?.servers, id))
    : serverIds;

  if (permittedIds.length === 0) {
    return res.status(403).json({ success: false, error: 'Forbidden: Anda tidak memiliki akses ke server yang dipilih' });
  }

  const allServers = getAllServers(true);
  const targetServers = allServers.filter((s) => permittedIds.includes(s.id));

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
