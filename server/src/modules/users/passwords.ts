import crypto from 'crypto';

/**
 * Hash password using Node.js built-in scrypt with a unique random salt.
 * Format: "salt:hexHash"
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify password against stored "salt:hexHash" using constant-time comparison.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;

  const keyBuffer = Buffer.from(keyHex, 'hex');

  return new Promise((resolve) => {
    crypto.scrypt(password, salt, keyBuffer.length, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

/**
 * SHA-256 hash of random session token for safe persistence.
 * Raw tokens are never written to disk; only hashes are stored.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate cryptographically secure random session token.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

