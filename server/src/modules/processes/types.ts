export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  stat: string;
  comm: string;
  args: string;
}

export interface SystemService {
  unit: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

export interface ServicesResponse {
  services: SystemService[];
  dockerContainers: DockerContainerInfo[];
}

export interface Pm2ProcessInfo {
  pm_id: number;
  name: string;
  status: string;
  cpu: number;
  memoryMB: number;
  restarts: number;
  uptimeMs: number;
  mode: string;
  pid: number;
  cwd?: string;
}

export interface SupervisorProcessInfo {
  name: string;
  status: string;
  pid: string;
  uptime: string;
}
