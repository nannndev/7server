// PostgreSQL via `psql`. CSV output (psql >= 12) for queries; PGPASSWORD in the target shell for passwords.
// 'socket' runs as the postgres OS user (peer auth); 'container-env' uses the image's POSTGRES_* vars.
import { DatabaseAdapter, DbConnection, Cmd } from '../types.js';
import { prepareSql, parseCsv, tableFrom, splitOnMarker, MAX_ROWS } from '../sql.js';
import { sq, ident, flag, firstEnv } from '../shell.js';
import { buildSelect, buildCount, quoteAnsi } from '../browse.js';
import { sections, num, errorLines, SchemaTable } from '../schema.js';

const MARK = '__VPSHUB_RS__';
const NULL = '␀'; // shown for NULL so it differs from an empty string
const ENV = { user: ['POSTGRES_USER'], password: ['POSTGRES_PASSWORD'], database: ['POSTGRES_DB'] };

function base(c: DbConnection, db?: string, extra = ''): string {
  const dbName = db || c.database;
  const dbArg = dbName ? ` -d ${sq(ident(dbName, 'Database'))}` : '';
  const common = `-X -q -v ON_ERROR_STOP=0 --pset=null=${sq(NULL)}${extra}`;
  if (c.auth === 'container-env') {
    const u = `"${firstEnv(ENV.user)}"`;
    return `PGPASSWORD="${firstEnv(ENV.password)}" psql -U ${u}${dbArg || ` -d "${firstEnv(ENV.database)}"`} ${common}`;
  }
  if (c.auth === 'socket') {
    // Peer auth: become the OS user that owns the cluster. Works for root; sudo -n never prompts.
    const as = sq(c.user || 'postgres');
    return `(command -v sudo >/dev/null && sudo -n -u ${as} psql${dbArg} ${common} || su ${as} -s /bin/sh -c ${sq(`psql${dbArg} ${common}`)})`;
  }
  const pw = c.auth === 'password' ? 'PGPASSWORD="$VPSHUB_DB_PASSWORD" ' : '';
  return `${pw}psql${flag('-h', c.host || '127.0.0.1')}${flag('-p', c.port)}${flag('-U', c.user || 'postgres')}${dbArg} ${common}`;
}

const env = (c: DbConnection) => (c.auth === 'password' && c.password ? { VPSHUB_DB_PASSWORD: c.password } : undefined);
const cmd = (c: DbConnection, script: string, extra: Partial<Cmd> = {}): Cmd => ({ script, env: env(c), ...extra });
const sqlCmd = (c: DbConnection, sql: string, db?: string, extra = ' -At') => cmd(c, `${base(c, db, extra)} -c ${sq(sql)} 2>&1`);

export const postgresAdapter: DatabaseAdapter = {
  id: 'postgres',
  label: 'PostgreSQL',
  kind: 'sql',
  fields: ['host', 'port', 'user', 'password', 'database'],
  defaultPort: 5432,
  authModes: ['password', 'socket', 'container-env'],
  queryLanguage: 'sql',
  readOnlyEnforced: 'session',
  discover: { images: /(^|\/)(postgres|postgis|timescaledb(-ha)?|pgvector)$/, port: 5432, units: ['postgresql'], binary: 'psql' },
  containerEnv: ENV,

  ping: (c) => ({ ...sqlCmd(c, 'SHOW server_version'), timeoutMs: 15000 }),
  parsePing: (out) => out.trim().split('\n').pop() || '',

  listDatabases: (c) => sqlCmd(c, 'SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1', c.database || 'postgres'),
  parseDatabases: (out) => out.split('\n').map((s) => s.trim()).filter(Boolean),

  listObjects: (c, db) =>
    sqlCmd(
      c,
      `SELECT n.nspname||'.'||c.relname, CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'table' END, c.reltuples::bigint, pg_size_pretty(pg_total_relation_size(c.oid))
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
       ORDER BY 1`,
      db,
      ' -At -F \'\t\''
    ),
  parseObjects: (out) =>
    out.split('\n').filter((l) => l.includes('\t')).map((l) => {
      const [name, type, rows, size] = l.split('\t');
      const r = Number(rows);
      return { name, type, rows: r < 0 ? null : r, size };
    }),

  preview: (c, table, db, limit = 100, offset = 0) => {
    const [schema, rel] = table.includes('.') ? table.split('.', 2) : ['public', table];
    const q = `SELECT * FROM "${ident(schema, 'Schema')}"."${ident(rel, 'Tabel')}" LIMIT ${Math.min(Math.max(1, limit | 0), MAX_ROWS)} OFFSET ${Math.max(0, offset | 0)}`;
    return sqlCmd(c, q, db, ' --csv');
  },
  parsePreview: (out) => tableFrom(parseCsv(out.replace(/\n$/, '')), NULL),

  query: (c, text, db) => {
    const stmts = prepareSql(text, 'postgres', c.allowWrite);
    const guard = c.allowWrite ? '' : 'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;\nBEGIN READ ONLY;\n';
    const body = stmts.map((s) => `${s.text};\n\\echo ${MARK}`).join('\n');
    return cmd(c, `${base(c, db, ' --csv')} 2>&1`, { stdin: guard + body + '\n', timeoutMs: 120000, maxBytes: 20 * 1024 * 1024 });
  },
  parseQuery: (out) => {
    const results = [];
    const messages: string[] = [];
    for (const ch of splitOnMarker(out, MARK)) {
      const lines = ch.split('\n');
      const msg = lines.filter((l) => /^(ERROR|WARNING|NOTICE|HINT|DETAIL|LINE \d+|psql:)/.test(l));
      messages.push(...msg);
      const data = lines.filter((l) => !msg.includes(l) && !/^(SET|BEGIN|START TRANSACTION)$/.test(l)).join('\n');
      if (!data.trim()) continue;
      // psql prints a command tag (e.g. "UPDATE 3") for non-SELECT statements.
      if (/^[A-Z][A-Z ]*( \d+)*$/.test(data.trim())) { messages.push(data.trim()); continue; }
      results.push(tableFrom(parseCsv(data), NULL));
    }
    return { results, message: messages.join('\n') || undefined };
  },

  selectSql: (object, o) => buildSelect(quoteAnsi, object.includes('.') ? object : `public.${object}`, o),
  countSql: (object, where) => buildCount(quoteAnsi, object.includes('.') ? object : `public.${object}`, where),

  describe: (c, table, db) => {
    const [schema, rel] = table.includes('.') ? table.split('.', 2) : ['public', table];
    const s = ident(schema, 'Schema');
    const t = ident(rel, 'Tabel');
    const sql = `\\echo @@COLS
SELECT a.attname, format_type(a.atttypid, a.atttypmod), CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
  pg_get_expr(d.adbin, d.adrelid),
  CASE WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) THEN 'PRI' ELSE '' END
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
WHERE n.nspname='${s}' AND c.relname='${t}' AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
\\echo @@IDX
SELECT i.relname, pg_get_indexdef(ix.indexrelid), ix.indisunique FROM pg_index ix
JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='${s}' AND c.relname='${t}';
`;
    return cmd(c, `${base(c, db, " -At -F '\t'")} 2>&1`, { stdin: sql });
  },
  parseDescribe: (out) => {
    const sec: Record<string, string[]> = {};
    let cur = '';
    for (const l of out.split('\n')) {
      if (/^@@[A-Z]+$/.test(l)) { cur = l.slice(2); sec[cur] = []; } else if (cur && l) sec[cur].push(l);
    }
    if (!sec.COLS) throw new Error(out.trim() || 'describe gagal');
    return {
      columns: sec.COLS.map((l) => {
        const [name, type, nullable, def, key] = l.split('\t');
        return { name, type, nullable: nullable === 'YES', default: def || null, key: key || undefined };
      }),
      indexes: (sec.IDX || []).map((l) => {
        const [name, def, unique] = l.split('\t');
        return { name, columns: (/\((.*)\)\s*$/.exec(def)?.[1]) || def, unique: unique === 't' };
      })
    };
  },

  schema: (c, db) => {
    const sys = `n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'`;
    const sql = `\\echo @@META
SELECT current_setting('server_version'), pg_encoding_to_char(d.encoding), d.datcollate, pg_database_size(d.datname),
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE ${sys}),
  (SELECT count(*) FROM pg_trigger t WHERE NOT t.tgisinternal),
  (SELECT count(*) FROM pg_namespace n WHERE ${sys} AND n.nspname NOT LIKE 'pg_%')
FROM pg_database d WHERE d.datname = current_database();
\\echo @@T
SELECT n.nspname||'.'||c.relname, CASE WHEN c.relkind IN ('v','m') THEN 'view' ELSE 'table' END, c.reltuples::bigint,
  pg_table_size(c.oid), pg_indexes_size(c.oid), c.relkind
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND ${sys};
\\echo @@C
SELECT n.nspname||'.'||c.relname, a.attname, format_type(a.atttypid, a.atttypmod), CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END,
  CASE WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)) THEN 'PRI' ELSE '' END
FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind IN ('r','p','v','m') AND a.attnum > 0 AND NOT a.attisdropped AND ${sys}
ORDER BY 1, a.attnum;
\\echo @@F
SELECT cn.nspname||'.'||cl.relname, a.attname, fn.nspname||'.'||fl.relname, fa.attname, con.conname
FROM pg_constraint con
JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace cn ON cn.oid=cl.relnamespace
JOIN pg_class fl ON fl.oid=con.confrelid JOIN pg_namespace fn ON fn.oid=fl.relnamespace
CROSS JOIN LATERAL unnest(con.conkey, con.confkey) AS k(col, fcol)
JOIN pg_attribute a ON a.attrelid=con.conrelid AND a.attnum=k.col
JOIN pg_attribute fa ON fa.attrelid=con.confrelid AND fa.attnum=k.fcol
WHERE con.contype='f';
`;
    return cmd(c, `${base(c, db, " -At -F '\t'")} 2>&1`, { stdin: sql, timeoutMs: 90000, maxBytes: 20 * 1024 * 1024 });
  },
  parseSchema: (out) => {
    const s = sections(out, NULL);
    if (!s.T) throw new Error(errorLines(out) || out.trim().slice(0, 300) || 'Gagal membaca schema');
    const tables = new Map<string, SchemaTable>();
    for (const [name, type, rows, data, idx, kind] of s.T) {
      if (!name) continue;
      const r = Number(rows);
      tables.set(name, { name, type: type === 'view' ? 'view' : 'table', rows: Number.isFinite(r) && r >= 0 ? r : null, dataBytes: num(data), indexBytes: num(idx), engine: kind === 'p' ? 'partitioned' : kind === 'm' ? 'materialized' : undefined, columns: [] });
    }
    for (const [t, name, type, nullable, key] of s.C || []) {
      tables.get(t || '')?.columns.push({ name: name || '', type: type || '', nullable: nullable === 'YES', pk: key === 'PRI' });
    }
    const m = s.META?.[0] || [];
    return {
      meta: {
        version: m[0] || undefined,
        charset: m[1] || undefined,
        collation: m[2] || undefined,
        sizeBytes: num(m[3]),
        extra: [
          { label: 'Functions', value: num(m[4]) },
          { label: 'Triggers', value: num(m[5]) },
          { label: 'Schemas', value: num(m[6]) }
        ]
      },
      tables: [...tables.values()],
      relations: (s.F || []).map(([from, fromColumn, to, toColumn, name]) => ({ from: from!, fromColumn: fromColumn!, to: to!, toColumn: toColumn!, name: name || undefined }))
    };
  },

  dump: (c, db) => {
    const psql = base(c, db);
    // Same connection flags as psql, but pg_dump; strip psql-only options.
    const script = psql.replace(/\bpsql\b/g, 'pg_dump').replace(/ -X -q -v ON_ERROR_STOP=0 --pset=null='[^']*'/g, ' --no-owner --no-privileges');
    return cmd(c, script, { timeoutMs: 30 * 60 * 1000 });
  },
  dumpExtension: 'sql'
};
