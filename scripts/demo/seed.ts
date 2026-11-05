// Fills a demo data dir with believable AI gateway history, connected providers and audit entries,
// for README screenshots. Never point it at real data: it refuses unless VPSHUB_DATA_DIR is under /tmp.
//   VPSHUB_DATA_DIR=/tmp/7s-demo/data npx --prefix server tsx scripts/demo/seed.ts

const dir = process.env.VPSHUB_DATA_DIR || '';
if (!/^\/(private\/)?tmp\//.test(dir)) { console.error('refusing: VPSHUB_DATA_DIR must be under /tmp'); process.exit(1); }
// Imported only after the check: loading them opens the data dir.
const { connectProvider, getAllKeys } = await import('../../server/src/modules/ai-gateway/store.js');
const { saveAccount } = await import('../../server/src/modules/ai-gateway/accounts.js');
const { appendUsage } = await import('../../server/src/infra/db.js');
const { writeAudit } = await import('../../server/src/infra/audit.js');

connectProvider('anthropic', 'sk-ant-demo-not-a-real-key', 'https://api.anthropic.com', 212);
connectProvider('openai', 'sk-demo-not-a-real-key', 'https://api.openai.com/v1', 168);
connectProvider('deepseek', 'sk-demo-not-a-real-key', 'https://api.deepseek.com', 301);
const day = 86400_000;
saveAccount('claude', { accessToken: 'demo', email: 'ops@example.com', expiresAt: Date.now() + 6 * 3600_000 });
saveAccount('copilot', { accessToken: 'demo', email: 'ops-team', expiresAt: Date.now() + 25 * 60_000 });

const keys = getAllKeys();
const models: [string, string, number][] = [
  ['claude', 'claude-sonnet-4-5', 0.45], ['anthropic', 'claude-haiku-4-5', 0.15], ['openai', 'gpt-5-mini', 0.2],
  ['copilot', 'gpt-5', 0.12], ['deepseek', 'deepseek-chat', 0.08]
];
let rnd = 42; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
const pick = () => { let x = r(); for (const m of models) { if ((x -= m[2]) <= 0) return m; } return models[0]; };
const now = Date.now();
for (let i = 0; i < 420; i++) {
  const t = now - Math.floor(r() * 7 * day);
  const [provider, model] = pick();
  const key = keys[Math.floor(r() * keys.length)];
  const inputTokens = 400 + Math.floor(r() * 9000), outputTokens = 80 + Math.floor(r() * 1800);
  const err = r() < 0.04;
  appendUsage({ id: crypto.randomUUID(), timestamp: new Date(t).toISOString(), keyId: key?.id || 'copilot', keyName: key?.name || 'Dashboard copilot',
    provider, model, inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, durationMs: 600 + Math.floor(r() * 5200),
    status: err ? 'error' : 'success', statusCode: err ? 429 : 200, error: err ? 'rate limited, fell back to next in combo' : undefined, streaming: r() < 0.7 });
}

const who = [['admin', 'admin'], ['rina', 'operator'], ['dimas', 'operator'], ['auditor', 'viewer']];
const acts = [['POST', '/api/servers/prod-web-01/services/nginx/restart', 200], ['POST', '/api/exec', 200], ['GET', '/api/servers/db-primary/databases', 200],
  ['POST', '/api/servers/prod-api-01/docker/cache/restart', 200], ['DELETE', '/api/servers/prod-api-01/docker/old-migration', 200], ['POST', '/api/servers/prod-web-01/cron', 201],
  ['PUT', '/api/monitor', 200], ['POST', '/api/servers/worker-sgp-01/firewall', 403], ['POST', '/api/login', 401]] as const;
for (let i = 0; i < 60; i++) {
  const [user, role] = who[Math.floor(r() * who.length)];
  const [method, path, status] = acts[Math.floor(r() * acts.length)];
  writeAudit({ t: new Date(now - Math.floor(r() * 3 * day)).toISOString(), ip: `10.20.0.${10 + Math.floor(r() * 30)}`, method, path, user, role, status });
}
console.log('demo data seeded');
