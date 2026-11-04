// MongoDB via mongosh (falls back to legacy `mongo`). There is no read-only shell mode, so read-only
// accepts only a single find/aggregate/count-style call, parsed here; the user string is never eval'd raw.
import { DatabaseAdapter, DbConnection, Cmd } from '../types.js';
import { QueryError, MAX_ROWS } from '../sql.js';
import { sq, ident, flag } from '../shell.js';

const ENV = { user: ['MONGO_INITDB_ROOT_USERNAME'], password: ['MONGO_INITDB_ROOT_PASSWORD'], database: ['MONGO_INITDB_DATABASE'] };
const BIN = '"$(command -v mongosh || command -v mongo)"';

function base(c: DbConnection): string {
  if (c.auth === 'container-env') {
    return `${BIN} --quiet --norc -u "\${MONGO_INITDB_ROOT_USERNAME:-}" -p "\${MONGO_INITDB_ROOT_PASSWORD:-}" --authenticationDatabase admin`;
  }
  const pw = c.auth === 'password' ? ` -u ${sq(c.user || 'root')} -p "$VPSHUB_DB_PASSWORD" --authenticationDatabase admin` : '';
  return `${BIN} --quiet --norc${flag('--host', c.host)}${flag('--port', c.port)}${pw}`;
}

const env = (c: DbConnection) => (c.auth === 'password' && c.password ? { VPSHUB_DB_PASSWORD: c.password } : undefined);
// The script is passed on stdin; JSON.stringify keeps it as one line of JS for --eval-free execution.
const js = (c: DbConnection, db: string | undefined, code: string, extra: Partial<Cmd> = {}): Cmd => ({
  script: `${base(c)} ${sq(ident(db || c.database || 'admin', 'Database'))} 2>&1`,
  stdin: code + '\n',
  env: env(c),
  ...extra
});

// Read-only grammar: db.<coll>.<method>(<JSON args>) where method is a read method. Args must be JSON (EJSON-lite).
const READ_METHODS = new Set(['find', 'findOne', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'distinct']);
export function parseMongoReadQuery(text: string): { coll: string; method: string; args: unknown[] } {
  const m = /^\s*db\.([A-Za-z0-9_.\-]{1,120})\.([A-Za-z]+)\(([\s\S]*)\)\s*;?\s*$/.exec(text);
  if (!m) throw new QueryError('Mode read-only: format harus db.<collection>.<find|aggregate|countDocuments|distinct>(...)');
  const [, coll, method, rawArgs] = m;
  if (!READ_METHODS.has(method)) throw new QueryError(`Mode read-only: ${method}() tidak diizinkan.`);
  let args: unknown[];
  try {
    args = rawArgs.trim() ? JSON.parse(`[${rawArgs}]`) : [];
  } catch {
    throw new QueryError('Argumen harus JSON valid (pakai "kunci": nilai, bukan ekspresi JavaScript).');
  }
  if (method === 'aggregate') {
    const pipeline = JSON.stringify(args[0] ?? []);
    if (/"\$(out|merge|function|accumulator|where)"/.test(pipeline)) throw new QueryError('Mode read-only: $out/$merge/$function/$where tidak diizinkan.');
  }
  if (/"\$where"/.test(JSON.stringify(args))) throw new QueryError('Mode read-only: $where tidak diizinkan.');
  return { coll, method, args };
}

const toResult = `function __out(v){ const a = Array.isArray(v) ? v : [v]; print(EJSON.stringify(a.slice(0, ${MAX_ROWS}), {relaxed:true})); }`;

export const mongoAdapter: DatabaseAdapter = {
  id: 'mongodb',
  label: 'MongoDB',
  kind: 'document',
  fields: ['host', 'port', 'user', 'password', 'database'],
  defaultPort: 27017,
  authModes: ['none', 'password', 'container-env'],
  queryLanguage: 'js',
  readOnlyEnforced: 'statement',
  discover: { images: /(^|\/)(mongo|mongodb(-community-server)?|percona-server-mongodb)$/, port: 27017, units: ['mongod'], binary: 'mongosh' },
  containerEnv: ENV,

  ping: (c) => js(c, 'admin', 'print(db.version())', { timeoutMs: 20000 }),
  parsePing: (out) => out.trim().split('\n').pop() || '',

  listDatabases: (c) => js(c, 'admin', 'db.adminCommand({listDatabases:1}).databases.forEach(d=>print(d.name))'),
  parseDatabases: (out) => out.split('\n').map((s) => s.trim()).filter((s) => s && !['admin', 'config', 'local'].includes(s)),

  listObjects: (c, db) =>
    js(c, db, `db.getCollectionInfos().forEach(ci=>{ let n=''; try{ n=db.getCollection(ci.name).estimatedDocumentCount() }catch(e){}; print([ci.name, ci.type||'collection', n].join('\\t')) })`),
  parseObjects: (out) =>
    out.split('\n').filter((l) => l.includes('\t')).map((l) => {
      const [name, type, n] = l.split('\t');
      return { name, type, rows: n === '' ? null : Number(n), size: null };
    }),

  preview: (c, coll, db, limit = 50, offset = 0) =>
    js(c, db, `${toResult}; __out(db.getCollection(${JSON.stringify(ident(coll, 'Collection'))}).find({}).skip(${Math.max(0, offset | 0)}).limit(${Math.min(Math.max(1, limit | 0), MAX_ROWS)}).toArray())`, { maxBytes: 10 * 1024 * 1024 }),
  parsePreview: (out) => docsToTable(out),

  query: (c, text, db) => {
    let code: string;
    if (c.allowWrite) {
      code = `${toResult}; __out(${text.trim().replace(/;\s*$/, '')})`;
    } else {
      const q = parseMongoReadQuery(text);
      const call = `db.getCollection(${JSON.stringify(q.coll)}).${q.method}(...${JSON.stringify(q.args)})`;
      code = `${toResult}; let __r = ${call}; if (__r && typeof __r.toArray === 'function') __r = __r.limit ? __r.limit(${MAX_ROWS}).toArray() : __r.toArray(); __out(__r)`;
    }
    return js(c, db, code, { timeoutMs: 120000, maxBytes: 20 * 1024 * 1024 });
  },
  parseQuery: (out) => {
    try {
      return { results: [docsToTable(out)] };
    } catch {
      return { results: [{ columns: ['output'], rows: out.trim().split('\n').map((l) => [l]) }] };
    }
  }
};

/** Flattens an array of documents into columns = union of top-level keys; nested values shown as JSON. */
export function docsToTable(out: string) {
  const line = out.trim().split('\n').filter((l) => l.startsWith('[')).pop();
  if (!line) throw new Error(out.trim() || 'Tidak ada output');
  const docs: any[] = JSON.parse(line);
  const cols: string[] = [];
  for (const d of docs) for (const k of Object.keys(d && typeof d === 'object' ? d : { value: d })) if (!cols.includes(k)) cols.push(k);
  const rows = docs.map((d) => {
    const o = d && typeof d === 'object' ? d : { value: d };
    return cols.map((k) => (o[k] === undefined || o[k] === null ? null : typeof o[k] === 'object' ? JSON.stringify(o[k]) : String(o[k])));
  });
  return { columns: cols, rows };
}
