import { executeCommand } from '../../infra/ssh.js';
import type { ServerCredentials } from '../servers/types.js';
import type { SshKeyItem, SecurityHardeningStatus } from './types.js';

export function parseAuthorizedKeys(content: string): SshKeyItem[] {
  const lines = content.split('\n');
  const items: SshKeyItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    // Standard public key line: ssh-rsa AAAAB3... user@host
    // Or options: command="..." ssh-rsa AAA...
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      // Find key type index (e.g. ssh-rsa, ssh-ed25519, ecdsa-sha2-nistp256)
      let typeIdx = parts.findIndex((p) => p.startsWith('ssh-') || p.startsWith('ecdsa-'));
      if (typeIdx === -1 && parts[0].includes('-')) typeIdx = 0;

      if (typeIdx !== -1 && parts[typeIdx + 1]) {
        const type = parts[typeIdx];
        const key = parts[typeIdx + 1];
        const comment = parts.slice(typeIdx + 2).join(' ') || `Key #${items.length + 1}`;

        items.push({
          id: `key-${items.length + 1}`,
          type,
          key,
          comment,
          raw: line
        });
      }
    }
  }

  return items;
}

export async function fetchSshKeys(target: ServerCredentials): Promise<SshKeyItem[]> {
  try {
    const { stdout } = await executeCommand(target, 'cat ~/.ssh/authorized_keys 2>/dev/null || true', 10000);
    return parseAuthorizedKeys(stdout);
  } catch {
    return [];
  }
}

export async function addSshKey(target: ServerCredentials, newKeyLine: string): Promise<SshKeyItem[]> {
  const trimmed = newKeyLine.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    throw new Error('Public key tidak boleh kosong atau berupa komentar');
  }

  // Validate format
  const parsed = parseAuthorizedKeys(trimmed);
  if (parsed.length === 0) {
    throw new Error('Format public key tidak valid (harus diawali ssh-ed25519, ssh-rsa, dll)');
  }

  const base64Key = Buffer.from(trimmed + '\n').toString('base64');
  const cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo "${base64Key}" | base64 -d >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
  await executeCommand(target, cmd, 15000);

  return await fetchSshKeys(target);
}

export async function deleteSshKey(target: ServerCredentials, keyId: string): Promise<SshKeyItem[]> {
  const currentKeys = await fetchSshKeys(target);
  const remaining = currentKeys.filter((k) => k.id !== keyId);

  const newContent = remaining.map((k) => k.raw).join('\n') + (remaining.length > 0 ? '\n' : '');
  const base64Content = Buffer.from(newContent).toString('base64');

  const cmd = `echo "${base64Content}" | base64 -d > ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
  await executeCommand(target, cmd, 15000);

  return await fetchSshKeys(target);
}

export async function fetchHardeningStatus(target: ServerCredentials): Promise<SecurityHardeningStatus> {
  const probeScript = `
# 1. SSH Config Probe
SSHD_CONFIG=$(cat /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null || true)
PASS_AUTH=$(echo "$SSHD_CONFIG" | grep -iE '^[ \\t]*PasswordAuthentication[ \\t]+' | tail -1 | awk '{print $2}')
ROOT_LOGIN=$(echo "$SSHD_CONFIG" | grep -iE '^[ \\t]*PermitRootLogin[ \\t]+' | tail -1 | awk '{print $2}')
PORT=$(echo "$SSHD_CONFIG" | grep -iE '^[ \\t]*Port[ \\t]+' | tail -1 | awk '{print $2}')
[ -z "$PASS_AUTH" ] && PASS_AUTH="yes"
[ -z "$ROOT_LOGIN" ] && ROOT_LOGIN="prohibit-password"
[ -z "$PORT" ] && PORT="22"

# 2. Fail2ban Probe
if command -v fail2ban-client >/dev/null 2>&1; then
  F2B_INSTALLED="1"
  if systemctl is-active --quiet fail2ban; then
    F2B_ACTIVE="1"
    BANNED=$(fail2ban-client status sshd 2>/dev/null | grep -i 'Banned IP list:' | sed 's/.*Banned IP list://' | tr -s ' ' | sed 's/^ //')
  else
    F2B_ACTIVE="0"
    BANNED=""
  fi
else
  F2B_INSTALLED="0"
  F2B_ACTIVE="0"
  BANNED=""
fi

echo "@@HARDENING|$PASS_AUTH|$ROOT_LOGIN|$PORT|$F2B_INSTALLED|$F2B_ACTIVE|$BANNED"
`;

  try {
    const { stdout } = await executeCommand(target, probeScript, 15000);
    const line = stdout.split('\n').find((l) => l.startsWith('@@HARDENING|'));
    if (!line) {
      return {
        passwordAuth: true,
        rootLogin: 'yes',
        sshPort: 22,
        fail2banInstalled: false,
        fail2banActive: false,
        bannedIps: []
      };
    }

    const parts = line.split('|');
    const passwordAuth = parts[1].toLowerCase() === 'yes';
    const rootLogin = parts[2].toLowerCase();
    const sshPort = parseInt(parts[3], 10) || 22;
    const fail2banInstalled = parts[4] === '1';
    const fail2banActive = parts[5] === '1';
    const bannedIps = (parts[6] || '').split(/\s+/).filter(Boolean);

    return {
      passwordAuth,
      rootLogin,
      sshPort,
      fail2banInstalled,
      fail2banActive,
      bannedIps
    };
  } catch {
    return {
      passwordAuth: true,
      rootLogin: 'yes',
      sshPort: 22,
      fail2banInstalled: false,
      fail2banActive: false,
      bannedIps: []
    };
  }
}

export async function unbanIp(target: ServerCredentials, ip: string): Promise<{ success: boolean; ip: string }> {
  const cleanIp = ip.trim();
  if (!cleanIp || !/^[0-9a-fA-F.:]+$/.test(cleanIp)) {
    throw new Error('Alamat IP tidak valid');
  }

  const cmd = `fail2ban-client set sshd unbanip ${cleanIp} 2>&1`;
  const { stdout, code } = await executeCommand(target, cmd, 10000);
  return {
    success: (code ?? 0) === 0 || stdout.includes(cleanIp),
    ip: cleanIp
  };
}

