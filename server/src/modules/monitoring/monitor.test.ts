// Run: npx tsx src/monitor.test.ts
import assert from 'node:assert/strict';
import {
  acknowledgeAlert,
  clearAlertHistory,
  evaluateMetrics,
  getActiveAlerts,
  getAlertHistory,
  pickDomains,
  validateCustomWebhook,
  validateWebhook,
  esc
} from './monitor.js';
import { auditSummary } from '../../infra/audit.js';

assert.deepEqual(
  pickDomains(['_', '203.0.113.10', 'erp.example.com', 'www.erp.example.com', 'www.only.com', 'localhost', '*.x.com', 'ERP.example.com']),
  ['erp.example.com', 'www.only.com']
);

const s = auditSummary({ command: 'ls', password: 'x', privateKey: 'k', content: 'secret file body', path: '/etc/a', discordWebhook: 'https://discord.com/api/webhooks/1/t' });
assert.equal(s.split(' ').some((p) => p.endsWith('=x')), false); // password value not leaked
assert.equal(/secret|password|privateKey|discordWebhook|webhooks/.test(s), false);
assert.match(s, /command=ls/);
assert.match(s, /path=\/etc\/a/);

// Webhook allowlist: only Discord webhook URLs, no SSRF to arbitrary hosts.
assert.equal(validateWebhook(' https://discord.com/api/webhooks/123/abc-DEF_9 '), 'https://discord.com/api/webhooks/123/abc-DEF_9');
assert.ok(validateWebhook('https://discordapp.com/api/webhooks/1/x'));
for (const bad of ['http://discord.com/api/webhooks/1/x', 'https://evil.com/api/webhooks/1/x', 'https://discord.com.evil.com/api/webhooks/1/x',
  'https://discord.com/api/webhooks/1/x?wait=1', 'https://169.254.169.254/', '', 'https://discord.com/api/webhooks/abc/x']) {
  assert.throws(() => validateWebhook(bad), bad);
}

// Discord markdown escaping keeps names literal.
assert.equal(esc('my_app *prod* `x`'), 'my\\_app \\*prod\\* \\`x\\`');

// Custom webhook validation
assert.equal(validateCustomWebhook('https://ntfy.sh/7server-alerts'), 'https://ntfy.sh/7server-alerts');
assert.throws(() => validateCustomWebhook('ftp://bad.example.com'));

// Alert trigger, acknowledge & recovery history
clearAlertHistory();
evaluateMetrics('srv-test', 'test-1', { cpuUsagePercent: 95, memory: { usedPercent: 40 }, disk: { usedPercent: 50 } }, { cpu: 90, mem: 90, disk: 90 });
let active = getActiveAlerts();
assert.ok(active.some((a) => a.key === 'srv:test-1:cpu' && !a.acknowledged));
assert.equal(acknowledgeAlert('srv:test-1:cpu'), true);
assert.equal(getActiveAlerts().find((a) => a.key === 'srv:test-1:cpu')?.acknowledged, true);

evaluateMetrics('srv-test', 'test-1', { cpuUsagePercent: 25, memory: { usedPercent: 40 }, disk: { usedPercent: 50 } }, { cpu: 90, mem: 90, disk: 90 });
assert.equal(getActiveAlerts().some((a) => a.key === 'srv:test-1:cpu'), false);
const hist = getAlertHistory();
assert.equal(hist[0].type, 'recovered');
assert.equal(hist[1].type, 'triggered');
clearAlertHistory();

console.log('monitor tests ok');
