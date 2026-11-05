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
import { listAccounts, saveAccount, removeAccount, getCredential } from './accounts.js';
import { MODELS } from './subscription.js';
import { listenForCallback } from './callbackServer.js';
import {
  getAllKeys,
  createVirtualKey,
  deleteVirtualKey,
  toggleVirtualKey,
  getClientConfig,
  saveGatewayConfig,
  connectProvider,
  disconnectProvider,
  getUsageLogs,
  clearUsageLogs,
  getGatewayStats
} from './store.js';

// ------------------- PUBLIC AI GATEWAY PROXY ROUTES -------------------
// Mounted at /api/ai (Before requireAuth, protected by Virtual API Key)
export const aiGatewayPublicRoutes = Router();
// Only callers inside the 7Server system (loopback, private nets, registered VPS hosts) may use the proxy.
aiGatewayPublicRoutes.use(internalOnly);

aiGatewayPublicRoutes.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: '7Server AI Gateway', timestamp: new Date().toISOString() });
});

aiGatewayPublicRoutes.post(
  ['/v1/messages', '/messages', '/v1/v1/messages'],
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

aiGatewayManagementRoutes.get('/ai-gateway/keys', (req: Request, res: Response) => {
  const keys = getAllKeys();
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
  res.json({ key: updated });
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
  const { apiKey, baseUrl } = req.body || {};
  const verifyResult = await verifyProviderConnection(providerId, apiKey, baseUrl);
  if (!verifyResult.valid) {
    res.status(400).json({ error: verifyResult.error || 'Connection verification failed' });
    return;
  }
  const updatedConfig = connectProvider(providerId, apiKey, baseUrl, verifyResult.latencyMs);
  res.json({ config: updatedConfig, verification: verifyResult });
});

aiGatewayManagementRoutes.post('/ai-gateway/providers/:providerId/disconnect', (req: Request, res: Response) => {
  const providerId = String(req.params.providerId) as any;
  const updatedConfig = disconnectProvider(providerId);
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

aiGatewayManagementRoutes.get('/ai-gateway/accounts', (_req: Request, res: Response) => {
  res.json({ accounts: listAccounts(), models: MODELS });
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/start', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  try {
    const r = await startLogin(p);
    const autoCallback = r.kind === 'redirect' ? await listenForCallback(r.sessionId, r.redirectUri) : false;
    res.json({ ...r, autoCallback });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/complete', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  try {
    const { provider, cred } = await completeLogin(String(req.body?.sessionId || ''), String(req.body?.callback || ''));
    if (provider !== p) { res.status(400).json({ error: 'Sesi login milik provider lain' }); return; }
    saveAccount(provider, cred);
    res.json({ accounts: listAccounts() });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/poll', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  try {
    const r = await pollDeviceLogin(String(req.body?.sessionId || ''));
    if (r.status === 'done') { saveAccount(p, r.cred); res.json({ status: 'done', accounts: listAccounts() }); }
    else res.json({ status: 'pending' });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.post('/ai-gateway/accounts/:provider/test', async (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  try { await getCredential(p); res.json({ ok: true, accounts: listAccounts() }); } catch (e: any) { res.status(400).json({ error: e.message }); }
});

aiGatewayManagementRoutes.delete('/ai-gateway/accounts/:provider', (req: Request, res: Response) => {
  const p = oauthProvider(req, res); if (!p) return;
  removeAccount(p);
  res.json({ accounts: listAccounts() });
});

// In-Dashboard AI Copilot Chat Endpoint (SSE Streaming)
aiGatewayManagementRoutes.post('/ai-copilot/chat', (req: Request, res: Response) => {
  handleCopilotChat(req, res);
});

