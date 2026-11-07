import { Router } from 'express';
import { withServer } from '../../http/handlers.js';
import { need } from '../../http/auth.js';
import { badRequest } from '../../http/errors.js';
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

// DELETE Remove an ingress route from cloudflared config.yml
tunnelsRoutes.delete('/servers/:id/tunnels/cloudflare/routes', need('service.control'), withServer(async (server, req) => {
  const hostname = String(req.body?.hostname || '').trim().toLowerCase();
  if (!hostname) throw badRequest('Hostname is required to delete route');
  return removeTunnelRouteOnServer(server, hostname);
}));

