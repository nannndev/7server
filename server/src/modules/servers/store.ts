import { v4 as uuidv4 } from 'uuid';
import { listDocs, replaceDocs } from '../../infra/db.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { RawServer, SafeServer, ServerCredentials } from './types.js';

// Stored in 7server.db (collection "servers"); credentials are encrypted before they get here.
const readData = (): RawServer[] => listDocs<RawServer>('servers');
const writeData = (data: RawServer[]): void => replaceDocs('servers', data, (s) => s.id);

export function getAllServers(includeCredentials?: false): SafeServer[];
export function getAllServers(includeCredentials: true): ServerCredentials[];
export function getAllServers(includeCredentials = false): (SafeServer | ServerCredentials)[] {
  const servers = readData();
  return servers.map((server) => {
    if (includeCredentials) {
      const creds: ServerCredentials = {
        ...server,
        hasPassword: !!server.encryptedPassword,
        hasPrivateKey: !!server.encryptedPrivateKey,
        password: server.encryptedPassword ? decrypt(server.encryptedPassword) : '',
        privateKey: server.encryptedPrivateKey ? decrypt(server.encryptedPrivateKey) : '',
        passphrase: server.encryptedPassphrase ? decrypt(server.encryptedPassphrase) : ''
      };
      return creds;
    }
    const { encryptedPassword, encryptedPrivateKey, encryptedPassphrase, ...safe } = server;
    const safeServer: SafeServer = {
      ...safe,
      hasPassword: !!encryptedPassword,
      hasPrivateKey: !!encryptedPrivateKey
    };
    return safeServer;
  });
}

export function getServerById(id: string, includeCredentials?: false): SafeServer | null;
export function getServerById(id: string, includeCredentials: true): ServerCredentials | null;
export function getServerById(id: string, includeCredentials = false): SafeServer | ServerCredentials | null {
  if (includeCredentials) {
    const servers = getAllServers(true);
    return servers.find((s) => s.id === id) || null;
  } else {
    const servers = getAllServers(false);
    return servers.find((s) => s.id === id) || null;
  }
}

export function createServer(data: Partial<RawServer> & { password?: string; privateKey?: string; passphrase?: string }): SafeServer {
  const servers = readData();
  const id = uuidv4();

  const newServer: RawServer = {
    id,
    name: data.name || data.host || 'VPS Server',
    host: (data.host || '').trim(),
    port: data.port ? parseInt(String(data.port), 10) : 22,
    username: (data.username || 'root').trim(),
    authType: data.authType || 'password',
    encryptedPassword: data.password ? encrypt(data.password) : null,
    encryptedPrivateKey: data.privateKey ? encrypt(data.privateKey) : null,
    encryptedPassphrase: data.passphrase ? encrypt(data.passphrase) : null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    description: data.description || '',
    status: 'unknown',
    lastChecked: null,
    metrics: null,
    createdAt: new Date().toISOString()
  };

  servers.push(newServer);
  writeData(servers);
  return getServerById(id, false)!;
}

export function updateServer(id: string, data: Partial<RawServer> & { password?: string; privateKey?: string; passphrase?: string }): SafeServer | null {
  const servers = readData();
  const index = servers.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const current = servers[index];
  const updated: RawServer = {
    ...current,
    name: data.name !== undefined ? data.name : current.name,
    host: data.host !== undefined ? data.host.trim() : current.host,
    port: data.port !== undefined ? parseInt(String(data.port), 10) : current.port,
    username: data.username !== undefined ? data.username.trim() : current.username,
    authType: data.authType !== undefined ? data.authType : current.authType,
    tags: data.tags !== undefined ? (Array.isArray(data.tags) ? data.tags : []) : current.tags,
    description: data.description !== undefined ? data.description : current.description,
    status: data.status !== undefined ? data.status : current.status,
    lastChecked: data.lastChecked !== undefined ? data.lastChecked : current.lastChecked,
    metrics: data.metrics !== undefined ? data.metrics : current.metrics
  };

  if (data.password !== undefined && data.password !== '') {
    updated.encryptedPassword = encrypt(data.password);
  }
  if (data.privateKey !== undefined && data.privateKey !== '') {
    updated.encryptedPrivateKey = encrypt(data.privateKey);
  }
  if (data.passphrase !== undefined && data.passphrase !== '') {
    updated.encryptedPassphrase = encrypt(data.passphrase);
  }

  servers[index] = updated;
  writeData(servers);
  return getServerById(id, false);
}

export function deleteServer(id: string): boolean {
  const servers = readData();
  const filtered = servers.filter((s) => s.id !== id);
  if (filtered.length === servers.length) return false;
  writeData(filtered);
  return true;
}


// Export keeps credentials encrypted; they only decrypt with the same data/secret.key.
export function exportServers(): RawServer[] {
  return readData();
}

export function importServers(items: RawServer[]): number {
  const servers = readData();
  let count = 0;
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.host !== 'string') continue;
    const idx = servers.findIndex((s) => s.id === item.id);
    if (idx === -1) servers.push(item); else servers[idx] = item;
    count++;
  }
  writeData(servers);
  return count;
}
