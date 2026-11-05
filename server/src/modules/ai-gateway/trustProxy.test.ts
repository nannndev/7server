// Run: npx tsx src/modules/ai-gateway/trustProxy.test.ts
// The internal-only guard must not be fooled by a forged X-Forwarded-For, and must see the real
// client behind a trusted proxy. Boots a tiny app on a random port (no data dir writes needed).
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { internalOnly } from './internalOnly.js';

async function probe(trust: string | false, xff?: string) {
  const app = express();
  if (trust) app.set('trust proxy', trust);
  app.get('/x', internalOnly, (_req, res) => { res.json({ ok: true }); });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const { port } = server.address() as { port: number };
  const res = await fetch(`http://127.0.0.1:${port}/x`, { headers: xff ? { 'x-forwarded-for': xff } : {} });
  server.close();
  return res.status;
}

// No trust: socket is 127.0.0.1, header ignored either way -> allowed (loopback is internal).
assert.equal(await probe(false), 200);
assert.equal(await probe(false, '8.8.8.8'), 200, 'header must be ignored when no proxy is trusted');
// Trusted local proxy: the client behind it decides.
assert.equal(await probe('loopback', '8.8.8.8'), 403, 'public client behind a trusted proxy is rejected');
assert.equal(await probe('loopback', '10.1.2.3'), 200, 'private client behind a trusted proxy is allowed');
// A client can't prepend a fake private hop: Express takes the right-most untrusted address.
assert.equal(await probe('loopback', '10.0.0.1, 8.8.8.8'), 403, 'spoofed private hop must not win');
console.log('trust proxy tests ok');
