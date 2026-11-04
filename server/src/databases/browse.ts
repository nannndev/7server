// Shared SELECT builder for the data grid. The user-supplied WHERE text is wrapped as a sub-expression
// and the whole statement then goes through prepareSql() in read-only mode, so a filter like
// "1=1; DROP TABLE x" is rejected (two statements) and anything else still runs in a READ ONLY session.
import { BrowseOptions } from './types.js';
import { ident } from './shell.js';
import { QueryError, MAX_ROWS } from './sql.js';

export type Quote = (name: string) => string;

export const quoteMysql: Quote = (n) => `\`${ident(n, 'Nama')}\``;
export const quoteAnsi: Quote = (n) => `"${ident(n, 'Nama')}"`;

/** "schema.table" -> quoted parts. */
export const qualified = (q: Quote, name: string) => name.split('.').map(q).join('.');

function whereClause(where?: string): string {
  const w = (where || '').trim();
  if (!w) return '';
  if (w.length > 2000) throw new QueryError('Filter terlalu panjang');
  // A trailing/embedded ';' would start a second statement: refuse rather than let the splitter decide.
  if (/;/.test(w.replace(/'(?:[^']|'')*'/g, ''))) throw new QueryError('Filter tidak boleh berisi ";"');
  return ` WHERE (${w})`;
}

export function buildSelect(q: Quote, object: string, o: BrowseOptions): string {
  const limit = Math.min(Math.max(1, o.limit | 0), MAX_ROWS);
  const offset = Math.max(0, o.offset | 0);
  const order = o.orderBy ? ` ORDER BY ${q(o.orderBy)} ${o.dir === 'desc' ? 'DESC' : 'ASC'}` : '';
  return `SELECT * FROM ${qualified(q, object)}${whereClause(o.where)}${order} LIMIT ${limit} OFFSET ${offset}`;
}

export const buildCount = (q: Quote, object: string, where?: string) =>
  `SELECT COUNT(*) AS n FROM ${qualified(q, object)}${whereClause(where)}`;
