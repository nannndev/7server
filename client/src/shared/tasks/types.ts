export type TaskCategory = 'docker' | 'software' | 'git' | 'database' | 'system';
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

