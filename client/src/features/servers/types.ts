export type AuthType = 'password' | 'key';

export type ServerStatus = 'online' | 'offline' | 'unknown';

export interface MemoryMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  availableMB: number;
  usedPercent: number;
}

export interface DiskMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usedPercent: number;
}

export interface DockerMetrics {
  installed: boolean;
  runningContainers: number;
  totalContainers: number;
}

export interface SwapMetrics {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  usedPercent: number;
}

export interface ServerMetrics {
  hostname: string;
  os: string;
  kernel: string;
  uptime: string;
  loadAverage: [number, number, number];
  cpuCores: number;
  cpuUsagePercent: number;
  memory: MemoryMetrics;
  swap?: SwapMetrics;
  disk: DiskMetrics;
  docker: DockerMetrics;
  timestamp: string;
}

export interface ServerItem {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  tags: string[];
  description?: string;
  status: ServerStatus;
  lastChecked?: string | null;
  metrics?: ServerMetrics | null;
  createdAt: string;
  hasPassword?: boolean;
  hasPrivateKey?: boolean;
  hasSudoPassword?: boolean;
}
