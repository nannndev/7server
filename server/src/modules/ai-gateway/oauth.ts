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
//  - device code (copilot, kimi, kilocode, muse, nous): user approves on the provider's site while we poll.
import crypto from 'crypto';

export type OAuthProviderId = 'claude' | 'codex' | 'copilot' | 'gemini-cli' | 'kimi' | 'kilocode' | 'muse' | 'nous';
export const OAUTH_PROVIDER_IDS: OAuthProviderId[] = ['claude', 'codex', 'copilot', 'gemini-cli', 'kimi', 'kilocode', 'muse', 'nous'];
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
  /** kilocode: organization sent as X-Kilocode-OrganizationID */
  orgId?: string;
  /** kimi: device id sent on every request (X-Msh-Device-Id), fixed at login */
  deviceId?: string;
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

// Kimi Code subscription (device flow), as in 9Router's registry/kimi.js and CLIProxyAPI.
export const KIMI = {
  clientId: '17e5f671-d194-4dfb-9706-5516cb48c098',
  deviceCodeUrl: 'https://auth.kimi.com/api/oauth/device_authorization',
  tokenUrl: 'https://auth.kimi.com/api/oauth/token',
  authorizeDeviceUrl: 'https://www.kimi.com/code/authorize_device',
  chatUrl: 'https://api.kimi.com/coding/v1/chat/completions'
};
// Kilo Code (device flow, OpenRouter-style catalog: anthropic/..., google/..., openai/...). Token never expires.
export const KILOCODE = {
  apiBaseUrl: 'https://api.kilo.ai',
  codesUrl: 'https://api.kilo.ai/api/device-auth/codes',
  chatUrl: 'https://api.kilo.ai/api/openrouter/chat/completions'
};
// Standard RFC 8628 device flow, then a provider API key minted from the account token for chat.
// Muse Code (Meta) and Nous Research, as in 9Router's oauth/providers/{muse,nous}.js.
interface StdDevice { clientId: string; deviceCodeUrl: string; tokenUrl: string; scope?: string; headers?: Record<string, string>; chatUrl: string }
export const MUSE: StdDevice & { keyUrl: string } = {
  clientId: '1031625952748946',
  deviceCodeUrl: 'https://auth.meta.com/oidc/device/authorization/',
  tokenUrl: 'https://auth.meta.com/oidc/device/token/',
  headers: { 'x-api-version': '1.0.0' },
  chatUrl: 'https://api.meta.ai/v1/chat/completions',
  keyUrl: 'https://api.meta.ai/muse-code/key'
};
export const NOUS: StdDevice & { agentKeyUrl: string } = {
  clientId: 'hermes-cli',
  deviceCodeUrl: 'https://portal.nousresearch.com/api/oauth/device/code',
  tokenUrl: 'https://portal.nousresearch.com/api/oauth/token',
  scope: 'inference:invoke inference:mint_agent_key',
  chatUrl: 'https://inference-api.nousresearch.com/v1/chat/completions',
  agentKeyUrl: 'https://portal.nousresearch.com/api/oauth/agent-key'
};
const STD_DEVICE: Partial<Record<OAuthProviderId, StdDevice>> = { muse: MUSE, nous: NOUS };

/** Kimi identifies the calling device on every request; the id is created at login and reused. */
export function kimiHeaders(deviceId?: string): Record<string, string> {
  const os = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
  return {
    'X-Msh-Platform': '7server',
    'X-Msh-Version': '1.0.0',
    'X-Msh-Device-Name': 'unknown',
    'X-Msh-Device-Model': `${os} ${process.arch}`,
    'X-Msh-Device-Id': deviceId || `kimi-${Date.now()}`
  };
}

// ------------------------------------------------------------------ pending login sessions
// shortcut: in-memory, lost on restart (user just clicks "Login" again); fine for a single-node dashboard.
interface Pending { provider: OAuthProviderId; verifier?: string; deviceCode?: string; deviceId?: string; interval?: number; createdAt: number }
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

  if (provider === 'kimi') {
    const deviceId = crypto.randomUUID();
    const d = await postJson(KIMI.deviceCodeUrl, { client_id: KIMI.clientId }, true, kimiHeaders(deviceId));
    pending.set(sessionId, { provider, deviceCode: d.device_code, deviceId, interval: Number(d.interval) || 5, createdAt: Date.now() });
    return {
      kind: 'device', sessionId, userCode: d.user_code,
      verificationUri: d.verification_uri_complete || d.verification_uri || `${KIMI.authorizeDeviceUrl}?user_code=${d.user_code}`,
      interval: Number(d.interval) || 5, expiresIn: Number(d.expires_in) || 900
    };
  }

  const std = STD_DEVICE[provider];
  if (std) {
    const d = await postJson(std.deviceCodeUrl, { client_id: std.clientId, ...(std.scope ? { scope: std.scope } : {}) }, true, std.headers);
    pending.set(sessionId, { provider, deviceCode: d.device_code, interval: Number(d.interval) || 5, createdAt: Date.now() });
    return { kind: 'device', sessionId, userCode: d.user_code, verificationUri: d.verification_uri_complete || d.verification_uri, interval: Number(d.interval) || 5, expiresIn: Number(d.expires_in) || 900 };
  }

  if (provider === 'kilocode') {
    const d = await postJson(KILOCODE.codesUrl, {});
    pending.set(sessionId, { provider, deviceCode: d.code, interval: 3, createdAt: Date.now() });
    return { kind: 'device', sessionId, userCode: d.code, verificationUri: d.verificationUrl, interval: 3, expiresIn: Number(d.expiresIn) || 300 };
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
  if (!p || !['copilot', 'kimi', 'kilocode', 'muse', 'nous'].includes(p.provider) || !p.deviceCode) throw new Error('Sesi login tidak ditemukan atau kedaluwarsa; klik Login lagi');
  if (STD_DEVICE[p.provider]) return pollStdDevice(sessionId, p, STD_DEVICE[p.provider]!);
  if (p.provider === 'kimi') return pollKimi(sessionId, p);
  if (p.provider === 'kilocode') return pollKilocode(sessionId, p);
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

// Kimi answers pending states with HTTP 200 and an `error` field, unlike GitHub.
async function pollKimi(sessionId: string, p: Pending): Promise<PollResult> {
  const res = await fetch(KIMI.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...kimiHeaders(p.deviceId) },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: KIMI.clientId, device_code: p.deviceCode! }).toString(),
    signal: AbortSignal.timeout(20000)
  });
  const t: any = await res.json().catch(() => ({}));
  if (t.error === 'authorization_pending' || t.error === 'slow_down') return { status: 'pending' };
  pending.delete(sessionId);
  if (t.error || !t.access_token) throw new Error(`Kimi: ${t.error_description || t.error || res.status}`);
  const claims = jwtPayload(t.access_token);
  return { status: 'done', cred: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in), deviceId: p.deviceId, email: claims.email || claims.name || claims.sub } };
}

async function pollStdDevice(sessionId: string, p: Pending, cfg: StdDevice): Promise<PollResult> {
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', ...cfg.headers },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: cfg.clientId, device_code: p.deviceCode! }).toString(),
    signal: AbortSignal.timeout(20000)
  });
  const t: any = await res.json().catch(() => ({}));
  if (t.error === 'authorization_pending' || t.error === 'slow_down') return { status: 'pending' };
  pending.delete(sessionId);
  if (t.error || !t.access_token) throw new Error(`${p.provider}: ${t.error_description || t.error || res.status}`);
  return { status: 'done', cred: p.provider === 'muse' ? await mintMuseKey(t.access_token) : await mintNousKey(t) };
}

// Muse chat uses a minted Model API key (no expiry); the Meta token is kept so a re-mint needs no new login.
async function mintMuseKey(metaToken: string): Promise<OAuthCredential> {
  const r = await fetch(MUSE.keyUrl, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${metaToken}`, 'Content-Type': 'application/json', ...MUSE.headers },
    body: JSON.stringify({ onboard: true }),
    signal: AbortSignal.timeout(20000)
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Muse Code: ${[j.title, j.detail].filter(Boolean).join(': ') || r.status}${j.action_url ? ` (${j.action_url})` : ''}`);
  if (j.is_subs_active === false || !j.api_key) throw new Error(`Muse Code: langganan tidak aktif${j.action_url || j.require_payment_action_url ? ` (${j.action_url || j.require_payment_action_url})` : ''}`);
  return { accessToken: j.api_key, email: j.user_email?.trim().toLowerCase(), refreshToken: metaToken };
}

// Nous chat prefers a short-lived agent key; if minting fails the OAuth token still works for inference.
async function mintNousKey(t: any): Promise<OAuthCredential> {
  const cred: OAuthCredential = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: expiry(t.expires_in) };
  try {
    const r = await fetch(NOUS.agentKeyUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${t.access_token}` },
      body: JSON.stringify({ min_ttl_seconds: 7200 }),
      signal: AbortSignal.timeout(20000)
    });
    if (r.ok) { const j: any = await r.json(); if (j.api_key) { cred.apiToken = j.api_key; cred.apiTokenExpiresAt = j.expires_at ? Date.parse(j.expires_at) || Number(j.expires_at) * 1000 : undefined; } }
  } catch { /* fall back to the OAuth token */ }
  return cred;
}

// Kilo answers 202 while waiting, 403 when denied, 410 when the code expired.
async function pollKilocode(sessionId: string, p: Pending): Promise<PollResult> {
  const res = await fetch(`${KILOCODE.codesUrl}/${encodeURIComponent(p.deviceCode!)}`, { signal: AbortSignal.timeout(20000) });
  if (res.status === 202) return { status: 'pending' };
  pending.delete(sessionId);
  if (res.status === 403) throw new Error('Kilo Code: login ditolak');
  if (res.status === 410) throw new Error('Kilo Code: kode kedaluwarsa, klik Login lagi');
  const d: any = await res.json().catch(() => ({}));
  if (!res.ok || d.status !== 'approved' || !d.token) {
    if (res.ok) { pending.set(sessionId, p); return { status: 'pending' }; }
    throw new Error(`Kilo Code: ${res.status}`);
  }
  let orgId: string | undefined;
  try {
    const pr = await fetch(`${KILOCODE.apiBaseUrl}/api/profile`, { headers: { Authorization: `Bearer ${d.token}` }, signal: AbortSignal.timeout(10000) });
    if (pr.ok) orgId = (await pr.json())?.organizations?.[0]?.id || undefined;
  } catch { /* personal account: no org header */ }
  return { status: 'done', cred: { accessToken: d.token, email: d.userEmail, orgId } };
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
const LEAD_MS: Record<OAuthProviderId, number> = { claude: 5 * 60_000, codex: 5 * 60_000, 'gemini-cli': 5 * 60_000, copilot: 5 * 60_000, kimi: 5 * 60_000, kilocode: 0, muse: 0, nous: 5 * 60_000 };

export const needsRefresh = (provider: OAuthProviderId, c: OAuthCredential, now = Date.now()) =>
  provider === 'copilot'
    ? !c.apiToken || !c.apiTokenExpiresAt || c.apiTokenExpiresAt - now < LEAD_MS.copilot
    : (c.expiresAt !== undefined && c.expiresAt - now < LEAD_MS[provider]) // 0 = forced by markExpired()
      // Nous: the minted agent key expires on its own schedule.
      || (provider === 'nous' && !!c.apiTokenExpiresAt && c.apiTokenExpiresAt - now < LEAD_MS.nous);

export async function refreshCredential(provider: OAuthProviderId, c: OAuthCredential): Promise<OAuthCredential> {
  if (provider === 'copilot') return { ...c, ...(await fetchCopilotApiToken(c.accessToken)) };
  if (provider === 'kilocode') throw new Error('Token Kilo Code ditolak; login ulang di AI Gateway');
  // Muse keeps the Meta token in refreshToken: a rejected key is re-minted from it.
  if (provider === 'muse') { if (!c.refreshToken) throw new Error('Muse Code: login ulang'); return mintMuseKey(c.refreshToken); }
  if (provider === 'nous') {
    if (!c.refreshToken) throw new Error('Nous: login ulang');
    const t = await postJson(NOUS.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: NOUS.clientId }, true);
    return mintNousKey({ ...t, refresh_token: t.refresh_token || c.refreshToken });
  }
  if (!c.refreshToken) throw new Error('Sesi kedaluwarsa dan tidak ada refresh token; login ulang');
  if (provider === 'claude') {
    const t = await postJson(CLAUDE.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: CLAUDE.clientId });
    return { ...c, accessToken: t.access_token, refreshToken: t.refresh_token || c.refreshToken, expiresAt: expiry(t.expires_in) };
  }
  if (provider === 'kimi') {
    const t = await postJson(KIMI.tokenUrl, { grant_type: 'refresh_token', refresh_token: c.refreshToken, client_id: KIMI.clientId }, true, kimiHeaders(c.deviceId));
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
