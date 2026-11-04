// Entry point: HTTP server + terminal WebSocket + background monitor.
import http from 'http';
import { config } from './config.js';
import { createApp } from './app.js';
import { attachTerminalWs } from './modules/terminal/ws.js';
import { startMonitor } from './modules/monitoring/monitor.js';

const server = http.createServer(createApp());
attachTerminalWs(server);
startMonitor();

server.listen(config.port, () => {
  console.log(`VPS Management Backend (TypeScript) is running on http://localhost:${config.port}`);
});
