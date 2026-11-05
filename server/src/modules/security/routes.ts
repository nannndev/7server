import { Router, Request } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchSshKeys, addSshKey, deleteSshKey, fetchHardeningStatus, unbanIp } from './service.js';

export const securityRoutes = Router();

securityRoutes.get('/servers/:id/security/keys', withServer(async (target) => {
  return await fetchSshKeys(target);
}));

securityRoutes.post('/servers/:id/security/keys', withServer(async (target, req: Request) => {
  const { key } = req.body;
  if (!key) throw new Error('Public key is required');
  return await addSshKey(target, key);
}));

securityRoutes.delete('/servers/:id/security/keys/:keyId', withServer(async (target, req: Request) => {
  const keyId = req.params.keyId as string;
  return await deleteSshKey(target, keyId);
}));

securityRoutes.get('/servers/:id/security/hardening', withServer(async (target) => {
  return await fetchHardeningStatus(target);
}));

securityRoutes.post('/servers/:id/security/fail2ban/unban', withServer(async (target, req: Request) => {
  const { ip } = req.body;
  if (!ip) throw new Error('IP address is required');
  return await unbanIp(target, ip);
}));
