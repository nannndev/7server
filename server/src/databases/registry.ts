// The one place that lists supported engines. To add a database: write adapters/<engine>.ts implementing
// DatabaseAdapter, import it here. Discovery, the API and the UI pick it up automatically.
import { DatabaseAdapter } from './types.js';
import { mysqlAdapter } from './adapters/mysql.js';
import { postgresAdapter } from './adapters/postgres.js';
import { sqliteAdapter } from './adapters/sqlite.js';
import { redisAdapter } from './adapters/redis.js';
import { mongoAdapter } from './adapters/mongodb.js';
import { badRequest } from '../http/errors.js';

const ADAPTERS: DatabaseAdapter[] = [mysqlAdapter, postgresAdapter, redisAdapter, mongoAdapter, sqliteAdapter];

export const adapters = new Map(ADAPTERS.map((a) => [a.id, a]));

export function getAdapter(id: string): DatabaseAdapter {
  const a = adapters.get(id);
  if (!a) throw badRequest(`Engine '${id}' tidak dikenal`);
  return a;
}

/** Serializable description for the UI (no functions). */
export const describeAdapters = () =>
  ADAPTERS.map((a) => ({
    id: a.id,
    label: a.label,
    kind: a.kind,
    fields: a.fields,
    defaultPort: a.defaultPort,
    authModes: a.authModes,
    queryLanguage: a.queryLanguage,
    readOnlyEnforced: a.readOnlyEnforced,
    canDump: !!a.dump,
    canSchema: !!a.schema,
    canListDatabases: !!a.listDatabases
  }));
