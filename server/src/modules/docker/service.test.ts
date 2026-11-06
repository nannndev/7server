// Run: npx tsx src/modules/docker/service.test.ts
import assert from 'node:assert/strict';
import {
  checkName,
  containerCommand,
  composeCommand,
  pruneCommand,
  imageRemoveCommand,
  pullImageCommand,
  volumeCreateCommand,
  volumeRemoveCommand,
  networkCreateCommand,
  networkRemoveCommand,
  runContainerCommand
} from './service.js';

assert.equal(containerCommand('erp-pos-app', 'restart'), "docker restart 'erp-pos-app'");
assert.equal(containerCommand('abc123', 'rm'), "docker rm -f 'abc123'");
assert.throws(() => containerCommand('x', 'exec'));
for (const bad of ["a;rm -rf /", "a'b", "$(id)", "a b", "", "-rf", "a`id`", "../x"]) assert.throws(() => checkName(bad), bad);

assert.match(composeCommand('global-erp-pos-api-prod', '/home/deploy/erp-pos', 'pull-up'), /^cd '\/home\/deploy\/erp-pos' && DC="docker compose -p global-erp-pos-api-prod"/);
assert.throws(() => composeCommand('p', '/x; rm -rf /', 'up'));
assert.throws(() => composeCommand('p', '/a/../etc', 'up'));
assert.throws(() => composeCommand('p', 'relative', 'up'));
assert.throws(() => composeCommand('p', '/x', 'exec sh'));
assert.match(
  composeCommand('dongjung-api', '/var/www/d/api', 'ps', '/var/www/d/api/docker-compose.prod.yml,/var/www/d/api/override.yml'),
  /docker compose -p dongjung-api -f \/var\/www\/d\/api\/docker-compose.prod.yml -f \/var\/www\/d\/api\/override.yml"/
);
assert.throws(() => composeCommand('p', '/x', 'up', "/x/a.yml'; id #"));
assert.throws(() => composeCommand('p', '/x', 'up', '/x/../etc/passwd'));
assert.throws(() => composeCommand('p', '/x', 'up', '/x/a b.yml')); // space would word-split inside DC
assert.throws(() => composeCommand('p$(id)', '/x', 'up'));

assert.equal(pruneCommand('build-cache'), 'docker builder prune -af 2>&1');
assert.throws(() => pruneCommand('system --all'));
assert.equal(imageRemoveCommand('ghcr.io/irsyad-hash/k-motion-ui:164445c6b514'), "docker rmi 'ghcr.io/irsyad-hash/k-motion-ui:164445c6b514' 2>&1");
assert.throws(() => imageRemoveCommand('img;id'));

// New feature tests:
assert.equal(pullImageCommand('node:22-alpine'), "docker pull 'node:22-alpine' 2>&1");
assert.equal(pullImageCommand('redis:7.2'), "docker pull 'redis:7.2' 2>&1");
assert.throws(() => pullImageCommand('node; rm -rf /'));

assert.equal(volumeCreateCommand('pgdata'), "docker volume create 'pgdata' 2>&1");
assert.equal(volumeCreateCommand('custom_vol', 'local'), "docker volume create --driver 'local' 'custom_vol' 2>&1");
assert.equal(volumeRemoveCommand('pgdata'), "docker volume rm 'pgdata' 2>&1");
assert.throws(() => volumeCreateCommand('vol;id'));

assert.equal(networkCreateCommand('app_net'), "docker network create 'app_net' 2>&1");
assert.equal(networkCreateCommand('custom_net', 'bridge', '172.28.0.0/16'), "docker network create --driver 'bridge' --subnet '172.28.0.0/16' 'custom_net' 2>&1");
assert.equal(networkRemoveCommand('app_net'), "docker network rm 'app_net' 2>&1");
assert.throws(() => networkRemoveCommand('bridge')); // default protected
assert.throws(() => networkRemoveCommand('host')); // default protected

const runCmd = runContainerCommand({
  name: 'my-web',
  image: 'nginx:alpine',
  ports: ['8080:80'],
  env: ['APP_ENV=prod', 'API_KEY=xyz123'],
  volumes: ['web_data:/usr/share/nginx/html:ro'],
  network: 'app_net',
  restart: 'unless-stopped',
  memory: '512m'
});
assert.match(runCmd, /^docker run -d --name 'my-web' --restart unless-stopped --network 'app_net' --memory 512m -p '8080:80' -e 'APP_ENV=prod' -e 'API_KEY=xyz123' -v 'web_data:\/usr\/share\/nginx\/html:ro' 'nginx:alpine'/);

console.log('docker tests ok');
