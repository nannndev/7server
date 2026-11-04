// MySQL / MariaDB. Uses the `mysql` CLI in batch mode. Password is passed via MYSQL_PWD in the
// target shell (never on the command line); with 'container-env' it comes from the container's own env.
import { DatabaseAdapter, DbConnection, Cmd } from '../types.js';
import { prepareSql, parseMysqlBatch, splitOnMarker, MAX_ROWS } from '../sql.js';
import { sq, ident, flag, firstEnv } from '../shell.js';
import { buildSelect, buildCount, quoteMysql } from '../browse.js';
import { ObjectStructure } from '../types.js';
import { sections, num, errorLines, SchemaTable } from '../schema.js';

const MARK = '__VPSHUB_RS__';
const ENV = {
  user: ['MYSQL_USER', 'MARIADB_USER'],
  password: ['MYSQL_ROOT_PASSWORD', 'MARIADB_ROOT_PASSWORD', 'MYSQL_PASSWORD', 'MARIADB_PASSWORD'],
  database: ['MYSQL_DATABASE', 'MARIADB_DATABASE']
};

// `mysql` on MySQL images, `mariadb` on newer MariaDB images.
const BIN = '"$(command -v mysql || command -v mariadb)"';

function base(c: DbConnection, extra = ''): string {
  let user: string;
  let pw = '';
  if (c.auth === 'container-env') {
    // root when a root password is set, otherwise the app user.
    user = `"$( [ -n "\${MYSQL_ROOT_PASSWORD:-\${MARIADB_ROOT_PASSWORD:-}}" ] && echo root || echo "${firstEnv(ENV.user)}")"`;
    pw = `MYSQL_PWD="${firstEnv(ENV.password)}" `;
  } else {
    user = sq(c.user || 'root');
    if (c.auth === 'password') pw = 'MYSQL_PWD="$VPSHUB_DB_PASSWORD" ';
  }
  const net = c.auth === 'socket' ? '' : `${flag('-h', c.host)}${flag('-P', c.port)}`;
  return `${pw}${BIN} -u ${user}${net} --batch --raw=0 --default-character-set=utf8mb4 ${extra}`;
}

const env = (c: DbConnection) => (c.auth === 'password' && c.password ? { VPSHUB_DB_PASSWORD: c.password } : undefined);
const cmd = (c: DbConnection, script: string, extra: Partial<Cmd> = {}): Cmd => ({ script, env: env(c), ...extra });

export const mysqlAdapter: DatabaseAdapter = {
  id: 'mysql',
  label: 'MySQL / MariaDB',
  kind: 'sql',
  fields: ['host', 'port', 'user', 'password', 'database'],
  defaultPort: 3306,
  authModes: ['password', 'socket', 'container-env'],
  queryLanguage: 'sql',
  readOnlyEnforced: 'session',
  discover: { images: /(^|\/)(mysql|mariadb|percona(-server)?)$/, port: 3306, units: ['mysql', 'mariadb', 'mysqld'], binary: 'mysql' },
  containerEnv: ENV,

  ping: (c) => cmd(c, `${base(c, '-N')} -e 'SELECT VERSION()' 2>&1`, { timeoutMs: 15000 }),
  parsePing: (out) => out.trim().split('\n').pop() || '',

  listDatabases: (c) => cmd(c, `${base(c, '-N')} -e 'SHOW DATABASES' 2>&1`),
  parseDatabases: (out) =>
    out.split('\n').map((s) => s.trim()).filter((s) => s && !['information_schema', 'performance_schema', 'sys'].includes(s)),

  listObjects: (c, db) =>
    cmd(c, `${base(c, '-N')} -e ${sq(
      `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024/1024,2) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${ident(db || c.database, 'Database')}' ORDER BY TABLE_NAME`
    )} 2>&1`),
  parseObjects: (out) =>
    out.split('\n').filter(Boolean).map((l) => {
      const [name, type, rows, mb] = l.split('\t');
      return { name, type: type === 'VIEW' ? 'view' : 'table', rows: rows === 'NULL' ? null : Number(rows), size: mb === 'NULL' ? null : `${mb} MB` };
    }),

  preview: (c, table, db, limit = 100, offset = 0) =>
    cmd(c, `${base(c)} ${sq(ident(db || c.database, 'Database'))} -e ${sq(
      `SELECT * FROM \`${ident(table, 'Tabel')}\` LIMIT ${Math.min(Math.max(1, limit | 0), MAX_ROWS)} OFFSET ${Math.max(0, offset | 0)}`
    )} 2>&1`),
  parsePreview: (out) => parseMysqlBatch(out),

  query: (c, text, db) => {
    const stmts = prepareSql(text, 'mysql', c.allowWrite);
    // Server-side guard on top of the statement allowlist: the session cannot write even if parsing misses something.
    const guard = c.allowWrite ? '' : 'SET SESSION TRANSACTION READ ONLY; START TRANSACTION READ ONLY;\n';
    const body = stmts.map((s) => `${s.text};\nSELECT '${MARK}';`).join('\n');
    const dbArg = db || c.database ? ` ${sq(ident(db || c.database, 'Database'))}` : '';
    // --force: keep going so earlier results are kept; errors come back on stderr.
    return cmd(c, `${base(c, '--force --show-warnings')}${dbArg} 2>&1`, { stdin: guard + body + '\n', timeoutMs: 120000, maxBytes: 20 * 1024 * 1024 });
  },
  parseQuery: (out) => {
    const chunks = splitOnMarker(out, MARK).map((ch) => ch.replace(new RegExp(`^${MARK}\\n?`, 'm'), ''));
    const results = [];
    const messages: string[] = [];
    for (const ch of chunks) {
      const lines = ch.split('\n').filter((l) => l !== MARK);
      const errs = lines.filter((l) => /^(ERROR|Warning|Note) /.test(l));
      messages.push(...errs);
      const data = lines.filter((l) => !/^(ERROR|Warning|Note) /.test(l)).join('\n');
      if (data.trim()) results.push(parseMysqlBatch(data));
    }
    return { results, message: messages.join('\n') || undefined };
  },

  selectSql: (object, o) => buildSelect(quoteMysql, object, o),
  countSql: (object, where) => buildCount(quoteMysql, object, where),

  describe: (c, table, db) => {
    const d = ident(db || c.database, 'Database');
    const t = ident(table, 'Tabel');
    const sql = [
      `SELECT '@@COLS'`,
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${d}' AND TABLE_NAME='${t}' ORDER BY ORDINAL_POSITION`,
      `SELECT '@@IDX'`,
      `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX), MIN(NON_UNIQUE) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${d}' AND TABLE_NAME='${t}' GROUP BY INDEX_NAME`,
      `SELECT '@@DDL'`,
      `SHOW CREATE TABLE \`${d}\`.\`${t}\``
    ].join(';\n') + ';\n';
    return cmd(c, `${base(c, '-N')} 2>&1`, { stdin: sql });
  },
  parseDescribe: (out) => {
    const sec: Record<string, string[]> = {};
    let cur = '';
    for (const l of out.split('\n')) {
      if (/^@@[A-Z]+$/.test(l)) { cur = l.slice(2); sec[cur] = []; } else if (cur && l) sec[cur].push(l);
    }
    if (!sec.COLS) throw new Error(out.trim() || 'describe gagal');
    const unesc = (v: string) => v.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    const res: ObjectStructure = {
      columns: sec.COLS.map((l) => {
        const [name, type, nullable, def, key, extra] = l.split('\t');
        return { name, type, nullable: nullable === 'YES', default: def === 'NULL' ? null : def, key: key || undefined, extra: extra || undefined };
      }),
      indexes: (sec.IDX || []).map((l) => {
        const [name, columns, nonUnique] = l.split('\t');
        return { name, columns, unique: nonUnique === '0' };
      }),
      ddl: sec.DDL?.[0] ? unesc(sec.DDL[0].split('\t').slice(1).join('\t')) : undefined
    };
    return res;
  },

  schema: (c, db) => {
    const d = ident(db || c.database, 'Database');
    const sql = [
      // MySQL 8 caches table stats for 24h; read live values. MariaDB/5.7 reject this line, --force skips it.
      `SET SESSION information_schema_stats_expiry=0`,
      `SELECT '@@META'`,
      `SELECT VERSION(), s.DEFAULT_CHARACTER_SET_NAME, s.DEFAULT_COLLATION_NAME,
        (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='${d}'),
        (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${d}'),
        (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='${d}'),
        (SELECT IFNULL(SUM(DATA_FREE),0) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${d}')
       FROM information_schema.SCHEMATA s WHERE s.SCHEMA_NAME='${d}'`,
      `SELECT '@@T'`,
      `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='${d}'`,
      `SELECT '@@C'`,
      `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${d}' ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      `SELECT '@@F'`,
      `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME, CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='${d}' AND REFERENCED_TABLE_SCHEMA='${d}' AND REFERENCED_TABLE_NAME IS NOT NULL`
    ].join(';\n') + ';\n';
    return cmd(c, `${base(c, '-N --force')} 2>&1`, { stdin: sql, timeoutMs: 90000, maxBytes: 20 * 1024 * 1024 });
  },
  parseSchema: (out) => {
    const s = sections(out, 'NULL');
    if (!s.T) throw new Error(errorLines(out) || out.trim().slice(0, 300) || 'Gagal membaca schema');
    const tables = new Map<string, SchemaTable>();
    for (const [name, type, rows, data, idx, engine] of s.T) {
      if (!name) continue;
      tables.set(name, { name, type: type === 'VIEW' || type === 'SYSTEM VIEW' ? 'view' : 'table', rows: num(rows), dataBytes: num(data), indexBytes: num(idx), engine: engine || undefined, columns: [] });
    }
    for (const [t, name, type, nullable, key] of s.C || []) {
      tables.get(t || '')?.columns.push({ name: name || '', type: type || '', nullable: nullable === 'YES', pk: key === 'PRI' });
    }
    const list = [...tables.values()];
    const m = s.META?.[0] || [];
    return {
      meta: {
        version: m[0] || undefined,
        charset: m[1] || undefined,
        collation: m[2] || undefined,
        sizeBytes: list.reduce((a, t) => a + (t.dataBytes || 0) + (t.indexBytes || 0), 0),
        extra: [
          { label: 'Routines', value: num(m[3]) },
          { label: 'Triggers', value: num(m[4]) },
          { label: 'Events', value: num(m[5]) },
          { label: 'Ruang terbuang (data free)', value: num(m[6]), unit: 'bytes' }
        ]
      },
      tables: list,
      relations: (s.F || []).map(([from, fromColumn, to, toColumn, name]) => ({ from: from!, fromColumn: fromColumn!, to: to!, toColumn: toColumn!, name: name || undefined }))
    };
  },

  dump: (c, db) =>
    cmd(c, `${base(c).replace(BIN, '"$(command -v mysqldump || command -v mariadb-dump)"').replace(' --batch --raw=0', '')} --single-transaction --quick --routines --triggers ${sq(ident(db, 'Database'))}`, { timeoutMs: 30 * 60 * 1000 }),
  dumpExtension: 'sql'
};
