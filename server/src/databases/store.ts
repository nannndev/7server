// Saved database connections (7server.db, collection db_connections). Passwords are encrypted at rest and never returned to the UI.
import { listDocs, replaceDocs } from '../infra/db.js';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, decrypt } from '../infra/crypto.js';
import { getAdapter } from './registry.js';
import { DbConnection } from './types.js';
import { CONTAINER_RE } from './shell.js';
import { badRequest } from '../http/errors.js';

type Stored = Omit<DbConnection, 'password'> & { encryptedPassword?: string | null };

const read = (): Stored[] => listDocs<Stored>('db_connections');
const write = (list: Stored[]) => replaceDocs('db_connections', list, (c) => c.id);

export type PublicConnection = Omit<Stored, 'encryptedPassword'> & { hasPassword: boolean };

const toPublic = ({ encryptedPassword, ...rest }: Stored): PublicConnection => ({ ...rest, hasPassword: !!encryptedPassword });

export const listConnections = (serverId?: string) => read().filter((c) => !serverId || c.serverId === serverId).map(toPublic);

export function getConnection(id: string): DbConnection | null {
  const s = read().find((c) => c.id === id);
  if (!s) return null;
  const { encryptedPassword, ...rest } = s;
  return { ...rest, password: encryptedPassword ? decrypt(encryptedPassword) : undefined };
}

/** Validates user input into a connection (shared by create and update). */
function normalize(input: any, prev?: Stored): Stored {
  const adapter = getAdapter(String(input.engine ?? prev?.engine));
  const location =
    input.location?.kind === 'container'
      ? { kind: 'container' as const, container: String(input.location.container || '') }
      : { kind: 'host' as const };
  if (location.kind === 'container' && !CONTAINER_RE.test(location.container)) throw badRequest('Nama container tidak valid');
  const auth = adapter.authModes.includes(input.auth) ? input.auth : adapter.authModes[0];
  const port = input.port === '' || input.port == null ? undefined : Number(input.port);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw badRequest('Port tidak valid');
  const str = (v: unknown, max = 255) => (v == null || v === '' ? undefined : String(v).slice(0, max));
  const host = str(input.host);
  if (host && !/^[A-Za-z0-9_.:\-\[\]]+$/.test(host)) throw badRequest('Host tidak valid');

  let encryptedPassword = prev?.encryptedPassword ?? null;
  if (input.password === null) encryptedPassword = null;
  else if (typeof input.password === 'string' && input.password !== '') encryptedPassword = encrypt(input.password);

  return {
    id: prev?.id ?? uuidv4(),
    serverId: String(input.serverId ?? prev?.serverId),
    name: str(input.name, 100) || prev?.name || adapter.label,
    engine: adapter.id,
    location,
    host,
    port,
    user: str(input.user),
    database: str(input.database, 1024),
    auth,
    allowWrite: !!input.allowWrite,
    discovered: !!(input.discovered ?? prev?.discovered),
    encryptedPassword
  };
}

export function createConnection(input: any): PublicConnection {
  const list = read();
  const c = normalize(input);
  list.push(c);
  write(list);
  return toPublic(c);
}

export function updateConnection(id: string, input: any): PublicConnection | null {
  const list = read();
  const i = list.findIndex((c) => c.id === id);
  if (i === -1) return null;
  list[i] = normalize({ ...list[i], ...input, engine: list[i].engine, serverId: list[i].serverId }, list[i]);
  write(list);
  return toPublic(list[i]);
}

export function deleteConnection(id: string): boolean {
  const list = read();
  const next = list.filter((c) => c.id !== id);
  if (next.length === list.length) return false;
  write(next);
  return true;
}
