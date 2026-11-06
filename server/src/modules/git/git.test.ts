import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveIntegration,
  listIntegrations,
  getRawIntegration,
  getDecryptedAccessToken,
  deleteIntegration,
  saveOAuthConfig,
  getOAuthConfig
} from './store.js';
import { detectFrameworkFromFiles } from './githubService.js';

test('Git Integration Store - saves, encrypts and lists integrations securely', () => {
  const accountId = 'test_998877';
  const rawToken = 'gho_secret_access_token_1234567890abcdef';

  const saved = saveIntegration({
    provider: 'github',
    account_id: accountId,
    username: 'octocat',
    display_name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231',
    scopes: ['repo', 'read:user', 'admin:repo_hook'],
    access_token: rawToken
  });

  assert.equal(saved.username, 'octocat');
  assert.equal(saved.has_token, true);
  // safe integration must not have raw token field
  assert.equal((saved as any).access_token, undefined);

  // In database, the raw record has encrypted access_token (not plain text)
  const raw = getRawIntegration(saved.id);
  assert.ok(raw);
  assert.notEqual(raw?.access_token, rawToken);
  assert.ok(raw?.access_token.includes(':')); // AES-256-GCM format iv:authTag:encrypted

  // Decryption returns exact original token
  const decrypted = getDecryptedAccessToken(raw!);
  assert.equal(decrypted, rawToken);

  // List integrations returns safe item
  const list = listIntegrations();
  const itemInList = list.find((i) => i.id === saved.id);
  assert.ok(itemInList);
  assert.equal(itemInList?.username, 'octocat');

  // Clean up
  deleteIntegration(saved.id);
  assert.equal(getRawIntegration(saved.id), null);
});

test('Git OAuth Config - stores and retrieves clientId/secret', () => {
  saveOAuthConfig({
    githubClientId: 'gh_test_client_id_123',
    githubClientSecret: 'gh_test_client_secret_456'
  });

  const cfg = getOAuthConfig();
  assert.equal(cfg.githubClientId, 'gh_test_client_id_123');
  assert.equal(cfg.githubClientSecret, 'gh_test_client_secret_456');
});

test('Framework Detection Engine - detects Docker preset', () => {
  const result = detectFrameworkFromFiles(['Dockerfile', 'README.md'], null, null);
  assert.equal(result.detected_engine, 'docker');
  assert.equal(result.framework, 'Docker');
  assert.equal(result.build_preset, 'Docker Container');
  assert.equal(result.suggested_config.internal_port, 3000);
});

test('Framework Detection Engine - detects Next.js application', () => {
  const pkg = JSON.stringify({
    name: 'my-next-app',
    dependencies: {
      next: '^14.2.0',
      react: '^18.2.0'
    },
    scripts: {
      build: 'next build',
      start: 'next start'
    }
  });

  const result = detectFrameworkFromFiles(['package.json', 'README.md'], pkg, null);
  assert.equal(result.detected_engine, 'native_node');
  assert.equal(result.framework, 'Next.js');
  assert.equal(result.suggested_config.build_command, 'npm run build');
  assert.equal(result.suggested_config.start_command, 'npm start');
  assert.equal(result.suggested_config.internal_port, 3000);
});

test('Framework Detection Engine - detects Express / Node.js API', () => {
  const pkg = JSON.stringify({
    name: 'my-api',
    dependencies: {
      express: '^4.19.0',
      cors: '^2.8.5'
    },
    scripts: {
      build: 'tsc',
      start: 'node dist/index.js'
    }
  });

  const result = detectFrameworkFromFiles(['package.json', 'tsconfig.json'], pkg, null);
  assert.equal(result.detected_engine, 'native_node');
  assert.equal(result.build_preset, 'Node.js API');
  assert.equal(result.suggested_config.internal_port, 3001);
});

test('Framework Detection Engine - detects Laravel application', () => {
  const comp = JSON.stringify({
    name: 'laravel/laravel',
    require: {
      php: '^8.2',
      'laravel/framework': '^11.0'
    }
  });

  const result = detectFrameworkFromFiles(['composer.json', 'artisan', 'public'], null, comp);
  assert.equal(result.detected_engine, 'native_php');
  assert.equal(result.framework, 'Laravel');
  assert.equal(result.suggested_config.root_dir, '/public');
  assert.ok(result.suggested_config.install_command.includes('composer install'));
});

test('Framework Detection Engine - detects Python FastAPI/Django', () => {
  const result = detectFrameworkFromFiles(['requirements.txt', 'main.py'], null, null);
  assert.equal(result.detected_engine, 'native_python');
  assert.equal(result.suggested_config.start_command, 'python main.py');
});

