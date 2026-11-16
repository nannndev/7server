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

export interface SavedDeployConfig {
  id: string;
  serverId: string;
  appName: string;
  spec: {
    appName: string;
    repo: string;
    branch: string;
    rootDir: string;
    installCmd: string;
    buildCmd: string;
    startCmd: string;
    port: number;
    domain: string;
    exposure?: 'public' | 'tunnel' | 'none';
    engine: string;
    env: Array<{ key: string; value: string }>;
    healthCheckPath?: string;
    postDeployCmd?: string;
    autoSsl?: boolean;
  };
  autoDeploy: boolean;
  lastDeployAt?: string;
  lastCommit?: string;
  lastStatus?: 'success' | 'failed';
  updatedAt: string;
}

export interface DeployHistoryRecord {
  id: string;
  serverId: string;
  appName: string;
  branch: string;
  commit?: string;
  trigger: 'manual' | 'redeploy' | 'rollback' | 'webhook';
  triggeredBy?: string;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  logSnippet?: string;
}
