// Run: npx tsx src/monitor.test.ts
import assert from 'node:assert/strict';
import { pickDomains, validateWebhook, esc } from './monitor.js';
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

console.log('monitor tests ok');
