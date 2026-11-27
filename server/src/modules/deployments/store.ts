import crypto from 'node:crypto';
import { getKv, setKv } from '../../infra/db.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import type { DeploySpec } from './types.js';

const CONFIGS_KEY = 'deploy_configs';
const HISTORY_KEY = 'deploy_history';
const MAX_HISTORY_TOTAL = 200;
const MAX_LOG_CHARS = 12_000;

export interface SavedDeployConfig {
  id: string; // `${serverId}:${appName}`
  serverId: string;
  appName: string;
  spec: DeploySpec;
  webhookSecret: string;
  autoDeploy: boolean;
  lastDeployAt?: string;
  lastCommit?: string;
  lastStatus?: 'success' | 'failed';
  updatedAt: string;
}

export interface DeployHistoryRecord {
  id: string;
  serverId: string;
  appName: string;
  branch: string;
  commit?: string;
  trigger: 'manual' | 'redeploy' | 'rollback' | 'webhook';
  triggeredBy?: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  logSnippet?: string;
}

function readConfigs(): SavedDeployConfig[] {
  try {
    return getKv<SavedDeployConfig[]>(CONFIGS_KEY, []);
  } catch {
    return [];
  }
}

function writeConfigs(list: SavedDeployConfig[]) {
  setKv(CONFIGS_KEY, list);
}

function encryptSpecEnv(spec: DeploySpec): DeploySpec {
  return {
    ...spec,
    commitSha: undefined,
    env: (spec.env || []).map((e) => ({
      key: e.key,
      value: e.value ? encrypt(e.value) : ''
    }))
  };
}

function decryptSpecEnv(spec: DeploySpec): DeploySpec {
  return {
    ...spec,
    env: (spec.env || []).map((e) => ({
      key: e.key,
      value: e.value ? decrypt(e.value) : ''
    }))
  };
}

export function saveDeployConfig(
  serverId: string,
  spec: DeploySpec,
  patch: Partial<Pick<SavedDeployConfig, 'autoDeploy' | 'lastDeployAt' | 'lastCommit' | 'lastStatus'>> & { regenerateWebhook?: boolean } = {}
): SavedDeployConfig {
  const list = readConfigs();
  const id = `${serverId}:${spec.appName}`;
  const idx = list.findIndex((c) => c.id === id);
  const existing = idx >= 0 ? list[idx] : undefined;

  const next: SavedDeployConfig = {
    id,
    serverId,
    appName: spec.appName,
    spec: encryptSpecEnv(spec),
    webhookSecret:
      patch.regenerateWebhook || !existing?.webhookSecret
        ? crypto.randomBytes(24).toString('hex')
        : existing.webhookSecret,
    autoDeploy: patch.autoDeploy !== undefined ? patch.autoDeploy : spec.autoDeploy !== undefined ? spec.autoDeploy : existing?.autoDeploy ?? false,
    lastDeployAt: patch.lastDeployAt ?? existing?.lastDeployAt,
    lastCommit: patch.lastCommit ?? existing?.lastCommit,
    lastStatus: patch.lastStatus ?? existing?.lastStatus,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) list[idx] = next;
  else list.unshift(next);
  writeConfigs(list);
  return { ...next, spec: decryptSpecEnv(next.spec) };
}

export function getDeployConfig(serverId: string, appName: string): SavedDeployConfig | null {
  const id = `${serverId}:${appName}`;
  const found = readConfigs().find((c) => c.id === id);
  if (!found) return null;
  return { ...found, spec: decryptSpecEnv(found.spec) };
}

export function listDeployConfigs(serverId: string): Omit<SavedDeployConfig, 'webhookSecret'>[] {
  return readConfigs()
    .filter((c) => c.serverId === serverId)
    .map(({ webhookSecret: _secret, spec, ...rest }) => ({
      ...rest,
      spec: decryptSpecEnv(spec)
    }));
}

export function deleteDeployConfig(serverId: string, appName: string) {
  const id = `${serverId}:${appName}`;
  writeConfigs(readConfigs().filter((c) => c.id !== id));
}

export function updateDeployMeta(
  serverId: string,
  appName: string,
  patch: Partial<Pick<SavedDeployConfig, 'autoDeploy' | 'lastDeployAt' | 'lastCommit' | 'lastStatus'>> & { regenerateWebhook?: boolean }
): SavedDeployConfig | null {
  const existing = getDeployConfig(serverId, appName);
  if (!existing) return null;
  return saveDeployConfig(serverId, existing.spec, patch);
}

// ----------------- DEPLOY HISTORY ----------------- //

function readHistory(): DeployHistoryRecord[] {
  try {
    return getKv<DeployHistoryRecord[]>(HISTORY_KEY, []);
  } catch {
    return [];
  }
}

function writeHistory(list: DeployHistoryRecord[]) {
  setKv(HISTORY_KEY, list.slice(0, MAX_HISTORY_TOTAL));
}

export function createDeployRecord(input: {
  serverId: string;
  appName: string;
  branch: string;
  commit?: string;
  trigger: DeployHistoryRecord['trigger'];
  triggeredBy?: string;
}): DeployHistoryRecord {
  const list = readHistory();
  const rec: DeployHistoryRecord = {
    id: crypto.randomUUID(),
    serverId: input.serverId,
    appName: input.appName,
    branch: input.branch,
    commit: input.commit,
    trigger: input.trigger,
    triggeredBy: input.triggeredBy,
    status: 'running',
    startedAt: new Date().toISOString()
  };
  list.unshift(rec);
  writeHistory(list);
  return rec;
}

export function finishDeployRecord(
  id: string,
  outcome: { status: 'success' | 'failed'; commit?: string; log?: string }
): DeployHistoryRecord | null {
  const list = readHistory();
  const rec = list.find((r) => r.id === id);
  if (!rec) return null;
  const finishedAt = new Date().toISOString();
  rec.status = outcome.status;
  rec.finishedAt = finishedAt;
  rec.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(rec.startedAt));
  if (outcome.commit) rec.commit = outcome.commit;
  if (outcome.log) {
    rec.logSnippet = outcome.log.length > MAX_LOG_CHARS ? outcome.log.slice(-MAX_LOG_CHARS) : outcome.log;
  }
  writeHistory(list);
  return rec;
}

export function listDeployHistory(serverId: string, appName?: string, limit = 30): DeployHistoryRecord[] {
  return readHistory()
    .filter((r) => r.serverId === serverId && (!appName || r.appName === appName))
    .slice(0, limit);
}

export function extractCommitFromOutput(output: string): string | undefined {
  const match = /^Commit:\s*([0-9a-fA-F]{7,40})\b/m.exec(output);
  return match ? match[1] : undefined;
}
