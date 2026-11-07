import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCloudflaredConfig, addCloudflaredRoute, removeCloudflaredRoute } from './service.js';

describe('Cloudflare Tunnel Config Parser & Manipulator', () => {
  const sampleConfig = `tunnel: f1500da5-68d3-4b7d-87f8-b8bfb681c496
credentials-file: /etc/cloudflared/f1500da5-68d3-4b7d-87f8-b8bfb681c496.json

ingress:
  - hostname: supraairways.space
    service: http://localhost:80
  - hostname: www.supraairways.space
    service: http://localhost:80
  - service: http_status:404
`;

  it('parses tunnel id and ingress routes accurately', () => {
    const res = parseCloudflaredConfig(sampleConfig);
    assert.strictEqual(res.tunnelId, 'f1500da5-68d3-4b7d-87f8-b8bfb681c496');
    assert.strictEqual(res.routes.length, 3);
    assert.strictEqual(res.routes[0].hostname, 'supraairways.space');
    assert.strictEqual(res.routes[0].service, 'http://localhost:80');
    assert.strictEqual(res.routes[1].hostname, 'www.supraairways.space');
    assert.strictEqual(res.routes[2].service, 'http_status:404');
  });

  it('adds a new ingress route before 404 fallback', () => {
    const updated = addCloudflaredRoute(sampleConfig, {
      hostname: 'mainwarewolf.supraairways.space',
      service: 'http://localhost:3004'
    });
    const parsed = parseCloudflaredConfig(updated);
    assert.strictEqual(parsed.routes.length, 4);
    assert.strictEqual(parsed.routes[2].hostname, 'mainwarewolf.supraairways.space');
    assert.strictEqual(parsed.routes[2].service, 'http://localhost:3004');
    assert.strictEqual(parsed.routes[3].service, 'http_status:404');
  });

  it('updates service if hostname already exists', () => {
    const updated = addCloudflaredRoute(sampleConfig, {
      hostname: 'supraairways.space',
      service: 'http://localhost:8080'
    });
    const parsed = parseCloudflaredConfig(updated);
    assert.strictEqual(parsed.routes.length, 3);
    assert.strictEqual(parsed.routes[0].hostname, 'supraairways.space');
    assert.strictEqual(parsed.routes[0].service, 'http://localhost:8080');
  });

  it('removes an ingress route by hostname', () => {
    const updated = removeCloudflaredRoute(sampleConfig, 'www.supraairways.space');
    const parsed = parseCloudflaredConfig(updated);
    assert.strictEqual(parsed.routes.length, 2);
    assert.strictEqual(parsed.routes[0].hostname, 'supraairways.space');
    assert.strictEqual(parsed.routes[1].service, 'http_status:404');
  });
});

