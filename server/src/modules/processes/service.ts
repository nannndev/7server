// Processes, systemd services, PM2 and Supervisor: listing and control.
import { executeCommand } from '../../infra/ssh.js';
import { ServerCredentials, CommandResult } from '../servers/types.js';
import { ProcessInfo, ServicesResponse, Pm2ProcessInfo, SupervisorProcessInfo } from './types.js';
import { badRequest } from '../../http/errors.js';

export async function fetchRunningProcesses(serverConfig: ServerCredentials): Promise<ProcessInfo[]> {
  const cmd = `ps -eo pid,user,%cpu,%mem,stat,comm,args --sort=-%cpu | head -n 50`;
  const { stdout } = await executeCommand(serverConfig, cmd, 8000);

  const lines = stdout.trim().split('\n');
  if (lines.length < 2) return [];

  const processes: ProcessInfo[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (match) {
      processes.push({
        pid: parseInt(match[1], 10),
        user: match[2],
        cpu: parseFloat(match[3]) || 0,
        mem: parseFloat(match[4]) || 0,
        stat: match[5],
        comm: match[6],
        args: match[7] || match[6]
      });
    }
  }
  return processes;
}

export async function fetchServices(serverConfig: ServerCredentials): Promise<ServicesResponse> {
  const cmd = `
    echo "===SYSTEMD==="
    systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null | head -n 60
    echo "===DOCKER==="
    if command -v docker >/dev/null 2>&1; then
      docker ps -a --format '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.State}}' 2>/dev/null | head -n 30
    fi
  `;
  const { stdout } = await executeCommand(serverConfig, cmd, 10000);

  const sections = stdout.split('===DOCKER===');
  const systemdPart = sections[0].replace('===SYSTEMD===', '').trim();
  const dockerPart = (sections[1] || '').trim();

  const services = [];
  if (systemdPart) {
    for (const line of systemdPart.split('\n')) {
      // Failed / not-found units are prefixed with a status glyph ("● auditd.service not-found ...") that
      // is its own whitespace-separated token; drop it before splitting or every column shifts by one.
      const parts = line.trim().replace(/^[●*×]\s+/, '').split(/\s+/);
      if (parts.length >= 4) {
        const unit = parts[0];
        const load = parts[1];
        const active = parts[2];
        const sub = parts[3];
        const description = parts.slice(4).join(' ');
        services.push({
          unit,
          load,
          active,
          sub,
          description: description || unit
        });
      }
    }
  }

  const dockerContainers = [];
  if (dockerPart) {
    for (const line of dockerPart.split('\n')) {
      const parts = line.trim().split('\t');
      if (parts.length >= 4) {
        dockerContainers.push({
          id: parts[0],
          name: parts[1],
          image: parts[2],
          status: parts[3],
          state: parts[4] || 'unknown'
        });
      }
    }
  }

  return { services, dockerContainers };
}

export async function manageProcess(serverConfig: ServerCredentials, pid: number | string, action = 'kill'): Promise<CommandResult> {
  const signal = action === 'term' ? '-15' : '-9';
  const cmd = `kill ${signal} ${parseInt(String(pid), 10)}`;
  return await executeCommand(serverConfig, cmd, 5000);
}

export async function manageService(serverConfig: ServerCredentials, serviceName: string, action = 'restart'): Promise<CommandResult> {
  const allowed = ['start', 'stop', 'restart', 'reload', 'status'];
  if (!allowed.includes(action)) {
    throw badRequest(`Action '${action}' not supported`);
  }
  const cleanName = serviceName.replace(/[^a-zA-Z0-9_\-@.]/g, '');
  const cmd = `systemctl ${action} ${cleanName}`;
  return await executeCommand(serverConfig, cmd, 10000);
}

export async function fetchPm2AndSupervisor(serverConfig: ServerCredentials): Promise<{
  pm2: Pm2ProcessInfo[];
  supervisor: SupervisorProcessInfo[];
}> {
  const cmd = `
    export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
    if [ -d "$HOME/.nvm/versions/node" ]; then
      NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
      [ -n "$NVM_LATEST" ] && export PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
    fi
    echo "===PM2_START==="
    if command -v pm2 >/dev/null 2>&1; then
      pm2 jlist 2>/dev/null || echo "[]"
    else
      echo "[]"
    fi
    echo "===PM2_END==="
    echo "===SUPERVISOR_START==="
    if command -v supervisorctl >/dev/null 2>&1; then
      supervisorctl status 2>/dev/null || true
    fi
    echo "===SUPERVISOR_END==="
  `;
  const { stdout } = await executeCommand(serverConfig, cmd, 10000);

  const pm2: Pm2ProcessInfo[] = [];
  const supervisor: SupervisorProcessInfo[] = [];

  const pm2Match = stdout.match(/===PM2_START===([\s\S]*?)===PM2_END===/);
  if (pm2Match && pm2Match[1]) {
    const rawJson = pm2Match[1].trim();
    const jsonStart = rawJson.indexOf('[');
    const jsonEnd = rawJson.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd >= jsonStart) {
      try {
        const parsed = JSON.parse(rawJson.slice(jsonStart, jsonEnd + 1));
        if (Array.isArray(parsed)) {
          const now = Date.now();
          for (const item of parsed) {
            const env = item.pm2_env || {};
            const monit = item.monit || {};
            pm2.push({
              pm_id: item.pm_id ?? 0,
              name: item.name || env.name || `app-${item.pm_id}`,
              status: env.status || 'unknown',
              cpu: Number(monit.cpu || 0),
              memoryMB: Math.round(((monit.memory || 0) / (1024 * 1024)) * 10) / 10,
              restarts: Number(env.restart_time || 0),
              uptimeMs: env.pm_uptime && env.status === 'online' ? Math.max(0, now - Number(env.pm_uptime)) : 0,
              mode: env.exec_mode === 'cluster_mode' ? 'cluster' : 'fork',
              pid: Number(item.pid || 0),
              cwd: env.pm_cwd || ''
            });
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }

  const supMatch = stdout.match(/===SUPERVISOR_START===([\s\S]*?)===SUPERVISOR_END===/);
  if (supMatch && supMatch[1]) {
    const lines = supMatch[1].trim().split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.includes('sock no such file') || trimmed.includes('error')) continue;
      // e.g. "harucafe-worker:harucafe-worker_00   RUNNING   pid 1234, uptime 2 days, 04:12:11"
      const m = trimmed.match(/^(\S+)\s+(RUNNING|STOPPED|FATAL|STARTING|BACKOFF|EXITED)\s*(.*)$/);
      if (m) {
        const rest = m[3] || '';
        const pidMatch = rest.match(/pid\s+(\d+)/);
        const uptimeMatch = rest.match(/uptime\s+(.+)$/);
        supervisor.push({
          name: m[1],
          status: m[2],
          pid: pidMatch ? pidMatch[1] : '-',
          uptime: uptimeMatch ? uptimeMatch[1] : rest
        });
      }
    }
  }

  return { pm2, supervisor };
}

export async function managePm2Process(
  serverConfig: ServerCredentials,
  target: string | number,
  action: 'restart' | 'stop' | 'start' | 'reload' | 'flush'
): Promise<CommandResult> {
  const allowed = ['restart', 'stop', 'start', 'reload', 'flush'];
  if (!allowed.includes(action)) throw badRequest('Invalid PM2 action');
  const cleanTarget = String(target).replace(/[^a-zA-Z0-9_\-.]/g, '');
  const cmd = `
    export PATH=$PATH:/usr/local/bin:/usr/bin:/bin
    if [ -d "$HOME/.nvm/versions/node" ]; then
      NVM_LATEST=$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)
      [ -n "$NVM_LATEST" ] && export PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
    fi
    pm2 ${action} ${cleanTarget}
  `;
  return await executeCommand(serverConfig, cmd, 12000);
}

export async function manageSupervisorProcess(
  serverConfig: ServerCredentials,
  target: string,
  action: 'restart' | 'stop' | 'start'
): Promise<CommandResult> {
  const allowed = ['restart', 'stop', 'start'];
  if (!allowed.includes(action)) throw badRequest('Invalid Supervisor action');
  const cleanTarget = String(target).replace(/[^a-zA-Z0-9_\-:*]/g, '');
  return await executeCommand(serverConfig, `supervisorctl ${action} ${cleanTarget}`, 12000);
}
