export interface BatchResultItem {
  serverId: string;
  serverName: string;
  host: string;
  durationMs: number;
  success: boolean;
  stdout?: string;
  stderr?: string;
  code?: number;
  error?: string;
}
