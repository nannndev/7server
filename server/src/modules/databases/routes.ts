import { Router, Request, Response } from 'express';
import { QueryError } from '../../databases/sql.js';
import { createConnection, deleteConnection, getConnection, listConnections, updateConnection } from '../../databases/store.js';
import { describeAdapters, getAdapter } from '../../databases/registry.js';
import { discoverDatabases } from '../../databases/discovery.js';
import { getServerById } from '../servers/store.js';
import { inferRelations } from '../../databases/schema.js';
import { run as runDb, runDump } from '../../databases/runner.js';
import { withDb, withServer } from '../../http/handlers.js';
import { writeAudit } from '../../infra/audit.js';

export const databasesRoutes = Router();

databasesRoutes.get('/db/engines', (_req: Request, res: Response) => res.json({ success: true, data: describeAdapters() }));

databasesRoutes.get('/servers/:id/db/discover', withServer((t) => discoverDatabases(t)));
databasesRoutes.get('/servers/:id/db/connections', (req: Request, res: Response) =>
  res.json({ success: true, data: listConnections(req.params.id as string) }));

databasesRoutes.post('/servers/:id/db/connections', (req: Request, res: Response) => {
  try {
    if (!getServerById(req.params.id as string)) return res.status(404).json({ success: false, error: 'Server not found' });
    res.status(201).json({ success: true, data: createConnection({ ...req.body, serverId: req.params.id }) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

databasesRoutes.put('/db/connections/:cid', (req: Request, res: Response) => {
  try {
    const c = updateConnection(req.params.cid as string, req.body);
    if (!c) return res.status(404).json({ success: false, error: 'Connection not found' });
    res.json({ success: true, data: c });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

databasesRoutes.delete('/db/connections/:cid', (req: Request, res: Response) => {
  res.json({ success: deleteConnection(req.params.cid as string) });
});


databasesRoutes.get('/db/connections/:cid/ping', withDb(async ({ server, conn, adapter }) => adapter.parsePing(await runDb(server, conn, adapter.ping(conn)))));

databasesRoutes.get('/db/connections/:cid/databases', withDb(async ({ server, conn, adapter }) =>
  adapter.listDatabases ? adapter.parseDatabases!(await runDb(server, conn, adapter.listDatabases(conn))) : []));

databasesRoutes.get('/db/connections/:cid/objects', withDb(async ({ server, conn, adapter }, req) =>
  adapter.parseObjects(await runDb(server, conn, adapter.listObjects(conn, (req.query.database as string) || undefined)))));

databasesRoutes.get('/db/connections/:cid/preview', withDb(async ({ server, conn, adapter }, req) => {
  const out = await runDb(server, conn, adapter.preview(conn, String(req.query.object || ''), (req.query.database as string) || undefined,
    Number(req.query.limit) || 100, Number(req.query.offset) || 0));
  return adapter.parsePreview(out);
}));

// Data grid: server builds the SELECT (sort/filter/paging) and always runs it read-only, even on write-enabled
// connections, so the grid can never mutate data. The user filter goes through the same SQL guard as queries.
databasesRoutes.post('/db/connections/:cid/browse', withDb(async ({ server, conn, adapter }, req) => {
  const b = req.body || {};
  const object = String(b.object || '');
  const database = b.database || undefined;
  if (!adapter.selectSql) {
    return { ...adapter.parsePreview(await runDb(server, conn, adapter.preview(conn, object, database, Number(b.limit) || 100, Number(b.offset) || 0))), total: null };
  }
  const ro = { ...conn, allowWrite: false };
  const opts = { limit: Number(b.limit) || 100, offset: Number(b.offset) || 0, orderBy: b.orderBy || undefined, dir: b.dir === 'desc' ? 'desc' as const : 'asc' as const, where: b.where || undefined };
  const started = Date.now();
  const sql = adapter.selectSql(object, opts) + ';' + (adapter.countSql ? adapter.countSql(object, opts.where) + ';' : '');
  const out = adapter.parseQuery(await runDb(server, ro, adapter.query(ro, sql, database)));
  if (out.message && /ERROR|error/.test(out.message) && !out.results.length) throw new QueryError(out.message);
  const [rows, count] = out.results;
  return { ...(rows || { columns: [], rows: [] }), total: count?.rows?.[0]?.[0] != null ? Number(count.rows[0][0]) : null, sql: adapter.selectSql(object, opts), ms: Date.now() - started, message: out.message };
}));

// Schema snapshot for the ER diagram and the database properties view. Declared FKs come from the
// engine; inferred ones (naming convention) are added so FK-less schemas still show their relations.
databasesRoutes.get('/db/connections/:cid/schema', withDb(async ({ server, conn, adapter }, req) => {
  if (!adapter.schema) throw new QueryError('Visualisasi schema tidak tersedia untuk engine ini');
  const started = Date.now();
  const s = adapter.parseSchema!(await runDb(server, conn, adapter.schema(conn, (req.query.database as string) || undefined)));
  return { ...s, relations: [...s.relations, ...inferRelations(s.tables, s.relations)], ms: Date.now() - started };
}));

databasesRoutes.get('/db/connections/:cid/structure', withDb(async ({ server, conn, adapter }, req) => {
  if (!adapter.describe) throw new QueryError('Struktur tidak tersedia untuk engine ini');
  return adapter.parseDescribe!(await runDb(server, conn, adapter.describe(conn, String(req.query.object || ''), (req.query.database as string) || undefined)));
}));

databasesRoutes.post('/db/connections/:cid/query', withDb(async ({ server, conn, adapter }, req) => {
  const text = String(req.body?.query || '');
  if (text.length > 200_000) throw new QueryError('Query terlalu panjang');
  const started = Date.now();
  const out = await runDb(server, conn, adapter.query(conn, text, req.body?.database || undefined));
  const truncated = out.endsWith('__VPSHUB_TRUNCATED__');
  const parsed = adapter.parseQuery(truncated ? out.slice(0, -'__VPSHUB_TRUNCATED__'.length) : out);
  return { ...parsed, ms: Date.now() - started, truncated: truncated || undefined };
}));

databasesRoutes.get('/db/connections/:cid/dump', async (req: Request, res: Response) => {
  const conn = getConnection(req.params.cid as string);
  if (!conn) return res.status(404).json({ success: false, error: 'Connection not found' });
  const server = getServerById(conn.serverId, true);
  const adapter = getAdapter(conn.engine);
  if (!server || !adapter.dump) return res.status(400).json({ success: false, error: 'Dump tidak didukung' });
  const db = String(req.query.database || conn.database || '');
  // shortcut: dump is buffered in memory, fine for app DBs up to a few hundred MB; stream it for bigger ones
  const r = await runDump(server, conn, adapter.dump(conn, db));
  if (r.code !== 0) return res.status(500).json({ success: false, error: (r.stderr || `exit ${r.code}`).trim() });
  writeAudit({ t: new Date().toISOString(), ip: req.ip || '', method: 'GET', path: req.originalUrl.split('?')[0], detail: `dump ${conn.name} database=${db}`, status: 200 });
  const safe = `${conn.name}-${db}`.replace(/[^A-Za-z0-9_.-]+/g, '_');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}-${new Date().toISOString().slice(0, 10)}.${adapter.dumpExtension || 'txt'}"`);
  res.send(r.stdout);
});
