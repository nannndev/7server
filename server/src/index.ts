// Entry point: HTTP server + terminal WebSocket + background monitor.
import http from 'http';
import { config } from './config.js';
import { createApp } from './app.js';
import { attachTerminalWs } from './modules/terminal/ws.js';
import { startMonitor } from './modules/monitoring/monitor.js';

const server = http.createServer(createApp());
attachTerminalWs(server);
startMonitor();

const onListen = () => console.log(`7Server is running on http://${config.host || 'localhost'}:${config.port}`);
if (config.host) server.listen(config.port, config.host, onListen);
else server.listen(config.port, onListen);
