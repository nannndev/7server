import { Router, Request } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchCertificates, renewCertificates, issueCertificate } from './service.js';

export const certificateRoutes = Router();

certificateRoutes.get('/servers/:id/certificates', withServer(async (target) => {
  return await fetchCertificates(target);
}));

certificateRoutes.post('/servers/:id/certificates/renew', withServer(async (target, req: Request) => {
  const dryRun = Boolean(req.body?.dryRun);
  return await renewCertificates(target, dryRun);
}));

certificateRoutes.post('/servers/:id/certificates/issue', withServer(async (target, req: Request) => {
  const { domain, email, webserver } = req.body;
  if (!domain) throw new Error('Domain name is required');
  return await issueCertificate(target, domain, email, webserver);
}));

