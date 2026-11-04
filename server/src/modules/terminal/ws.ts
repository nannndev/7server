// Web terminal: authenticated WebSocket upgrade on /ws/terminal, piped to an SSH shell.
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import { getServerById } from '../servers/store.js';
import { attachTerminal } from '../../infra/ssh.js';
import { writeAudit } from '../../infra/audit.js';
import { AUTH_TOKEN, safeEqual } from '../../http/auth.js';

export function attachTerminalWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws: WebSocket, request) => {
    const parsed = parseUrl(request.url || '', true);
    const serverId = parsed.query.serverId as string;
    const cols = parseInt(String(parsed.query.cols), 10) || 80;
    const rows = parseInt(String(parsed.query.rows), 10) || 24;

    if (!serverId) {
      ws.send(JSON.stringify({ type: 'error', data: 'Server ID missing in URL query\r\n' }));
      ws.close();
      return;
    }

    const serverConfig = getServerById(serverId, true);
    if (!serverConfig) {
      ws.send(JSON.stringify({ type: 'error', data: 'Server configuration not found\r\n' }));
      ws.close();
      return;
    }

    writeAudit({ t: new Date().toISOString(), ip: request.socket.remoteAddress || '', method: 'WS', path: '/ws/terminal', detail: `server=${serverConfig.name} (${serverConfig.host})` });
    try {
      await attachTerminal(ws, serverConfig, cols, rows);
    } catch (err: any) {
      ws.send(JSON.stringify({ type: 'error', data: `Error initializing terminal: ${err.message}\r\n` }));
      ws.close();
    }
  });

  // The token travels in the query string because browsers can't set headers on a WebSocket.
  server.on('upgrade', (request, socket, head) => {
    const parsed = parseUrl(request.url || '', true);
    if (parsed.pathname === '/ws/terminal' && safeEqual(String(parsed.query.token || ''), AUTH_TOKEN)) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    } else {
      socket.destroy();
    }
  });
}
