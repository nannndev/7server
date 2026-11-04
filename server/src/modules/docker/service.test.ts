// Run: npx tsx src/dockerService.test.ts
import assert from 'node:assert/strict';
import { checkName, containerCommand, composeCommand, pruneCommand, imageRemoveCommand } from './service.js';

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

console.log('docker tests ok');
