// Route helpers that resolve the target from the URL once, so route bodies only contain domain logic.
import type { Request, Response } from 'express';
import { getServerById } from '../modules/servers/store.js';
import { getConnection } from '../databases/store.js';
import { getAdapter } from '../databases/registry.js';
import { statusOf } from './errors.js';
import type { ServerCredentials } from '../modules/servers/types.js';
import type { DbConnection } from '../databases/types.js';

export function isServerAllowed(userServers: string[] | '*' | undefined, serverId: string): boolean {
  if (!userServers || userServers === '*') return true;
  return Array.isArray(userServers) && userServers.includes(serverId);
}

/** Resolves :id to a server (with credentials) and checks user server scope. */
export const withServer = (fn: (target: ServerCredentials, req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    const serverId = req.params.id as string;
    if (req.user && !isServerAllowed(req.user.servers, serverId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Akses ke server ini dibatasi untuk akun Anda' });
    }

    const target = getServerById(serverId, true);
    if (!target) return res.status(404).json({ success: false, error: 'Server not found' });
    res.json({ success: true, data: await fn(target, req) });
  } catch (err: any) {
    res.status(statusOf(err)).json({ success: false, error: err.message });
  }
};

export interface DbContext { server: ServerCredentials; conn: DbConnection; adapter: ReturnType<typeof getAdapter> }

/** Resolves :cid to connection + server + adapter for every DB route. */
export const withDb = (fn: (ctx: DbContext, req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    const conn = getConnection(req.params.cid as string);
    if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });

    if (req.user && !isServerAllowed(req.user.servers, conn.serverId)) {
      return res.status(403).json({ success: false, error: 'Forbidden: Akses ke database di server ini dibatasi untuk akun Anda' });
    }

    const server = getServerById(conn.serverId, true);
    if (!server) return res.status(404).json({ success: false, error: 'Server not found' });
    res.json({ success: true, data: await fn({ server, conn, adapter: getAdapter(conn.engine) }, req) });
  } catch (err: any) {
    res.status(statusOf(err)).json({ success: false, error: err.message });
  }
};

/** For SFTP routes that stream or set their own headers: resolves :id or sends 404/403. */
export function sftpTarget(req: Request, res: Response): ServerCredentials | undefined {
  const serverId = req.params.id as string;
  if (req.user && !isServerAllowed(req.user.servers, serverId)) {
    res.status(403).json({ success: false, error: 'Forbidden: Akses ke server ini dibatasi untuk akun Anda' });
    return undefined;
  }

  const target = getServerById(serverId, true);
  if (!target) res.status(404).json({ success: false, error: 'Server not found' });
  return target || undefined;
}
