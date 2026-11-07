export interface WebAppInfo {
  name: string;
  path: string;
  type: string;
  domain?: string;
  size?: string;
  modified?: string;
  gitBranch?: string;
  gitCommit?: string;
  ports?: string;
}

export interface NginxSiteInfo {
  name: string;
  enabled: boolean;
  domains: string[];
  rootPath: string;
  proxyPort: string;
  ssl: boolean;
  configPath: string;
}

export interface ListeningPortInfo {
  proto: string;
  localAddress: string;
  port: string;
  process: string;
  pid: string;
}
