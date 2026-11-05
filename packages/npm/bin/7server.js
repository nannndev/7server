#!/usr/bin/env node
// 7server CLI: runs the bundled server (dashboard + API + AI gateway) on one port.
//   7server                    http://127.0.0.1:5001, data in ~/.7server
//   7server --port 8080 --host 0.0.0.0 --data /srv/7server --no-open
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

// node:sqlite works without a flag from Node 22.13 (and 23.4+).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`7server needs Node.js 22.13 or newer (you have ${process.versions.node}). Install a current LTS from https://nodejs.org`);
  process.exit(1);
}

const HELP = `7server ${pkg.version}: self-hosted dashboard for your servers

Usage: 7server [options]

  -p, --port <n>       port to listen on (default 5001, or $PORT)
  -H, --host <addr>    address to bind (default 127.0.0.1; 0.0.0.0 exposes it, put HTTPS in front)
  -d, --data <dir>     data directory: database + encryption key (default ~/.7server, or $VPSHUB_DATA_DIR)
      --no-open        don't open the browser
  -v, --version        print the version
  -h, --help           this help

Back up the data directory as a whole: 7server.db is useless without secret.key next to it.
The first admin password is $DASHBOARD_PASSWORD, or a random one written to <data>/dashboard.password.`;

const args = process.argv.slice(2);
const opts = { port: process.env.PORT || '5001', host: process.env.HOST || '127.0.0.1', data: process.env.VPSHUB_DATA_DIR || path.join(os.homedir(), '.7server'), open: true };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const val = () => {
    const v = args[++i];
    if (v === undefined || v.startsWith('-')) { console.error(`${a} needs a value. See 7server --help`); process.exit(2); }
    return v;
  };
  if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
  else if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0); }
  else if (a === '-p' || a === '--port') opts.port = val();
  else if (a === '-H' || a === '--host') opts.host = val();
  else if (a === '-d' || a === '--data') opts.data = path.resolve(val());
  else if (a === '--no-open') opts.open = false;
  else { console.error(`Unknown option ${a}. See 7server --help`); process.exit(2); }
}
if (!/^\d+$/.test(opts.port) || +opts.port < 1 || +opts.port > 65535) { console.error(`Invalid port: ${opts.port}`); process.exit(2); }

fs.mkdirSync(opts.data, { recursive: true, mode: 0o700 });
const exposed = !['127.0.0.1', 'localhost', '::1'].includes(opts.host);
const url = `http://${exposed ? (opts.host === '0.0.0.0' ? 'localhost' : opts.host) : '127.0.0.1'}:${opts.port}`;

console.log(`7server ${pkg.version}`);
console.log(`  dashboard  ${url}`);
console.log(`  data       ${opts.data}`);
if (exposed) {
  console.warn(`\n  Warning: listening on ${opts.host}, reachable from other machines. Use HTTPS (nginx/Caddy) in front,`);
  console.warn('  set TRUST_PROXY for it, and a strong DASHBOARD_PASSWORD.\n');
}

const child = spawn(process.execPath, [path.join(here, '..', 'dist', 'server.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: opts.port,
    HOST: opts.host,
    VPSHUB_DATA_DIR: opts.data,
    STATIC_DIR: path.join(here, '..', 'dist', 'client'),
    NODE_NO_WARNINGS: '1' // node:sqlite prints an ExperimentalWarning on some versions
  }
});

if (opts.open && process.stdout.isTTY) {
  // Open once the port answers; give up quietly after 20 s.
  const started = Date.now();
  const tryOpen = () => fetch(`http://127.0.0.1:${opts.port}/api/ai/health`).then(() => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  }).catch(() => { if (Date.now() - started < 20_000) setTimeout(tryOpen, 500); });
  setTimeout(tryOpen, 800);
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(signal ? 0 : code ?? 0));
