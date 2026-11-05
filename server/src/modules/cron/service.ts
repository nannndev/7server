import { executeCommand } from '../../infra/ssh.js';
import type { ServerCredentials } from '../servers/types.js';
import type { CronJobItem, CronRunResult } from './types.js';

export function parseCrontab(raw: string): CronJobItem[] {
  const lines = raw.split('\n');
  const items: CronJobItem[] = [];

  let pendingComment: string | undefined = undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if line is a disabled cron job: e.g. # * * * * * cmd or # 0 0 * * * cmd
    const disabledMatch = line.match(/^#\s*([0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+|@[a-z]+)\s+(.+)$/);
    if (disabledMatch) {
      const schedule = disabledMatch[1];
      let remainder = disabledMatch[2];
      let comment = pendingComment;

      // Check inline comment: cmd # comment
      const inlineCommentMatch = remainder.match(/^(.*?)\s+#\s*(.+)$/);
      let command = remainder;
      if (inlineCommentMatch) {
        command = inlineCommentMatch[1];
        comment = comment ? `${comment} (${inlineCommentMatch[2]})` : inlineCommentMatch[2];
      }

      items.push({
        id: `cron-${items.length + 1}`,
        schedule,
        command: command.trim(),
        comment,
        enabled: false,
        raw: line
      });
      pendingComment = undefined;
      continue;
    }

    // Check if line is a regular comment (save as pending comment for next job)
    if (line.startsWith('#')) {
      const commentText = line.replace(/^#+\s*/, '').trim();
      if (commentText) {
        pendingComment = commentText;
      }
      continue;
    }

    // Standard cronjob line: 5 schedule parts or @shorthand + command
    const cronMatch = line.match(/^([0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+\s+[0-9*,/-]+|@[a-z]+)\s+(.+)$/);
    if (cronMatch) {
      const schedule = cronMatch[1];
      let remainder = cronMatch[2];
      let comment = pendingComment;

      // Check inline comment: cmd # comment
      const inlineCommentMatch = remainder.match(/^(.*?)\s+#\s*(.+)$/);
      let command = remainder;
      if (inlineCommentMatch) {
        command = inlineCommentMatch[1];
        comment = comment ? `${comment} (${inlineCommentMatch[2]})` : inlineCommentMatch[2];
      }

      items.push({
        id: `cron-${items.length + 1}`,
        schedule,
        command: command.trim(),
        comment,
        enabled: true,
        raw: line
      });
      pendingComment = undefined;
      continue;
    }

    // Unrecognized or environment variable (e.g. MAILTO="", PATH=...), treat as skipped/ignored
  }

  return items;
}

export function serializeCrontab(jobs: CronJobItem[]): string {
  const lines: string[] = [
    '# Crontab managed by 7Server',
    '# Generated: ' + new Date().toISOString(),
    ''
  ];

  for (const job of jobs) {
    if (job.comment) {
      lines.push(`# ${job.comment}`);
    }
    const linePrefix = job.enabled ? '' : '# ';
    lines.push(`${linePrefix}${job.schedule} ${job.command}`);
  }

  lines.push(''); // Trailing newline is required by crontab
  return lines.join('\n');
}

export async function fetchCronJobs(target: ServerCredentials): Promise<CronJobItem[]> {
  try {
    const { stdout } = await executeCommand(target, 'crontab -l 2>/dev/null || true', 10000);
    return parseCrontab(stdout);
  } catch (err: any) {
    return [];
  }
}

export async function saveCronJobs(target: ServerCredentials, jobs: CronJobItem[]): Promise<CronJobItem[]> {
  const content = serializeCrontab(jobs);
  // Safely write crontab via base64 decoding into crontab
  const base64Content = Buffer.from(content).toString('base64');
  const cmd = `echo "${base64Content}" | base64 -d | crontab -`;
  await executeCommand(target, cmd, 15000);
  return await fetchCronJobs(target);
}

export async function addCronJob(
  target: ServerCredentials,
  newJob: { schedule: string; command: string; comment?: string; enabled?: boolean }
): Promise<CronJobItem[]> {
  const existing = await fetchCronJobs(target);
  const jobItem: CronJobItem = {
    id: `cron-${Date.now()}`,
    schedule: newJob.schedule.trim(),
    command: newJob.command.trim(),
    comment: newJob.comment?.trim(),
    enabled: newJob.enabled !== false,
    raw: `${newJob.schedule} ${newJob.command}`
  };
  return await saveCronJobs(target, [...existing, jobItem]);
}

export async function testRunCron(target: ServerCredentials, command: string): Promise<CronRunResult> {
  const start = Date.now();
  try {
    // Run command in subshell with timeout
    const result = await executeCommand(target, `timeout 35 bash -c ${JSON.stringify(command)} 2>&1`, 40000);
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.code ?? 0,
      durationMs: Date.now() - start
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      code: err.code || 1,
      durationMs: Date.now() - start
    };
  }
}

