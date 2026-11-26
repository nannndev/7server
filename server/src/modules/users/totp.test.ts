// Tests for TOTP engine, Base32 encoding, and Recovery codes
import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  base32Encode, 
  base32Decode, 
  generateTotpSecret, 
  generateTotpCode, 
  verifyTotpCode, 
  generateRecoveryCodes, 
  hashRecoveryCode 
} from './totp.js';

test('Base32 encoding and decoding round-trip', () => {
  const inputs = ['Hello', 'World', '7Server-Rocks!', 'RFC4648-Standard-Test'];
  for (const str of inputs) {
    const buf = Buffer.from(str, 'utf8');
    const enc = base32Encode(buf);
    const dec = base32Decode(enc);
    assert.equal(dec.toString('utf8'), str);
  }
});

test('TOTP code generation and time window verification', () => {
  const secret = generateTotpSecret();
  assert.ok(secret.length >= 32);

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  const currentCode = generateTotpCode(secret, currentStep);

  assert.equal(currentCode.length, 6);
  assert.ok(/^\d{6}$/.test(currentCode));

  // Verify current code
  assert.equal(verifyTotpCode(secret, currentCode), true);

  // Verify clock skew ±1 step window
  const pastCode = generateTotpCode(secret, currentStep - 1);
  const futureCode = generateTotpCode(secret, currentStep + 1);
  assert.equal(verifyTotpCode(secret, pastCode), true);
  assert.equal(verifyTotpCode(secret, futureCode), true);

  // Far future / past (>1 step) fails
  const farPastCode = generateTotpCode(secret, currentStep - 3);
  assert.equal(verifyTotpCode(secret, farPastCode), false);

  // Wrong code fails
  assert.equal(verifyTotpCode(secret, '000000' === currentCode ? '111111' : '000000'), false);
});

test('Recovery codes generation, format, and hashing', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);

  for (const c of codes) {
    assert.match(c, /^[A-F0-9]{4}-[A-F0-9]{4}$/);
    const hash1 = hashRecoveryCode(c);
    // Case-insensitivity and hyphen-ignoring
    const hash2 = hashRecoveryCode(c.toLowerCase().replace('-', ''));
    assert.equal(hash1, hash2);
  }
});
