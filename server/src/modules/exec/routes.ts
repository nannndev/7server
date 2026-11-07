import { Router, Request, Response } from 'express';
import { BatchResultItem } from './types.js';
import { executeCommand } from '../../infra/ssh.js';
import { sq } from '../../databases/shell.js';
import { getAllServers, getServerById } from '../servers/store.js';
import { need } from '../../http/auth.js';
import { isServerAllowed } from '../../http/handlers.js';

export const execRoutes = Router();

/** True when a command line invokes sudo itself (not "pseudo", not inside a word). */
export const callsSudo = (cmd: string) => /(^|[\s;&|(])sudo\s/.test(cmd);
/** Drops `sudo [-flags]` so the whole command can run under one root shell instead of nesting sudo. */
export const withoutSudo = (cmd: string) => cmd.replace(/(^|[\s;&|(])sudo\s+(-[A-Za-z]+\s+)*/g, '$1');

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
  // A command that itself calls `sudo` (copilot fixes) gets the same treatment: over a non-interactive SSH exec,
  // sudo cannot prompt and fails with "a terminal is required". Running the whole command as root is
  // equivalent, and it only happens after the user approved that exact command.
  const usesSudo = sudo === true || callsSudo(String(command));
  const pass = target.sudoPassword || (target.authType === 'password' ? target.password : undefined);
  const asRoot = withoutSudo(String(command));
  const result = usesSudo
    ? await executeCommand(target, `if [ "$(id -u)" -eq 0 ]; then sh -c ${sq(asRoot)}; else sudo ${pass ? "-k -S -p ''" : '-n'} sh -c ${sq(asRoot)}; fi`, 30000, pass ? { stdin: `${pass}\n` } : {})
    : await executeCommand(target, command, 30000);
  if (usesSudo && result.code !== 0 && /a password is required|terminal is required/i.test(`${result.stderr}${result.stdout}`)) {
    result.stderr = `${result.stderr}\nNo sudo password is saved for this server: add it in Edit server → Sudo password, then run the command again.`.trim();
  }
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
