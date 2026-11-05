import assert from 'node:assert';
import { parseCertbotOutput } from './service.js';

console.log('Testing certbot output parser...');

const sampleOutput = `
Saving debug log to /var/log/letsencrypt/letsencrypt.log

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Found the following certs:
  Certificate Name: api.myvps.app
    Serial Number: 4b29f03221919
    Key Type: ECDSA
    Domains: api.myvps.app
    Expiry Date: 2026-12-30 08:34:11+00:00 (VALID: 56 days)
    Certificate Path: /etc/letsencrypt/live/api.myvps.app/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/api.myvps.app/privkey.pem
  Certificate Name: myvps.app
    Serial Number: 3a187654321
    Key Type: RSA
    Domains: myvps.app www.myvps.app
    Expiry Date: 2026-11-20 14:10:00+00:00 (VALID: 16 days)
    Certificate Path: /etc/letsencrypt/live/myvps.app/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/myvps.app/privkey.pem
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
`;

const certs = parseCertbotOutput(sampleOutput);

assert.strictEqual(certs.length, 2, `Expected 2 certificates, got ${certs.length}`);

// Cert 1
assert.strictEqual(certs[0].name, 'api.myvps.app');
assert.deepStrictEqual(certs[0].domains, ['api.myvps.app']);
assert.strictEqual(certs[0].daysRemaining, 56);
assert.strictEqual(certs[0].isValid, true);
assert.strictEqual(certs[0].isExpiringSoon, false);
assert.strictEqual(certs[0].certPath, '/etc/letsencrypt/live/api.myvps.app/fullchain.pem');

// Cert 2
assert.strictEqual(certs[1].name, 'myvps.app');
assert.deepStrictEqual(certs[1].domains, ['myvps.app', 'www.myvps.app']);
assert.strictEqual(certs[1].daysRemaining, 16);
assert.strictEqual(certs[1].isValid, true);
assert.strictEqual(certs[1].isExpiringSoon, true); // <= 30 days

console.log('certificate tests ok');

