// Route helpers that resolve the target from the URL once, so route bodies only contain domain logic.
import type { Request, Response } from 'express';
import { getServerById } from '../modules/servers/store.js';
import { getConnection } from '../databases/store.js';
import { getAdapter } from '../databases/registry.js';
import { statusOf } from './errors.js';
import type { ServerCredentials } from '../modules/servers/types.js';
import type { DbConnection } from '../databases/types.js';

/** Resolves :id to a server (with credentials) and wraps the return value as { success, data }. */
export const withServer = (fn: (target: ServerCredentials, req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    const target = getServerById(req.params.id as string, true);
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
    const server = getServerById(conn.serverId, true);
    if (!server) return res.status(404).json({ success: false, error: 'Server not found' });
    res.json({ success: true, data: await fn({ server, conn, adapter: getAdapter(conn.engine) }, req) });
  } catch (err: any) {
    res.status(statusOf(err)).json({ success: false, error: err.message });
  }
};

/** For SFTP routes that stream or set their own headers: resolves :id or sends 404. */
export function sftpTarget(req: Request, res: Response) {
  const target = getServerById(req.params.id as string, true);
  if (!target) res.status(404).json({ success: false, error: 'Server not found' });
  return target;
}
