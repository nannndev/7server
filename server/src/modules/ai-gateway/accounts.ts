// Logged-in subscription accounts (multi-account per OAuth provider with ordered rotation).
// Tokens are encrypted at rest with the same key as SSH credentials, refreshed lazily before use,
// and never returned to the browser.
import crypto from 'crypto';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { listDocs, replaceDocs } from '../../infra/db.js';
import { OAUTH_PROVIDER_IDS, needsRefresh, refreshCredential, type OAuthCredential, type OAuthProviderId } from './oauth.js';

interface StoredAccount {
  id: string;
  provider: OAuthProviderId;
  label?: string;
  email?: string;
  connectedAt: string;
  refreshedAt?: string;
  lastError?: string;
  /** encrypt(JSON.stringify(OAuthCredential)) */
  secret: string;
}

export interface PublicAccount {
  id: string;
  provider: OAuthProviderId;
  label?: string;
  email?: string;
  connectedAt: string;
  refreshedAt?: string;
  expiresAt?: number;
  lastError?: string;
}

// Multiple documents per provider in 7server.db (collection ai_accounts), ordered by `ord`.
const read = (): StoredAccount[] => {
  const seen = new Set<string>();
  return listDocs<StoredAccount>('ai_accounts').map((a, idx) => {
    let id = a.id || a.provider;
    if (seen.has(id)) id = `${a.provider}:${idx}`;
    seen.add(id);
    return { ...a, id };
  });
};

const write = (all: StoredAccount[]) =>
  replaceDocs('ai_accounts', all.filter(Boolean), (a) => a.id || a.provider);

const open = (a: StoredAccount): OAuthCredential => JSON.parse(decrypt(a.secret));

const toPublic = (a: StoredAccount): PublicAccount => {
  let expiresAt: number | undefined;
  try { expiresAt = open(a).expiresAt; } catch { /* undecryptable: shown as error */ }
  return {
    id: a.id,
    provider: a.provider,
    label: a.label,
    email: a.email,
    connectedAt: a.connectedAt,
    refreshedAt: a.refreshedAt,
    expiresAt,
    lastError: a.lastError
  };
};

export function listAccounts(): PublicAccount[] {
  const all = read();
  return OAUTH_PROVIDER_IDS.flatMap((p) => all.filter((a) => a.provider === p).map(toPublic));
}

export function listAccountsFor(provider: OAuthProviderId): PublicAccount[] {
  return read().filter((a) => a.provider === provider).map(toPublic);
}

export const isConnected = (p: OAuthProviderId) => read().some((a) => a.provider === p);

export function saveAccount(provider: OAuthProviderId, cred: OAuthCredential, accountId?: string, label?: string): PublicAccount {
  const all = read();
  const sameProvider = all.filter((a) => a.provider === provider);
  const existingIdx = all.findIndex((a) => {
    if (a.provider !== provider) return false;
    if (accountId) return a.id === accountId;
    if (cred.email && a.email && a.email.toLowerCase() === cred.email.toLowerCase()) return true;
    try {
      const prev = open(a);
      if (prev.accessToken && prev.accessToken === cred.accessToken) return true;
    } catch { /* ignore */ }
    return false;
  });

  const secret = encrypt(JSON.stringify(cred));
  const now = new Date().toISOString();

  if (existingIdx >= 0) {
    const prev = all[existingIdx]!;
    const updated: StoredAccount = {
      ...prev,
      email: cred.email || prev.email,
      label: label !== undefined ? label : prev.label,
      refreshedAt: now,
      lastError: undefined,
      secret
    };
    all[existingIdx] = updated;
    write(all);
    return toPublic(updated);
  }

  // First account of a provider uses `provider` as id for backward-compatibility; subsequent accounts get `${provider}:${shortUuid}`
  const id = accountId || (sameProvider.length === 0 && !all.some((a) => a.id === provider)
    ? provider
    : `${provider}:${crypto.randomUUID().slice(0, 8)}`);

  const created: StoredAccount = {
    id,
    provider,
    label,
    email: cred.email,
    connectedAt: now,
    secret
  };
  all.push(created);
  write(all);
  return toPublic(created);
}

export function removeAccount(provider: OAuthProviderId, accountId?: string): boolean {
  const all = read();
  const next = accountId
    ? all.filter((a) => !(a.provider === provider && a.id === accountId))
    : all.filter((a) => a.provider !== provider);
  if (next.length === all.length) return false;
  write(next);
  return true;
}

/** Reorders accounts of a single provider according to `accountIds` (1st = highest priority in rotation). */
export function reorderAccounts(provider: OAuthProviderId, accountIds: string[]): PublicAccount[] {
  const all = read();
  const provAccounts = all.filter((a) => a.provider === provider);
  if (provAccounts.length <= 1) return listAccounts();

  const byId = new Map(provAccounts.map((a) => [a.id, a]));
  const ordered: StoredAccount[] = [];
  for (const id of accountIds) {
    const found = byId.get(id);
    if (found) {
      ordered.push(found);
      byId.delete(id);
    }
  }
  for (const rest of byId.values()) ordered.push(rest);

  // Replace the provider's accounts in `all` with `ordered`
  const next: StoredAccount[] = [];
  let inserted = false;
  for (const a of all) {
    if (a.provider === provider) {
      if (!inserted) {
        next.push(...ordered);
        inserted = true;
      }
    } else {
      next.push(a);
    }
  }
  if (!inserted) next.push(...ordered);
  write(next);
  return listAccounts();
}

// One refresh per account at a time: parallel requests share it. Critical for Codex, whose refresh
// tokens rotate on use — two concurrent refreshes would revoke the session.
const inflight = new Map<string, Promise<OAuthCredential>>();

/** Valid credential for a provider (or specific accountId), refreshing it first if it is about to expire. */
export async function getCredential(provider: OAuthProviderId, accountId?: string): Promise<OAuthCredential> {
  const all = read();
  const a = accountId
    ? all.find((x) => x.provider === provider && x.id === accountId)
    : all.find((x) => x.provider === provider);
  if (!a) throw new Error(`Akun ${provider} belum login di AI Gateway`);
  const cred = open(a);
  if (!needsRefresh(provider, cred)) return cred;

  const targetId = a.id;
  let p = inflight.get(targetId);
  if (!p) {
    p = refreshCredential(provider, cred)
      .then((next) => {
        const current = read();
        const idx = current.findIndex((x) => x.id === targetId);
        if (idx >= 0) {
          current[idx] = {
            ...current[idx]!,
            email: next.email || current[idx]!.email,
            secret: encrypt(JSON.stringify(next)),
            refreshedAt: new Date().toISOString(),
            lastError: undefined
          };
          write(current);
        }
        return next;
      })
      .catch((err) => {
        const current = read();
        const idx = current.findIndex((x) => x.id === targetId);
        if (idx >= 0) {
          current[idx]!.lastError = err.message;
          write(current);
        }
        throw err;
      })
      .finally(() => inflight.delete(targetId));
    inflight.set(targetId, p);
  }
  return p;
}

/** After an upstream 401 the stored token is dead even if not "expired": force a refresh next time. */
export function markExpired(provider: OAuthProviderId, accountId?: string) {
  const all = read();
  const idx = accountId
    ? all.findIndex((x) => x.provider === provider && x.id === accountId)
    : all.findIndex((x) => x.provider === provider);
  if (idx < 0) return;
  const a = all[idx]!;
  const cred = open(a);
  all[idx] = { ...a, secret: encrypt(JSON.stringify({ ...cred, expiresAt: 0, apiTokenExpiresAt: 0 })) };
  write(all);
}
