// Whole-database schema snapshot (tables, columns, sizes, relations) used by the ER diagram and the
// database properties view. Adapters emit sectioned output (@@NAME marker lines, tab-separated rows);
// the helpers here parse it and infer relations that exist by naming convention but not as FK constraints.

export interface SchemaColumn { name: string; type: string; nullable: boolean; pk: boolean }

export interface SchemaTable {
  name: string;
  type: 'table' | 'view';
  rows: number | null; // engine estimate
  dataBytes: number | null;
  indexBytes: number | null;
  engine?: string;
  columns: SchemaColumn[];
}

export interface SchemaRelation {
  from: string; // referencing (child) table
  fromColumn: string;
  to: string; // referenced (parent) table
  toColumn: string;
  name?: string;
  /** true = guessed from column naming, no FK constraint in the database */
  inferred?: boolean;
}

export interface SchemaMeta {
  version?: string;
  charset?: string;
  collation?: string;
  sizeBytes?: number | null;
  extra: { label: string; value: number | string | null; unit?: 'bytes' }[];
}

export interface DbSchema { meta: SchemaMeta; tables: SchemaTable[]; relations: SchemaRelation[] }

/** Splits "@@NAME" sectioned CLI output into rows of cells. nullToken cells become null. */
export function sections(out: string, nullToken: string | null): Record<string, (string | null)[][]> {
  const res: Record<string, (string | null)[][]> = {};
  let cur = '';
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const m = /^@@([A-Z]+)$/.exec(line);
    if (m) { cur = m[1]; res[cur] = []; continue; }
    // client warnings / --force errors / runner truncation marker never belong to a data section
    if (!cur || !line || /^(ERROR|Warning|mysql: \[Warning\]|psql:|__VPSHUB_)/.test(line)) continue;
    res[cur].push(line.split('\t').map((v) => (v === nullToken ? null : v === '""' ? '' : v)));
  }
  return res;
}

export const num = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** First error-looking lines of the output, for a readable failure message. */
export const errorLines = (out: string) =>
  out.split('\n').filter((l) => /^(ERROR|psql:|Error|Parse error|Runtime error)/.test(l)).slice(0, 3).join('\n');

const plurals = (base: string) => {
  const out = new Set([base, `${base}s`, `${base}es`]);
  if (/[^aeiou]y$/.test(base)) out.add(`${base.slice(0, -1)}ies`);
  return [...out];
};

/**
 * Relations implied by column names, for schemas that don't declare FK constraints (common in Laravel
 * apps and on MyISAM). Two rules, both requiring a single-column primary key on the target:
 *  1. column name equals another table's PK name   (orders.customer_id -> customers.customer_id)
 *  2. "<name>_id" -> table "<name>" / "<name>s" / "<name>es" / "<nam>ies" with PK  (orders.user_id -> users.id)
 * Columns already covered by a declared FK, and a table's own single PK, are skipped.
 */
export function inferRelations(tables: SchemaTable[], declared: SchemaRelation[]): SchemaRelation[] {
  const real = tables.filter((t) => t.type === 'table');
  const singlePk = new Map<string, string>(); // table -> pk column
  for (const t of real) {
    const pks = t.columns.filter((c) => c.pk);
    if (pks.length === 1) singlePk.set(t.name, pks[0].name);
  }
  const byPkName = new Map<string, string[]>();
  for (const [t, pk] of singlePk) byPkName.set(pk.toLowerCase(), [...(byPkName.get(pk.toLowerCase()) || []), t]);
  const byLowerName = new Map(real.map((t) => [t.name.toLowerCase(), t.name]));
  const covered = new Set(declared.map((r) => `${r.from}\u0000${r.fromColumn}`));
  const out: SchemaRelation[] = [];

  for (const t of real) {
    const ownPk = singlePk.get(t.name);
    const prefix = t.name.includes('.') ? t.name.slice(0, t.name.lastIndexOf('.') + 1) : '';
    for (const col of t.columns) {
      if (!/_id$/i.test(col.name) || col.name === ownPk || covered.has(`${t.name}\u0000${col.name}`)) continue;
      // Rule 1: another table uses this exact name as its PK (same schema first).
      let target: string | undefined;
      const sameName = (byPkName.get(col.name.toLowerCase()) || []).filter((x) => x !== t.name);
      const samePrefix = sameName.filter((x) => x.startsWith(prefix));
      if (samePrefix.length === 1) target = samePrefix[0];
      else if (sameName.length === 1) target = sameName[0];
      // Rule 2: table named after the column.
      if (!target) {
        const base = col.name.slice(0, -3).toLowerCase();
        const hits = plurals(base).map((n) => byLowerName.get(`${prefix}${n}`.toLowerCase())).filter((x): x is string => !!x && x !== t.name && singlePk.has(x));
        if (hits.length) target = hits[0];
      }
      if (target) out.push({ from: t.name, fromColumn: col.name, to: target, toColumn: singlePk.get(target)!, inferred: true });
    }
  }
  return out;
}
