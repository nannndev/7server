import { API_BASE, apiFetch, jsonPost, unwrap, downloadBlob } from '@/shared/api/client';

// ----------------- DATABASES ----------------- //

export type DbAuth = 'password' | 'socket' | 'container-env' | 'none';
export type DbLocation = { kind: 'host' } | { kind: 'container'; container: string };
export interface DbEngine {
  id: string;
  label: string;
  kind: 'sql' | 'keyvalue' | 'document';
  fields: ('host' | 'port' | 'user' | 'password' | 'database')[];
  defaultPort?: number;
  authModes: DbAuth[];
  queryLanguage: string;
  readOnlyEnforced: 'session' | 'statement' | 'none';
  canDump: boolean;
  canSchema: boolean;
  canListDatabases: boolean;
}
export interface DbConnection {
  id: string;
  serverId: string;
  name: string;
  engine: string;
  location: DbLocation;
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  auth: DbAuth;
  allowWrite: boolean;
  discovered?: boolean;
  hasPassword: boolean;
}
export interface DiscoveredDb { engine: string; name: string; location: DbLocation; auth: DbAuth; port?: number; image?: string; note?: string }
export interface DbObject { name: string; type: string; rows?: number | null; size?: string | null }
export interface ResultSet { columns: string[]; rows: (string | null)[][]; truncated?: boolean; meta?: [string, string][] }
export interface QueryResult { results: ResultSet[]; message?: string; ms: number; truncated?: boolean }

const dbq = (cid: string, p: string) => `${API_BASE}/db/connections/${cid}${p}`;

export const fetchDbEngines = async () => unwrap<DbEngine[]>(await apiFetch(`${API_BASE}/db/engines`), 'Failed to load engines');
export const discoverDbs = async (serverId: string) =>
  unwrap<DiscoveredDb[]>(await apiFetch(`${API_BASE}/servers/${serverId}/db/discover`), 'Discovery failed');
export const fetchDbConnections = async (serverId: string) =>
  unwrap<DbConnection[]>(await apiFetch(`${API_BASE}/servers/${serverId}/db/connections`), 'Failed to load connections');
export const createDbConnection = async (serverId: string, c: Partial<DbConnection> & { password?: string }) =>
  unwrap<DbConnection>(await apiFetch(`${API_BASE}/servers/${serverId}/db/connections`, jsonPost(c)), 'Failed to save connection');
export const updateDbConnection = async (cid: string, c: Partial<DbConnection> & { password?: string | null }) =>
  unwrap<DbConnection>(await apiFetch(dbq(cid, ''), { ...jsonPost(c), method: 'PUT' }), 'Failed to update connection');
export const deleteDbConnection = async (cid: string) => {
  await apiFetch(dbq(cid, ''), { method: 'DELETE' });
};
export const pingDb = async (cid: string) => unwrap<string>(await apiFetch(dbq(cid, '/ping')), 'Connection failed');
export const fetchDbDatabases = async (cid: string) => unwrap<string[]>(await apiFetch(dbq(cid, '/databases')), 'Failed to list databases');
export const fetchDbObjects = async (cid: string, database?: string) =>
  unwrap<DbObject[]>(await apiFetch(dbq(cid, `/objects${database ? `?database=${encodeURIComponent(database)}` : ''}`)), 'Failed to list objects');
export const previewDbObject = async (cid: string, object: string, database?: string, offset = 0, limit = 100) =>
  unwrap<ResultSet>(
    await apiFetch(dbq(cid, `/preview?object=${encodeURIComponent(object)}&offset=${offset}&limit=${limit}${database ? `&database=${encodeURIComponent(database)}` : ''}`)),
    'Preview failed'
  );
export const runDbQuery = async (cid: string, query: string, database?: string) =>
  unwrap<QueryResult>(await apiFetch(dbq(cid, '/query'), jsonPost({ query, database })), 'Query failed');
export const dumpDb = (cid: string, name: string, database: string) =>
  downloadBlob(dbq(cid, `/dump?database=${encodeURIComponent(database)}`), `${name}-${database}.sql`);

export interface BrowseResult extends ResultSet { total: number | null; sql?: string; ms?: number; message?: string }
export interface ColumnInfo { name: string; type: string; nullable: boolean; default?: string | null; key?: string; extra?: string }
export interface ObjectStructure { columns: ColumnInfo[]; indexes: { name: string; columns: string; unique: boolean }[]; ddl?: string }

export const browseDb = async (
  cid: string,
  p: { object: string; database?: string; limit: number; offset: number; orderBy?: string; dir?: 'asc' | 'desc'; where?: string }
) => unwrap<BrowseResult>(await apiFetch(dbq(cid, '/browse'), jsonPost(p)), 'Gagal memuat data');

export const fetchDbStructure = async (cid: string, object: string, database?: string) =>
  unwrap<ObjectStructure>(
    await apiFetch(dbq(cid, `/structure?object=${encodeURIComponent(object)}${database ? `&database=${encodeURIComponent(database)}` : ''}`)),
    'Gagal memuat struktur'
  );

export interface SchemaColumn { name: string; type: string; nullable: boolean; pk: boolean }
export interface SchemaTable {
  name: string;
  type: 'table' | 'view';
  rows: number | null;
  dataBytes: number | null;
  indexBytes: number | null;
  engine?: string;
  columns: SchemaColumn[];
}
export interface SchemaRelation { from: string; fromColumn: string; to: string; toColumn: string; name?: string; inferred?: boolean }
export interface DbSchema {
  meta: { version?: string; charset?: string; collation?: string; sizeBytes?: number | null; extra: { label: string; value: number | string | null; unit?: 'bytes' }[] };
  tables: SchemaTable[];
  relations: SchemaRelation[];
  ms?: number;
}

export const fetchDbSchema = async (cid: string, database?: string) =>
  unwrap<DbSchema>(await apiFetch(dbq(cid, `/schema${database ? `?database=${encodeURIComponent(database)}` : ''}`)), 'Gagal membaca schema');
