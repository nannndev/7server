import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { need } from '../../http/auth.js';
import {
  listIntegrations,
  getRawIntegration,
  getActiveIntegration,
  deleteIntegration,
  getDecryptedAccessToken,
  getOAuthConfig,
  saveOAuthConfig,
  saveIntegration
} from './store.js';
import {
  getGitHubAuthorizeUrl,
  exchangeGitHubCode,
  fetchGitHubUserProfile,
  fetchGitHubRepos,
  fetchGitHubBranches,
  inspectGitHubRepo
} from './githubService.js';

// Temporary OAuth state store with 10-minute TTL
interface OAuthStateRecord {
  state: string;
  expiresAt: number;
}
const oauthStates = new Map<string, OAuthStateRecord>();

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of oauthStates.entries()) {
    if (val.expiresAt < now) oauthStates.delete(key);
  }
}

function generateState(): string {
  cleanExpiredStates();
  const state = crypto.randomBytes(24).toString('hex');
  oauthStates.set(state, { state, expiresAt: Date.now() + 10 * 60 * 1000 });
  return state;
}

function validateAndConsumeState(state: string): boolean {
  cleanExpiredStates();
  if (!state) return false;
  const item = oauthStates.get(state);
  if (!item) return false;
  oauthStates.delete(state);
  return item.expiresAt >= Date.now();
}

function resolveCallbackUrl(req: Request): string {
  const host = req.get('host') || 'localhost:5001';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}/api/auth/github/callback`;
}

// ----------------------------------------------------------------
// Public OAuth Routes (Unauthenticated entrypoint & GitHub callback)
// ----------------------------------------------------------------
export const gitPublicRoutes = Router();

// GET /api/auth/github/redirect
gitPublicRoutes.get('/auth/github/redirect', (req: Request, res: Response) => {
  try {
    const state = generateState();
    const callbackUrl = resolveCallbackUrl(req);
    const authUrl = getGitHubAuthorizeUrl(callbackUrl, state);

    if (req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, url: authUrl, state });
    }

    res.redirect(authUrl);
  } catch (err: any) {
    if (req.headers.accept?.includes('application/json')) {
      return res.status(400).json({ success: false, error: err.message });
    }
    res.status(400).send(`<h3>Error initiating GitHub OAuth</h3><p>${err.message}</p>`);
  }
});

// GET /api/auth/github/callback
gitPublicRoutes.get('/auth/github/callback', async (req: Request, res: Response) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const callbackUrl = resolveCallbackUrl(req);

  const renderResultHtml = (success: boolean, message: string, integration?: any) => {
    const payload = JSON.stringify({ type: '7server-git-connected', provider: 'github', success, message, integration });
    return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <title>${success ? 'GitHub Terhubung' : 'Gagal Menghubungkan GitHub'} - 7Server</title>
  <style>
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090d16;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1rem;
    }
    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 12px;
      background: ${success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
      color: ${success ? '#4ade80' : '#f87171'};
      border: 1px solid ${success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'};
    }
    h2 { font-size: 1.15rem; margin: 0 0 0.5rem; color: #fff; }
    p { font-size: 0.85rem; color: #94a3b8; margin: 0 0 1.25rem; line-height: 1.5; }
    .close-btn {
      background: #2563eb;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${success ? 'Berhasil' : 'Error'}</div>
    <h2>${success ? 'GitHub Berhasil Terhubung!' : 'Gagal Menghubungkan GitHub'}</h2>
    <p>${message}</p>
    <button class="close-btn" onclick="done()">Tutup Jendela</button>
  </div>
  <script>
    function done() {
      try {
        if (window.opener) {
          window.opener.postMessage(${payload}, '*');
          window.close();
        } else {
          window.location.href = '/#/settings/integrations?connected=github';
        }
      } catch (e) {
        window.close();
      }
    }
    setTimeout(done, 1200);
  </script>
</body>
</html>`;
  };

  if (!code) {
    return res.status(400).send(renderResultHtml(false, 'Parameter code tidak ditemukan dari GitHub callback.'));
  }

  if (!validateAndConsumeState(state)) {
    return res.status(403).send(renderResultHtml(false, 'Validasi state CSRF gagal atau sesi telah kedaluwarsa.'));
  }

  try {
    const tokenData = await exchangeGitHubCode(code, callbackUrl);
    const profile = await fetchGitHubUserProfile(tokenData.access_token);

    const scopes = tokenData.scope
      ? tokenData.scope.split(',').map((s) => s.trim()).filter(Boolean)
      : ['repo', 'read:user', 'admin:repo_hook'];

    const saved = saveIntegration({
      provider: 'github',
      account_id: String(profile.id),
      username: profile.login,
      display_name: profile.name || profile.login,
      avatar_url: profile.avatar_url,
      scopes,
      access_token: tokenData.access_token
    });

    res.send(renderResultHtml(true, `Akun @${saved.username} berhasil diintegrasikan ke 7Server.`, saved));
  } catch (err: any) {
    res.status(500).send(renderResultHtml(false, err.message || 'Terjadi kesalahan saat memproses token GitHub.'));
  }
});

// ----------------------------------------------------------------
// Authenticated Git Management & Discovery Routes
// ----------------------------------------------------------------
export const gitManagementRoutes = Router();

// GET /api/git/oauth-config
gitManagementRoutes.get('/git/oauth-config', need('server.read'), (_req: Request, res: Response) => {
  const cfg = getOAuthConfig();
  res.json({
    success: true,
    data: {
      githubConfigured: Boolean(cfg.githubClientId && cfg.githubClientSecret),
      githubClientId: cfg.githubClientId || ''
    }
  });
});

// POST /api/git/oauth-config
gitManagementRoutes.post('/git/oauth-config', need('server.manage'), (req: Request, res: Response) => {
  const { githubClientId, githubClientSecret } = req.body || {};
  saveOAuthConfig({
    githubClientId: typeof githubClientId === 'string' ? githubClientId.trim() : undefined,
    githubClientSecret: typeof githubClientSecret === 'string' ? githubClientSecret.trim() : undefined
  });
  res.json({ success: true, message: 'Konfigurasi GitHub OAuth berhasil disimpan.' });
});

// POST /api/git/token (Connect via Personal Access Token - PAT)
gitManagementRoutes.post('/git/token', need('server.manage'), async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    return res.status(400).json({ success: false, error: 'Personal Access Token wajib diisi.' });
  }

  try {
    const profile = await fetchGitHubUserProfile(token);
    const saved = saveIntegration({
      provider: 'github',
      account_id: String(profile.id),
      username: profile.login,
      display_name: profile.name || profile.login,
      avatar_url: profile.avatar_url,
      scopes: ['repo', 'read:user', 'admin:repo_hook'],
      access_token: token
    });

    res.json({
      success: true,
      data: saved,
      message: `Akun @${saved.username} berhasil dihubungkan via Personal Access Token.`
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || 'Token GitHub tidak valid atau tidak memiliki akses yang diperlukan.'
    });
  }
});

// GET /api/git/integrations
gitManagementRoutes.get('/git/integrations', need('server.read'), (_req: Request, res: Response) => {
  const integrations = listIntegrations();
  res.json({ success: true, data: integrations });
});

// DELETE /api/git/integrations/:id
gitManagementRoutes.delete('/git/integrations/:id', need('server.manage'), (req: Request, res: Response) => {
  const id = req.params.id as string;
  const ok = deleteIntegration(id);
  if (!ok) {
    return res.status(404).json({ success: false, error: 'Integrasi Git tidak ditemukan.' });
  }
  res.json({ success: true, message: 'Integrasi Git berhasil dihapus.' });
});

// GET /api/git/github/repos
gitManagementRoutes.get('/git/github/repos', need('server.read'), async (req: Request, res: Response) => {
  try {
    const integrationId = typeof req.query.integrationId === 'string' ? req.query.integrationId : undefined;
    const integration = getActiveIntegration('github', integrationId);

    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Belum ada akun GitHub yang terhubung. Silakan hubungkan akun GitHub di Pengaturan / Integrasi terlebih dahulu.'
      });
    }

    const token = getDecryptedAccessToken(integration);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token akses GitHub tidak valid atau tidak dapat didekripsi.'
      });
    }

    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const perPage = req.query.per_page ? parseInt(String(req.query.per_page), 10) : 100;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const type = (['all', 'owner', 'public', 'private'].includes(String(req.query.type))
      ? String(req.query.type)
      : 'all') as any;

    const repos = await fetchGitHubRepos(token, {
      page,
      per_page: perPage,
      search,
      type
    });

    res.json({
      success: true,
      data: repos
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil repositori GitHub.' });
  }
});

// GET /api/git/github/repos/:owner/:repo/branches
gitManagementRoutes.get('/api/git/github/repos/:owner/:repo/branches', need('server.read'), async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const integrationId = typeof req.query.integrationId === 'string' ? req.query.integrationId : undefined;
    const integration = getActiveIntegration('github', integrationId);

    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Belum ada akun GitHub yang terhubung.'
      });
    }

    const token = getDecryptedAccessToken(integration);
    const branches = await fetchGitHubBranches(token, owner as string, repo as string);

    res.json({
      success: true,
      branches
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil branch repositori.' });
  }
});

// Alternative route without duplicate '/api' prefix when mounted under '/api'
gitManagementRoutes.get('/git/github/repos/:owner/:repo/branches', need('server.read'), async (req: Request, res: Response) => {
  try {
    const { owner, repo } = req.params;
    const integrationId = typeof req.query.integrationId === 'string' ? req.query.integrationId : undefined;
    const integration = getActiveIntegration('github', integrationId);

    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Belum ada akun GitHub yang terhubung.'
      });
    }

    const token = getDecryptedAccessToken(integration);
    const branches = await fetchGitHubBranches(token, owner as string, repo as string);

    res.json({
      success: true,
      branches
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil branch repositori.' });
  }
});

// POST /api/git/github/inspect
gitManagementRoutes.post('/git/github/inspect', need('server.read'), async (req: Request, res: Response) => {
  try {
    const { owner, repo, branch, subDir, integrationId } = req.body || {};
    if (!owner || !repo || !branch) {
      return res.status(400).json({
        success: false,
        error: 'Parameter owner, repo, dan branch wajib diisi.'
      });
    }

    const integration = getActiveIntegration('github', integrationId);
    if (!integration) {
      return res.status(400).json({
        success: false,
        error: 'Belum ada akun GitHub yang terhubung.'
      });
    }

    const token = getDecryptedAccessToken(integration);
    const result = await inspectGitHubRepo(token, owner, repo, branch, typeof subDir === 'string' ? subDir : '/');

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal menginspeksi proyek di GitHub.' });
  }
});

