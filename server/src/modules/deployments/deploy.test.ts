import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseDeploySpec, buildDeployScript } from './deploy.js';
import {
  saveDeployConfig,
  getDeployConfig,
  listDeployConfigs,
  deleteDeployConfig,
  createDeployRecord,
  finishDeployRecord,
  listDeployHistory,
  extractCommitFromOutput
} from './store.js';
import { verifyWebhookSignature } from './runner.js';

const base = { appName: 'my-app', repo: 'acme/web', branch: 'main', rootDir: '/', port: 3000, installCmd: 'npm ci', buildCmd: 'npm run build', startCmd: 'npm start', domain: 'app.example.com', engine: 'native_node', env: [{ key: 'NODE_ENV', value: "it's prod" }] };

// Anything that lands unquoted in a root script must be rejected.
for (const bad of [
  { appName: '../etc' }, { appName: 'a;rm -rf /' }, { repo: 'acme/web;id' }, { repo: '../x' }, { branch: '--upload-pack=x' },
  { branch: 'a b' }, { rootDir: '../../etc' }, { port: 0 }, { port: 70000 }, { domain: 'x.com;id' }, { env: [{ key: 'A B', value: '' }] }
]) {
  assert.throws(() => parseDeploySpec({ ...base, ...bad }), JSON.stringify(bad));
}

const spec = parseDeploySpec(base);
const script = buildDeployScript(spec, 'ghp_secret');
assert.ok(!script.includes('ghp_secret'), 'raw token must not appear (base64 header only)');
assert.ok(!script.includes('ghp_secret@github.com'), 'token must not be put in the clone URL');
for (const st of ['clone', 'env', 'install', 'build', 'process', 'health']) assert.ok(script.includes(`step ${st}`), st);
assert.ok(script.includes(`printf '%s=%s\\n' 'NODE_ENV'`), 'env key is shell-quoted');
assert.ok(script.includes(`it'\\''s prod"`), 'env value with whitespace is safely quoted for dotenv parsers');

// formatDotenvValue unit tests
{
  const { formatDotenvValue } = await import('./deploy.js');
  assert.equal(formatDotenvValue('Marketplace Booking System'), '"Marketplace Booking System"');
  assert.equal(formatDotenvValue('"Already Quoted"'), '"Already Quoted"');
  assert.equal(formatDotenvValue('simple_val'), 'simple_val');
  assert.equal(formatDotenvValue('val with spaces'), '"val with spaces"');
  assert.equal(formatDotenvValue(''), '');
}

// Generated scripts must at least parse in bash for every engine / domain combination.
for (const engine of ['docker', 'native_node', 'native_php', 'static']) {
  for (const domain of ['', 'app.example.com']) {
    const s = buildDeployScript(parseDeploySpec({ ...base, engine, domain, startCmd: engine === 'static' ? '' : 'npm start' }));
    execFileSync('bash', ['-n'], { input: s });
  }
}
assert.ok(buildDeployScript(parseDeploySpec({ ...base, nodeMajor: 22 })).includes('-lt 22 ]'), 'node guard');
assert.equal(parseDeploySpec({ ...base, nodeMajor: '22; id' }).nodeMajor, undefined, 'nodeMajor must be an integer');
execFileSync('bash', ['-n'], { input: buildDeployScript(parseDeploySpec({ ...base, nodeMajor: 22 })) });
// Static app with no domain: Nginx serves the build on the chosen port.
{
  const st = buildDeployScript(parseDeploySpec({ ...base, engine: 'static', startCmd: '', domain: '', port: 8081 }));
  assert.ok(st.includes('listen 8081;') && st.includes('server_name _;'), 'static site served on its port');
  assert.ok(!st.includes('certbot --nginx -d  '), 'no certbot without a domain');
  execFileSync('bash', ['-n'], { input: st });
}
{
  const { buildRemoveScript, buildPointDomainScript } = await import('./deploy.js');
  for (const bad of ['', '..', 'html', '../etc', 'a b', 'x;id', '-rf', '$(id)']) assert.throws(() => buildRemoveScript(bad), bad);
  const r = buildRemoveScript('my-app');
  assert.ok(r.includes("DIR='/var/www/my-app'"));
  assert.ok(r.includes('also used by other apps'), 'shared nginx configs are kept');
  execFileSync('bash', ['-n'], { input: r });

  // buildPointDomainScript validation & bash syntax
  assert.throws(() => buildPointDomainScript({ appName: 'bad/app', domain: 'sub.domain.com' }));
  assert.throws(() => buildPointDomainScript({ appName: 'myapp', domain: 'bad domain; id' }));
  assert.throws(() => buildPointDomainScript({ appName: 'myapp', domain: 'sub.domain.com', port: 999999 }));

  const scriptProxied = buildPointDomainScript({ appName: 'my-app', domain: 'app.example.com', port: 3000, enableSsl: true });
  assert.ok(scriptProxied.includes('proxy_pass http://127.0.0.1:3000;'));
  assert.ok(scriptProxied.includes('certbot --nginx -d app.example.com'));
  execFileSync('bash', ['-n'], { input: scriptProxied });

  const scriptStatic = buildPointDomainScript({ appName: 'static-app', domain: 'static.example.com', enableSsl: false });
  assert.ok(scriptStatic.includes('root $WEBROOT;'));
  assert.ok(!scriptStatic.includes('certbot --nginx'));
  execFileSync('bash', ['-n'], { input: scriptStatic });
}
assert.ok(buildDeployScript(parseDeploySpec({ ...base, composeSidecar: true })).includes('docker compose up -d'), 'sidecar compose started');
assert.ok(spec && buildDeployScript(spec).includes('exit 1\n    fi\n    sleep 2'), 'dead port fails the deploy');
// run_step from the real script: success continues, failure stops with the step's exit code.
{
  const full = buildDeployScript(spec);
  const fn = full.slice(full.indexOf('run_step() {'), full.indexOf('\n}\n', full.indexOf('run_step() {')) + 3);
  const run = (body: string) => {
    try { return { out: execFileSync('bash', ['-c', `set -eo pipefail\n${fn}\n${body}`], { encoding: 'utf8' }), code: 0 }; }
    catch (e: any) { return { out: String(e.stdout), code: e.status }; }
  };
  assert.deepEqual(run("run_step 'echo built'; echo after"), { out: 'built\nafter\n', code: 0 });
  assert.equal(run("run_step 'exit 7'; echo after").code, 7);
}
// Docker without domain publishes on 0.0.0.0 (not 127.0.0.1); with domain binds 127.0.0.1 behind Nginx.
{
  const noDom = buildDeployScript(parseDeploySpec({ ...base, engine: 'docker', domain: '', port: 3005 }));
  assert.ok(noDom.includes('-p 3005:"$CPORT"'), 'Docker without domain publishes externally on 0.0.0.0:3005');
  assert.ok(!noDom.includes('-p 127.0.0.1:3005'), 'Docker without domain must not bind only to localhost');
  const withDom = buildDeployScript(parseDeploySpec({ ...base, engine: 'docker', domain: 'app.example.com', port: 3005 }));
  assert.ok(withDom.includes('-p 127.0.0.1:3005:"$CPORT"'), 'Docker with domain binds 127.0.0.1 behind Nginx');
  assert.ok(!withDom.includes("printf '%s=%s\\n' 'NITRO_PORT' '3005'"), 'Docker must not inject NITRO_PORT to avoid breaking container internal port mapping');
  assert.ok(!withDom.includes("printf '%s=%s\\n' 'PORT' '3005'"), 'Docker must not inject PORT to avoid breaking container internal port mapping');
}
// PM2 runner script (.7server-start.sh) exports PORT, NITRO_PORT, NUXT_PORT and HOST=0.0.0.0 so Nuxt/Next/Node never reuse stale PM2 daemon env.
{
  const nuxt = buildDeployScript(parseDeploySpec({ ...base, engine: 'native_node', domain: '', port: 3002, startCmd: 'node .output/server/index.mjs' }));
  assert.ok(nuxt.includes('export PORT=3002 NITRO_PORT=3002 NUXT_PORT=3002'), 'runner script exports chosen port');
  assert.ok(nuxt.includes('export HOST=0.0.0.0 NITRO_HOST=0.0.0.0 NUXT_HOST=0.0.0.0 HOSTNAME=0.0.0.0'), 'runner script forces 0.0.0.0 host binding');
  assert.ok(nuxt.includes('pm2 start ./.7server-start.sh'), 'PM2 starts via isolated runner script');
  assert.ok(nuxt.includes('[ -r .env ] && . ./.env || true'), 'runner script safely sources .env only if readable');
  assert.ok(nuxt.includes('chmod 644 .env'), 'env file has 0644 readable permissions');
  assert.ok(nuxt.includes('cleanup_on_failure'), 'cleanup trap registered for failure rollback');
}
console.log('deploy ok');
// No-domain health check must not die silently when ss shows no listener (set -e + pipefail + grep no-match).
{
  const full = buildDeployScript(parseDeploySpec({ ...base, domain: '', port: 3001 }));
  assert.ok(full.includes("grep -E ':3001$' | head -n 1 || true)"), 'bind lookup tolerates no match');
  assert.ok(full.includes("trap 'echo \"Deploy script stopped at line"), 'unexpected failures are reported');
  const probe = `set -eo pipefail\nbind=$(printf '' | awk '{print $4}' | grep -E ':3001$' | head -n 1 || true)\necho survived`;
  assert.equal(execFileSync('bash', ['-c', probe], { encoding: 'utf8' }).trim(), 'survived');
}
// A port held outside this Linux (WSL host) answers 127.0.0.1 but is invisible to ss: refuse it before starting, never report "live".
{
  const full = buildDeployScript(parseDeploySpec({ ...base, domain: '', port: 3001 }));
  assert.ok(full.includes('if port_probe 3001; then'), 'pre-start probe for ghost ports');
  assert.ok(full.includes('Deployment is NOT live'), 'no listener behind a 200 fails the deploy');
  assert.ok(!full.includes('App process is online; continuing'), 'pm2 "online" must not mask a crash');
  const probe = `port_probe() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }\nif port_probe 1; then echo busy; else echo free; fi`;
  assert.equal(execFileSync('bash', ['-c', probe], { encoding: 'utf8' }).trim(), 'free');
}

// Hosts without systemd (containers, WSL1) must still reload Nginx.
assert.ok(buildDeployScript(parseDeploySpec({ ...base })).includes('systemctl reload nginx 2>/dev/null || nginx -s reload'));
console.log('nginx reload fallback ok');

// Docker stack fixes: compose project cleanup preserves volumes, early crash detection, env sync, and service-aware port rewrite.
{
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dockerScript = buildDeployScript(parseDeploySpec({ ...base, appName: 'jewelry-be', engine: 'docker', domain: '', port: 8081 }));
  execFileSync('bash', ['-n'], { input: dockerScript });
  assert.ok(!dockerScript.includes('down -v --remove-orphans'), 'failure cleanup must preserve volumes (no -v)');
  assert.ok(dockerScript.includes("docker compose -p '7server-jewelry-be' -f \"$cf\" down --remove-orphans"), 'cleanup targets compose project');
  assert.ok(dockerScript.includes('docker_project_containers'), 'health check scopes inspection to project containers');
  assert.ok(dockerScript.includes('DOCKER_CRASHED=1'), 'health check detects container crashes early');
  assert.ok(dockerScript.includes('COMPOSE_ENV_FLAG="--env-file .env"'), 'compose uses explicit --env-file .env');

  // Extract the embedded node port rewriter script from dockerScript and run it against a realistic multi-service compose file.
  const marker = "  if command -v node >/dev/null 2>&1; then\n    node -e '\n";
  const start = dockerScript.indexOf(marker);
  assert.ok(start !== -1, 'node port rewriter block present');
  const bodyStart = start + marker.length;
  const bodyEnd = dockerScript.indexOf('\n    \' "$COMPOSE_FILE"', bodyStart);
  assert.ok(bodyEnd !== -1, 'node port rewriter block terminated');
  const nodeBody = dockerScript.slice(bodyStart, bodyEnd);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '7s-compose-test-'));
  const composePath = path.join(tmpDir, 'docker-compose.prod.yml');
  fs.writeFileSync(composePath, [
    'services:',
    '  postgres:',
    '    image: postgres:16',
    '    ports:',
    '      - "5432:5432"',
    '  minio:',
    '    image: minio/minio:latest',
    '    ports:',
    '      - "9000:9000"',
    '  app:',
    '    build: .',
    '    ports:',
    '      - "${APP_PORT:-8080}:${PORT:-8080}"',
    ''
  ].join('\n'));
  try {
    execFileSync('node', ['-e', nodeBody, composePath, '8081', '', '5432 80 443', 'jewelry-be'], { encoding: 'utf8' });
    const rewritten = fs.readFileSync(composePath, 'utf8');
    assert.ok(rewritten.includes('127.0.0.1:5433:5432'), `postgres host port collision remapped:\n${rewritten}`);
    assert.ok(rewritten.includes('"9000:9000"'), `minio infra port left intact (not hijacked as main app):\n${rewritten}`);
    assert.ok(rewritten.includes('"8081:${PORT:-8080}"'), `app service mapped to targetPort 8081 keeping env container port:\n${rewritten}`);

    // Extract & run the compose env_file sync + override generator against env_file: [.env.prod] + CRLF .env
    const envMarker = "  if [ -f .env ] && command -v node >/dev/null 2>&1; then\n    node -e '\n";
    const envStart = dockerScript.indexOf(envMarker);
    assert.ok(envStart !== -1, 'compose env sync block present');
    const envBodyStart = envStart + envMarker.length;
    const envBodyEnd = dockerScript.indexOf("\n    ' \"$COMPOSE_FILE\"", envBodyStart);
    assert.ok(envBodyEnd !== -1, 'compose env sync block terminated');
    const envNodeBody = dockerScript.slice(envBodyStart, envBodyEnd);

    fs.writeFileSync(path.join(tmpDir, '.env'), 'OTP_DRIVER=live\r\nAPP_ENV=production\r\n');
    fs.writeFileSync(path.join(tmpDir, '.env.prod'), 'OTP_DRIVER=log\r\nKEEP_EXISTING=1\r\n');
    fs.writeFileSync(composePath, [
      'services:',
      '  postgres:',
      '    image: postgres:16',
      '  migrate:',
      '    build: .',
      '    env_file: [.env.prod]',
      '  seeder:',
      '    build: .',
      '  app:',
      '    build: .',
      '    env_file:',
      '      - path: .env.prod',
      '        required: true',
      ''
    ].join('\n'));
    execFileSync('node', ['-e', envNodeBody, composePath], { cwd: tmpDir, encoding: 'utf8' });
    const syncedProd = fs.readFileSync(path.join(tmpDir, '.env.prod'), 'utf8');
    assert.ok(!syncedProd.includes('\r'), 'CRLF stripped in synced .env.prod');
    assert.ok(syncedProd.includes('OTP_DRIVER=live'), `OTP_DRIVER updated from .env:\n${syncedProd}`);
    assert.ok(syncedProd.includes('KEEP_EXISTING=1'), `existing keys preserved in .env.prod:\n${syncedProd}`);
    const overrideYml = fs.readFileSync(path.join(tmpDir, '.7server-compose.override.yml'), 'utf8');
    assert.ok(overrideYml.includes('  app:') && overrideYml.includes('  migrate:') && overrideYml.includes('  seeder:'), `app/migrate/seeder receive override .env:\n${overrideYml}`);
    assert.ok(overrideYml.includes('HOST: "0.0.0.0"'), `override injects HOST=0.0.0.0:\n${overrideYml}`);
    assert.ok(!overrideYml.includes('  postgres:'), `postgres skipped from app .env override:\n${overrideYml}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Deployment lifecycle features: healthCheckPath, postDeployCmd, autoSsl, commitSha rollback, store & webhook HMAC
{
  const advSpec = parseDeploySpec({
    ...base,
    healthCheckPath: '/api/health',
    postDeployCmd: 'npx prisma migrate deploy',
    autoSsl: true,
    commitSha: 'a1b2c3d4e5f6'
  });
  assert.equal(advSpec.healthCheckPath, '/api/health');
  assert.equal(advSpec.postDeployCmd, 'npx prisma migrate deploy');
  assert.equal(advSpec.autoSsl, true);
  assert.equal(advSpec.commitSha, 'a1b2c3d4e5f6');

  const advScript = buildDeployScript(advSpec);
  execFileSync('bash', ['-n'], { input: advScript });
  assert.ok(advScript.includes("checkout -f 'a1b2c3d4e5f6'"), 'rollback script checks out target commitSha');
  assert.ok(advScript.includes('Running post-deploy command: npx prisma migrate deploy'), 'postDeployCmd runs in script');
  assert.ok(advScript.includes('/api/health'), 'healthCheckPath used in health probe');
  assert.ok(advScript.includes('certbot --nginx'), 'autoSsl invokes certbot');

  assert.equal(parseDeploySpec({ ...base, healthCheckPath: 'healthz' }).healthCheckPath, '/healthz');
  assert.throws(() => parseDeploySpec({ ...base, healthCheckPath: '/bad path' }));
  assert.throws(() => parseDeploySpec({ ...base, commitSha: 'not-hex;rm -rf /' }));

  const payload = '{"ref":"refs/heads/main"}';
  const secret = 'test-webhook-secret';
  const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(verifyWebhookSignature(secret, payload, sig), true);
  assert.equal(verifyWebhookSignature(secret, payload, 'sha256=deadbeef'), false);
  assert.equal(verifyWebhookSignature(secret, payload, undefined), false);

  const testServerId = '__test_deploy_lifecycle__';
  try {
    const saved = saveDeployConfig(testServerId, parseDeploySpec(base));
    assert.ok(saved.webhookSecret.length >= 16);
    const loaded = getDeployConfig(testServerId, 'my-app');
    assert.ok(loaded);
    assert.equal(loaded!.spec.env[0].value, "it's prod");
    assert.ok(listDeployConfigs(testServerId).some((c) => c.appName === 'my-app'));

    const rec = createDeployRecord({
      serverId: testServerId,
      appName: 'my-app',
      branch: 'main',
      trigger: 'manual'
    });
    const sha = extractCommitFromOutput('Commit: abc1234def5678\nLive!');
    assert.equal(sha, 'abc1234def5678');
    finishDeployRecord(rec.id, { status: 'success', commit: sha, log: 'done' });
    const history = listDeployHistory(testServerId, 'my-app');
    assert.ok(history.some((h) => h.id === rec.id && h.status === 'success' && h.commit === 'abc1234def5678'));
  } finally {
    deleteDeployConfig(testServerId, 'my-app');
  }
  console.log('deploy lifecycle ok');
}
