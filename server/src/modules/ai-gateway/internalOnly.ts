// The gateway proxies paid subscription accounts, so its public endpoints only answer callers inside
// the 7Server system: this machine (loopback), private networks (docker bridges, VPN), the VPS hosts
// registered in the dashboard, and any extra IPs listed in AI_GATEWAY_ALLOWED_IPS.
import fs from 'fs';
import net from 'net';
import { config } from '../../config.js';
import dns from 'dns/promises';
import type { Request, Response, NextFunction } from 'express';
import { getAllServers } from '../servers/store.js';

const extra = () => (process.env.AI_GATEWAY_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean);

/** IPv4-mapped IPv6 (::ffff:1.2.3.4) → 1.2.3.4 */
export const normalizeIp = (ip: string) => (ip || '').replace(/^::ffff:/i, '').trim();

// Inside a Docker container, published ports can make an internet caller arrive from the bridge
// gateway (172.17.0.1), so 172.16/12 counts as internal there only when explicitly allowed.
const IN_CONTAINER = fs.existsSync('/.dockerenv') || process.env.RUNNING_IN_DOCKER === '1';

export function isPrivateIp(ip: string, trustBridge = !IN_CONTAINER || config.trustDockerBridge): boolean {
  const a = normalizeIp(ip);
  if (a === '::1' || a === '127.0.0.1' || a.startsWith('127.')) return true;
  if (net.isIPv4(a)) {
    const [x, y] = a.split('.').map(Number);
    return x === 10 || (trustBridge && x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168);
  }
  // fc00::/7 unique-local
  return net.isIPv6(a) && /^f[cd]/i.test(a);
}

// Registered hosts may be hostnames: resolve them, cached briefly so every request isn't a DNS lookup.
let cache: { at: number; ips: Set<string> } = { at: 0, ips: new Set() };
async function registeredIps(): Promise<Set<string>> {
  if (Date.now() - cache.at < 60_000) return cache.ips;
  const ips = new Set<string>(extra().map(normalizeIp));
  await Promise.all(
    getAllServers(false).map(async (s) => {
      const h = String(s.host || '').trim();
      if (!h) return;
      if (net.isIP(h)) return void ips.add(normalizeIp(h));
      try { for (const r of await dns.lookup(h, { all: true })) ips.add(normalizeIp(r.address)); } catch { /* unresolvable */ }
    })
  );
  cache = { at: Date.now(), ips };
  return ips;
}

export async function isInternalCaller(ip: string): Promise<boolean> {
  const a = normalizeIp(ip);
  if (!a) return false;
  return isPrivateIp(a) || (await registeredIps()).has(a);
}

// req.ip is the socket address unless TRUST_PROXY lists the proxy in front, so a client can't spoof
// X-Forwarded-For to get in. Without TRUST_PROXY behind a local nginx, everyone looks like 127.0.0.1.
export async function internalOnly(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || '';
  if (await isInternalCaller(ip)) return next();
  res.status(403).json({
    error: { type: 'permission_error', message: `7Server AI Gateway hanya bisa dipakai dari dalam sistem 7Server (IP ${normalizeIp(ip)} tidak terdaftar).` }
  });
}

/** Test hook. */
export const __resetIpCache = () => { cache = { at: 0, ips: new Set() }; };
