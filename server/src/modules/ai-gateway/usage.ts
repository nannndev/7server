// Remaining quota of each logged-in subscription account, read from the provider's own usage
// endpoint with the account's token. Normalised to windows of "% used" with a reset time.
// shortcut: Gemini CLI has no stable quota endpoint we can read; it reports "unknown". Add it when one is confirmed.
import { getCredential, isConnected, listAccountsFor, type PublicAccount } from './accounts.js';
import { COPILOT, type OAuthProviderId } from './oauth.js';

export interface QuotaWindow {
  name: string;        // "session (5h)", "weekly", "premium requests"…
  usedPercent: number; // 0–100
  resetsAt?: string;   // ISO time
  /** absolute counts when the provider gives them (Copilot) */
  used?: number;
  total?: number;
}
export interface AccountUsage {
  accountId?: string;
  provider: OAuthProviderId;
  plan?: string;
  windows: QuotaWindow[];
  /** true when any window is at 100% */
  exhausted: boolean;
  checkedAt: string;
  error?: string;
}

const pct = (v: unknown) => Math.max(0, Math.min(100, Number(v) || 0));
const iso = (v: unknown): string | undefined => {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
  return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
};

/** Claude /api/oauth/usage: { five_hour: { utilization, resets_at }, seven_day: {…}, seven_day_<model>: {…} } */
export function parseClaude(data: any): Pick<AccountUsage, 'windows' | 'plan'> {
  const windows: QuotaWindow[] = [];
  const add = (name: string, w: any) => { if (w && typeof w.utilization === 'number') windows.push({ name, usedPercent: pct(w.utilization), resetsAt: iso(w.resets_at) }); };
  add('session (5h)', data?.five_hour);
  add('weekly', data?.seven_day);
  for (const [k, v] of Object.entries(data || {})) if (k.startsWith('seven_day_') && k !== 'seven_day') add(`weekly ${k.slice(10)}`, v);
  for (const l of Array.isArray(data?.limits) ? data.limits : []) {
    const model = String(l?.scope?.model?.display_name || '').trim().toLowerCase();
    if (l?.kind === 'weekly_scoped' && model && typeof l.percent === 'number') add(`weekly ${model}`, { utilization: l.percent, resets_at: l.resets_at });
  }
  return { windows };
}

/** Codex /backend-api/wham/usage: { plan_type, rate_limit: { primary_window, secondary_window, limit_reached } } */
export function parseCodex(data: any): Pick<AccountUsage, 'windows' | 'plan'> {
  const rl = data?.rate_limit || data?.rate_limits || data?.rate_limits_by_limit_id?.codex || {};
  const body = rl.rate_limit && typeof rl.rate_limit === 'object' ? rl.rate_limit : rl;
  const windows: QuotaWindow[] = [];
  const add = (name: string, w: any) => { if (w) windows.push({ name, usedPercent: pct(w.used_percent ?? w.percent_used), resetsAt: iso(w.reset_at ?? w.resets_at ?? w.resetAt) }); };
  add('session', body.primary_window || body.primary);
  add('weekly', body.secondary_window || body.secondary);
  if (body.limit_reached && !windows.some((w) => w.usedPercent >= 100)) windows.push({ name: 'limit', usedPercent: 100 });
  return { windows, plan: data?.plan_type || data?.summary?.plan };
}

/** Copilot copilot_internal/user: paid { quota_snapshots: { premium_interactions: { entitlement, remaining, unlimited } } }, free { monthly_quotas, limited_user_quotas } */
export function parseCopilot(data: any): Pick<AccountUsage, 'windows' | 'plan'> {
  const windows: QuotaWindow[] = [];
  if (data?.quota_snapshots) {
    const resetsAt = iso(data.quota_reset_date);
    for (const [key, name] of [['premium_interactions', 'premium requests'], ['chat', 'chat'], ['completions', 'completions']] as const) {
      const q = data.quota_snapshots[key];
      if (!q || q.unlimited || !(q.entitlement > 0)) continue;
      const used = q.entitlement - q.remaining;
      windows.push({ name, usedPercent: pct((used / q.entitlement) * 100), used, total: q.entitlement, resetsAt });
    }
  } else if (data?.monthly_quotas || data?.limited_user_quotas) {
    const total = data.monthly_quotas || {}, used = data.limited_user_quotas || {};
    const resetsAt = iso(data.limited_user_reset_date);
    for (const key of ['chat', 'completions']) {
      if (total[key] > 0) windows.push({ name: key, usedPercent: pct(((used[key] || 0) / total[key]) * 100), used: used[key] || 0, total: total[key], resetsAt });
    }
  }
  return { windows, plan: data?.copilot_plan || data?.access_type_sku };
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

// Usage endpoints are rate-limited too: cache each account's answer for a minute.
const cache = new Map<string, { at: number; value: AccountUsage }>();
const TTL = 60_000;

export async function usageOf(provider: OAuthProviderId, fresh = false, accountId?: string): Promise<AccountUsage> {
  const key = accountId || provider;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const base: AccountUsage = { accountId: key, provider, windows: [] as QuotaWindow[], exhausted: false, checkedAt: new Date().toISOString() };
  let value: AccountUsage;
  try {
    if (!isConnected(provider)) throw new Error('not logged in');
    const cred = await getCredential(provider, accountId);
    let parsed: Pick<AccountUsage, 'windows' | 'plan'>;
    if (provider === 'claude') {
      parsed = parseClaude(await fetchJson('https://api.anthropic.com/api/oauth/usage', {
        Authorization: `Bearer ${cred.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'anthropic-version': '2023-06-01', 'User-Agent': 'claude-cli/2.1.280 (external, sdk-cli)'
      }));
    } else if (provider === 'codex') {
      parsed = parseCodex(await fetchJson('https://chatgpt.com/backend-api/wham/usage', {
        Authorization: `Bearer ${cred.accessToken}`, ...(cred.accountId ? { 'ChatGPT-Account-ID': cred.accountId } : {})
      }));
    } else if (provider === 'copilot') {
      // This endpoint takes the GitHub OAuth token, not the short-lived Copilot API token.
      parsed = parseCopilot(await fetchJson('https://api.github.com/copilot_internal/user', {
        Authorization: `token ${cred.accessToken}`, 'X-GitHub-Api-Version': '2025-04-01', 'User-Agent': COPILOT.headers['User-Agent'], 'Editor-Version': 'vscode/1.100.0'
      }));
    } else {
      parsed = { windows: [] };
      throw new Error('quota not available for this provider');
    }
    value = { ...base, ...parsed, exhausted: parsed.windows.some((w) => w.usedPercent >= 100) };
  } catch (e: any) {
    value = { ...base, error: e.message };
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Remember a 429 from an account so routing can skip it until its window resets (or for 5 min). */
const cooling = new Map<string, number>();

export const markRateLimited = (p: OAuthProviderId, untilMs = Date.now() + 5 * 60_000, accountId?: string) => {
  const key = accountId || p;
  cooling.set(key, untilMs);
  cache.delete(key);
};

export const isAccountCoolingDown = (accountId: string) => (cooling.get(accountId) || 0) > Date.now();

/** A provider is cooling down only when all of its connected accounts are cooling down. */
export const isCoolingDown = (p: OAuthProviderId) => {
  const now = Date.now();
  if ((cooling.get(p) || 0) > now) {
    const accs = listAccountsFor(p);
    if (accs.length <= 1) return true;
  }
  const accs = listAccountsFor(p);
  if (accs.length === 0) return false;
  return accs.every((a) => (cooling.get(a.id) || 0) > now);
};

/** Returns a provider's accounts in rotation order, placing non-cooling accounts ahead of cooling ones. */
export const orderedAccountsFor = (p: OAuthProviderId): PublicAccount[] => {
  const accs = listAccountsFor(p);
  return [
    ...accs.filter((a) => !isAccountCoolingDown(a.id)),
    ...accs.filter((a) => isAccountCoolingDown(a.id))
  ];
};

export const __resetUsage = () => { cache.clear(); cooling.clear(); };
