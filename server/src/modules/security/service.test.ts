import assert from 'node:assert';
import { parseAuthorizedKeys } from './service.js';

console.log('Testing SSH authorized_keys parsing...');

const sampleAuthorizedKeys = `
# Admin developer keys
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyDev1 user@macbook-pro

# CI/CD Runner Key
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQExampleKeyRSA github-actions@deploy-runner

# Key with options prefix
command="dump-db" ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyBackup backup-robot
`;

const keys = parseAuthorizedKeys(sampleAuthorizedKeys);

assert.strictEqual(keys.length, 3, `Expected 3 parsed SSH keys, got ${keys.length}`);

// Key 1
assert.strictEqual(keys[0].type, 'ssh-ed25519');
assert.ok(keys[0].key.startsWith('AAAAC3NzaC1lZDI1NTE5'));
assert.strictEqual(keys[0].comment, 'user@macbook-pro');

// Key 2
assert.strictEqual(keys[1].type, 'ssh-rsa');
assert.ok(keys[1].key.startsWith('AAAAB3NzaC1yc2E'));
assert.strictEqual(keys[1].comment, 'github-actions@deploy-runner');

// Key 3
assert.strictEqual(keys[2].type, 'ssh-ed25519');
assert.ok(keys[2].comment.includes('backup-robot'));

console.log('security tests ok');

