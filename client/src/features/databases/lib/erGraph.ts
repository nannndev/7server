// Pure graph helpers for the ER diagram: which tables/relations are visible under the current filters.
// No React here so it stays unit-testable.
import type { DbSchema, SchemaRelation, SchemaTable } from '@/features/databases/api';

export interface ErFilter {
  /** Table name substring/glob ("order*", "user") matched case-insensitively. Empty = all. */
  search: string;
  /** Show only this table and its neighbours up to `depth` hops. */
  focus: string | null;
  depth: number;
  /** Tables explicitly hidden by the user. */
  hidden: Set<string>;
  showViews: boolean;
  showInferred: boolean;
  /** Drop tables with no relation at all (after the filters above). */
  hideIsolated: boolean;
}

export const defaultFilter = (): ErFilter => ({
  search: '', focus: null, depth: 1, hidden: new Set(), showViews: false, showInferred: true, hideIsolated: false
});

/** "order*,user" -> matcher. '*' is a wildcard, otherwise substring match. */
export function nameMatcher(pattern: string): (name: string) => boolean {
  const parts = pattern.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return () => true;
  const tests = parts.map((p) => {
    if (!p.includes('*')) return (n: string) => n.includes(p);
    const re = new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return (n: string) => re.test(n);
  });
  return (name) => {
    const n = name.toLowerCase();
    return tests.some((t) => t(n));
  };
}

/** Undirected BFS over relations from `start`, up to `depth` hops. */
export function neighbourhood(start: string, relations: SchemaRelation[], depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => adj.set(a, [...(adj.get(a) || []), b]);
  for (const r of relations) { link(r.from, r.to); link(r.to, r.from); }
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const t of frontier) for (const n of adj.get(t) || []) if (!seen.has(n)) { seen.add(n); next.push(n); }
    frontier = next;
  }
  return seen;
}

export interface VisibleGraph {
  tables: SchemaTable[];
  relations: SchemaRelation[];
  /** Total relations each visible table has in the full schema (for "+N hidden" hints). */
  degree: Map<string, number>;
}

export function visibleGraph(schema: DbSchema, f: ErFilter): VisibleGraph {
  const relations = schema.relations.filter((r) => f.showInferred || !r.inferred);
  const degree = new Map<string, number>();
  for (const r of relations) {
    degree.set(r.from, (degree.get(r.from) || 0) + 1);
    if (r.to !== r.from) degree.set(r.to, (degree.get(r.to) || 0) + 1);
  }

  const match = nameMatcher(f.search);
  let names = new Set(
    schema.tables.filter((t) => (f.showViews || t.type === 'table') && !f.hidden.has(t.name) && match(t.name)).map((t) => t.name)
  );

  if (f.focus && schema.tables.some((t) => t.name === f.focus)) {
    // Focus walks the full relation set so a search filter can't cut the path to a neighbour.
    const around = neighbourhood(f.focus, relations, Math.max(0, f.depth));
    names = new Set([...around].filter((n) => !f.hidden.has(n) && (f.showViews || schema.tables.find((t) => t.name === n)?.type === 'table')));
    names.add(f.focus);
  }

  let rels = relations.filter((r) => names.has(r.from) && names.has(r.to));
  if (f.hideIsolated) {
    const linked = new Set(rels.flatMap((r) => [r.from, r.to]));
    if (f.focus) linked.add(f.focus);
    names = new Set([...names].filter((n) => linked.has(n)));
    rels = rels.filter((r) => names.has(r.from) && names.has(r.to));
  }

  return { tables: schema.tables.filter((t) => names.has(t.name)), relations: rels, degree };
}

/** Per-table stats for the properties view. */
export function tableStats(schema: DbSchema) {
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();
  for (const r of schema.relations) {
    outbound.set(r.from, (outbound.get(r.from) || 0) + 1);
    inbound.set(r.to, (inbound.get(r.to) || 0) + 1);
  }
  return schema.tables.map((t) => ({
    ...t,
    totalBytes: t.dataBytes == null && t.indexBytes == null ? null : (t.dataBytes || 0) + (t.indexBytes || 0),
    inbound: inbound.get(t.name) || 0,
    outbound: outbound.get(t.name) || 0,
    hasPk: t.columns.some((c) => c.pk)
  }));
}

export const fmtBytes = (n: number | null | undefined) => {
  if (n == null) return '–';
  if (n < 1024) return `${n} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
};

export const fmtNum = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString());
