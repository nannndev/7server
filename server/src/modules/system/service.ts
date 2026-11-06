import { executeCommand } from '../../infra/ssh.js';
import type { ServerCredentials } from '../servers/types.js';
import { badRequest } from '../../http/errors.js';
import type { SystemTuningStatus, ConfigureSwapPayload, ConfigureSystemPayload } from './types.js';

const HOSTNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,62}$/;
const TIMEZONE_RE = /^[a-zA-Z0-9_+\/-]{1,64}$/;

export function checkHostname(name: string): string {
  const s = String(name || '').trim();
  if (!HOSTNAME_RE.test(s)) throw badRequest(`Hostname tidak valid: ${s.slice(0, 40)}`);
  return s;
}

export function checkTimezone(tz: string): string {
  const s = String(tz || '').trim();
  if (!TIMEZONE_RE.test(s)) throw badRequest(`Timezone tidak valid: ${s.slice(0, 40)}`);
  return s;
}

export async function fetchSystemStatus(server: ServerCredentials): Promise<SystemTuningStatus> {
  const script = [
    'echo "@@FREE"',
    'free -m 2>/dev/null || cat /proc/meminfo',
    'echo "@@SWAPPINESS"',
    'cat /proc/sys/vm/swappiness 2>/dev/null || echo "60"',
    'echo "@@PRESSURE"',
    'cat /proc/sys/vm/vfs_cache_pressure 2>/dev/null || echo "100"',
    'echo "@@SWAPFILE_EXISTS"',
    '[ -f /swapfile ] && echo "1" || echo "0"',
    'echo "@@ROOT_DISK_FREE"',
    "df -m / 2>/dev/null | awk 'NR==2 {print $4}' || echo '0'",
    'echo "@@SWAPS"',
    'cat /proc/swaps 2>/dev/null || echo ""',
    'echo "@@HOSTNAME"',
    'hostname 2>/dev/null || cat /etc/hostname 2>/dev/null || echo ""',
    'echo "@@TIMEZONE"',
    'timedatectl show --property=Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || date +%Z',
    'echo "@@BBR"',
    'sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo "cubic"',
    'echo "@@LIMITS"',
    'cat /proc/sys/fs/file-max 2>/dev/null || echo "0"',
    'cat /proc/sys/net/core/somaxconn 2>/dev/null || echo "128"'
  ].join('\n');

  const { stdout } = await executeCommand(server, script, 20000);

  const sections: Record<string, string[]> = {};
  let cur = '';
  for (const line of stdout.split('\n')) {
    if (line.startsWith('@@')) {
      cur = line.slice(2).trim();
      sections[cur] = [];
      continue;
    }
    if (cur) sections[cur].push(line.replace(/\r$/, ''));
  }

  // Parse free -m
  let totalSwap = 0;
  let usedSwap = 0;
  let freeSwap = 0;
  for (const line of sections.FREE || []) {
    if (line.toLowerCase().startsWith('swap:')) {
      const parts = line.split(/\s+/).filter(Boolean);
      totalSwap = parseInt(parts[1], 10) || 0;
      usedSwap = parseInt(parts[2], 10) || 0;
      freeSwap = parseInt(parts[3], 10) || 0;
      break;
    }
  }

  const swappiness = parseInt((sections.SWAPPINESS || ['60'])[0], 10) || 60;
  const vfsCachePressure = parseInt((sections.PRESSURE || ['100'])[0], 10) || 100;
  const swapFileExists = (sections.SWAPFILE_EXISTS || ['0'])[0].trim() === '1';
  const diskFreeMB = parseInt((sections.ROOT_DISK_FREE || ['0'])[0].trim(), 10) || 0;

  // Parse /proc/swaps
  const activeSwaps = [];
  const swapLines = (sections.SWAPS || []).slice(1); // skip header line
  for (const sl of swapLines) {
    const parts = sl.trim().split(/\s+/);
    if (parts.length >= 5) {
      activeSwaps.push({
        filename: parts[0],
        type: parts[1],
        sizeKB: parseInt(parts[2], 10) || 0,
        usedKB: parseInt(parts[3], 10) || 0,
        priority: parseInt(parts[4], 10) || 0
      });
    }
  }

  const hostname = (sections.HOSTNAME || [''])[0].trim();
  const timezone = (sections.TIMEZONE || ['UTC'])[0].trim() || 'UTC';
  const bbrRaw = (sections.BBR || ['cubic'])[0].trim().toLowerCase();
  const bbrEnabled = bbrRaw.includes('bbr');

  const limits = sections.LIMITS || ['0', '128'];
  const fileMax = parseInt(limits[0] || '0', 10) || 0;
  const somaxconn = parseInt(limits[1] || '128', 10) || 128;

  return {
    swap: {
      totalMB: totalSwap,
      usedMB: usedSwap,
      freeMB: freeSwap,
      swappiness,
      vfsCachePressure,
      swapFileExists,
      swapFilePath: '/swapfile',
      diskFreeMB,
      activeSwaps
    },
    hostname,
    timezone,
    bbrEnabled,
    fileMax,
    somaxconn
  };
}

export async function configureSwap(server: ServerCredentials, payload: ConfigureSwapPayload) {
  const sizeMB = Math.max(0, Math.min(65536, Math.floor(Number(payload.sizeMB) || 0)));
  const swappiness = Math.max(0, Math.min(100, Math.floor(payload.swappiness ?? 10)));
  const vfsCachePressure = Math.max(1, Math.min(200, Math.floor(payload.vfsCachePressure ?? 50)));

  if (sizeMB === 0) {
    // Disable swap & remove /swapfile
    const script = [
      'swapoff -a 2>/dev/null || true',
      'if [ -f /swapfile ]; then rm -f /swapfile; fi',
      "sed -i '/\\/swapfile/d' /etc/fstab 2>/dev/null || true",
      'rm -f /etc/sysctl.d/99-7server-swap.conf 2>/dev/null || true',
      'echo "SWAP_DISABLED_OK"'
    ].join('\n');

    const { stdout, stderr, code } = await executeCommand(server, script, 30000);
    if (code !== 0) throw new Error((stderr || stdout || 'Failed to disable swap').trim());
    return { message: 'Swap disabled and /swapfile removed', output: stdout.trim() };
  }

  // Configure new swap
  const script = [
    'swapoff -a 2>/dev/null || true',
    'if [ -f /swapfile ]; then rm -f /swapfile; fi',
    `fallocate -l ${sizeMB}M /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=${sizeMB} status=none`,
    'chmod 600 /swapfile',
    'mkswap /swapfile',
    'swapon /swapfile',
    "sed -i '/\\/swapfile/d' /etc/fstab 2>/dev/null || true",
    'echo "/swapfile none swap sw 0 0" >> /etc/fstab',
    `sysctl -w vm.swappiness=${swappiness}`,
    `sysctl -w vm.vfs_cache_pressure=${vfsCachePressure}`,
    'mkdir -p /etc/sysctl.d',
    `echo "vm.swappiness=${swappiness}" > /etc/sysctl.d/99-7server-swap.conf`,
    `echo "vm.vfs_cache_pressure=${vfsCachePressure}" >> /etc/sysctl.d/99-7server-swap.conf`,
    `echo "SWAP_CONFIGURED_OK ${sizeMB}MB"`
  ].join('\n');

  const { stdout, stderr, code } = await executeCommand(server, script, 60000);
  if (code !== 0) throw new Error((stderr || stdout || 'Failed to configure swap').trim());
  return { message: `Swap successfully allocated: ${sizeMB}MB`, output: stdout.trim() };
}

export async function configureSystem(server: ServerCredentials, payload: ConfigureSystemPayload) {
  const commands: string[] = [];

  if (payload.hostname) {
    const validHost = checkHostname(payload.hostname);
    commands.push(`hostnamectl set-hostname '${validHost}' 2>/dev/null || hostname '${validHost}'`);
    commands.push(`echo '${validHost}' > /etc/hostname 2>/dev/null || true`);
  }

  if (payload.timezone) {
    const validTz = checkTimezone(payload.timezone);
    commands.push(`timedatectl set-timezone '${validTz}' 2>/dev/null || ln -sf /usr/share/zoneinfo/'${validTz}' /etc/localtime`);
  }

  if (payload.bbr != null) {
    if (payload.bbr) {
      commands.push(
        'modprobe tcp_bbr 2>/dev/null || true',
        'sysctl -w net.core.default_qdisc=fq',
        'sysctl -w net.ipv4.tcp_congestion_control=bbr',
        'mkdir -p /etc/sysctl.d',
        'echo "net.core.default_qdisc=fq" > /etc/sysctl.d/99-7server-bbr.conf',
        'echo "net.ipv4.tcp_congestion_control=bbr" >> /etc/sysctl.d/99-7server-bbr.conf'
      );
    } else {
      commands.push(
        'sysctl -w net.ipv4.tcp_congestion_control=cubic 2>/dev/null || true',
        'rm -f /etc/sysctl.d/99-7server-bbr.conf 2>/dev/null || true'
      );
    }
  }

  if (payload.optimizeLimits) {
    commands.push(
      'sysctl -w fs.file-max=2097152',
      'sysctl -w net.core.somaxconn=65535',
      'mkdir -p /etc/sysctl.d',
      'echo "fs.file-max=2097152" > /etc/sysctl.d/99-7server-limits.conf',
      'echo "net.core.somaxconn=65535" >> /etc/sysctl.d/99-7server-limits.conf'
    );
  }

  if (commands.length === 0) {
    return { message: 'No changes requested', output: '' };
  }

  const script = commands.join('\n');
  const { stdout, stderr, code } = await executeCommand(server, script, 30000);
  if (code !== 0) throw new Error((stderr || stdout || 'Failed to apply system settings').trim());

  return { message: 'System configuration updated successfully', output: stdout.trim() };
}

