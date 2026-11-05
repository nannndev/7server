// Logged-in subscription accounts (one per OAuth provider). Tokens are encrypted at rest with the same
// key as SSH credentials, refreshed lazily before use, and never returned to the browser.
import fs from 'fs';
import { dataFile } from '../../config.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { OAUTH_PROVIDER_IDS, needsRefresh, refreshCredential, type OAuthCredential, type OAuthProviderId } from './oauth.js';

const FILE = dataFile('ai-gateway-accounts.json');

interface StoredAccount {
  provider: OAuthProviderId;
  email?: string;
  connectedAt: string;
  refreshedAt?: string;
  lastError?: string;
  /** encrypt(JSON.stringify(OAuthCredential)) */
  secret: string;
}

export interface PublicAccount {
  provider: OAuthProviderId;
  email?: string;
  connectedAt: string;
  refreshedAt?: string;
  expiresAt?: number;
  lastError?: string;
}

const read = (): Partial<Record<OAuthProviderId, StoredAccount>> => {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
};
const write = (all: Partial<Record<OAuthProviderId, StoredAccount>>) => {
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(`${FILE}.tmp`, FILE);
};
const open = (a: StoredAccount): OAuthCredential => JSON.parse(decrypt(a.secret));

export function listAccounts(): PublicAccount[] {
  const all = read();
  return OAUTH_PROVIDER_IDS.filter((p) => all[p]).map((p) => {
    const a = all[p]!;
    let expiresAt: number | undefined;
    try { expiresAt = open(a).expiresAt; } catch { /* undecryptable: shown as error */ }
    return { provider: p, email: a.email, connectedAt: a.connectedAt, refreshedAt: a.refreshedAt, expiresAt, lastError: a.lastError };
  });
}

export const isConnected = (p: OAuthProviderId) => !!read()[p];

export function saveAccount(provider: OAuthProviderId, cred: OAuthCredential) {
  const all = read();
  all[provider] = { provider, email: cred.email, connectedAt: new Date().toISOString(), secret: encrypt(JSON.stringify(cred)) };
  write(all);
}

export function removeAccount(provider: OAuthProviderId): boolean {
  const all = read();
  if (!all[provider]) return false;
  delete all[provider];
  write(all);
  return true;
}

// One refresh per provider at a time: parallel requests share it. Critical for Codex, whose refresh
// tokens rotate on use — two concurrent refreshes would revoke the session.
const inflight = new Map<OAuthProviderId, Promise<OAuthCredential>>();

/** Valid credential for a provider, refreshing it first if it is about to expire. */
export async function getCredential(provider: OAuthProviderId): Promise<OAuthCredential> {
  const a = read()[provider];
  if (!a) throw new Error(`Akun ${provider} belum login di AI Gateway`);
  const cred = open(a);
  if (!needsRefresh(provider, cred)) return cred;

  let p = inflight.get(provider);
  if (!p) {
    p = refreshCredential(provider, cred)
      .then((next) => {
        const all = read();
        if (all[provider]) {
          all[provider] = { ...all[provider]!, secret: encrypt(JSON.stringify(next)), refreshedAt: new Date().toISOString(), lastError: undefined };
          write(all);
        }
        return next;
      })
      .catch((err) => {
        const all = read();
        if (all[provider]) { all[provider]!.lastError = err.message; write(all); }
        throw err;
      })
      .finally(() => inflight.delete(provider));
    inflight.set(provider, p);
  }
  return p;
}

/** After an upstream 401 the stored token is dead even if not "expired": force a refresh next time. */
export function markExpired(provider: OAuthProviderId) {
  const all = read();
  const a = all[provider];
  if (!a) return;
  const cred = open(a);
  all[provider] = { ...a, secret: encrypt(JSON.stringify({ ...cred, expiresAt: 0, apiTokenExpiresAt: 0 })) };
  write(all);
}
