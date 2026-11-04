// SQLite: a file on the host (or inside a container). Read-only mode opens the file with -readonly,
// so the engine itself refuses writes.
import { DatabaseAdapter, DbConnection, Cmd } from '../types.js';
import { prepareSql, parseCsv, tableFrom, splitOnMarker, MAX_ROWS } from '../sql.js';
import { sq, ident } from '../shell.js';
import { buildSelect, buildCount, quoteAnsi } from '../browse.js';
import { sections, num, errorLines, SchemaTable } from '../schema.js';

const MARK = '__VPSHUB_RS__';
const NULL = '␀';

function file(c: DbConnection): string {
  const f = String(c.database || '');
  if (!/^\/[^\0\n]{1,1024}$/.test(f)) throw new Error('Path file SQLite harus absolut');
  return f;
}

// -batch -bail off; -cmd sets output mode before reading stdin. -safe blocks .shell/.system/ATTACH-to-file etc. (3.37+).
const base = (c: DbConnection, mode: string) =>
  `sqlite3 -batch ${c.allowWrite ? '' : '-readonly '}$(sqlite3 -safe :memory: 'select 1' >/dev/null 2>&1 && echo -safe) -cmd '.mode ${mode}' -cmd '.headers on' -cmd ${sq(`.nullvalue ${NULL}`)} ${sq(file(c))}`;

const cmd = (script: string, extra: Partial<Cmd> = {}): Cmd => ({ script, ...extra });

export const sqliteAdapter: DatabaseAdapter = {
  id: 'sqlite',
  label: 'SQLite',
  kind: 'sql',
  fields: ['database'],
  authModes: ['none'],
  queryLanguage: 'sql',
  readOnlyEnforced: 'session',

  ping: (c) => cmd(`${base(c, 'list')} 'select sqlite_version()' 2>&1`, { timeoutMs: 15000 }),
  parsePing: (out) => out.trim().split('\n').pop() || '',

  listObjects: (c) =>
    cmd(`${base(c, 'tabs')} ${sq("select name, type from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name")} 2>&1`),
  parseObjects: (out) =>
    out.split('\n').slice(1).filter(Boolean).map((l) => {
      const [name, type] = l.split('\t');
      return { name, type, rows: null, size: null };
    }),

  preview: (c, table, _db, limit = 100, offset = 0) =>
    cmd(`${base(c, 'csv')} ${sq(`select * from "${ident(table, 'Tabel')}" limit ${Math.min(Math.max(1, limit | 0), MAX_ROWS)} offset ${Math.max(0, offset | 0)}`)} 2>&1`),
  parsePreview: (out) => tableFrom(parseCsv(out.replace(/\n$/, '')), NULL),

  query: (c, text) => {
    const stmts = prepareSql(text, 'sqlite', c.allowWrite);
    const body = stmts.map((s) => `${s.text};\n.print ${MARK}`).join('\n');
    return cmd(`${base(c, 'csv')} 2>&1`, { stdin: body + '\n', timeoutMs: 120000, maxBytes: 20 * 1024 * 1024 });
  },
  parseQuery: (out) => {
    const results = [];
    const messages: string[] = [];
    for (const ch of splitOnMarker(out, MARK)) {
      const lines = ch.split('\n');
      const err = lines.filter((l) => /^(Parse error|Runtime error|Error)/.test(l));
      messages.push(...err);
      const data = lines.filter((l) => !err.includes(l)).join('\n');
      if (data.trim()) results.push(tableFrom(parseCsv(data), NULL));
    }
    return { results, message: messages.join('\n') || undefined };
  },

  selectSql: (object, o) => buildSelect(quoteAnsi, object, o),
  countSql: (object, where) => buildCount(quoteAnsi, object, where),

  describe: (c, table) => {
    const t = ident(table, 'Tabel');
    const sql = `.print @@COLS\nselect name, type, case when "notnull" then 'NO' else 'YES' end, dflt_value, case when pk>0 then 'PRI' else '' end from pragma_table_info('${t}');\n.print @@IDX\nselect l.name, group_concat(i.name, ','), l."unique" from pragma_index_list('${t}') l join pragma_index_info(l.name) i group by l.name;\n.print @@DDL\nselect sql from sqlite_master where name='${t}';\n`;
    return cmd(`${base(c, 'tabs').replace("-cmd '.headers on'", "-cmd '.headers off'")} 2>&1`, { stdin: sql });
  },
  parseDescribe: (out) => {
    const sec: Record<string, string[]> = {};
    let cur = '';
    for (const l of out.split('\n')) {
      if (/^@@[A-Z]+$/.test(l)) { cur = l.slice(2); sec[cur] = []; } else if (cur) sec[cur].push(l);
    }
    if (!sec.COLS) throw new Error(out.trim() || 'describe gagal');
    // .mode tabs quotes empty strings as "" ; unwrap so an empty key reads as empty.
    const cells = (l: string) => l.split('\t').map((v) => (v === '""' ? '' : v));
    return {
      columns: sec.COLS.filter(Boolean).map((l) => {
        const [name, type, nullable, def, key] = cells(l);
        return { name, type: type || 'ANY', nullable: nullable === 'YES', default: def === NULL ? null : def, key: key || undefined };
      }),
      indexes: (sec.IDX || []).filter(Boolean).map((l) => {
        const [name, columns, unique] = cells(l);
        return { name, columns, unique: unique === '1' };
      }),
      ddl: (sec.DDL || []).join('\n').trim() || undefined
    };
  },

  schema: (c) => {
    const user = `m.type IN ('table','view') AND m.name NOT LIKE 'sqlite_%'`;
    const sql = `.print @@META
select sqlite_version(), (select page_count from pragma_page_count()) * (select page_size from pragma_page_size()), (select freelist_count from pragma_freelist_count()) * (select page_size from pragma_page_size()), (select journal_mode from pragma_journal_mode());
.print @@T
select m.name, m.type from sqlite_master m where ${user};
.print @@C
select m.name, p.name, coalesce(nullif(p.type,''),'ANY'), case when p."notnull" then 'NO' else 'YES' end, case when p.pk > 0 then 'PRI' else '' end from sqlite_master m join pragma_table_info(m.name) p where ${user};
.print @@F
select m.name, f."from", f."table", coalesce(f."to", ''), 'fk_' || m.name || '_' || f.id from sqlite_master m join pragma_foreign_key_list(m.name) f where m.type = 'table';
`;
    return cmd(`${base(c, 'tabs').replace("-cmd '.headers on'", "-cmd '.headers off'")} 2>&1`, { stdin: sql, timeoutMs: 60000, maxBytes: 20 * 1024 * 1024 });
  },
  parseSchema: (out) => {
    const s = sections(out, NULL);
    if (!s.T) throw new Error(errorLines(out) || out.trim().slice(0, 300) || 'Gagal membaca schema');
    const tables = new Map<string, SchemaTable>();
    for (const [name, type] of s.T) if (name) tables.set(name, { name, type: type === 'view' ? 'view' : 'table', rows: null, dataBytes: null, indexBytes: null, columns: [] });
    for (const [t, name, type, nullable, key] of s.C || []) {
      tables.get(t || '')?.columns.push({ name: name || '', type: type || 'ANY', nullable: nullable === 'YES', pk: key === 'PRI' });
    }
    const pkOf = (t: string) => tables.get(t)?.columns.find((c) => c.pk)?.name || 'rowid';
    const m = s.META?.[0] || [];
    return {
      meta: {
        version: m[0] || undefined,
        sizeBytes: num(m[1]),
        extra: [
          { label: 'Halaman kosong (freelist)', value: num(m[2]), unit: 'bytes' as const },
          { label: 'Journal mode', value: m[3] || null }
        ]
      },
      tables: [...tables.values()],
      // An FK without an explicit target column points at the parent's primary key.
      relations: (s.F || []).map(([from, fromColumn, to, toColumn, name]) => ({ from: from!, fromColumn: fromColumn!, to: to!, toColumn: toColumn || pkOf(to!), name: name || undefined }))
    };
  },

  dump: (c) => cmd(`sqlite3 -readonly ${sq(file(c))} .dump`, { timeoutMs: 30 * 60 * 1000 }),
  dumpExtension: 'sql'
};
