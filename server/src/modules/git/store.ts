import crypto from 'crypto';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { listDocs, getDoc, putDoc, deleteDoc, getKv, setKv } from '../../infra/db.js';
import type { GitIntegration, SafeGitIntegration, GitOAuthConfig } from './types.js';

const COLLECTION = 'git_integrations';
const OAUTH_CONFIG_KEY = 'git_oauth_config';

export function getOAuthConfig(): GitOAuthConfig {
  const fromKv = getKv<GitOAuthConfig>(OAUTH_CONFIG_KEY, {});
  return {
    githubClientId: process.env.GITHUB_CLIENT_ID || fromKv.githubClientId || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || fromKv.githubClientSecret || ''
  };
}

export function saveOAuthConfig(cfg: GitOAuthConfig) {
  const current = getKv<GitOAuthConfig>(OAUTH_CONFIG_KEY, {});
  setKv(OAUTH_CONFIG_KEY, {
    ...current,
    ...cfg
  });
}

export function toSafeIntegration(item: GitIntegration): SafeGitIntegration {
  return {
    id: item.id,
    provider: item.provider,
    account_id: item.account_id,
    username: item.username,
    display_name: item.display_name,
    avatar_url: item.avatar_url,
    scopes: item.scopes || [],
    has_token: Boolean(item.access_token),
    created_at: item.created_at,
    updated_at: item.updated_at
  };
}

export function listIntegrations(): SafeGitIntegration[] {
  const all = listDocs<GitIntegration>(COLLECTION);
  return all.map(toSafeIntegration);
}

export function getRawIntegration(id: string): GitIntegration | null {
  return getDoc<GitIntegration>(COLLECTION, id);
}

export function getDecryptedAccessToken(integration: GitIntegration): string {
  if (!integration.access_token) return '';
  return decrypt(integration.access_token);
}

export function getActiveIntegration(provider: GitIntegration['provider'] = 'github', specificId?: string): GitIntegration | null {
  if (specificId) {
    const found = getRawIntegration(specificId);
    if (found && found.provider === provider) return found;
  }
  const all = listDocs<GitIntegration>(COLLECTION);
  return all.find((i) => i.provider === provider) || null;
}

export function saveIntegration(params: {
  provider: GitIntegration['provider'];
  account_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  scopes: string[];
  access_token: string;
  refresh_token?: string | null;
}): SafeGitIntegration {
  const now = new Date().toISOString();
  const id = `git_int_${params.provider}_${params.account_id}`;
  const existing = getRawIntegration(id);

  const doc: GitIntegration = {
    id,
    provider: params.provider,
    account_id: params.account_id,
    username: params.username,
    display_name: params.display_name,
    avatar_url: params.avatar_url,
    scopes: params.scopes,
    access_token: encrypt(params.access_token),
    refresh_token: params.refresh_token ? encrypt(params.refresh_token) : null,
    created_at: existing ? existing.created_at : now,
    updated_at: now
  };

  putDoc(COLLECTION, id, doc);
  return toSafeIntegration(doc);
}

export function deleteIntegration(id: string): boolean {
  return deleteDoc(COLLECTION, id);
}

