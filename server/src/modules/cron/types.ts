export interface CronJobItem {
  id: string;
  schedule: string;
  command: string;
  comment?: string;
  enabled: boolean;
  raw: string;
}

export interface CronRunResult {
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
}

