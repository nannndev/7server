// Entry point: HTTP server + terminal WebSocket + background monitor.
import http from 'http';
import { config } from './config.js';
import { createApp } from './app.js';
import { usersReady } from './http/auth.js';
import { openSetup } from './modules/users/setup.js';
import { attachTerminalWs } from './modules/terminal/ws.js';
import { startMonitor } from './modules/monitoring/monitor.js';

const server = http.createServer(createApp());
attachTerminalWs(server);
startMonitor();

const onListen = async () => {
  const url = `http://${config.host || 'localhost'}:${config.port}`;
  await usersReady;
  const code = openSetup();
  if (code) {
    console.log(`\n  First run: open ${url} to create the admin account.`);
    console.log(`  From another machine you'll be asked for this setup code: ${code}\n`);
  }
  console.log(`7Server is running on ${url}`); // last: the CLI treats it as "ready"
};
server.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${config.port} is already in use (another 7server, or something else). Pick another with PORT or --port.`);
  else if (e.code === 'EACCES') console.error(`No permission to listen on port ${config.port}. Use a port above 1024.`);
  else console.error(e);
  process.exit(1);
});
if (config.host) server.listen(config.port, config.host, onListen);
else server.listen(config.port, onListen);
