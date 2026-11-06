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
  pm2Count?: number;
  timestamp: string;
}

export interface RawServer {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  encryptedPassword?: string | null;
  encryptedPrivateKey?: string | null;
  encryptedPassphrase?: string | null;
  encryptedSudoPassword?: string | null;
  tags: string[];
  description?: string;
  status: ServerStatus;
  lastChecked?: string | null;
  metrics?: ServerMetrics | null;
  createdAt: string;
}

export interface SafeServer extends Omit<RawServer, 'encryptedPassword' | 'encryptedPrivateKey' | 'encryptedPassphrase' | 'encryptedSudoPassword'> {
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasSudoPassword?: boolean;
}

export interface ServerCredentials extends SafeServer {
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudoPassword?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
  truncated?: boolean;
}
