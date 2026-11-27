// Standard RFC 6238 TOTP (Time-based One-Time Password) implementation.
// Zero external dependencies; uses native node:crypto. Compatible with Google Authenticator,
// 1Password, Authy, Apple Passwords, bitwarden, etc.
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string to buffer.
 */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error(`Invalid base32 character: ${cleaned[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random 20-byte Base32 secret for TOTP.
 */
export function generateTotpSecret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Generates an otpauth:// URL for QR code scanners.
 */
export function generateOtpAuthUri(username: string, secret: string, issuer = '7Server'): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Computes the 6-digit TOTP code for a secret and time step.
 */
export function generateTotpCode(secretBase32: string, timeStep = Math.floor(Date.now() / 1000 / 30)): string {
  const key = base32Decode(secretBase32);
  const counterBuffer = Buffer.alloc(8);
  // Big-endian 64-bit integer
  counterBuffer.writeBigUInt64BE(BigInt(timeStep), 0);

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verifies a 6-digit TOTP code with ±1 step (30s) clock-skew window.
 */
export function verifyTotpCode(secretBase32: string, code: string, windowSteps = 1): boolean {
  if (!code || !secretBase32) return false;
  const trimmed = code.trim().replace(/\s+/g, '');
  if (trimmed.length !== 6) return false;

  const currentStep = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = generateTotpCode(secretBase32, currentStep + offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(trimmed))) {
      return true;
    }
  }
  return false;
}

/**
 * Generates 10 human-readable recovery codes formatted like "XXXX-XXXX".
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Hashes a recovery code for secure storage in the database.
 */
export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}
