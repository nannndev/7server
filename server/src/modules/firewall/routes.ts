import { Router } from 'express';
import { need } from '../../http/auth.js';
import { withServer } from '../../http/handlers.js';
import { 
  getFirewallStatus, 
  previewRuleChange, 
  addFirewallRule, 
  deleteFirewallRule, 
  toggleFirewallState 
} from './service.js';

export const firewallRoutes = Router();

// Read firewall status
firewallRoutes.get('/servers/:id/firewall', need('server.read'), withServer(async (target) => {
  return await getFirewallStatus(target);
}));

// Preview rule change with safeguards
firewallRoutes.post('/servers/:id/firewall/preview', need('firewall.manage'), withServer(async (target, req) => {
  const { action, port, proto, fromIp } = req.body || {};
  return previewRuleChange(target, action, port, proto, fromIp);
}));

// Add firewall rule
firewallRoutes.post('/servers/:id/firewall/rule', need('firewall.manage'), withServer(async (target, req) => {
  const { action, port, proto, fromIp, comment } = req.body || {};
  if (!action || !port) {
    throw new Error('Action (allow/deny) and port number are required');
  }
  return await addFirewallRule(target, action, port, proto, fromIp, comment);
}));

// Delete firewall rule
firewallRoutes.delete('/servers/:id/firewall/rule/:num', need('firewall.manage'), withServer(async (target, req) => {
  const num = parseInt(req.params.num as string, 10);
  if (isNaN(num)) throw new Error('Rule number is invalid');
  return await deleteFirewallRule(target, num);
}));

// Toggle firewall on/off
firewallRoutes.post('/servers/:id/firewall/toggle', need('firewall.manage'), withServer(async (target, req) => {
  const { enable } = req.body || {};
  return await toggleFirewallState(target, !!enable);
}));
