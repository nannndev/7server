#!/usr/bin/env node
// 7server CLI: runs the bundled server (dashboard + API + AI gateway) on one port.
//   7server                          http://127.0.0.1:5001, data in ~/.7server
//   7server --port 8080 --host 0.0.0.0 --data /srv/7server --no-open
//   7server reset-password [user]    set a new password for a locked-out account
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

// ---------------------------------------------------------------- output
const color = process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
const paint = (code) => (s) => (color ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { dim: paint(2), bold: paint(1), green: paint(32), yellow: paint(33), red: paint(31), cyan: paint(36) };
const out = (s = '') => process.stdout.write(s + '\n');
const err = (s) => process.stderr.write(s + '\n');

// node:sqlite works without a flag from Node 22.13 (and 23.4+).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  err(`${c.red('✗')} 7server needs Node.js 22.13 or newer (you have ${process.versions.node}).`);
  err(`  Install a current LTS from https://nodejs.org`);
  process.exit(1);
}

const HELP = `${c.bold('7server')} ${pkg.version}  ${c.dim('self-hosted dashboard for your servers')}

${c.bold('Usage')}
  7server [options]                 start the dashboard
  7server reset-password [user]     set a new password (default user: admin)

${c.bold('Options')}
  -p, --port <n>       port to listen on ${c.dim('(default 5001, or $PORT)')}
  -H, --host <addr>    address to bind ${c.dim('(default 127.0.0.1; 0.0.0.0 exposes it, put HTTPS in front)')}
  -d, --data <dir>     data directory ${c.dim('(default ~/.7server, or $VPSHUB_DATA_DIR)')}
      --no-open        don't open the browser
      --no-update-check  don't check npm for a newer version
      --no-telemetry   don't send anonymous heartbeat ping (or DO_NOT_TRACK=1)
  -v, --version        print the version
  -h, --help           this help

${c.bold('First run')}
  Open the dashboard and create the admin account. From another machine you'll
  be asked for the setup code printed here. To skip it: DASHBOARD_PASSWORD=… 7server

${c.bold('Data')}
  Back up the data directory as a whole: 7server.db is useless without secret.key.`;

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'start';
const opts = {
  port: process.env.PORT || '5001',
  host: process.env.HOST || '127.0.0.1',
  data: process.env.VPSHUB_DATA_DIR || path.join(os.homedir(), '.7server'),
  open: true,
  updateCheck: !process.env.SEVENSERVER_NO_UPDATE_CHECK && !process.env.CI,
  telemetry: process.env.SEVENSERVER_TELEMETRY !== '0' && process.env.DO_NOT_TRACK !== '1'
};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const val = () => {
    const v = args[++i];
    if (v === undefined || v.startsWith('-')) { err(`${c.red('✗')} ${a} needs a value. See 7server --help`); process.exit(2); }
    return v;
  };
  if (a === '-h' || a === '--help') { out(HELP); process.exit(0); }
  else if (a === '-v' || a === '--version') { out(pkg.version); process.exit(0); }
  else if (a === '-p' || a === '--port') opts.port = val();
  else if (a === '-H' || a === '--host') opts.host = val();
  else if (a === '-d' || a === '--data') opts.data = path.resolve(val());
  else if (a === '--no-open') opts.open = false;
  else if (a === '--no-update-check') opts.updateCheck = false;
  else if (a === '--no-telemetry') opts.telemetry = false;
  else if (!a.startsWith('-')) positional.push(a);
  else { err(`${c.red('✗')} Unknown option ${a}. See 7server --help`); process.exit(2); }
}
if (!['start', 'reset-password'].includes(command)) { err(`${c.red('✗')} Unknown command "${command}". See 7server --help`); process.exit(2); }
if (!/^\d+$/.test(opts.port) || +opts.port < 1 || +opts.port > 65535) { err(`${c.red('✗')} Invalid port: ${opts.port}`); process.exit(2); }

fs.mkdirSync(opts.data, { recursive: true, mode: 0o700 });
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: opts.port,
  HOST: opts.host,
  VPSHUB_DATA_DIR: opts.data,
  STATIC_DIR: path.join(here, '..', 'dist', 'client'),
  NODE_NO_WARNINGS: '1', // node:sqlite prints an ExperimentalWarning on some versions
  SEVENSERVER_CLI: '1',
  SEVENSERVER_TELEMETRY: opts.telemetry ? '1' : '0'
};

// ---------------------------------------------------------------- reset-password
if (command === 'reset-password') {
  out(`\n  ${c.bold('7server')} ${c.dim(pkg.version)} · reset password ${c.dim(`(data: ${opts.data})`)}\n`);
  const child = spawn(process.execPath, [path.join(here, '..', 'dist', 'reset-password.js'), ...positional], { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  start();
}

// ---------------------------------------------------------------- start
function start() {
  const exposed = !['127.0.0.1', 'localhost', '::1'].includes(opts.host);
  const url = `http://${exposed ? (opts.host === '0.0.0.0' ? 'localhost' : opts.host) : '127.0.0.1'}:${opts.port}`;
  const home = os.homedir();
  const short = (p) => (p.startsWith(home) ? '~' + p.slice(home.length) : p);

  const rows = [
    ['Dashboard', c.cyan(url)],
    ['Data', short(opts.data)],
    ['Bind', exposed ? c.yellow(`${opts.host} (reachable from other machines)`) : `${opts.host} (this machine only)`]
  ];
  out('');
  out(`  ${c.bold('7server')} ${c.dim('v' + pkg.version)}`);
  out('');
  for (const [k, v] of rows) out(`  ${c.dim(k.padEnd(10))} ${v}`);
  if (exposed) {
    out('');
    out(`  ${c.yellow('!')} Put HTTPS (nginx/Caddy) in front, set ${c.bold('TRUST_PROXY')} for it, and use strong passwords.`);
  }
  out('');

  const child = spawn(process.execPath, [path.join(here, '..', 'dist', 'server.js')], { stdio: ['inherit', 'pipe', 'pipe'], env });

  // Server output: show the first-run setup block nicely, keep real errors, hide startup chatter.
  let ready = false;
  let update = null; // printed under "Ready" so it doesn't split the startup block
  const showUpdate = () => { if (ready && update) { out(update); update = null; } };
  const onLine = (line, isErr) => {
    if (!line.trim()) return;
    if (/injected env|is running on|Creating admin user|^\[db\] imported/.test(line)) {
      if (/is running on/.test(line) && !ready) { ready = true; out(`  ${c.green('●')} Ready. Press ${c.bold('Ctrl+C')} to stop.\n`); showUpdate(); }
      return;
    }
    const setup = line.match(/First run: open (\S+)/);
    if (setup) { out(`  ${c.bold('First run')}  open the dashboard and create your admin account.`); return; }
    const code = line.match(/setup code: (\d{6})/);
    if (code) { out(`  ${c.dim('Setup code'.padEnd(10))} ${c.bold(code[1])} ${c.dim('(only asked from another machine)')}\n`); return; }
    if (/already in use|No permission to listen/.test(line)) { err(`  ${c.red('✗')} ${line}`); return; }
    (isErr ? err : out)(`  ${c.dim('│')} ${line}`);
  };
  const pipe = (stream, isErr) => {
    let buf = '';
    stream.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i), isErr); buf = buf.slice(i + 1); } });
    stream.on('end', () => buf && onLine(buf, isErr));
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  if (opts.open && process.stdout.isTTY) {
    const started = Date.now();
    const tryOpen = () => fetch(`http://127.0.0.1:${opts.port}/api/ai/health`).then(() => {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const cmdArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
      spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    }).catch(() => { if (Date.now() - started < 20_000) setTimeout(tryOpen, 500); });
    setTimeout(tryOpen, 800);
  }

  if (opts.updateCheck) checkForUpdate().then((msg) => { update = msg; showUpdate(); }).catch(() => {});

  let stopping = false;
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; out(`\n  ${c.dim('Stopping 7server…')}`); child.kill(sig); });
  child.on('exit', (code, signal) => {
    if (!stopping && code) {
      err(`\n  ${c.red('✗')} 7server stopped (exit code ${code}).`);
      if (!ready) err(`    ${c.dim('Try')} 7server --port ${+opts.port + 1} ${c.dim('· report a bug: https://github.com/nannndev/7server/issues')}`);
    }
    process.exit(signal || stopping ? 0 : code ?? 0);
  });
}

// ---------------------------------------------------------------- update check
// Asks the npm registry for the latest version at most once a day (cached in the data dir) and
// never delays startup or fails it. Opt out: --no-update-check or SEVENSERVER_NO_UPDATE_CHECK=1.
async function checkForUpdate() {
  const cacheFile = path.join(opts.data, '.update-check.json');
  let cached = null;
  try { cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* first time */ }
  let latest = cached?.latest;
  if (!cached || Date.now() - cached.at > 24 * 3600_000) {
    const r = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`, { signal: AbortSignal.timeout(3000), headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    latest = (await r.json()).version;
    try { fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), latest }), { mode: 0o600 }); } catch { /* read-only data dir */ }
  }
  if (!latest || !newer(latest, pkg.version)) return null;
  const line = `Update available ${c.dim(pkg.version)} → ${c.green(latest)}`;
  const run = `npm install -g ${pkg.name}`;
  return `  ${c.yellow('↑')} ${line}\n    ${c.dim('run')} ${c.bold(run)} ${c.dim(`· changes: https://github.com/nannndev/7server/releases/tag/v${latest}`)}\n`;
}

/** Semver-ish compare: true when a > b (pre-releases sort below their release). */
function newer(a, b) {
  const parse = (v) => { const [core, pre] = String(v).split('-'); return { n: core.split('.').map((x) => parseInt(x, 10) || 0), pre }; };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) if ((x.n[i] || 0) !== (y.n[i] || 0)) return (x.n[i] || 0) > (y.n[i] || 0);
  if (x.pre && !y.pre) return false;
  if (!x.pre && y.pre) return true;
  return false;
}
