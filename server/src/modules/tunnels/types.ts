export interface CloudflareTunnelRoute {
  hostname: string;
  service: string;
  path?: string;
}

export interface CloudflareTunnelInfo {
  id: string;
  name: string;
  created?: string;
}

export interface CloudflareTunnelStatus {
  installed: boolean;
  version?: string;
  active: boolean;
  configPath?: string;
  tunnelId?: string;
  tunnelName?: string;
  routes: CloudflareTunnelRoute[];
  availableTunnels: CloudflareTunnelInfo[];
}

export interface DnsCheckResult {
  domain: string;
  serverIp?: string;
  resolvedIps: string[];
  cnames: string[];
  matched: boolean;
  status: 'ok' | 'nxdomain' | 'mismatch';
}

