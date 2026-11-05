export type BackupType = 'database' | 'files' | 'system' | 'other';
export type DbEngine = 'mysql' | 'postgres' | 'mongodb' | 'redis' | 'sqlite' | 'unknown';

export interface BackupItem {
  id: string;
  filename: string;
  filepath: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
  type: BackupType;
  engine?: DbEngine;
  source?: string;
}

export interface BackupProfile {
  id: string;
  serverId: string;
  name: string;
  type: 'database' | 'files';
  target: string; // Database name or directory path
  engine?: DbEngine;
  schedule: string; // e.g. "0 2 * * *" or "manual"
  retentionCount: number; // e.g. 7
  destination: 'local' | 's3';
  s3Config?: {
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    region?: string;
  };
  createdAt: string;
  lastRunAt?: string | null;
  lastStatus?: 'success' | 'failed' | null;
  lastDurationMs?: number;
}

export interface CreateBackupRequest {
  name?: string;
  type: 'database' | 'files';
  engine?: DbEngine;
  database?: string;
  sourcePath?: string;
  excludePatterns?: string[];
  retentionCount?: number;
}

export interface RestoreBackupRequest {
  filepath: string;
  type: 'database' | 'files';
  targetDatabase?: string;
  targetDir?: string;
}

export interface BackupRunResult {
  success: boolean;
  item?: BackupItem;
  stdout: string;
  stderr: string;
  durationMs: number;
  code: number;
}

export interface BackupRestoreResult {
  success: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  code: number;
}

