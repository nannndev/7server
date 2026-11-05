import assert from 'node:assert';
import {
  createVirtualKey,
  getAllKeys,
  getKeyBySecret,
  deleteVirtualKey,
  toggleVirtualKey,
  saveGatewayConfig,
  getClientConfig,
  getInternalConfig,
  addUsageLog,
  getUsageLogs,
  getGatewayStats
} from './store.js';
import { authenticateVirtualKey } from './service.js';

console.log('Testing 7Server AI Gateway store & service...');

// 1. Virtual Key Management
const testKeyName = 'Test-Claude-Code-CLI';
const createdKey = createVirtualKey(testKeyName, ['anthropic']);
const secret = createdKey.key!; // only returned at creation
assert.ok(createdKey.id, 'Key ID should be generated');
assert.ok(secret.startsWith('7s-sk-'), 'Key should start with 7s-sk-');
assert.equal((createdKey as any).keyHash, undefined, 'creation response carries the key, not the hash');
// Stored form: hash only, never the key.
const stored = getAllKeys().find((k) => k.id === createdKey.id)!;
assert.equal(stored.key, undefined, 'full key is never stored');
assert.match(stored.keyHash!, /^[0-9a-f]{64}$/);
assert.strictEqual(createdKey.name, testKeyName);
assert.strictEqual(createdKey.enabled, true);
assert.deepStrictEqual(createdKey.allowedProviders, ['anthropic']);

// Lookup by secret
const foundKey = getKeyBySecret(secret);
assert.ok(foundKey, 'Key should be found by exact secret');
assert.strictEqual(foundKey?.id, createdKey.id);

// Auth helper tests
const reqBearer = {
  headers: { authorization: `Bearer ${createdKey.key}` },
  socket: {}
} as any;
const authenticatedFromBearer = authenticateVirtualKey(reqBearer);
assert.strictEqual(authenticatedFromBearer?.id, createdKey.id);

const reqXApiKey = {
  headers: { 'x-api-key': createdKey.key },
  socket: {}
} as any;
const authenticatedFromHeader = authenticateVirtualKey(reqXApiKey);
assert.strictEqual(authenticatedFromHeader?.id, createdKey.id);

// Disable key test
toggleVirtualKey(createdKey.id, false);
const disabledLookup = getKeyBySecret(secret);
assert.strictEqual(disabledLookup, null, 'Disabled key should not be returned by secret lookup');

// Re-enable
toggleVirtualKey(createdKey.id, true);
assert.ok(getKeyBySecret(secret), 'Re-enabled key should be found');

// 2. Upstream Master Key Encryption & Masking
const dummyMasterKey = 'sk-ant-api03-abcdef1234567890-XYZ';
saveGatewayConfig({
  providers: {
    anthropic: {
      enabled: true,
      apiKey: dummyMasterKey,
      baseUrl: 'https://api.anthropic.com'
    }
  }
});

// Internal config must return decrypted key
const internal = getInternalConfig();
assert.strictEqual(internal.providers.anthropic?.apiKey, dummyMasterKey, 'Internal config should have decrypted key');

// Client config must return masked key
const clientCfg = getClientConfig();
assert.ok(clientCfg.providers.anthropic?.apiKey?.includes('...'), 'Client config must be masked');
assert.ok(!clientCfg.providers.anthropic?.apiKey?.includes('1234567890'), 'Client config must not contain full master key');

// 3. Usage Logging
addUsageLog({
  keyId: createdKey.id,
  keyName: createdKey.name,
  provider: 'anthropic',
  model: 'claude-3-7-sonnet-20250219',
  inputTokens: 150,
  outputTokens: 75,
  durationMs: 420,
  status: 'success',
  statusCode: 200,
  streaming: true
});

const logs = getUsageLogs(10);
assert.ok(logs.length > 0, 'Should have recorded usage log');
assert.strictEqual(logs[0].keyId, createdKey.id);
assert.strictEqual(logs[0].totalTokens, 225);

const stats = getGatewayStats();
assert.ok(stats.totalRequests >= 1);
assert.ok(stats.totalInputTokens >= 150);
assert.ok(stats.totalOutputTokens >= 75);

// Clean up test key and dummy config
deleteVirtualKey(createdKey.id);
assert.strictEqual(getKeyBySecret(secret), null, 'Deleted key should no longer exist');

saveGatewayConfig({
  providers: {
    anthropic: {
      enabled: false,
      connected: false,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com'
    }
  }
});

console.log('AI Gateway unit tests passed successfully!');

