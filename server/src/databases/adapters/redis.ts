// Redis / Valkey / KeyDB via redis-cli. Redis has no read-only session, so read-only mode is an
// allowlist of read commands; one command per line, arguments tokenised here (never by a shell).
import { DatabaseAdapter, DbConnection, Cmd } from '../types.js';
import { QueryError, MAX_ROWS } from '../sql.js';
import { sq, flag } from '../shell.js';

const ENV = { password: ['REDIS_PASSWORD', 'REDIS_PASS', 'VALKEY_PASSWORD'] };

const READ_CMDS = new Set([
  'GET', 'MGET', 'STRLEN', 'GETRANGE', 'EXISTS', 'TYPE', 'TTL', 'PTTL', 'KEYS', 'SCAN', 'DBSIZE', 'INFO', 'PING', 'TIME',
  'HGET', 'HMGET', 'HGETALL', 'HKEYS', 'HVALS', 'HLEN', 'HEXISTS', 'HSCAN',
  'LRANGE', 'LLEN', 'LINDEX', 'SMEMBERS', 'SCARD', 'SISMEMBER', 'SSCAN', 'SRANDMEMBER',
  'ZRANGE', 'ZREVRANGE', 'ZRANGEBYSCORE', 'ZCARD', 'ZSCORE', 'ZRANK', 'ZSCAN', 'ZCOUNT',
  'XRANGE', 'XREVRANGE', 'XLEN', 'XINFO', 'OBJECT', 'MEMORY', 'SLOWLOG', 'CLIENT', 'LASTSAVE', 'ROLE', 'COMMAND', 'JSON.GET'
]);
// Subcommands of the commands above that mutate state.
const WRITE_SUBS: Record<string, Set<string>> = {
  CLIENT: new Set(['KILL', 'PAUSE', 'SETNAME', 'NO-EVICT', 'REPLY', 'TRACKING', 'UNPAUSE']),
  SLOWLOG: new Set(['RESET']),
  MEMORY: new Set(['PURGE'])
};
// Never allowed through the dashboard, even in write mode (replication/persistence/config/scripting).
const BLOCKED = new Set(['MONITOR', 'SUBSCRIBE', 'PSUBSCRIBE', 'SSUBSCRIBE', 'SYNC', 'PSYNC', 'REPLICAOF', 'SLAVEOF', 'SHUTDOWN', 'DEBUG', 'CONFIG', 'MODULE', 'ACL', 'FAILOVER', 'CLUSTER', 'EVAL', 'EVALSHA', 'EVAL_RO', 'EVALSHA_RO', 'FUNCTION', 'FCALL', 'FCALL_RO', 'SCRIPT', 'BGREWRITEAOF', 'BGSAVE', 'SAVE', 'MIGRATE', 'RESTORE']);

/** Splits a line like redis-cli does: whitespace separated, "double" or 'single' quotes, \" escapes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let tok = '';
    const q = line[i] === '"' || line[i] === "'" ? line[i++] : '';
    while (i < line.length) {
      const ch = line[i];
      if (q) {
        if (ch === '\\' && q === '"' && i + 1 < line.length) { tok += line[i + 1]; i += 2; continue; }
        if (ch === q) { i++; break; }
        tok += ch; i++;
      } else {
        if (/\s/.test(ch)) break;
        tok += ch; i++;
      }
    }
    out.push(tok);
  }
  return out;
}

export function checkRedisCommand(args: string[], write: boolean): void {
  if (!args.length) return;
  const name = args[0].toUpperCase();
  if (BLOCKED.has(name)) throw new QueryError(`Perintah ${name} tidak diizinkan lewat dashboard.`);
  if (!write) {
    if (!READ_CMDS.has(name)) throw new QueryError(`Mode read-only: ${name} tidak diizinkan. Aktifkan mode tulis di pengaturan koneksi bila perlu.`);
    const sub = args[1]?.toUpperCase();
    if (sub && WRITE_SUBS[name]?.has(sub)) throw new QueryError(`Mode read-only: ${name} ${sub} tidak diizinkan.`);
  }
}

function base(c: DbConnection): string {
  let auth = '';
  if (c.auth === 'password') auth = 'REDISCLI_AUTH="$VPSHUB_DB_PASSWORD" ';
  if (c.auth === 'container-env') auth = `REDISCLI_AUTH="${ENV.password.map((n) => `\${${n}:-`).join('')}${'}'.repeat(ENV.password.length)}" `;
  const db = c.database && /^\d{1,2}$/.test(c.database) ? ` -n ${c.database}` : '';
  const bin = '"$(command -v redis-cli || command -v valkey-cli || command -v keydb-cli)"';
  return `${auth}${bin}${flag('-h', c.host)}${flag('-p', c.port)}${c.user ? ` --user ${sq(c.user)}` : ''}${db}`;
}

const env = (c: DbConnection) => (c.auth === 'password' && c.password ? { VPSHUB_DB_PASSWORD: c.password } : undefined);
const cmd = (c: DbConnection, script: string, extra: Partial<Cmd> = {}): Cmd => ({ script, env: env(c), ...extra });

// Each arg becomes a single-quoted shell word, so redis-cli receives it verbatim.
const call = (c: DbConnection, args: string[]) => `${base(c)} --no-raw ${args.map(sq).join(' ')} 2>&1`;

export const redisAdapter: DatabaseAdapter = {
  id: 'redis',
  label: 'Redis / Valkey',
  kind: 'keyvalue',
  fields: ['host', 'port', 'user', 'password', 'database'],
  defaultPort: 6379,
  authModes: ['none', 'password', 'container-env'],
  queryLanguage: 'redis',
  readOnlyEnforced: 'statement',
  discover: { images: /(^|\/)(redis|redis-stack(-server)?|valkey|keydb|dragonfly)$/, port: 6379, units: ['redis-server', 'redis', 'valkey'], binary: 'redis-cli' },
  containerEnv: ENV,

  ping: (c) => cmd(c, `${base(c)} --raw INFO server 2>&1 | grep -E '^(redis|valkey|dragonfly)_version|NOAUTH|WRONGPASS|ERR|Could not connect'`, { timeoutMs: 15000 }),
  parsePing: (out) => {
    const t = out.trim();
    if (/NOAUTH|WRONGPASS|ERR|Could not connect/.test(t)) throw new Error(t);
    return t.split(':').pop()?.trim() || t;
  },

  listDatabases: (c) => cmd(c, `${base(c)} --raw INFO keyspace 2>&1`),
  parseDatabases: (out) => {
    const dbs = [...out.matchAll(/^db(\d+):keys=(\d+)/gm)].map((m) => m[1]);
    return dbs.length ? dbs : ['0'];
  },

  // Sample of keys (SCAN, never KEYS) with their types.
  listObjects: (c, db) => {
    const cc = { ...c, database: db ?? c.database };
    return cmd(c, `${base(cc)} --raw --scan --count 1000 2>&1 | head -n 500 | while IFS= read -r k; do printf '%s\\t%s\\n' "$(${base(cc)} --raw TYPE "$k")" "$k"; done`, { timeoutMs: 60000 });
  },
  parseObjects: (out) =>
    out.split('\n').filter((l) => l.includes('\t')).map((l) => {
      const i = l.indexOf('\t');
      return { name: l.slice(i + 1), type: l.slice(0, i), rows: null, size: null };
    }),

  // "Preview" a key: dump its value according to type.
  preview: (c, key, db) => {
    const cc = { ...c, database: db ?? c.database };
    const k = sq(key);
    const b = `${base(cc)} --raw`;
    const script = `t=$(${b} TYPE ${k}); echo "TYPE $t"; echo "TTL $(${b} TTL ${k})"; case "$t" in
      string) ${b} GET ${k} ;;
      hash) ${b} HGETALL ${k} ;;
      list) ${b} LRANGE ${k} 0 ${MAX_ROWS - 1} ;;
      set) ${b} SMEMBERS ${k} ;;
      zset) ${b} ZRANGE ${k} 0 ${MAX_ROWS - 1} WITHSCORES ;;
      stream) ${b} XRANGE ${k} - + COUNT 100 ;;
      *) echo "(tipe $t tidak bisa ditampilkan)" ;;
    esac 2>&1`;
    return cmd(c, script, { maxBytes: 5 * 1024 * 1024 });
  },
  parsePreview: (out) => {
    const lines = out.replace(/\n$/, '').split('\n');
    const type = (lines.shift() || '').replace(/^TYPE /, '');
    const ttl = (lines.shift() || '').replace(/^TTL /, '');
    const meta = [['type', type], ['ttl', ttl === '-1' ? 'tidak ada' : `${ttl}s`]];
    if (type === 'hash' || type === 'zset') {
      const rows: string[][] = [];
      for (let i = 0; i + 1 < lines.length; i += 2) rows.push([lines[i], lines[i + 1]]);
      return { columns: type === 'hash' ? ['field', 'value'] : ['member', 'score'], rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS || undefined, meta } as any;
    }
    if (type === 'string') return { columns: ['value'], rows: [[lines.join('\n')]], meta } as any;
    return { columns: ['value'], rows: lines.slice(0, MAX_ROWS).map((l) => [l]), truncated: lines.length > MAX_ROWS || undefined, meta } as any;
  },

  query: (c, text) => {
    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) throw new QueryError('Perintah kosong');
    if (lines.length > 50) throw new QueryError('Maksimal 50 perintah sekaligus');
    const calls = lines.map((l) => {
      const args = tokenize(l);
      checkRedisCommand(args, c.allowWrite);
      return `echo ${sq('> ' + l)}; ${call(c, args)}`;
    });
    return cmd(c, calls.join('; '), { timeoutMs: 60000, maxBytes: 5 * 1024 * 1024 });
  },
  parseQuery: (out) => ({ results: [{ columns: ['output'], rows: out.replace(/\n$/, '').split('\n').slice(0, MAX_ROWS).map((l) => [l]) }] })
};
