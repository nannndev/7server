import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config.js';


if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const KEY_FILE = path.join(DATA_DIR, 'secret.key');
let MASTER_KEY: Buffer;

if (fs.existsSync(KEY_FILE)) {
  MASTER_KEY = fs.readFileSync(KEY_FILE);
} else {
  MASTER_KEY = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, MASTER_KEY, { mode: 0o600 });
}

export function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // unencrypted fallback
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('Decryption error:', err.message);
    return '';
  }
}

