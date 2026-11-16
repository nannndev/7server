import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  checkedAt: string;
  source?: 'github' | 'npm';
  error?: string;
}

const DEFAULT_RELEASE_URL = 'https://github.com/nannndev/7server/releases';
const CACHE_TTL_MS = 6 * 3600_000;
const MANUAL_COOLDOWN_MS = 15_000;

let cached: { at: number; result: VersionCheckResult } | null = null;
let lastManualAt = 0;

/** Reads the running 7Server version from env or nearest package.json. */
export function getCurrentVersion(): string {
  const fromEnv = process.env.SEVEN_SERVER_VERSION?.trim();
  if (fromEnv) return fromEnv.replace(/^v/i, '');

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../packages/npm/package.json'),
    path.resolve(here, '../../../package.json'),
    path.resolve(process.cwd(), 'packages/npm/package.json'),
    path.resolve(process.cwd(), 'package.json')
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (pkg?.name === 'sevenserver' && typeof pkg.version === 'string' && pkg.version.trim()) {
        return pkg.version.trim().replace(/^v/i, '');
      }
    } catch {
      // try next candidate
    }
  }
  return '0.3.1';
}

/** Returns >0 if a > b, <0 if a < b, 0 if equal. */
export function compareSemver(a: string, b: string): number {
  const clean = (v: string) =>
    v
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .slice(0, 3)
      .map((n) => parseInt(n, 10) || 0);

  const pa = clean(a);
  const pb = clean(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkLatestVersion(force = false): Promise<VersionCheckResult> {
  const now = Date.now();
  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }
  if (force && cached && now - lastManualAt < MANUAL_COOLDOWN_MS) {
    return cached.result;
  }
  if (force) lastManualAt = now;

  const currentVersion = getCurrentVersion();
  const checkedAt = new Date(now).toISOString();

  // 1. Try GitHub Releases API
  try {
    const res = await fetch('https://api.github.com/repos/nannndev/7server/releases/latest', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `7server/${currentVersion}`
      },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json();
      const latestRaw = String(data?.tag_name || data?.name || '').trim().replace(/^v/i, '');
      if (latestRaw) {
        const result: VersionCheckResult = {
          currentVersion,
          latestVersion: latestRaw,
          updateAvailable: compareSemver(latestRaw, currentVersion) > 0,
          releaseUrl: String(data?.html_url || DEFAULT_RELEASE_URL),
          releaseNotes: typeof data?.body === 'string' && data.body.trim() ? data.body.trim().slice(0, 600) : undefined,
          publishedAt: data?.published_at || undefined,
          checkedAt,
          source: 'github'
        };
        cached = { at: now, result };
        return result;
      }
    }
  } catch {
    // fallback to npm registry
  }

  // 2. Fallback to npm registry
  try {
    const res = await fetch('https://registry.npmjs.org/sevenserver/latest', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data: any = await res.json();
      const latestRaw = String(data?.version || '').trim().replace(/^v/i, '');
      if (latestRaw) {
        const result: VersionCheckResult = {
          currentVersion,
          latestVersion: latestRaw,
          updateAvailable: compareSemver(latestRaw, currentVersion) > 0,
          releaseUrl: `https://www.npmjs.com/package/sevenserver/v/${latestRaw}`,
          checkedAt,
          source: 'npm'
        };
        cached = { at: now, result };
        return result;
      }
    }
  } catch {
    // return non-fatal error state
  }

  const fallback: VersionCheckResult = {
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    releaseUrl: DEFAULT_RELEASE_URL,
    checkedAt,
    error: 'Unable to reach release server'
  };
  cached = { at: now, result: fallback };
  return fallback;
}

export const __resetVersionCache = () => {
  cached = null;
  lastManualAt = 0;
};
