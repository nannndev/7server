// Web terminal: authenticated WebSocket upgrade on /ws/terminal, piped to an SSH shell.
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { parse as parseUrl } from 'url';
import { getServerById } from '../servers/store.js';
import { attachTerminal } from '../../infra/ssh.js';
import { writeAudit } from '../../infra/audit.js';
import { AUTH_TOKEN, safeEqual } from '../../http/auth.js';
import { getSessionByToken, getUserById, touchSession } from '../users/store.js';
import { ROLE_PERMISSIONS, AuthContextUser } from '../users/types.js';
import { isServerAllowed } from '../../http/handlers.js';

export function attachTerminalWs(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', async (ws: WebSocket, request) => {
    const parsed = parseUrl(request.url || '', true);
    const serverId = parsed.query.serverId as string;
    const cols = parseInt(String(parsed.query.cols), 10) || 80;
    const rows = parseInt(String(parsed.query.rows), 10) || 24;
    const user: AuthContextUser = (request as any).user;

    if (!serverId) {
      ws.send(JSON.stringify({ type: 'error', data: 'Server ID missing in URL query\r\n' }));
      ws.close();
      return;
    }

    if (!isServerAllowed(user?.servers, serverId)) {
      ws.send(JSON.stringify({ type: 'error', data: 'Forbidden: Akses terminal ke server ini dibatasi untuk akun Anda\r\n' }));
      ws.close();
      return;
    }

    const serverConfig = getServerById(serverId, true);
    if (!serverConfig) {
      ws.send(JSON.stringify({ type: 'error', data: 'Server configuration not found\r\n' }));
      ws.close();
      return;
    }

    writeAudit({
      t: new Date().toISOString(),
      ip: request.socket.remoteAddress || '',
      method: 'WS',
      path: '/ws/terminal',
      detail: `action=terminal.open server=${serverConfig.name} (${serverConfig.host})`,
      user: user?.username || 'anonymous',
      role: user?.role,
      sessionId: user?.sessionId,
      status: 200
    });

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
    if (parsed.pathname !== '/ws/terminal') {
      return socket.destroy();
    }

    const token = String(parsed.query.token || '');
    const serverId = String(parsed.query.serverId || '');

    let user: AuthContextUser | null = null;
    const session = getSessionByToken(token);
    if (session) {
      const dbUser = getUserById(session.userId);
      if (dbUser && !dbUser.disabled) {
        user = {
          id: dbUser.id,
          username: dbUser.username,
          role: dbUser.role,
          permissions: ROLE_PERMISSIONS[dbUser.role] || [],
          servers: dbUser.servers,
          sessionId: session.id
        };
        touchSession(session.id);
      }
    } else if (safeEqual(token, AUTH_TOKEN)) {
      user = {
        id: 'admin-root',
        username: 'admin',
        role: 'admin',
        permissions: ROLE_PERMISSIONS.admin,
        servers: '*',
        sessionId: 'master-token'
      };
    }

    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Role permission check: Viewer role cannot open terminal
    if (!user.permissions.includes('terminal.open')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // Server scope restriction check
    if (serverId && !isServerAllowed(user.servers, serverId)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    (request as any).user = user;
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });
}
