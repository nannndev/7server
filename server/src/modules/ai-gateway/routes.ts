import { Router, type Request, type Response } from 'express';
import {
  handleAnthropicMessages,
  handleOpenAiChatCompletions,
  handleListModels
} from './service.js';
import { handleCopilotChat } from './copilot.js';
import { verifyProviderConnection } from './verifier.js';
import { internalOnly } from './internalOnly.js';
import { startLogin, completeLogin, pollDeviceLogin, isOAuthProvider } from './oauth.js';
import { listAccounts, saveAccount, removeAccount, reorderAccounts, getCredential } from './accounts.js';
import { accountModels, ALIAS_OF, MODELS, resolveModel } from './subscription.js';
import { usageOf } from './usage.js';
import { listenForCallback } from './callbackServer.js';
import {
  getAllKeys,
  publicKey,
  createVirtualKey,
  deleteVirtualKey,
  toggleVirtualKey,
  getClientConfig,
  saveGatewayConfig,
  getInternalConfig,
  connectProvider,
  disconnectProvider,
  reorderProviderKeys,
  getUsageLogs,
  clearUsageLogs,
  getGatewayStats
} from './store.js';

import { need } from '../../http/auth.js';

// ------------------- PUBLIC AI GATEWAY PROXY ROUTES -------------------
// Mounted at /api/ai (Before requireAuth, protected by Virtual API Key)
export const aiGatewayPublicRoutes = Router();
// Only callers inside the 7Server system (loopback, private nets, registered VPS hosts) may use the proxy.
aiGatewayPublicRoutes.use(internalOnly);

aiGatewayPublicRoutes.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: '7Server AI Gateway', timestamp: new Date().toISOString() });
});

aiGatewayPublicRoutes.post(
  ['/v1/messages', '/messages', '/v1/v1/messages', '/v1/messages/count_tokens', '/messages/count_tokens'],
  (req: Request, res: Response) => {
    handleAnthropicMessages(req, res);
  }
);

aiGatewayPublicRoutes.post(
  ['/v1/chat/completions', '/chat/completions', '/v1/v1/chat/completions'],
  (req: Request, res: Response) => {
    handleOpenAiChatCompletions(req, res);
  }
);

aiGatewayPublicRoutes.get(
  ['/v1/models', '/models', '/v1/v1/models'],
  (req: Request, res: Response) => {
    handleListModels(req, res).catch((e) => res.status(500).json({ error: { message: e.message } }));
  }
);

// ------------------- MANAGEMENT ROUTES -------------------
// Mounted at /api (After requireAuth, protected by 7Server Session/Token)
export const aiGatewayManagementRoutes = Router();

// In-Dashboard AI Copilot Chat Endpoint (SSE Streaming) - accessible by all users with copilot.chat
aiGatewayManagementRoutes.post('/ai-copilot/chat', need('copilot.chat'), (req: Request, res: Response) => {
  handleCopilotChat(req, res);
});

// All routes below require gateway.manage permission
aiGatewayManagementRoutes.use('/ai-gateway', need('gateway.manage'));

aiGatewayManagementRoutes.get('/ai-gateway/keys', (req: Request, res: Response) => {
  const keys = getAllKeys().map(publicKey);
  res.json({ keys });
});

aiGatewayManagementRoutes.post('/ai-gateway/keys', (req: Request, res: Response) => {
  const { name, allowedProviders } = req.body || {};
  const newKey = createVirtualKey(String(name || ''), allowedProviders);
  res.json({ key: newKey });
});

aiGatewayManagementRoutes.delete('/ai-gateway/keys/:id', (req: Request, res: Response) => {
  const success = deleteVirtualKey(String(req.params.id));
  if (!success) {
    res.status(404).json({ error: 'Virtual key not found' });
    return;
  }
  res.json({ success: true });
});

aiGatewayManagementRoutes.patch('/ai-gateway/keys/:id/toggle', (req: Request, res: Response) => {
  const { enabled } = req.body || {};
  const updated = toggleVirtualKey(String(req.params.id), typeof enabled === 'boolean' ? enabled : undefined);
  if (!updated) {
    res.status(404).json({ error: 'Virtual key not found' });
    return;
  }
  res.json({ key: publicKey(updated) });
});

aiGatewayManagementRoutes.get('/ai-gateway/config', (req: Request, res: Response) => {
  const config = getClientConfig();
  res.json({ config });
});

aiGatewayManagementRoutes.post('/ai-gateway/config', (req: Request, res: Response) => {
  const updatedConfig = saveGatewayConfig(req.body || {});
  res.json({ config: updatedConfig });
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/verify', async (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const { apiKey, baseUrl } = req.body || {};
  const result = await verifyProviderConnection(providerId, apiKey, baseUrl);
  res.json(result);
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/connect', async (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const { apiKey, baseUrl, label, addNew, keyId } = req.body || {};
  const verifyResult = await verifyProviderConnection(providerId, apiKey, baseUrl);
  if (!verifyResult.valid) {
    res.status(400).json({ error: verifyResult.error || 'Connection verification failed' });
    return;
  }
  const updatedConfig = connectProvider(providerId, apiKey, baseUrl, verifyResult.latencyMs, verifyResult.models, { label, addNew: !!addNew, keyId });
  res.json({ config: updatedConfig, verification: verifyResult });
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/disconnect', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const keyId = req.body?.keyId ? String(req.body.keyId) : (req.query.keyId ? String(req.query.keyId) : undefined);
  const updatedConfig = disconnectProvider(providerId, keyId);
  res.json({ config: updatedConfig });
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/reorder', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const keyIds = Array.isArray(req.body?.keyIds) ? req.body.keyIds.map(String) : [];
  const updatedConfig = reorderProviderKeys(providerId, keyIds);
  res.json({ config: updatedConfig });
});

aiGatewayManagementRoutes.get('/ai-gateway/usage', (req: Request, res: Response) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const logs = getUsageLogs(limit);
  res.json({ logs });
});

aiGatewayManagementRoutes.delete('/ai-gateway/usage', (req: Request, res: Response) => {
  clearUsageLogs();
  res.json({ success: true });
});

aiGatewayManagementRoutes.get('/ai-gateway/stats', (req: Request, res: Response) => {
  const stats = getGatewayStats();
  res.json({ stats });
});

// ------------------- SUBSCRIPTION ACCOUNTS (OAuth login, 9Router style) -------------------
const oauthProvider = (req: Request, res: Response) => {
  const p = String(req.params.provider);
  if (!isOAuthProvider(p)) { res.status(400).json({ error: `Provider login tidak dikenal: ${p}` }); return null; }
  return p;
};

aiGatewayManagementRoutes.get('/ai-gateway/accounts', async (_req: Request, res: Response) => {
  // Live catalogs (Copilot policy, Kilo free models) so the pickers only offer models the account can use.
  res.json({ accounts: listAccounts(), models: { ...MODELS, ...(await accountModels()) }, aliases: ALIAS_OF });
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/start', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.body?.accountId ? String(req.body.accountId) : undefined;
  try {
    const r = await startLogin(p);
    const autoCallback = r.kind === 'redirect' ? await listenForCallback(r.sessionId, r.redirectUri, accountId) : false;
    res.json({ ...r, autoCallback });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/complete', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.body?.accountId ? String(req.body.accountId) : undefined;
  const label = req.body?.label ? String(req.body.label) : undefined;
  try {
    const { provider, cred } = await completeLogin(String(req.body?.sessionId || ''), String(req.body?.callback || ''));
    if (provider !== p) { res.status(400).json({ error: 'Sesi login milik provider lain' }); return; }
    saveAccount(provider, cred, accountId, label);
    res.json({ accounts: listAccounts() });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/poll', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.body?.accountId ? String(req.body.accountId) : undefined;
  try {
    const r = await pollDeviceLogin(String(req.body?.sessionId || ''));
    if (r.status === 'done') { saveAccount(p, r.cred, accountId); res.json({ status: 'done', accounts: listAccounts() }); }
    else res.json({ status: 'pending' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/test', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.body?.accountId ? String(req.body.accountId) : undefined;
  try { await getCredential(p, accountId); res.json({ ok: true, accounts: listAccounts() }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/reorder', (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountIds = Array.isArray(req.body?.accountIds) ? req.body.accountIds.map(String) : [];
  res.json({ accounts: reorderAccounts(p, accountIds) });
});

aiGatewayManagementRoutes.delete('/ai-gateway/accounts/:provider', (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.query.accountId ? String(req.query.accountId) : (req.body?.accountId ? String(req.body.accountId) : undefined);
  removeAccount(p, accountId);
  res.json({ accounts: listAccounts() });
});

aiGatewayManagementRoutes.get('/ai-gateway/accounts/usage', async (req: Request, res: Response) => {
  const fresh = req.query.fresh === '1';
  const usage = await Promise.all(listAccounts().map((a) => usageOf(a.provider, fresh, a.id)));
  res.json({ usage });
});

// Combos: name -> ordered `alias/model` list. Each entry must be a subscription model we can route.
aiGatewayManagementRoutes.get('/ai-gateway/combos', (_req: Request, res: Response) => {
  res.json({ combos: getInternalConfig().combos || {} });
});
aiGatewayManagementRoutes.put('/ai-gateway/combos/:name', (req: Request, res: Response) => {
  const name = String(req.params.name || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/.test(name)) { res.status(400).json({ error: 'Name: 1–40 chars, lowercase letters, digits, . _ -' }); return; }
  const targets = Array.isArray(req.body?.targets) ? req.body.targets.map((t: unknown) => String(t).trim()).filter(Boolean) : [];
  const bad = targets.filter((t: string) => !resolveModel(t));
  if (!targets.length || targets.length > 8 || bad.length) { res.status(400).json({ error: bad.length ? `Not a subscription model: ${bad.join(', ')}` : 'Give 1–8 targets like cc/claude-sonnet-5' }); return; }
  const combos = { ...(getInternalConfig().combos || {}), [name]: targets };
  saveGatewayConfig({ combos });
  res.json({ combos });
});
aiGatewayManagementRoutes.delete('/ai-gateway/combos/:name', (req: Request, res: Response) => {
  const combos = { ...(getInternalConfig().combos || {}) };
  delete combos[String(req.params.name)];
  saveGatewayConfig({ combos });
  res.json({ combos });
});

// In-Dashboard AI Copilot Chat Endpoint (SSE Streaming)
aiGatewayManagementRoutes.post('/ai-copilot/chat', (req: Request, res: Response) => {
  handleCopilotChat(req, res);
});

