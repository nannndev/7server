// Run (from client/): npx --prefix ../server tsx src/features/databases/lib/erGraph.test.ts
import assert from 'node:assert/strict';
import { visibleGraph, defaultFilter, nameMatcher, neighbourhood, tableStats, fmtBytes } from '@/features/databases/lib/erGraph';
import type { DbSchema } from '@/features/databases/api';

const t = (name: string, type: 'table' | 'view' = 'table', dataBytes: number | null = 100) =>
  ({ name, type, rows: 1, dataBytes, indexBytes: 10, columns: [{ name: 'id', type: 'int', nullable: false, pk: type === 'table' }] });

const schema: DbSchema = {
  meta: { extra: [] },
  tables: [t('users'), t('orders'), t('order_items'), t('products'), t('categories'), t('logs'), t('v_sales', 'view')],
  relations: [
    { from: 'orders', fromColumn: 'user_id', to: 'users', toColumn: 'id' },
    { from: 'order_items', fromColumn: 'order_id', to: 'orders', toColumn: 'id' },
    { from: 'order_items', fromColumn: 'product_id', to: 'products', toColumn: 'id' },
    { from: 'products', fromColumn: 'category_id', to: 'categories', toColumn: 'id', inferred: true }
  ]
};
const names = (g: { tables: { name: string }[] }) => g.tables.map((x) => x.name).sort();

// default: all tables, no views, all relations
let g = visibleGraph(schema, defaultFilter());
assert.deepEqual(names(g), ['categories', 'logs', 'order_items', 'orders', 'products', 'users']);
assert.equal(g.relations.length, 4);

// views toggle
assert.ok(names(visibleGraph(schema, { ...defaultFilter(), showViews: true })).includes('v_sales'));

// inferred relations toggle
assert.equal(visibleGraph(schema, { ...defaultFilter(), showInferred: false }).relations.length, 3);

// hide isolated: logs has no relation
assert.ok(!names(visibleGraph(schema, { ...defaultFilter(), hideIsolated: true })).includes('logs'));
// ...and with inferred hidden, categories becomes isolated too
assert.ok(!names(visibleGraph(schema, { ...defaultFilter(), hideIsolated: true, showInferred: false })).includes('categories'));

// search with wildcard + comma list; relations only between visible tables
g = visibleGraph(schema, { ...defaultFilter(), search: 'order*, users' });
assert.deepEqual(names(g), ['order_items', 'orders', 'users']);
assert.deepEqual(g.relations.map((r) => r.fromColumn).sort(), ['order_id', 'user_id']);

// focus + depth
assert.deepEqual(names(visibleGraph(schema, { ...defaultFilter(), focus: 'orders', depth: 1 })), ['order_items', 'orders', 'users']);
assert.deepEqual(names(visibleGraph(schema, { ...defaultFilter(), focus: 'orders', depth: 2 })), ['order_items', 'orders', 'products', 'users']);
assert.deepEqual(names(visibleGraph(schema, { ...defaultFilter(), focus: 'orders', depth: 0 })), ['orders']);
// focus ignores the search box so neighbours aren't cut off
assert.deepEqual(names(visibleGraph(schema, { ...defaultFilter(), search: 'zzz', focus: 'products', depth: 1 })), ['categories', 'order_items', 'products']);
// hidden tables stay hidden even inside a focus neighbourhood
assert.deepEqual(names(visibleGraph(schema, { ...defaultFilter(), focus: 'orders', depth: 1, hidden: new Set(['users']) })), ['order_items', 'orders']);
// unknown focus falls back to normal filtering
assert.equal(visibleGraph(schema, { ...defaultFilter(), focus: 'nope' }).tables.length, 6);

// degree counts the full schema, so the UI can say "+N hidden"
assert.equal(visibleGraph(schema, { ...defaultFilter(), search: 'users' }).degree.get('users'), 1);
assert.equal(g.degree.get('order_items'), 2);

// self-reference counted once, BFS handles cycles
assert.deepEqual([...neighbourhood('a', [{ from: 'a', fromColumn: 'p', to: 'a', toColumn: 'id' }, { from: 'a', fromColumn: 'b', to: 'b', toColumn: 'id' }, { from: 'b', fromColumn: 'a', to: 'a', toColumn: 'id' }], 5)].sort(), ['a', 'b']);

assert.ok(nameMatcher('')('anything'));
assert.ok(nameMatcher('USR')('app_usr_x'));
assert.ok(!nameMatcher('a.b')('axb')); // regex chars are literal

const stats = tableStats(schema);
const oi = stats.find((x) => x.name === 'order_items')!;
assert.deepEqual([oi.outbound, oi.inbound, oi.totalBytes, oi.hasPk], [2, 0, 110, true]);
assert.equal(stats.find((x) => x.name === 'users')!.inbound, 1);

assert.equal(fmtBytes(null), '–');
assert.equal(fmtBytes(512), '512 B');
assert.equal(fmtBytes(1536), '1.5 KB');
assert.equal(fmtBytes(5 * 1024 ** 3), '5.0 GB');

console.log('erGraph tests ok');
