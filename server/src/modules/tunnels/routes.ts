import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import { need } from '../../http/auth.js';
import { badRequest } from '../../http/errors.js';
import { runScript } from '../software/routes.js';
import {
  fetchCloudflareTunnelStatus,
  addTunnelRouteOnServer,
  removeTunnelRouteOnServer,
  checkDomainDns
} from './service.js';

export const tunnelsRoutes = Router();

// Public / auth DNS pre-flight check endpoint
tunnelsRoutes.get('/dns/check', async (req, res) => {
  const domain = String(req.query?.domain || '').trim();
  const serverIp = req.query?.serverIp ? String(req.query.serverIp).trim() : undefined;
  if (!domain) throw badRequest('Query parameter "domain" is required');
  const result = await checkDomainDns(domain, serverIp);
  res.json(result);
});

// GET Cloudflare tunnel status & ingress routes on target server
tunnelsRoutes.get('/servers/:id/tunnels/cloudflare', withServer((server) =>
  fetchCloudflareTunnelStatus(server)
));

// POST Add or update an ingress route in cloudflared config.yml
tunnelsRoutes.post('/servers/:id/tunnels/cloudflare/routes', need('service.control'), withServer(async (server, req) => {
  const hostname = String(req.body?.hostname || '').trim().toLowerCase();
  const service = String(req.body?.service || '').trim();
  const autoDns = req.body?.autoDns !== false;

  if (!hostname || !hostname.includes('.')) {
    throw badRequest('Invalid hostname (e.g. app.domain.com)');
  }
  if (!service) {
    throw badRequest('Service target is required (e.g. http://localhost:3000)');
  }

  return addTunnelRouteOnServer(server, { hostname, service }, autoDns);
}));

// POST Setup / install cloudflared with Zero Trust token
tunnelsRoutes.post('/servers/:id/tunnels/cloudflare/setup-token', need('service.control'), withServer((t, req, res) => {
  const rawInput = String(req.body?.token || '').trim();
  const tokenMatch = rawInput.match(/service\s+install\s+([A-Za-z0-9._-]+)/i) || rawInput.match(/eyJ[A-Za-z0-9._-]+/);
  const token = tokenMatch ? (tokenMatch[1] || tokenMatch[0]) : rawInput;

  if (!token || token.length < 20 || !/^[A-Za-z0-9._-]+$/.test(token)) {
    throw badRequest('Invalid Cloudflare Tunnel token. It should be a Zero Trust connector token (starting with eyJ...)');
  }

  const script = `set -eo pipefail
echo "==> Configuring Cloudflare Tunnel on $(hostname)..."

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "==> Installing cloudflared package..."
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq
  apt-get install -y cloudflared
  echo "✓ cloudflared installed successfully ($(cloudflared --version))"
fi

echo "==> Installing and starting cloudflared service..."
systemctl stop cloudflared 2>/dev/null || true
cloudflared service install ${token}
systemctl daemon-reload
systemctl enable cloudflared
systemctl restart cloudflared

sleep 2
if systemctl is-active --quiet cloudflared; then
  echo "✓ Cloudflare Tunnel service is active and running!"
else
  echo "Notice: Cloudflare service started. Verifying logs..."
  journalctl -u cloudflared -n 10 --no-pager || true
fi
`;

  return runScript(t, req, res, script);
}));

// DELETE Remove an ingress route from cloudflared config.yml
tunnelsRoutes.delete('/servers/:id/tunnels/cloudflare/routes', need('service.control'), withServer(async (server, req) => {
  const hostname = String(req.body?.hostname || '').trim().toLowerCase();
  if (!hostname) throw badRequest('Hostname is required to delete route');
  return removeTunnelRouteOnServer(server, hostname);
}));

