import { getKv, setKv } from '../../infra/db.js';
import { encrypt, decrypt } from '../../infra/crypto.js';

const CF_KEY = 'cf_integration';

export interface CloudflareZoneSummary {
  id: string;
  name: string;
  status: string;
}

export interface CloudflareIntegration {
  tokenEncrypted: string;
  accountId?: string;
  accountName?: string;
  zones: CloudflareZoneSummary[];
  verifiedAt: string;
}

export interface SafeCloudflareIntegration {
  connected: boolean;
  accountId?: string;
  accountName?: string;
  zones: CloudflareZoneSummary[];
  verifiedAt?: string;
}

export function getCloudflareIntegration(): CloudflareIntegration | null {
  try {
    const raw = getKv<CloudflareIntegration | null>(CF_KEY, null);
    if (!raw || !raw.tokenEncrypted) return null;
    return raw;
  } catch {
    return null;
  }
}

export function getSafeCloudflareIntegration(): SafeCloudflareIntegration {
  const data = getCloudflareIntegration();
  if (!data) return { connected: false, zones: [] };
  return {
    connected: true,
    accountId: data.accountId,
    accountName: data.accountName,
    zones: data.zones || [],
    verifiedAt: data.verifiedAt
  };
}

export function getCloudflareToken(): string | null {
  const data = getCloudflareIntegration();
  if (!data?.tokenEncrypted) return null;
  try {
    return decrypt(data.tokenEncrypted);
  } catch {
    return null;
  }
}

export function saveCloudflareIntegration(input: {
  token: string;
  accountId?: string;
  accountName?: string;
  zones: CloudflareZoneSummary[];
}): SafeCloudflareIntegration {
  const rec: CloudflareIntegration = {
    tokenEncrypted: encrypt(input.token.trim()),
    accountId: input.accountId,
    accountName: input.accountName,
    zones: input.zones,
    verifiedAt: new Date().toISOString()
  };
  setKv(CF_KEY, rec);
  return getSafeCloudflareIntegration();
}

export function updateCloudflareZones(zones: CloudflareZoneSummary[], accountId?: string, accountName?: string): SafeCloudflareIntegration {
  const existing = getCloudflareIntegration();
  if (!existing) return { connected: false, zones: [] };
  const next: CloudflareIntegration = {
    ...existing,
    ...(accountId ? { accountId } : {}),
    ...(accountName ? { accountName } : {}),
    zones,
    verifiedAt: new Date().toISOString()
  };
  setKv(CF_KEY, next);
  return getSafeCloudflareIntegration();
}

export function deleteCloudflareIntegration(): void {
  setKv(CF_KEY, null);
}
