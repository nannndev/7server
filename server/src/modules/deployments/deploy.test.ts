import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseDeploySpec, buildDeployScript } from './deploy.js';

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
assert.ok(script.includes(`printf '%s=%s\\n' 'NODE_ENV' 'it'\\''s prod'`), 'env value is shell-quoted');

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
}
// PM2 runner script (.7server-start.sh) exports PORT, NITRO_PORT, NUXT_PORT and HOST=0.0.0.0 so Nuxt/Next/Node never reuse stale PM2 daemon env.
{
  const nuxt = buildDeployScript(parseDeploySpec({ ...base, engine: 'native_node', domain: '', port: 3002, startCmd: 'node .output/server/index.mjs' }));
  assert.ok(nuxt.includes('export PORT=3002 NITRO_PORT=3002 NUXT_PORT=3002'), 'runner script exports chosen port');
  assert.ok(nuxt.includes('export HOST=0.0.0.0 NITRO_HOST=0.0.0.0 NUXT_HOST=0.0.0.0 HOSTNAME=0.0.0.0'), 'runner script forces 0.0.0.0 host binding');
  assert.ok(nuxt.includes('pm2 start ./.7server-start.sh'), 'PM2 starts via isolated runner script');
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
