// The contract every database engine implements. Adapters are pure: they build shell commands and
// parse their output. Running them (on the host or inside a container, over SSH) is the runner's job,
// so a new engine is one new file plus one line in the registry, and is testable without a database.
import { ResultSet } from './sql.js';

export type { ResultSet };

/** Where the database client runs. 'container' = `docker exec` into it (no port needs to be exposed). */
export type DbLocation = { kind: 'host' } | { kind: 'container'; container: string };

export interface DbConnection {
  id: string;
  serverId: string;
  name: string;
  engine: string; // adapter id
  location: DbLocation;
  host?: string; // network host for the client; empty = local socket / container default
  port?: number;
  user?: string;
  password?: string; // decrypted only in memory; stored encrypted
  database?: string; // default db, or file path for sqlite
  /** 'container-env': take credentials from the container's own env vars (never seen by the dashboard). */
  auth: 'password' | 'socket' | 'container-env' | 'none';
  allowWrite: boolean;
  discovered?: boolean;
}

export type FieldKind = 'host' | 'port' | 'user' | 'password' | 'database';

export interface ObjectInfo {
  name: string;
  type: string; // table | view | collection | key-type ...
  rows?: number | null;
  size?: string | null;
}

/** A command to run remotely. stdin carries query text / secrets so they never appear in `ps`. */
export interface Cmd {
  script: string;
  stdin?: string;
  env?: Record<string, string>; // exported inside the target shell (host or container) before `script`
  timeoutMs?: number;
  maxBytes?: number;
}

export interface BrowseOptions {
  limit: number;
  offset: number;
  orderBy?: string;
  dir?: 'asc' | 'desc';
  where?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | null;
  key?: string; // PRI / UNI / MUL / FK
  extra?: string;
}

export interface ObjectStructure {
  columns: ColumnInfo[];
  indexes: { name: string; columns: string; unique: boolean }[];
  ddl?: string;
}

export interface QueryOutput {
  results: ResultSet[];
  message?: string;
}

export interface DiscoverHint {
  /** Match an image name (repo part, lower-cased, without registry/tag). */
  images?: RegExp;
  /** Default port when found as a host service. */
  port?: number;
  /** systemd units that indicate a host install. */
  units?: string[];
  /** Binary used to detect a host install. */
  binary?: string;
}

export interface DatabaseAdapter {
  id: string;
  label: string;
  kind: 'sql' | 'keyvalue' | 'document';
  /** Which form fields make sense for this engine. */
  fields: FieldKind[];
  defaultPort?: number;
  /** Auth modes the engine supports, first is the default. */
  authModes: DbConnection['auth'][];
  /** Language the query editor shows ('sql', 'redis', 'js'...). */
  queryLanguage: string;
  /** Whether writes can be blocked by the server itself, or only by statement inspection. */
  readOnlyEnforced: 'session' | 'statement' | 'none';
  discover?: DiscoverHint;
  /** Env var names a container image uses for credentials (for 'container-env' auth). */
  containerEnv?: { user?: string[]; password?: string[]; database?: string[] };

  ping(c: DbConnection): Cmd;
  parsePing(out: string): string; // returns server version
  listDatabases?(c: DbConnection): Cmd;
  parseDatabases?(out: string): string[];
  listObjects(c: DbConnection, database?: string): Cmd;
  parseObjects(out: string): ObjectInfo[];
  /** Preview: first rows of a table / sample of keys / documents. */
  preview(c: DbConnection, object: string, database?: string, limit?: number, offset?: number): Cmd;
  parsePreview(out: string): ResultSet;
  query(c: DbConnection, text: string, database?: string): Cmd; // must throw QueryError on disallowed input
  parseQuery(out: string): QueryOutput;
  /**
   * SQL engines only: builds a read-only SELECT for the data grid (sorting, filtering, paging).
   * The result is run through query() with allowWrite forced off, so the read-only guard and the
   * session lock apply to it like to any user query.
   */
  selectSql?(object: string, opts: BrowseOptions): string;
  /** SQL engines only: SELECT COUNT(*) with the same filter, for pagination when a filter is set. */
  countSql?(object: string, where?: string): string;
  /** Columns, indexes and DDL of one object. Optional. */
  describe?(c: DbConnection, object: string, database?: string): Cmd;
  parseDescribe?(out: string): ObjectStructure;
  /** Whole-database snapshot for the ER diagram + properties (one round-trip). Optional. */
  schema?(c: DbConnection, database?: string): Cmd;
  parseSchema?(out: string): import('./schema.js').DbSchema;
  /** Streams a dump to stdout. Optional: not every engine has a sensible text dump. */
  dump?(c: DbConnection, database: string): Cmd;
  dumpExtension?: string;
}
