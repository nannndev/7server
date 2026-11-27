import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ServerCredentials } from '../servers/types.js';
import { getServerById } from '../servers/store.js';
import { executeSoftwareScript } from '../software/service.js';
import { getActiveIntegration, getDecryptedAccessToken } from '../git/store.js';
import { buildDeployScript } from './deploy.js';
import type { DeploySpec } from './types.js';
import {
  createDeployRecord,
  extractCommitFromOutput,
  finishDeployRecord,
  getDeployConfig,
  saveDeployConfig,
  updateDeployMeta,
  type DeployHistoryRecord
} from './store.js';

export interface TrackedDeployOpts {
  trigger: DeployHistoryRecord['trigger'];
  triggeredBy?: string;
  preScript?: string;
  sudoPassword?: string;
  onChunk?: (chunk: string, isStderr: boolean) => void;
  persistSpec?: boolean;
  signal?: AbortSignal;
}

export async function executeTrackedDeploy(
  server: ServerCredentials,
  spec: DeploySpec,
  opts: TrackedDeployOpts
) {
  if (opts.persistSpec !== false) {
    saveDeployConfig(server.id, spec);
  }

  const integration = getActiveIntegration('github');
  const token = integration ? getDecryptedAccessToken(integration) : undefined;
  const pre = opts.preScript ? `${opts.preScript}\n` : '';
  const script = pre + buildDeployScript(spec, token);

  const rec = createDeployRecord({
    serverId: server.id,
    appName: spec.appName,
    branch: spec.branch,
    commit: spec.commitSha,
    trigger: opts.trigger,
    triggeredBy: opts.triggeredBy
  });

  let accLog = '';
  try {
    const result = await executeSoftwareScript(
      server,
      script,
      opts.sudoPassword,
      (chunk, isErr) => {
        accLog += chunk;
        if (accLog.length > 20_000) accLog = accLog.slice(-15_000);
        opts.onChunk?.(chunk, isErr);
      },
      30 * 60 * 1000,
      opts.signal
    );
    const fullLog = result.output || accLog;
    const commit = extractCommitFromOutput(fullLog) || spec.commitSha;
    const status = result.ok ? 'success' : 'failed';
    finishDeployRecord(rec.id, { status, commit, log: fullLog });
    updateDeployMeta(server.id, spec.appName, {
      lastDeployAt: new Date().toISOString(),
      lastCommit: commit,
      lastStatus: status
    });
    return result;
  } catch (err: any) {
    const errLog = `${accLog}\n${err?.message || 'Deploy failed'}`;
    finishDeployRecord(rec.id, { status: 'failed', log: errLog });
    updateDeployMeta(server.id, spec.appName, {
      lastDeployAt: new Date().toISOString(),
      lastStatus: 'failed'
    });
    throw err;
  }
}

export async function runStreamTrackedDeploy(
  server: ServerCredentials,
  req: Request,
  res: Response,
  spec: DeploySpec,
  opts: Omit<TrackedDeployOpts, 'sudoPassword' | 'onChunk'>
) {
  const isStream = req.query.stream === '1' || req.headers.accept?.includes('text/event-stream');
  const sudoPassword = req.body?.sudoPassword ? String(req.body.sudoPassword) : undefined;

  if (!isStream) {
    return executeTrackedDeploy(server, spec, { ...opts, sudoPassword });
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  const send = (type: string, payload: any) => {
    if (res.writableEnded || ac.signal.aborted) return;
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
    if (typeof (res as any).flush === 'function') (res as any).flush();
  };
  try {
    send(
      'done',
      await executeTrackedDeploy(server, spec, {
        ...opts,
        sudoPassword,
        signal: ac.signal,
        onChunk: (chunk) => send('chunk', { chunk })
      })
    );
  } catch (err: any) {
    if (!ac.signal.aborted) {
      send('error', { error: err?.message || 'Execution failed' });
    }
  }
  if (!res.writableEnded) res.end();
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer | string,
  signatureHeader?: string,
  tokenHeaderOrQuery?: string
): boolean {
  if (!secret) return false;

  // 1. GitHub HMAC-SHA256: x-hub-signature-256: sha256=...
  if (signatureHeader && signatureHeader.startsWith('sha256=')) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(signatureHeader);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }

  // 2. GitLab token (x-gitlab-token) or query / payload token (?token=...)
  const tokenCandidate = tokenHeaderOrQuery || (!signatureHeader?.startsWith('sha256=') ? signatureHeader : undefined);
  if (tokenCandidate) {
    const a = Buffer.from(tokenCandidate);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return true;
    }
  }

  return false;
}

export function handleDeployWebhook(
  serverId: string,
  appName: string,
  rawBody: Buffer | string,
  body: any,
  signatureHeader?: string,
  gitlabTokenOrQueryToken?: string
): { status: number; payload: any } {
  const cfg = getDeployConfig(serverId, appName);
  if (!cfg) return { status: 404, payload: { error: 'Deploy configuration not found' } };

  if (!verifyWebhookSignature(cfg.webhookSecret, rawBody, signatureHeader, gitlabTokenOrQueryToken)) {
    return { status: 401, payload: { error: 'Invalid webhook signature' } };
  }

  if (!cfg.autoDeploy) {
    return { status: 200, payload: { ignored: true, reason: 'Auto-deploy is disabled for this app' } };
  }

  const expectedRef = `refs/heads/${cfg.spec.branch}`;
  const ref = String(body?.ref || '');
  if (ref && ref !== expectedRef) {
    return { status: 200, payload: { ignored: true, reason: `Push was to ${ref}, watching ${expectedRef}` } };
  }

  const server = getServerById(serverId, true);
  if (!server) return { status: 404, payload: { error: 'Server not found' } };

  const commitSha = typeof body?.after === 'string' && /^[0-9a-fA-F]{7,40}$/.test(body.after) ? body.after : undefined;
  const sender = body?.pusher?.name || body?.sender?.login || 'github-webhook';

  // Run in background so GitHub webhook responds within timeout
  executeTrackedDeploy(
    server,
    { ...cfg.spec, ...(commitSha ? { commitSha } : {}) },
    { trigger: 'webhook', triggeredBy: String(sender), persistSpec: false }
  ).catch((err) => {
    console.warn(`[deploy-webhook] ${serverId}/${appName} failed:`, err?.message);
  });

  return { status: 202, payload: { accepted: true, appName, branch: cfg.spec.branch } };
}
