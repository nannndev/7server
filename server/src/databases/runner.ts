// Executes an adapter Cmd on a server: directly in the host shell, or inside a container via `docker exec`.
// stdin is piped through unchanged; env vars are exported inside the *target* shell so a container sees them.
import { executeCommand } from '../infra/ssh.js';
import { ServerCredentials } from '../modules/servers/types.js';
import { Cmd, DbConnection } from './types.js';
import { sq, envPrefix, CONTAINER_RE } from './shell.js';
import { badRequest } from '../http/errors.js';

export function wrap(c: DbConnection, cmd: Cmd): string {
  const inner = `${envPrefix(cmd.env)}${cmd.script}`;
  if (c.location.kind === 'host') return `sh -c ${sq(inner)}`;
  const name = c.location.container;
  if (!CONTAINER_RE.test(name)) throw badRequest(`Nama container tidak valid: ${name}`);
  // -i keeps stdin open for queries; no -t so output is not mangled by a TTY.
  return `docker exec -i ${sq(name)} sh -c ${sq(inner)}`;
}

export async function run(server: ServerCredentials, c: DbConnection, cmd: Cmd): Promise<string> {
  const r = await executeCommand(server, wrap(c, cmd), cmd.timeoutMs ?? 30000, { stdin: cmd.stdin ?? '', maxBytes: cmd.maxBytes });
  const out = r.stdout + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '');
  if (r.code === 127 || /: not found$|command not found|No such file or directory.*(mysql|psql|redis-cli|mongosh|sqlite3)/m.test(out)) {
    throw new Error(`Klien database tidak ditemukan di ${c.location.kind === 'container' ? `container ${(c.location as any).container}` : 'server'}.\n${out.trim()}`);
  }
  if (r.truncated) return out + '\n__VPSHUB_TRUNCATED__';
  return out;
}

/** Same as run() but returns raw stdout bytes as a string for dumps (no stderr mixing). */
export async function runDump(server: ServerCredentials, c: DbConnection, cmd: Cmd): Promise<{ stdout: string; stderr: string; code: number }> {
  const r = await executeCommand(server, wrap(c, cmd), cmd.timeoutMs ?? 30000, { stdin: '' });
  return { stdout: r.stdout, stderr: r.stderr, code: r.code };
}
