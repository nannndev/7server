// Auto-finish OAuth logins: providers only redirect to fixed localhost ports (Claude/Gemini :54545,
// Codex :1455), so while a login is pending we listen on that port on this machine. Works when the
// browser runs on the same machine as the backend; otherwise the user pastes the callback URL.
import http from 'http';
import { completeLogin } from './oauth.js';
import { saveAccount } from './accounts.js';

const servers = new Map<number, http.Server>();

const page = (ok: boolean, msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>7Server</title><body style="font-family:system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0">` +
  `<div style="text-align:center"><h2>${ok ? '✅ Login berhasil' : '❌ Login gagal'}</h2><p>${msg.replace(/</g, '&lt;')}</p>` +
  `${ok ? '<script>setTimeout(()=>window.close(),1500)</script>' : ''}</div>`;

/** Listens once on the redirect URI's port; resolves false if the port can't be bound (fall back to paste). */
export function listenForCallback(sessionId: string, redirectUri: string): Promise<boolean> {
  const u = new URL(redirectUri);
  const port = Number(u.port);
  servers.get(port)?.close(); // a newer login replaces an older pending one on the same port
  servers.delete(port);

  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', redirectUri);
      if (url.pathname !== u.pathname) { res.writeHead(404).end(); return; }
      try {
        const { provider, cred } = await completeLogin(sessionId, url.toString());
        saveAccount(provider, cred);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(true, 'Akun terhubung. Tab ini bisa ditutup dan kembali ke 7Server.'));
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(false, e.message));
      }
      close();
    });
    const timer = setTimeout(() => close(), 15 * 60_000); // same TTL as pending sessions
    const close = () => { clearTimeout(timer); srv.close(); if (servers.get(port) === srv) servers.delete(port); };
    srv.once('error', () => { clearTimeout(timer); resolve(false); });
    srv.listen(port, '127.0.0.1', () => { servers.set(port, srv); resolve(true); });
  });
}
