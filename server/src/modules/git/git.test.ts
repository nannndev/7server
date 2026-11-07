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


// Node major the repo needs: lowest major any declared range allows.
{
  const { minNodeMajor } = await import('./githubService.js');
  const cases: [string | null, number | undefined][] = [
    ['^22.11.0 || ^24.11.0 || >=26.0', 22], ['>=18', 18], ['v20.10.0\n', 20], ['20', 20],
    ['lts/*', undefined], ['>= 22.x', 22], ['', undefined], [null, undefined], ['18.x || 20.x', 18]
  ];
  for (const [input, want] of cases) assert.equal(minNodeMajor(input), want, String(input));
}

// Compose handling: published ports, and a db-only compose next to a Node app is a sidecar, not the app.
{
  const { readCompose } = await import('./githubService.js');
  const pg = `services:\n  db:\n    image: postgres:16-alpine\n    container_name: warnet_postgres\n    ports:\n      - "5432:5432"\n`;
  assert.deepEqual(readCompose(pg), { ports: [5432], builds: false });
  assert.deepEqual(readCompose(`services:\n  web:\n    build: .\n    ports:\n      - 127.0.0.1:8080:80\n      - "9000"\n`), { ports: [8080, 9000], builds: true });

  const pkg = JSON.stringify({ dependencies: { next: '14' }, scripts: { build: 'next build', start: 'next start' } });
  const sidecar = detectFrameworkFromFiles(['package.json', 'docker-compose.yml'], pkg, null, pg);
  assert.equal(sidecar.detected_engine, 'native_node', 'db-only compose must not make a Node app "Docker"');

  const app = detectFrameworkFromFiles(['docker-compose.yml'], null, null, `services:\n  web:\n    build: .\n    ports:\n      - "8080:80"\n  db:\n    image: postgres\n    ports:\n      - "5432:5432"\n`);
  assert.equal(app.detected_engine, 'docker');
  assert.equal(app.suggested_config.internal_port, 8080, 'uses the app port, not the database port');

  const { readDockerfilePort } = await import('./githubService.js');
  assert.equal(readDockerfilePort('FROM node:20\nEXPOSE 4000/tcp\nCMD ["node","index.js"]'), 4000);
  const pnpmMonorepo = detectFrameworkFromFiles(
    ['package.json', 'nuxt.config.ts'],
    JSON.stringify({ dependencies: { nuxt: '^3.13.0' }, scripts: { build: 'nuxt build' } }),
    null,
    null,
    null,
    ['pnpm-lock.yaml', 'pnpm-workspace.yaml']
  );
  assert.equal(pnpmMonorepo.framework, 'Nuxt');
  assert.equal(pnpmMonorepo.suggested_config.install_command, 'pnpm install');
  assert.equal(pnpmMonorepo.suggested_config.build_command, 'pnpm run build');
  assert.equal(pnpmMonorepo.suggested_config.start_command, 'node .output/server/index.mjs');
}
