// Shared helpers for the SQL adapters: quote/comment-aware statement splitting, the read-only guard,
// and parsers for the CLI output formats the adapters request.

export type Dialect = 'mysql' | 'postgres' | 'sqlite';

export class QueryError extends Error {}

export interface ResultSet {
  columns: string[];
  rows: (string | null)[][];
  truncated?: boolean;
}

export const MAX_ROWS = 1000;

export interface Statement {
  text: string;
  firstWord: string; // upper-cased first token, '' if none
  lineWords: string[]; // lower-cased first word of every line (outside strings/comments)
}

export function splitSql(sql: string, dialect: Dialect) {
  const statements: Statement[] = [];
  let unquotedBackslash = false;
  let dotCommand = false;
  let start = 0;
  let i = 0;
  let atLineStart = true;
  let hasContent = false;
  let firstWord = '';
  let lineWords: string[] = [];
  const n = sql.length;
  const isWord = (ch: string) => /[A-Za-z0-9_$]/.test(ch);
  const wordAt = (j: number) => {
    let k = j;
    while (k < n && /[A-Za-z_]/.test(sql[k])) k++;
    return sql.slice(j, k);
  };
  const flush = (end: number) => {
    if (hasContent) statements.push({ text: sql.slice(start, end).trim(), firstWord: firstWord.toUpperCase(), lineWords });
    hasContent = false;
    firstWord = '';
    lineWords = [];
  };
  const skipQuoted = (j: number, q: string, escapes: boolean) => {
    let k = j + 1;
    while (k < n) {
      const ch = sql[k];
      if (escapes && ch === '\\') { k += 2; continue; }
      if (ch === q) {
        if (sql[k + 1] === q) { k += 2; continue; }
        return k + 1;
      }
      k++;
    }
    return n;
  };

  while (i < n) {
    const c = sql[i];
    const nx = sql[i + 1];
    if (c === '\n') { atLineStart = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }

    // MySQL only treats "--" as a comment when followed by whitespace.
    const lineComment =
      (c === '-' && nx === '-' && (dialect !== 'mysql' || /\s/.test(sql[i + 2] ?? ' '))) || (dialect === 'mysql' && c === '#');
    if (lineComment || (c === '/' && nx === '*')) {
      const j = lineComment ? sql.indexOf('\n', i) : sql.indexOf('*/', i + 2);
      const end = j < 0 ? n : lineComment ? j : j + 2;
      // Conservative: some clients still act on backslash commands inside comments.
      if (sql.slice(i, end).includes('\\')) unquotedBackslash = true;
      i = end;
      continue;
    }

    if (atLineStart) {
      atLineStart = false;
      if (c === '.') dotCommand = true;
      const w = wordAt(i);
      if (w) lineWords.push(w.toLowerCase());
    }
    if (c === ';') { flush(i); start = i + 1; i++; continue; }
    if (!hasContent) { hasContent = true; firstWord = wordAt(i) || c; }
    if (c === '\\') { unquotedBackslash = true; i++; continue; }

    if (c === "'" || c === '"' || c === '`') {
      const escapes =
        dialect === 'mysql'
          ? c !== '`'
          : dialect === 'postgres' && c === "'" && /[eE]/.test(sql[i - 1] ?? '') && !isWord(sql[i - 2] ?? ' ');
      i = skipQuoted(i, c, escapes);
      continue;
    }
    if (dialect === 'postgres' && c === '$') {
      const m = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const j = sql.indexOf(m[0], i + m[0].length);
        i = j < 0 ? n : j + m[0].length;
        continue;
      }
    }
    if (isWord(c)) { while (i < n && isWord(sql[i])) i++; continue; }
    i++;
  }
  flush(n);
  return { statements, unquotedBackslash, dotCommand };
}

// First keywords allowed in read-only mode. The DB session is ALSO forced read-only by each adapter;
// this list is what stops a statement from switching that back off (SET, COMMIT, BEGIN READ WRITE, ...).
const READ_ONLY: Record<Dialect, Set<string>> = {
  mysql: new Set(['SELECT', 'SHOW', 'EXPLAIN', 'DESCRIBE', 'DESC', 'WITH', 'VALUES', 'TABLE', 'USE']),
  postgres: new Set(['SELECT', 'SHOW', 'EXPLAIN', 'WITH', 'VALUES', 'TABLE']),
  sqlite: new Set(['SELECT', 'EXPLAIN', 'WITH', 'VALUES', 'PRAGMA'])
};

// mysql client commands (recognised at line start) that run shell commands, read/write files or reconnect.
const MYSQL_CLIENT_CMDS = new Set(['system', 'source', 'pager', 'tee', 'connect', 'edit', 'delimiter']);

/** Validates user SQL for the given mode and returns its statements. Throws QueryError with a readable reason. */
export function prepareSql(sql: string, dialect: Dialect, write: boolean): Statement[] {
  const { statements, unquotedBackslash, dotCommand } = splitSql(sql, dialect);
  if (!statements.length) throw new QueryError('Query kosong');
  if (unquotedBackslash && dialect !== 'sqlite') {
    throw new QueryError('Backslash di luar string tidak diizinkan (perintah meta klien seperti \\! atau \\G).');
  }
  if (dotCommand && dialect === 'sqlite') throw new QueryError('Dot-command sqlite3 (mis. .shell, .read) tidak diizinkan.');
  if (dialect === 'mysql') {
    const cmd = statements.flatMap((s) => s.lineWords).find((w) => MYSQL_CLIENT_CMDS.has(w));
    if (cmd) throw new QueryError(`Baris tidak boleh diawali "${cmd}" (perintah klien mysql).`);
  }
  if (!write) {
    for (const s of statements) {
      if (!READ_ONLY[dialect].has(s.firstWord)) {
        throw new QueryError(`Mode read-only: "${s.firstWord}" tidak diizinkan. Aktifkan mode tulis di pengaturan koneksi bila perlu.`);
      }
      if (dialect === 'mysql' && /\bINTO\s+(OUTFILE|DUMPFILE)\b/i.test(s.text)) {
        throw new QueryError('Mode read-only: INTO OUTFILE/DUMPFILE tidak diizinkan.');
      }
    }
  }
  return statements;
}

// ---------- output parsers ----------

export function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function tableFrom(rows: string[][], nullToken: string | null): ResultSet {
  if (!rows.length) return { columns: [], rows: [] };
  const [columns, ...body] = rows;
  return {
    columns,
    rows: body.slice(0, MAX_ROWS).map((r) => r.map((v) => (nullToken !== null && v === nullToken ? null : v))),
    truncated: body.length > MAX_ROWS || undefined
  };
}

/** mysql --batch: tab separated, header first, \n \t \\ \0 escaped, NULL literal for null. */
export function parseMysqlBatch(seg: string): ResultSet {
  const lines = seg.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  const unescape = (v: string) => v.replace(/\\(.)/g, (_, ch) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === '0' ? '\0' : ch));
  const rows = lines.map((l) => l.split('\t'));
  const t = tableFrom(rows, 'NULL');
  return { ...t, columns: t.columns.map(unescape), rows: t.rows.map((r) => r.map((v) => (v === null ? null : unescape(v)))) };
}

/** Splits CLI output on marker lines the adapters inject between statements. Empty chunks are dropped. */
export function splitOnMarker(out: string, marker: string): string[] {
  const parts: string[] = [];
  let cur: string[] = [];
  for (const line of out.split('\n')) {
    if (line === marker) { parts.push(cur.join('\n')); cur = []; } else cur.push(line);
  }
  parts.push(cur.join('\n'));
  return parts.filter((p) => p.trim() !== '');
}
