// SQLite storage for everything that used to be a JSON file in server/data/.
// One file (7server.db), built into Node (node:sqlite), no native module, so it bundles for the
// desktop sidecar too. Secrets keep their AES-256-GCM encryption before they reach the database;
// secret.key stays a separate file on purpose (a stolen .db alone can't decrypt anything).
//
// Shapes:
// - docs(collection, id, data): small record sets the stores read and write as JSON documents.
// - kv(key, data): single values (gateway config, monitor settings, metric history, uptime).
// - audit, ai_usage: append-only logs with indexes and capped size.
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, dataFile } from '../config.js';

const DB_FILE = dataFile('7server.db');
let db: DatabaseSync | null = null;

function open(): DatabaseSync {
  if (db) return db;
  const fresh = !fs.existsSync(DB_FILE);
  db = new DatabaseSync(DB_FILE);
  if (fresh) fs.chmodSync(DB_FILE, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;      -- readers don't block the writer; crash-safe
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;     -- deleted rows are zeroed, so a replaced secret doesn't linger in free pages
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      ord INTEGER NOT NULL,          -- insertion order, so lists keep the order the JSON files had
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS docs_order ON docs (collection, ord);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      t TEXT NOT NULL, user TEXT, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_t ON audit (t);
    CREATE INDEX IF NOT EXISTS audit_user ON audit (user);
    CREATE TABLE IF NOT EXISTS ai_usage (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      t TEXT NOT NULL, key_id TEXT, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_usage_t ON ai_usage (t);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  migrateFromJson(db);
  return db;
}

// ---------------------------------------------------------------- documents
/** All documents of a collection, in insertion order. */
export function listDocs<T>(collection: string): T[] {
  return open().prepare('SELECT data FROM docs WHERE collection = ? ORDER BY ord').all(collection).map((r: any) => JSON.parse(r.data));
}

export function getDoc<T>(collection: string, id: string): T | null {
  const row: any = open().prepare('SELECT data FROM docs WHERE collection = ? AND id = ?').get(collection, id);
  return row ? JSON.parse(row.data) : null;
}

/** Insert or replace one document; a new id goes to the end of the order. */
export function putDoc(collection: string, id: string, value: unknown) {
  const d = open();
  const existing: any = d.prepare('SELECT ord FROM docs WHERE collection = ? AND id = ?').get(collection, id);
  const ord = existing ? existing.ord : ((d.prepare('SELECT COALESCE(MAX(ord), 0) + 1 AS n FROM docs WHERE collection = ?').get(collection) as any).n);
  d.prepare('INSERT OR REPLACE INTO docs (collection, id, data, ord) VALUES (?, ?, ?, ?)').run(collection, id, JSON.stringify(value), ord);
}

export function deleteDoc(collection: string, id: string): boolean {
  return Number(open().prepare('DELETE FROM docs WHERE collection = ? AND id = ?').run(collection, id).changes) > 0;
}

/**
 * Replace a whole collection in one transaction: the drop-in for "write the JSON file". `idOf` picks
 * the key of each item; order follows the array.
 */
export function replaceDocs<T>(collection: string, items: T[], idOf: (item: T, index: number) => string) {
  const d = open();
  tx(() => {
    d.prepare('DELETE FROM docs WHERE collection = ?').run(collection);
    const ins = d.prepare('INSERT INTO docs (collection, id, data, ord) VALUES (?, ?, ?, ?)');
    items.forEach((item, i) => ins.run(collection, idOf(item, i), JSON.stringify(item), i + 1));
  });
}

// ---------------------------------------------------------------- single values
export function getKv<T>(key: string, fallback: T): T {
  const row: any = open().prepare('SELECT data FROM kv WHERE key = ?').get(key);
  return row ? JSON.parse(row.data) : fallback;
}
export function setKv(key: string, value: unknown) {
  open().prepare('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)').run(key, JSON.stringify(value));
}

// ---------------------------------------------------------------- logs
const AUDIT_KEEP = 50_000;
const USAGE_KEEP = 5_000;

export function appendAudit(entry: { t: string; user?: string } & Record<string, unknown>) {
  const d = open();
  d.prepare('INSERT INTO audit (t, user, data) VALUES (?, ?, ?)').run(entry.t, entry.user || null, JSON.stringify(entry));
  trim('audit', AUDIT_KEEP);
}
/** Newest first. Filters run in SQL where they can; free-text search runs on the decoded rows. */
export function readAuditRows(limit: number, user?: string): any[] {
  const d = open();
  const rows = user
    ? d.prepare('SELECT data FROM audit WHERE user = ? ORDER BY seq DESC LIMIT ?').all(user, limit)
    : d.prepare('SELECT data FROM audit ORDER BY seq DESC LIMIT ?').all(limit);
  return rows.map((r: any) => JSON.parse(r.data));
}

export function appendUsage(entry: { timestamp: string; keyId?: string } & Record<string, unknown>) {
  open().prepare('INSERT INTO ai_usage (t, key_id, data) VALUES (?, ?, ?)').run(entry.timestamp, entry.keyId || null, JSON.stringify(entry));
  trim('ai_usage', USAGE_KEEP);
}
/** Newest first. */
export function readUsageRows(limit: number): any[] {
  return open().prepare('SELECT data FROM ai_usage ORDER BY seq DESC LIMIT ?').all(limit).map((r: any) => JSON.parse(r.data));
}
export function allUsageRows(): any[] {
  return open().prepare('SELECT data FROM ai_usage ORDER BY seq DESC').all().map((r: any) => JSON.parse(r.data));
}
export function clearUsage() { open().exec('DELETE FROM ai_usage'); }

// Cap logs by row count: cheap, and keeps the db from growing without bound.
let trimCounter = 0;
function trim(table: 'audit' | 'ai_usage', keep: number) {
  if (++trimCounter % 200) return; // check every 200 inserts
  open().prepare(`DELETE FROM ${table} WHERE seq <= (SELECT MAX(seq) FROM ${table}) - ?`).run(keep);
}

/** Rewrite the file so nothing deleted survives in free pages or the WAL (after a secret is rotated). */
export function compact() {
  const d = open();
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  d.exec('VACUUM');
  d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
}

export function tx(fn: () => void) {
  const d = open();
  d.exec('BEGIN IMMEDIATE');
  try { fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
}

// ---------------------------------------------------------------- one-time import of the old JSON files
// Each file is imported once, then renamed to <name>.migrated (kept, never deleted) so nothing is lost
// and a rollback is a rename away.
type Importer = { file: string; run: (d: DatabaseSync, json: any, raw: string) => void };

const docIds = (collection: string, idField = 'id') => (d: DatabaseSync, json: any) => {
  const list: any[] = Array.isArray(json) ? json : [];
  const ins = d.prepare('INSERT OR REPLACE INTO docs (collection, id, data, ord) VALUES (?, ?, ?, ?)');
  list.forEach((item, i) => ins.run(collection, String(item?.[idField] ?? i), JSON.stringify(item), i + 1));
};

const IMPORTERS: Importer[] = [
  { file: 'servers.json', run: docIds('servers') },
  { file: 'databases.json', run: docIds('db_connections') },
  { file: 'users.json', run: docIds('users') },
  { file: 'sessions.json', run: docIds('sessions') },
  { file: 'ai-gateway-keys.json', run: docIds('ai_keys') },
  { file: 'backup-profiles.json', run: docIds('backup_profiles') },
  {
    file: 'ai-gateway-accounts.json',
    run: (d, json) => {
      const ins = d.prepare('INSERT OR REPLACE INTO docs (collection, id, data, ord) VALUES (?, ?, ?, ?)');
      Object.entries(json || {}).forEach(([provider, acc], i) => ins.run('ai_accounts', provider, JSON.stringify(acc), i + 1));
    }
  },
  { file: 'ai-gateway-config.json', run: (d, json) => { d.prepare('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)').run('ai_gateway_config', JSON.stringify(json)); } },
  { file: 'monitor.json', run: (d, json) => { d.prepare('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)').run('monitor_settings', JSON.stringify(json)); } },
  { file: 'history.json', run: (d, json) => { d.prepare('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)').run('metric_history', JSON.stringify(json)); } },
  { file: 'uptime.json', run: (d, json) => { d.prepare('INSERT OR REPLACE INTO kv (key, data) VALUES (?, ?)').run('uptime', JSON.stringify(json)); } },
  {
    file: 'ai-gateway-usage.json',
    run: (d, json) => {
      const list: any[] = Array.isArray(json) ? json : [];
      const ins = d.prepare('INSERT INTO ai_usage (t, key_id, data) VALUES (?, ?, ?)');
      // the file is newest-first; insert oldest-first so seq order = time order
      [...list].reverse().forEach((e) => ins.run(String(e?.timestamp || ''), e?.keyId || null, JSON.stringify(e)));
    }
  },
  {
    file: 'audit.log',
    run: (d, _json, raw) => {
      const ins = d.prepare('INSERT INTO audit (t, user, data) VALUES (?, ?, ?)');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try { const e = JSON.parse(line); ins.run(String(e.t || ''), e.user || null, JSON.stringify(e)); } catch { /* skip a torn line */ }
      }
    }
  }
];

function migrateFromJson(d: DatabaseSync) {
  for (const imp of IMPORTERS) {
    const file = path.join(DATA_DIR, imp.file);
    if (!fs.existsSync(file)) continue;
    const done = d.prepare('SELECT value FROM meta WHERE key = ?').get(`imported:${imp.file}`);
    if (done) continue;
    const raw = fs.readFileSync(file, 'utf8');
    let json: any = null;
    if (!imp.file.endsWith('.log')) {
      try { json = JSON.parse(raw); } catch { console.warn(`[db] ${imp.file} is not valid JSON; left in place, not imported`); continue; }
    }
    d.exec('BEGIN IMMEDIATE');
    try {
      imp.run(d, json, raw);
      d.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(`imported:${imp.file}`, new Date().toISOString());
      d.exec('COMMIT');
    } catch (e: any) {
      d.exec('ROLLBACK');
      console.warn(`[db] import of ${imp.file} failed, file left in place: ${e.message}`);
      continue;
    }
    fs.renameSync(file, `${file}.migrated`);
    console.log(`[db] imported ${imp.file} into 7server.db (original kept as ${imp.file}.migrated)`);
  }
}

/** Test hook: close so a test can point DATA_DIR elsewhere. */
export function __closeDb() { db?.close(); db = null; }
