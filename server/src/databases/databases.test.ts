// Run: npx tsx src/databases/databases.test.ts
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareSql, splitSql, parseCsv, parseMysqlBatch, QueryError } from './sql.js';
import { tokenize, checkRedisCommand } from './adapters/redis.js';
import { parseMongoReadQuery } from './adapters/mongodb.js';
import { imageRepo } from './discovery.js';
import { inferRelations, sections } from './schema.js';
import { adapters, getAdapter } from './registry.js';
import { wrap } from './runner.js';
import { DbConnection } from './types.js';

const ro = (sql: string, d: 'mysql' | 'postgres' | 'sqlite' = 'mysql') => prepareSql(sql, d, false);
const rejects = (sql: string, d: 'mysql' | 'postgres' | 'sqlite' = 'mysql') => assert.throws(() => ro(sql, d), QueryError, `should reject: ${sql}`);

// ---- statement splitting ----
assert.equal(splitSql("select 'a;b'; select 2", 'mysql').statements.length, 2);
assert.equal(splitSql('select "x;y" -- c;\n; select 1', 'mysql').statements.length, 2);
assert.equal(splitSql("select $$a;b$$; select $t$x;y$t$", 'postgres').statements.length, 2);
assert.equal(splitSql("select 'it''s;'", 'postgres').statements.length, 1);
assert.equal(splitSql("select 'a\\';b'", 'mysql').statements.length, 1); // mysql backslash escape keeps ; inside

// ---- read-only allowlist ----
for (const ok of ['SELECT 1', 'show tables', '  -- hi\nSELECT 1', '/* x */ select now()', 'WITH a AS (SELECT 1) SELECT * FROM a', 'EXPLAIN SELECT 1', "select ';drop table x'"]) {
  assert.doesNotThrow(() => ro(ok), ok);
}
for (const bad of [
  'DELETE FROM users', 'update t set a=1', 'select 1; drop table x', 'SET SESSION TRANSACTION READ WRITE', 'commit',
  "select * from t into outfile '/tmp/x'", 'select 1 into dumpfile "/tmp/x"', 'LOAD DATA INFILE "/etc/passwd" INTO TABLE t',
  'GRANT ALL ON *.* TO x', 'CALL sp()', 'lock tables t write', 'select 1;\nsystem id', 'select 1 \\! id', '\\! id',
  'select 1;\nsource /etc/passwd', ''
]) rejects(bad);
// No ';' = one statement: MySQL sees "select 1 DELETE from t" (a syntax error), never a separate DELETE.
for (const one of ['select 1 # c\nDELETE from t', 'select 1 --\nDELETE from t']) {
  const st = ro(one);
  assert.equal(st.length, 1);
  assert.equal(st[0].firstWord, 'SELECT');
}
// mysql "--" needs a following space to be a comment, so "--1" is not a comment start:
rejects('select 1;--1\ndelete from t');
// a backslash inside a comment is refused too (some clients act on it)
rejects('select 1 -- \\! id');

for (const bad of ['DELETE FROM t', 'select 1; copy t to program \'id\'', 'COPY t FROM \'/etc/passwd\'', '\\! id', 'select 1 \\gexec', 'SET default_transaction_read_only = off', 'commit', 'do $$ begin end $$', 'select pg_terminate_backend(1); vacuum']) rejects(bad, 'postgres');
assert.doesNotThrow(() => ro("select $$;drop$$, E'a\\';b'", 'postgres'));

for (const bad of ['.shell id', 'select 1;\n.system id', "ATTACH '/tmp/x' AS y", 'delete from t']) rejects(bad, 'sqlite');
assert.doesNotThrow(() => ro('pragma table_info(t)', 'sqlite'));

// write mode still blocks client meta-commands
assert.throws(() => prepareSql('select 1; \\! id', 'mysql', true), QueryError);
assert.throws(() => prepareSql('select 1;\nsystem id', 'mysql', true), QueryError);
assert.doesNotThrow(() => prepareSql('update t set a=1', 'mysql', true));

// ---- parsers ----
assert.deepEqual(parseCsv('a,b\n"x,1","he said ""hi"""\n,\n'), [['a', 'b'], ['x,1', 'he said "hi"'], ['', '']]);
assert.deepEqual(parseMysqlBatch('id\tname\n1\tNULL\n2\ta\\tb\\nc'), { columns: ['id', 'name'], rows: [['1', null], ['2', 'a\tb\nc']], truncated: undefined });

// ---- redis ----
assert.deepEqual(tokenize(`SET "a b" 'c d' e\\"f`), ['SET', 'a b', 'c d', 'e\\"f']);
assert.doesNotThrow(() => checkRedisCommand(['GET', 'k'], false));
assert.doesNotThrow(() => checkRedisCommand(['client', 'list'], false));
for (const bad of [['SET', 'k', 'v'], ['DEL', 'k'], ['FLUSHALL'], ['CLIENT', 'KILL', 'x'], ['CONFIG', 'GET', '*']]) {
  assert.throws(() => checkRedisCommand(bad, false), QueryError, bad.join(' '));
}
for (const bad of [['CONFIG', 'SET', 'dir', '/tmp'], ['EVAL', 'x', '0'], ['MONITOR'], ['SLAVEOF', 'h', '1'], ['MODULE', 'LOAD', '/x.so']]) {
  assert.throws(() => checkRedisCommand(bad, true), QueryError, `write mode still blocks ${bad[0]}`);
}

// ---- mongo read grammar ----
assert.deepEqual(parseMongoReadQuery('db.users.find({"age": {"$gt": 3}}, {"name": 1})'), { coll: 'users', method: 'find', args: [{ age: { $gt: 3 } }, { name: 1 }] });
for (const bad of ['db.users.deleteMany({})', 'db.users.find({}).forEach(x=>db.x.drop())', 'db.u.aggregate([{"$out":"x"}])', 'db.u.find({"$where":"sleep(1)"})', 'db.u.find(this)', 'print(1)']) {
  assert.throws(() => parseMongoReadQuery(bad), QueryError, bad);
}

// ---- discovery image matching (generic, not tied to one registry) ----
assert.equal(imageRepo('ghcr.io/acme/postgres:16@sha256:ab'), 'acme/postgres');
assert.equal(imageRepo('mysql:8.0'), 'mysql');
assert.equal(imageRepo('localhost:5000/mariadb:11'), 'mariadb');
const engineFor = (img: string) => [...adapters.values()].find((a) => a.discover?.images?.test(imageRepo(img)))?.id;
assert.equal(engineFor('mysql:8.0'), 'mysql');
assert.equal(engineFor('bitnami/mariadb:11'), 'mysql');
assert.equal(engineFor('postgis/postgis:16-3.4'), 'postgres');
assert.equal(engineFor('timescale/timescaledb:latest-pg16'), 'postgres');
assert.equal(engineFor('redis:7-alpine'), 'redis');
assert.equal(engineFor('valkey/valkey:8'), 'redis');
assert.equal(engineFor('mongo:7'), 'mongodb');
assert.equal(engineFor('phpmyadmin/phpmyadmin:latest'), undefined);
assert.equal(engineFor('ghcr.io/x/mysql-exporter'), undefined);

// ---- runner wrapping ----
const conn = (over: Partial<DbConnection>): DbConnection => ({ id: 'x', serverId: 's', name: 'n', engine: 'mysql', location: { kind: 'host' }, auth: 'password', allowWrite: false, ...over });
assert.match(wrap(conn({ location: { kind: 'container', container: 'erp-pos-mysql' } }), { script: 'echo hi', env: { A: "it's" } }), /^docker exec -i 'erp-pos-mysql' sh -c /);
assert.throws(() => wrap(conn({ location: { kind: 'container', container: 'x;id' } }), { script: 'x' }));
// password travels via env inside the target shell, never as a CLI argument
const q = getAdapter('mysql').query(conn({ password: 'p@ss$word' }), 'select 1');
assert.ok(!q.script.includes('p@ss$word'));
assert.equal(q.env?.VPSHUB_DB_PASSWORD, 'p@ss$word');
assert.match(q.stdin || '', /START TRANSACTION READ ONLY/);
assert.match(getAdapter('postgres').query(conn({ engine: 'postgres' }), 'select 1').stdin || '', /BEGIN READ ONLY/);

// ---- every adapter satisfies the contract ----
for (const a of adapters.values()) {
  for (const m of ['ping', 'parsePing', 'listObjects', 'parseObjects', 'preview', 'parsePreview', 'query', 'parseQuery'] as const) {
    assert.equal(typeof a[m], 'function', `${a.id}.${m}`);
  }
  assert.ok(a.authModes.length > 0, `${a.id} authModes`);
}

// ---- SQLite end-to-end against a real sqlite3 (runs the exact commands the adapter builds) ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-db-'));
const file = path.join(dir, 'app.db');
execFileSync('sqlite3', [file, "create table users(id integer primary key, name text, note text); insert into users(name,note) values ('alice','a,b'),('bob',null),('o''neil','line1\nline2');"]);
// Runs exactly the string the runner would send over SSH; returns output even on non-zero exit (like the runner).
const sh = (c: DbConnection, cmd: { script: string; stdin?: string }) => {
  const r = spawnSync('sh', ['-c', wrap(c, cmd as any)], { input: cmd.stdin ?? '' });
  return r.stdout.toString() + r.stderr.toString();
};
const lite = getAdapter('sqlite');
const sc = conn({ engine: 'sqlite', database: file, auth: 'none' });
assert.match(lite.parsePing(sh(sc, lite.ping(sc))), /^\d+\.\d+/);
assert.deepEqual(lite.parseObjects(sh(sc, lite.listObjects(sc))).map((o) => o.name), ['users']);
const prev = lite.parsePreview(sh(sc, lite.preview(sc, 'users')));
assert.deepEqual(prev.columns, ['id', 'name', 'note']);
assert.deepEqual(prev.rows, [['1', 'alice', 'a,b'], ['2', 'bob', null], ['3', "o'neil", 'line1\nline2']]);
const two = lite.parseQuery(sh(sc, lite.query(sc, "select count(*) as n from users; select name from users where name like 'a%'")));
assert.equal(two.results.length, 2);
assert.deepEqual(two.results[0].rows, [['3']]);
assert.deepEqual(two.results[1].rows, [['alice']]);
// read-only is enforced by the engine too: even a statement slipped past the parser can't write
const roCmd = lite.query(sc, 'select 1');
const forced = sh(sc, { ...roCmd, stdin: 'insert into users(name) values (\'x\');\n' });
assert.match(forced, /readonly|read-only/i);
assert.equal(execFileSync('sqlite3', [file, 'select count(*) from users']).toString().trim(), '3');
// write mode works when enabled
const wc = { ...sc, allowWrite: true };
lite.parseQuery(sh(wc, lite.query(wc, "insert into users(name) values ('carol')")));
assert.equal(execFileSync('sqlite3', [file, 'select count(*) from users']).toString().trim(), '4');
fs.rmSync(dir, { recursive: true, force: true });

// ---- data-grid SELECT builder ----
const my = getAdapter('mysql');
assert.equal(my.selectSql!('users', { limit: 50, offset: 100, orderBy: 'created_at', dir: 'desc' }),
  'SELECT * FROM `users` ORDER BY `created_at` DESC LIMIT 50 OFFSET 100');
assert.equal(my.selectSql!('users', { limit: 5000, offset: -3 }), 'SELECT * FROM `users` LIMIT 1000 OFFSET 0');
assert.equal(getAdapter('postgres').selectSql!('users', { limit: 10, offset: 0, where: "email like '%a%'" }),
  `SELECT * FROM "public"."users" WHERE (email like '%a%') LIMIT 10 OFFSET 0`);
assert.equal(getAdapter('postgres').countSql!('app.orders'), 'SELECT COUNT(*) AS n FROM "app"."orders"');
// identifiers are allowlisted, never escaped; odd names are refused
for (const bad of ['users`; drop table x; --', 'a b', "x'"]) assert.throws(() => my.selectSql!(bad, { limit: 1, offset: 0 }), bad);
assert.throws(() => my.selectSql!('users', { limit: 1, offset: 0, orderBy: 'id`, (select 1)' }));
// filter: a ';' outside strings would start a second statement -> refused; inside a string it's fine
assert.throws(() => my.selectSql!('users', { limit: 1, offset: 0, where: '1=1; drop table users' }), QueryError);
assert.doesNotThrow(() => my.selectSql!('users', { limit: 1, offset: 0, where: "note = 'a;b'" }));
// a filter that sneaks in a write is still caught by the read-only guard on the combined statement
assert.throws(() => prepareSql(my.selectSql!('t', { limit: 1, offset: 0, where: "1=1) UNION SELECT 1 INTO OUTFILE '/tmp/x' -- " }), 'mysql', false), QueryError);

// ---- SQLite describe + browse end-to-end ----
{
  const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-db2-'));
  const f2 = path.join(d2, 'shop.db');
  execFileSync('sqlite3', [f2, "create table items(id integer primary key, sku text not null unique, price real default 0); create index ix_price on items(price); insert into items(sku,price) values ('a',3),('b',1),('c',2);"]);
  const c2 = conn({ engine: 'sqlite', database: f2, auth: 'none' });
  const st = lite.parseDescribe!(sh(c2, lite.describe!(c2, 'items')));
  assert.deepEqual(st.columns.map((x) => [x.name, x.key ?? '', x.nullable]), [['id', 'PRI', true], ['sku', '', false], ['price', '', true]]);
  assert.ok(st.indexes.some((i) => i.name === 'ix_price' && i.columns === 'price' && !i.unique));
  assert.ok(st.indexes.some((i) => i.unique && i.columns === 'sku'));
  assert.match(st.ddl || '', /CREATE TABLE items/);
  const browse = lite.selectSql!('items', { limit: 2, offset: 0, orderBy: 'price', dir: 'desc', where: "sku <> 'zzz'" }) + ';' + lite.countSql!('items', "sku <> 'zzz'") + ';';
  const br = lite.parseQuery(sh(c2, lite.query(c2, browse)));
  assert.deepEqual(br.results[0].rows.map((r) => r[1]), ['a', 'c']);
  assert.equal(br.results[1].rows[0][0], '3');
  fs.rmSync(d2, { recursive: true, force: true });
}

// ---- relation inference ----
{
  const T = (name: string, cols: [string, boolean?][], type: 'table' | 'view' = 'table') =>
    ({ name, type, rows: null, dataBytes: null, indexBytes: null, columns: cols.map(([n, pk]) => ({ name: n, type: 'int', nullable: false, pk: !!pk })) });
  const tables = [
    T('users', [['id', true], ['name']]),
    T('categories', [['id', true]]),
    T('companies', [['id', true]]),
    T('customers', [['customer_id', true], ['company_id']]),
    T('orders', [['id', true], ['user_id'], ['customer_id'], ['category_id'], ['external_id'], ['parent_id']]),
    T('order_view', [['id'], ['user_id']], 'view')
  ];
  const declared = [{ from: 'orders', fromColumn: 'user_id', to: 'users', toColumn: 'id' }];
  const inf = inferRelations(tables, declared).map((r) => `${r.from}.${r.fromColumn}->${r.to}.${r.toColumn}`).sort();
  assert.deepEqual(inf, [
    'customers.company_id->companies.id', // <name>_id -> plural ...ies
    'orders.category_id->categories.id', // y -> ies
    'orders.customer_id->customers.customer_id' // same-name PK
  ]);
  // declared FK not duplicated, unknown targets (external_id, parent_id) ignored, views never inferred
}

// ---- SQLite schema snapshot end-to-end (declared FK + inferred) ----
{
  const d3 = fs.mkdtempSync(path.join(os.tmpdir(), 'vpshub-db3-'));
  const f3 = path.join(d3, 'erd.db');
  execFileSync('sqlite3', [f3, `
    create table users(id integer primary key, email text not null);
    create table posts(id integer primary key, user_id integer not null references users(id), title text);
    create table comments(id integer primary key, post_id integer, body text);
    create view recent_posts as select * from posts;
    insert into users(email) values ('a@x'),('b@x');`]);
  const c3 = conn({ engine: 'sqlite', database: f3, auth: 'none' });
  const sch = lite.parseSchema!(sh(c3, lite.schema!(c3)));
  assert.deepEqual(sch.tables.map((t) => `${t.name}:${t.type}:${t.columns.length}`).sort(), ['comments:table:3', 'posts:table:3', 'recent_posts:view:3', 'users:table:2']);
  assert.ok(sch.tables.find((t) => t.name === 'users')!.columns.find((c) => c.name === 'id')!.pk);
  assert.deepEqual(sch.relations.map((r) => `${r.from}.${r.fromColumn}->${r.to}.${r.toColumn}`), ['posts.user_id->users.id']);
  assert.ok((sch.meta.sizeBytes || 0) > 0 && /^\d+\.\d+/.test(sch.meta.version || ''));
  const all = [...sch.relations, ...inferRelations(sch.tables, sch.relations)];
  assert.ok(all.some((r) => r.from === 'comments' && r.fromColumn === 'post_id' && r.to === 'posts' && r.inferred));
  assert.equal(all.filter((r) => r.from === 'posts' && r.fromColumn === 'user_id').length, 1);
  fs.rmSync(d3, { recursive: true, force: true });
}

// ---- section parser ignores client noise ----
assert.deepEqual(sections('ERROR 1193 (HY000): Unknown system variable\n@@T\nusers\tBASE TABLE\tNULL\nWarning (Code 1): x\n@@C\n', 'NULL'),
  { T: [['users', 'BASE TABLE', null]], C: [] });

console.log('database tests ok');
