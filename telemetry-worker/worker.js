/**
 * 7Server Anonymous Telemetry & Update Check Worker
 * Runs on Cloudflare Workers (Free tier: 100,000 req/day).
 *
 * KV Binding required: STATS_KV
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
  'Access-Control-Max-Age': '86400',
};

const LATEST_VERSION = '0.2.0';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Route: Ping / Heartbeat
    if (request.method === 'POST' && url.pathname === '/api/v1/ping') {
      return handlePing(request, env);
    }

    // Route: Public aggregated stats (safe for landing page)
    if (request.method === 'GET' && (url.pathname === '/api/v1/stats' || url.pathname === '/stats')) {
      return handleStats(env);
    }

    // Route: Check update
    if (request.method === 'GET' && url.pathname === '/api/v1/version') {
      return jsonResponse({
        latest_version: LATEST_VERSION,
        tag: `v${LATEST_VERSION}`,
        url: 'https://github.com/nannndev/7server/releases/latest',
      });
    }

    // Default info route
    return jsonResponse({
      name: '7Server Telemetry & Metric Collector',
      status: 'online',
      version: LATEST_VERSION,
      docs: 'https://github.com/nannndev/7server',
      privacy: '100% anonymous instance telemetry. No personal data, IPs, passwords, or server names are ever stored.'
    });
  }
};

async function handlePing(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const { id, version, os, arch, node } = body || {};

  // Validate UUID / hex instance id format
  if (!id || typeof id !== 'string' || !/^[0-9a-fA-F-]{16,64}$/.test(id)) {
    return jsonResponse({ error: 'Invalid or missing instance id' }, 400);
  }

  // Country from Cloudflare header (no IP address stored!)
  const country = request.headers.get('cf-ipcountry') || 'unknown';

  const record = {
    id,
    version: String(version || '0.2.0').slice(0, 16),
    os: String(os || 'unknown').slice(0, 16),
    arch: String(arch || 'unknown').slice(0, 16),
    node: String(node || '').slice(0, 16),
    country,
    lastSeen: Date.now(),
  };

  // If KV is bound, record instance with 30 days TTL (2,592,000s)
  if (env && env.STATS_KV) {
    try {
      await env.STATS_KV.put(`inst:${id}`, JSON.stringify(record), {
        expirationTtl: 30 * 24 * 60 * 60, // 30 days
        metadata: { os: record.os, arch: record.arch, version: record.version, country: record.country }
      });

      // Increment all-time total installs if new
      const seenKey = `seen:${id}`;
      const alreadySeen = await env.STATS_KV.get(seenKey);
      if (!alreadySeen) {
        await env.STATS_KV.put(seenKey, '1');
        const total = (Number(await env.STATS_KV.get('metric:total_installs')) || 0) + 1;
        await env.STATS_KV.put('metric:total_installs', String(total));
      }
    } catch (err) {
      // Don't fail the client request if KV write fails
      console.error('KV write error:', err);
    }
  }

  return jsonResponse({
    ok: true,
    latest_version: LATEST_VERSION,
    update_available: version ? version !== LATEST_VERSION : false
  });
}

async function handleStats(env) {
  if (!env || !env.STATS_KV) {
    return jsonResponse({
      active_instances_30d: 1,
      total_installs: 1,
      os: { darwin: 1 },
      note: 'KV storage not bound yet. Connect STATS_KV to enable live count.'
    });
  }

  try {
    // List keys with prefix inst:
    const list = await env.STATS_KV.list({ prefix: 'inst:', limit: 1000 });
    const keys = list.keys || [];

    const osBreakdown = {};
    const versionBreakdown = {};

    for (const k of keys) {
      const meta = k.metadata;
      if (meta) {
        if (meta.os) osBreakdown[meta.os] = (osBreakdown[meta.os] || 0) + 1;
        if (meta.version) versionBreakdown[meta.version] = (versionBreakdown[meta.version] || 0) + 1;
      }
    }

    const totalInstalls = Number(await env.STATS_KV.get('metric:total_installs')) || keys.length;

    return jsonResponse({
      active_instances_30d: keys.length,
      total_installs: Math.max(totalInstalls, keys.length),
      os: osBreakdown,
      versions: versionBreakdown,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ error: 'Failed to retrieve stats', message: String(err) }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
      ...CORS_HEADERS
    }
  });
}

