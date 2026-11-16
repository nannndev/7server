import { Router, type Request, type Response } from 'express';
import {
  handleAnthropicMessages,
  handleOpenAiChatCompletions,
  handleOpenAiResponses,
  handleOpenAiEmbeddings,
  handlePlaygroundChat,
  handleListModels,
  isValidComboTarget
} from './service.js';
import { handleCopilotChat } from './copilot.js';
import { verifyProviderConnection } from './verifier.js';
import { internalOnly } from './internalOnly.js';
import { startLogin, completeLogin, pollDeviceLogin, isOAuthProvider } from './oauth.js';
import { listAccounts, saveAccount, removeAccount, reorderAccounts, toggleAccount, getCredential } from './accounts.js';
import { accountModels, ALIAS_OF, MODELS } from './subscription.js';
import { usageOf } from './usage.js';
import { listenForCallback } from './callbackServer.js';
import {
  getAllKeys,
  publicKey,
  createVirtualKey,
  updateVirtualKey,
  deleteVirtualKey,
  toggleVirtualKey,
  getClientConfig,
  saveGatewayConfig,
  getInternalConfig,
  connectProvider,
  disconnectProvider,
  reorderProviderKeys,
  toggleProviderKeyAccount,
  addProviderCustomModel,
  removeProviderCustomModel,
  getUsageLogs,
  clearUsageLogs,
  getGatewayStats,
  getUsageAnalytics
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

aiGatewayPublicRoutes.post(
  ['/v1/responses', '/responses', '/v1/v1/responses'],
  (req: Request, res: Response) => {
    handleOpenAiResponses(req, res);
  }
);

aiGatewayPublicRoutes.post(
  ['/v1/embeddings', '/embeddings', '/v1/v1/embeddings'],
  (req: Request, res: Response) => {
    handleOpenAiEmbeddings(req, res);
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
  const { name, allowedProviders, rateLimitPerMin, maxBudgetUsd, maxTokens, expiresAt } = req.body || {};
  const newKey = createVirtualKey(String(name || ''), allowedProviders, {
    rateLimitPerMin,
    maxBudgetUsd,
    maxTokens,
    expiresAt
  });
  res.json({ key: newKey });
});

aiGatewayManagementRoutes.patch('/ai-gateway/keys/:id', (req: Request, res: Response) => {
  const { name, enabled, allowedProviders, rateLimitPerMin, maxBudgetUsd, maxTokens, expiresAt } = req.body || {};
  const updated = updateVirtualKey(String(req.params.id), {
    name,
    enabled,
    allowedProviders,
    rateLimitPerMin,
    maxBudgetUsd,
    maxTokens,
    expiresAt
  });
  if (!updated) {
    res.status(404).json({ error: 'Virtual key not found' });
    return;
  }
  res.json({ key: updated });
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

aiGatewayManagementRoutes.patch('/ai-gateway/providers/:providerId/keys/:keyId/toggle', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const keyId = String(req.params.keyId);
  const enabled = req.body?.enabled !== false;
  const updatedConfig = toggleProviderKeyAccount(providerId, keyId, enabled);
  res.json({ config: updatedConfig });
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/custom-models', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
  if (!model) { res.status(400).json({ error: 'model is required' }); return; }
  const updatedConfig = addProviderCustomModel(providerId, model);
  res.json({ config: updatedConfig });
});

aiGatewayManagementRoutes.delete('/ai-gateway/providers/:providerId/custom-models', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const model = typeof req.body?.model === 'string'
    ? req.body.model.trim()
    : typeof req.query?.model === 'string'
      ? req.query.model.trim()
      : '';
  if (!model) { res.status(400).json({ error: 'model is required' }); return; }
  const updatedConfig = removeProviderCustomModel(providerId, model);
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

aiGatewayManagementRoutes.get('/ai-gateway/analytics', (req: Request, res: Response) => {
  const rawRange = String(req.query.range || '30d');
  const range = rawRange === '1d' || rawRange === '7d' || rawRange === '30d' || rawRange === 'all' ? rawRange : '30d';
  const tzOffsetMin = req.query.tzOffset !== undefined ? Number(req.query.tzOffset) : 0;
  const provider = req.query.provider ? String(req.query.provider) : undefined;
  const model = req.query.model ? String(req.query.model) : undefined;
  const keyId = req.query.keyId ? String(req.query.keyId) : undefined;
  const analytics = getUsageAnalytics(range, { tzOffsetMin, provider, model, keyId });
  res.json({ analytics });
});

// Admin Web Playground endpoint (SSE or JSON chat test via the gateway pipeline)
aiGatewayManagementRoutes.post('/ai-gateway/playground', (req: Request, res: Response) => {
  handlePlaygroundChat(req, res);
});

// ------------------- SUBSCRIPTION ACCOUNTS (OAuth login, 9Router style) -------------------
const oauthProvider = (req: Request, res: Response) => {
  const p = String(req.params.provider);
  if (!isOAuthProvider(p)) { res.status(400).json({ error: `Provider login tidak dikenal: ${p}` }); return null; }
  return p;
};

aiGatewayManagementRoutes.get('/ai-gateway/accounts', async (_req: Request, res: Response) => {
  // Live catalogs (Copilot policy, Kilo free models) + user custom models per provider.
  const baseModels: Record<string, string[]> = { ...MODELS, ...(await accountModels()) };
  const cfg = getClientConfig();
  for (const p of Object.keys(ALIAS_OF) as Array<keyof typeof ALIAS_OF>) {
    const custom = cfg.providers?.[p]?.customModels || [];
    if (custom.length) {
      baseModels[p] = Array.from(new Set([...(baseModels[p] || []), ...custom]));
    }
  }
  res.json({ accounts: listAccounts(), models: baseModels, aliases: ALIAS_OF });
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

aiGatewayManagementRoutes.patch('/ai-gateway/accounts/:provider/toggle', (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : '';
  if (!accountId) { res.status(400).json({ error: 'accountId is required' }); return; }
  const enabled = req.body?.enabled !== false;
  res.json({ accounts: toggleAccount(p, accountId, enabled) });
});

aiGatewayManagementRoutes.delete('/ai-gateway/accounts/:provider', (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  const accountId = req.query.accountId ? String(req.query.accountId) : (req.body?.accountId ? String(req.body.accountId) : undefined);
  removeAccount(p, accountId);
  res.json({ accounts: listAccounts() });
});

aiGatewayManagementRoutes.get('/ai-gateway/accounts/usage', async (req: Request, res: Response) => {
  const fresh = req.query.fresh === '1';
  const tzOffsetMin = Number.isFinite(Number(req.query.tzOffset)) ? Number(req.query.tzOffset) : 0;
  const [usageList, todayAnalytics, allAnalytics] = await Promise.all([
    Promise.all(listAccounts().map((a) => usageOf(a.provider, fresh, a.id))),
    Promise.resolve(getUsageAnalytics('1d', { tzOffsetMin })),
    Promise.resolve(getUsageAnalytics('all', { tzOffsetMin }))
  ]);

  const todayMap = new Map(todayAnalytics.byProvider.map((r) => [r.key.toLowerCase(), r]));
  const allMap = new Map(allAnalytics.byProvider.map((r) => [r.key.toLowerCase(), r]));

  const usage = usageList.map((u) => {
    const k = String(u.provider).toLowerCase();
    const tRow = todayMap.get(k);
    const aRow = allMap.get(k);
    return {
      ...u,
      gatewayStats: {
        todayRequests: tRow?.requests || 0,
        todayTokens: tRow?.totalTokens || 0,
        totalRequests: aRow?.requests || 0,
        totalTokens: aRow?.totalTokens || 0
      }
    };
  });
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
  const bad = targets.filter((t: string) => !isValidComboTarget(t));
  if (!targets.length || targets.length > 8 || bad.length) { res.status(400).json({ error: bad.length ? `Unknown provider/model target: ${bad.join(', ')}` : 'Give 1–8 targets like cc/claude-sonnet-5 or openai/gpt-4o' }); return; }
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

