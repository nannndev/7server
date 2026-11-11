import { badRequest } from '../../http/errors.js';

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

export type DeployEngine = 'docker' | 'native_node' | 'native_php' | 'native_python' | 'native_go' | 'static';
export type ExposureType = 'public' | 'tunnel' | 'none';

export interface DeploySpec {
  appName: string;
  repo: string; // owner/name on GitHub
  branch: string;
  rootDir: string;
  installCmd: string;
  buildCmd: string;
  startCmd: string;
  port: number;
  domain: string;
  exposure?: ExposureType;
  tunnelName?: string;
  engine: DeployEngine;
  env: Array<{ key: string; value: string }>;
  nodeMajor?: number;
  composeSidecar?: boolean;
}

export const ENGINES: DeployEngine[] = ['docker', 'native_node', 'native_php', 'native_python', 'native_go', 'static'];
export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// Every field ends up in a root shell script, so anything not quoted with sq() must match a strict pattern.
export function parseDeploySpec(body: any): DeploySpec {
  const appName = str(body?.appName);
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(appName)) throw badRequest('Invalid app name (a-z, 0-9, - and _ only)');
  const repo = str(body?.repo);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes('..')) throw badRequest('Invalid repository (expected owner/name)');
  const branch = str(body?.branch);
  if (!/^[\w./-]{1,200}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw badRequest('Invalid branch name');
  const rootDir = str(body?.rootDir) || '/';
  if (!/^[\w./-]{1,200}$/.test(rootDir) || rootDir.split('/').includes('..')) throw badRequest('Invalid root directory');
  const port = Number(body?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw badRequest('Invalid port');
  const domain = str(body?.domain).toLowerCase();
  if (domain && !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw badRequest('Invalid domain');
  const engine = ENGINES.includes(body?.engine) ? body.engine : 'native_node';
  const env = (Array.isArray(body?.env) ? body.env : [])
    .map((e: any) => ({ key: str(e?.key), value: typeof e?.value === 'string' ? e.value : '' }))
    .filter((e: { key: string }) => e.key);
  for (const e of env) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key)) throw badRequest(`Invalid env key: ${e.key}`);
  // Commands are free text on purpose: callers already hold service.control, which runs arbitrary scripts.
  const exposure: ExposureType = body?.exposure === 'tunnel' ? 'tunnel' : body?.exposure === 'none' ? 'none' : 'public';
  const tunnelName = str(body?.tunnelName);
  const nodeMajor = Number.isInteger(body?.nodeMajor) && body.nodeMajor >= 4 && body.nodeMajor < 100 ? body.nodeMajor : undefined;
  return { composeSidecar: body?.composeSidecar === true, nodeMajor, appName, repo, branch, rootDir, installCmd: str(body?.installCmd), buildCmd: str(body?.buildCmd), startCmd: str(body?.startCmd), port, domain, exposure, tunnelName, engine, env };
}
