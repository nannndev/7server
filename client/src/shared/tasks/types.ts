export type TaskCategory = 'docker' | 'software' | 'git' | 'database' | 'system' | 'services' | 'nginx';
export type TaskStatus = 'running' | 'success' | 'failed';

export interface BackgroundTask {
  id: string;
  serverId?: string;
  serverName?: string;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  startedAt: number;
  finishedAt?: number;
  durationSec: number;
  logs: string[];
  /** "@@STAGE <id>" markers seen in the output, in order (never trimmed) */
  stages?: string[];
  error?: string;
  metadata?: Record<string, any>;
}

export interface StartTaskParams {
  id?: string;
  serverId?: string;
  serverName?: string;
  title: string;
  category: TaskCategory;
  initialLog?: string;
  metadata?: Record<string, any>;
}

