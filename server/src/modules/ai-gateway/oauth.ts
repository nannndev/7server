// Subscription-account login for AI providers, ported from 9Router (MIT, github.com/decolua/9router).
//
// ⚠️ These flows reuse the public OAuth clients of the providers' own CLIs (Claude Code, Codex CLI,
// GitHub Copilot, Gemini CLI). That is not licensed for proxy use: accounts may be rate-limited or
// banned, and any upstream change can break a flow. The user explicitly accepted this risk.
//
// Flows:
//  - authorization code + PKCE (claude, codex) and authorization code (gemini): the browser logs in,
//    the provider redirects to a localhost URL that won't load on a remote VPS, so the user pastes that
//    URL (or just the code) back into the dashboard and we exchange it here.
//  - device code (copilot): user enters a short code on github.com while we poll.
import crypto from 'crypto';

export type OAuthProviderId = 'claude' | 'codex' | 'copilot' | 'gemini-cli';
export const OAUTH_PROVIDER_IDS: OAuthProviderId[] = ['claude', 'codex', 'copilot', 'gemini-cli'];
export const isOAuthProvider = (v: unknown): v is OAuthProviderId => OAUTH_PROVIDER_IDS.includes(v as OAuthProviderId);

/** Stored (encrypted at rest by the store) credential for one logged-in account. */
export interface OAuthCredential {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt?: number;
  email?: string;
  /** gemini-cli: Cloud Code Assist project; codex: ChatGPT account id */
  projectId?: string;
  accountId?: string;
  /** copilot: short-lived API token derived from the GitHub token */
  apiToken?: string;
  apiTokenExpiresAt?: number;
}

const CLAUDE = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://api.anthropic.com/v1/oauth/token',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
  redirectUri: 'http://localhost:54545/callback'
};
const CODEX = {
  clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
  authorizeUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  scope: 'openid profile email offline_access',
  // Fixed: registered for the Codex CLI client.
  redirectUri: 'http://localhost:1455/auth/callback'
};
const GEMINI = {
  clientId: process.env.GEMINI_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET || '', // set in server/.env (see .env.example)
  authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo',
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ],
  redirectUri: 'http://localhost:54545/callback'
};
export const COPILOT = {
  clientId: 'Iv1.b507a08c87ecfe98',
  deviceCodeUrl: 'https://github.com/login/device/code',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  copilotTokenUrl: 'https://api.github.com/copilot_internal/v2/token',
  userUrl: 'https://api.github.com/user',
  headers: {
    'User-Agent': 'GitHubCopilotChat/0.26.7',
    'Editor-Version': 'vscode/1.85.0',
    'Editor-Plugin-Version': 'copilot-chat/0.26.7'
  }
};

// ------------------------------------------------------------------ pending login sessions
// shortcut: in-memory, lost on restart (user just clicks "Login" again); fine for a single-node dashboard.
interface Pending { provider: OAuthProviderId; verifier?: string; deviceCode?: string; interval?: number; createdAt: number }
const pending = new Map<string, Pending>();
const SESSION_TTL_MS = 15 * 60 * 1000;
const sweep = () => { for (const [k, v] of pending) if (Date.now() - v.createdAt > SESSION_TTL_MS) pending.delete(k); };

const b64url = (b: Buffer) => b.toString('base64url');
export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function postJson(url: string, body: unknown, form = false, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json',
      ...extraHeaders
    },
    body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) throw new Error(`${new URL(url).host}: ${json.error_description || json.error?.message || json.error || text.slice(0, 200) || res.status}`);
  return json;
}

const expiry = (expiresIn: unknown) => (Number(expiresIn) > 0 ? Date.now() + Number(expiresIn) * 1000 : undefined);

/** JWT payload without verification: only used to read display info (email / account id) we were just issued. */
export function jwtPayload(token?: string): any {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
}

// ------------------------------------------------------------------ start
export type StartResult =
  | { kind: 'redirect'; sessionId: string; authUrl: string; redirectUri: string }
  | { kind: 'device'; sessionId: string; userCode: string; verificationUri: string; interval: number; expiresIn: number };

export async function startLogin(provider: OAuthProviderId): Promise<StartResult> {
  sweep();
  const sessionId = crypto.randomUUID();

  if (provider === 'copilot') {
    const d = await postJson(COPILOT.deviceCodeUrl, { client_id: COPILOT.clientId, scope: 'read:user' }, true);
    pending.set(sessionId, { provider, deviceCode: d.device_code, interval: Number(d.interval) || 5, createdAt: Date.now() });
    return { kind: 'device', sessionId, userCode: d.user_code, verificationUri: d.verification_uri, interval: Number(d.interval) || 5, expiresIn: Number(d.expires_in) || 900 };
  }

  const { verifier, challenge } = pkce();
  pending.set(sessionId, { provider, verifier, createdAt: Date.now() });
  let url: URL;
  if (provider === 'claude') {
    url = new URL(CLAUDE.authorizeUrl);
    url.search = new URLSearchParams({
      code: 'true', client_id: CLAUDE.clientId, response_type: 'code', redirect_uri: CLAUDE.redirectUri,
      scope: CLAUDE.scopes.join(' '), code_challenge: challenge, code_challenge_method: 'S256', state: sessionId
    }).toString();
    return { kind: 'redirect', sessionId, authUrl: url.toString(), redirectUri: CLAUDE.redirectUri };
  }
  if (provider === 'codex') {
    url = new URL(CODEX.authorizeUrl);
    url.search = new URLSearchParams({
      response_type: 'code', client_id: CODEX.clientId, redirect_uri: CODEX.redirectUri, scope: CODEX.scope,
      code_challenge: challenge, code_challenge_method: 'S256', id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true', originator: 'codex_cli_rs', state: sessionId
    }).toString();
    return { kind: 'redirect', sessionId, authUrl: url.toString(), redirectUri: CODEX.redirectUri };
  }
  if (!GEMINI.clientId || !GEMINI.clientSecret) throw new Error('Gemini login is not configured: set GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_CLIENT_SECRET in server/.env');
  url = new URL(GEMINI.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: GEMINI.clientId, response_type: 'code', redirect_uri: GEMINI.redirectUri, scope: GEMINI.scopes.join(' '),
    state: sessionId, access_type: 'offline', prompt: 'consent'
  }).toString();
  return { kind: 'redirect', sessionId, authUrl: url.toString(), redirectUri: GEMINI.redirectUri };
}

/**
 * Accepts what the user pasted: the full redirect URL (`http://localhost:.../callback?code=..&state=..`),
 * a bare query string, or Claude's "code#state" format. Returns code + state (state may be empty).
 */
export function parsePastedCallback(input: string): { code: string; state: string } {
  const s = String(input || '').trim();
  if (!s) throw new Error('Tempel URL callback atau kode dari halaman login');
  let params: URLSearchParams | null = null;
  if (/^https?:\/\//i.test(s)) params = new URL(s).searchParams;
  else if (s.includes('code=')) params = new URLSearchParams(s.replace(/^.*?\?/, ''));
  if (params) {
    if (params.get('error')) throw new Error(`Login ditolak: ${params.get('error_description') || params.get('error')}`);
    const code = params.get('code');
    if (!code) throw new Error('URL tidak berisi parameter code');
    return { code, state: params.get('state') || '' };
  }
  const [code, state = ''] = s.split('#');
  return { code, state };
}

// ------------------------------------------------------------------ complete (redirect flows)
export async function completeLogin(sessionId: string, pasted: string): Promise<{ provider: OAuthProviderId; cred: OAuthCredential }> {
  const p = pending.get(sessionId);
  if (!p || p.provider === 'copilot') throw new Error('Sesi login tidak ditemukan atau kedaluwarsa; klik Login lagi');
  const { code, state } = parsePastedCallback(pasted);
  // CSRF / mix-up guard: the state we generated must come back (Claude may omit it in code-only paste).
  if (state && state !== sessionId) throw new Error('State tidak cocok; mulai login ulang');
  pending.delete(sessionId);

  if (p.provider === 'claude') {
    const t = await postJson(CLAUDE.tokenUrl, {
      code, state: state || sessionId, grant_type: 'authorization_code', client_id: CLAUDE.clientId,
      redirect_uri: CLAUDE.redirectUri, code_verifier: p.verifier
    });
    return { provider: 'claude', cred: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), email: t.account?.email_address } };
  }
  if (p.provider === 'codex') {
    const t = await postJson(CODEX.tokenUrl, {
      grant_type: 'authorization_code', client_id: CODEX.clientId, code, redirect_uri: CODEX.redirectUri, code_verifier: p.verifier!
    }, true);
    const idp = jwtPayload(t.id_token);
    const auth = idp['https://api.openai.com/auth'] || {};
    return {
      provider: 'codex',
      cred: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), email: idp.email, accountId: auth.chatgpt_account_id }
    };
  }
  // gemini-cli
  const t = await postJson(GEMINI.tokenUrl, {
    grant_type: 'authorization_code', client_id: GEMINI.clientId, client_secret: GEMINI.clientSecret, code, redirect_uri: GEMINI.redirectUri
  }, true);
  const cred: OAuthCredential = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in) };
  try {
    const u = await fetch(`${GEMINI.userInfoUrl}?alt=json`, { headers: { Authorization: `Bearer ${t.access_token}` } });
    if (u.ok) cred.email = (await u.json()).email;
    cred.projectId = await loadGeminiProject(t.access_token);
  } catch { /* project resolved lazily on first request */ }
  return { provider: 'gemini-cli', cred };
}

// ------------------------------------------------------------------ poll (device flow)
export type PollResult = { status: 'pending' } | { status: 'done'; cred: OAuthCredential };

export async function pollDeviceLogin(sessionId: string): Promise<PollResult> {
  const p = pending.get(sessionId);
  if (!p || p.provider !== 'copilot' || !p.deviceCode) throw new Error('Sesi login tidak ditemukan atau kedaluwarsa; klik Login lagi');
  const res = await fetch(COPILOT.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: COPILOT.clientId, device_code: p.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).toString(),
    signal: AbortSignal.timeout(20000)
  });
  const t: any = await res.json().catch(() => ({}));
  if (t.error === 'authorization_pending' || t.error === 'slow_down') return { status: 'pending' };
  if (t.error || !t.access_token) {
    pending.delete(sessionId);
    throw new Error(`GitHub: ${t.error_description || t.error || res.status}`);
  }
  pending.delete(sessionId);
  const cred: OAuthCredential = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in) };
  try {
    const u = await fetch(COPILOT.userUrl, { headers: { Authorization: `token ${t.access_token}`, 'User-Agent': COPILOT.headers['User-Agent'] } });
    if (u.ok) { const j = await u.json(); cred.email = j.email || j.login; }
  } catch { /* display only */ }
  // Fail the login now if the account has no Copilot subscription, instead of on the first request.
  Object.assign(cred, await fetchCopilotApiToken(t.access_token));
  return { status: 'done', cred };
}

export async function fetchCopilotApiToken(githubToken: string): Promise<Pick<OAuthCredential, 'apiToken' | 'apiTokenExpiresAt'>> {
  const res = await fetch(COPILOT.copilotTokenUrl, {
    headers: { Authorization: `token ${githubToken}`, Accept: 'application/json', 'x-github-api-version': '2025-04-01', ...COPILOT.headers },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`Copilot token: ${res.status} ${(await res.text()).slice(0, 160)} (akun tanpa langganan Copilot?)`);
  const j: any = await res.json();
  return { apiToken: j.token, apiTokenExpiresAt: Number(j.expires_at) * 1000 };
}

async function loadGeminiProject(accessToken: string): Promise<string | undefined> {
  const r = await fetch('https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata: { ideType: 9, platform: 3, pluginType: 2 }, mode: 1 }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) return undefined;
  const d: any = await r.json();
  return d.cloudaicompanionProject?.id || d.cloudaicompanionProject || undefined;
}

// ------------------------------------------------------------------ refresh
// Refresh ahead of expiry. Codex rotates the refresh token on every use and re-using a rotated one logs
// the account out, so only refresh it when the access token is actually close to expiring.
const LEAD_MS: Record<OAuthProviderId, number> = { claude: 5 * 60_000, codex: 5 * 60_000, 'gemini-cli': 5 * 60_000, copilot: 5 * 60_000 };

export const needsRefresh = (provider: OAuthProviderId, c: OAuthCredential, now = Date.now()) =>
  provider === 'copilot'
    ? !c.apiToken || !c.apiTokenExpiresAt || c.apiTokenExpiresAt - now < LEAD_MS.copilot
    : c.expiresAt !== undefined && c.expiresAt - now < LEAD_MS[provider]; // 0 = forced by markExpired()

export async function refreshCredential(provider: OAuthProviderId, c: OAuthCredential): Promise<OAuthCredential> {
  if (provider === 'copilot') return { ...c, ...(await fetchCopilotApiToken(c.accessToken)) };
  if (!c.refreshToken) throw new Error('Sesi kedaluwarsa dan tidak ada refresh token; login ulang');
  if (provider === 'claude') {
    const t = await postJson(CLAUDE.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: CLAUDE.clientId });
    return { ...c, accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken, expiresAt: expiry(t.expires_in) };
  }
  if (provider === 'codex') {
    const t = await postJson(CODEX.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: CODEX.clientId, scope: CODEX.scope }, true);
    return { ...c, accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken, expiresAt: expiry(t.expires_in) };
  }
  const t = await postJson(GEMINI.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: GEMINI.clientId, client_secret: GEMINI.clientSecret }, true);
  const next = { ...c, accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken, expiresAt: expiry(t.expires_in) };
  if (!next.projectId) next.projectId = await loadGeminiProject(next.accessToken).catch(() => undefined);
  return next;
}

/** Test hook: lets unit tests seed a pending session without network. */
export const __pending = pending;
