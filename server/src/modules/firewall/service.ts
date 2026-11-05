import { ServerCredentials } from '../servers/types.js';
import { executeCommand } from '../../infra/ssh.js';
import { FirewallRule, FirewallStatus, RulePreview } from './types.js';

export async function getFirewallStatus(server: ServerCredentials): Promise<FirewallStatus> {
  const sshPort = server.port || 22;
  const cmd = `if command -v ufw >/dev/null 2>&1; then sudo ufw status numbered; else echo "UFW_NOT_INSTALLED"; fi`;
  const result = await executeCommand(server, cmd);
  const raw = result.stdout || '';

  if (raw.includes('UFW_NOT_INSTALLED')) {
    return {
      active: false,
      raw: 'UFW tidak terpasang di server ini',
      defaultIncoming: 'allow',
      defaultOutgoing: 'allow',
      rules: [],
      sshPort,
      sshProtected: false
    };
  }

  const active = raw.toLowerCase().includes('status: active');
  const rules: FirewallRule[] = [];
  let sshProtected = false;

  // Parse lines like: [ 1] 22/tcp                     ALLOW IN    Anywhere
  const lines = raw.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*\[\s*(\d+)\]\s+(.*?)\s+(ALLOW IN|DENY IN|REJECT IN|LIMIT IN|ALLOW|DENY|REJECT|LIMIT)\s+(.*?)(?:\s+#\s*(.*))?$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      const to = match[2].trim();
      const action = match[3].trim().toUpperCase();
      const from = match[4].trim();
      const comment = match[5]?.trim();
      const isV6 = to.includes('(v6)') || from.includes('(v6)');

      // Check if this rule protects active SSH port
      if ((to.startsWith(String(sshPort)) || to.startsWith('22/')) && action.includes('ALLOW')) {
        sshProtected = true;
      }

      rules.push({
        number: num,
        to,
        action,
        from,
        comment,
        isV6
      });
    }
  }

  return {
    active,
    raw,
    defaultIncoming: 'deny (default)',
    defaultOutgoing: 'allow (default)',
    rules,
    sshPort,
    sshProtected
  };
}

export function previewRuleChange(
  server: ServerCredentials,
  action: 'allow' | 'deny' | 'delete',
  port?: number,
  proto: 'tcp' | 'udp' | 'any' = 'tcp',
  fromIp?: string
): RulePreview {
  const activeSshPort = server.port || 22;

  // Safeguard 1: Blocking or denying the active SSH port
  if (port === activeSshPort && action === 'deny') {
    return {
      allowed: false,
      reason: `Pengaman 7Server: Tidak dapat memblokir port SSH aktif (${activeSshPort}) karena akan memutus akses dashboard ke server ini!`,
      command: '',
      activeSshPort,
      willBlockSsh: true
    };
  }

  let command = '';
  const protoSuffix = proto === 'any' ? '' : `/${proto}`;

  if (action === 'delete') {
    command = `sudo ufw delete <rule-number>`;
  } else if (fromIp && fromIp.trim()) {
    command = `sudo ufw ${action} proto ${proto === 'any' ? 'any' : proto} from ${fromIp.trim()} to any port ${port}`;
  } else {
    command = `sudo ufw ${action} ${port}${protoSuffix}`;
  }

  return {
    allowed: true,
    command,
    activeSshPort,
    willBlockSsh: false
  };
}

export async function addFirewallRule(
  server: ServerCredentials,
  action: 'allow' | 'deny',
  port: number,
  proto: 'tcp' | 'udp' | 'any' = 'tcp',
  fromIp?: string,
  comment?: string
): Promise<{ success: boolean; output: string }> {
  const preview = previewRuleChange(server, action, port, proto, fromIp);
  if (!preview.allowed) {
    throw new Error(preview.reason);
  }

  const commentSuffix = comment ? ` comment "${comment.replace(/"/g, '')}"` : '';
  const protoSuffix = proto === 'any' ? '' : `/${proto}`;
  let cmd = '';

  if (fromIp && fromIp.trim()) {
    cmd = `sudo ufw ${action} proto ${proto === 'any' ? 'any' : proto} from ${fromIp.trim()} to any port ${port}${commentSuffix}`;
  } else {
    cmd = `sudo ufw ${action} ${port}${protoSuffix}${commentSuffix}`;
  }

  const res = await executeCommand(server, cmd);
  return { success: true, output: res.stdout || res.stderr };
}

export async function deleteFirewallRule(
  server: ServerCredentials,
  ruleNumber: number
): Promise<{ success: boolean; output: string }> {
  // Check if deleting this rule deletes the only SSH rule
  const status = await getFirewallStatus(server);
  const targetRule = status.rules.find((r) => r.number === ruleNumber);
  const activeSshPort = server.port || 22;

  if (targetRule && (targetRule.to.startsWith(String(activeSshPort)) || targetRule.to.startsWith('22/'))) {
    // Check if there are other allow rules for SSH
    const otherSshRules = status.rules.filter((r) => r.number !== ruleNumber && (r.to.startsWith(String(activeSshPort)) || r.to.startsWith('22/')) && r.action.includes('ALLOW'));
    if (otherSshRules.length === 0) {
      throw new Error(`Pengaman 7Server: Tidak dapat menghapus aturan SSH #${ruleNumber}. Harus ada minimal 1 aturan ALLOW untuk port SSH (${activeSshPort}) sebelum menghapus aturan ini!`);
    }
  }

  const cmd = `echo "y" | sudo ufw delete ${ruleNumber}`;
  const res = await executeCommand(server, cmd);
  return { success: true, output: res.stdout || res.stderr };
}

export async function toggleFirewallState(
  server: ServerCredentials,
  enable: boolean
): Promise<{ success: boolean; output: string }> {
  const activeSshPort = server.port || 22;

  if (enable) {
    // Safeguard: Ensure SSH is allowed before enabling UFW
    const preCheck = await getFirewallStatus(server);
    if (!preCheck.sshProtected) {
      // Auto-allow SSH before enabling so connection is never severed!
      await executeCommand(server, `sudo ufw allow ${activeSshPort}/tcp comment "7Server SSH access protection"`);
    }
    const res = await executeCommand(server, 'echo "y" | sudo ufw enable');
    return { success: true, output: res.stdout || res.stderr };
  } else {
    const res = await executeCommand(server, 'sudo ufw disable');
    return { success: true, output: res.stdout || res.stderr };
  }
}
