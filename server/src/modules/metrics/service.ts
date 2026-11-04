// Agentless host metrics over SSH (cpu, memory, disk, swap, docker counts, os info).
import { executeCommand } from '../../infra/ssh.js';
import { ServerCredentials, ServerMetrics } from '../servers/types.js';

export async function fetchServerMetrics(serverConfig: ServerCredentials): Promise<ServerMetrics> {
  const script = `
    cat << 'EOF' > /tmp/__vps_probe.sh
#!/bin/sh
echo "===START_METRICS==="
echo "HOSTNAME:$(hostname 2>/dev/null || cat /etc/hostname 2>/dev/null)"
echo "KERNEL:$(uname -r)"
if [ -f /etc/os-release ]; then
  . /etc/os-release
  echo "OS:$PRETTY_NAME"
else
  echo "OS:$(uname -s)"
fi
echo "UPTIME:$(uptime -p 2>/dev/null || cat /proc/uptime 2>/dev/null | awk '{print int($1/86400)"d "int($1%86400/3600)"h "int($1%3600/60)"m"}')"
echo "LOAD:$(cat /proc/loadavg 2>/dev/null | awk '{print $1" "$2" "$3}')"
echo "CORES:$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)"

# Memory & Swap in MB
if command -v free >/dev/null 2>&1; then
  free -m | awk 'NR==2{print "MEM:"$2":"$3":"$4":"$7}'
  free -m | awk '/^Swap:/{print "SWAP:"$2":"$3":"$4}'
else
  echo "MEM:0:0:0:0"
  echo "SWAP:0:0:0"
fi

# Disk for root / (Size, Used, Avail, Use%)
df -m / | awk 'NR==2{print "DISK:"$2":"$3":"$4":"$5}'

# Robust POSIX CPU calculation from /proc/stat delta
read c u1 n1 s1 i1 io1 ir1 so1 st1 rest < /proc/stat
t1=$((u1 + n1 + s1 + i1 + io1 + ir1 + so1 + st1))
id1=$((i1 + io1))
sleep 0.35
read c u2 n2 s2 i2 io2 ir2 so2 st2 rest < /proc/stat
t2=$((u2 + n2 + s2 + i2 + io2 + ir2 + so2 + st2))
id2=$((i2 + io2))

diff_total=$((t2 - t1))
diff_idle=$((id2 - id1))

if [ "$diff_total" -gt 0 ]; then
  diff_used=$((diff_total - diff_idle))
  cpu_pct=$(( (100 * diff_used) / diff_total ))
  if [ "$cpu_pct" -lt 0 ]; then cpu_pct=0; fi
  if [ "$cpu_pct" -gt 100 ]; then cpu_pct=100; fi
  echo "CPU:$cpu_pct"
else
  echo "CPU:0"
fi

# Docker containers check
if command -v docker >/dev/null 2>&1; then
  echo "DOCKER:AVAILABLE:$(docker ps -q 2>/dev/null | wc -l):$(docker ps -aq 2>/dev/null | wc -l)"
else
  echo "DOCKER:NOT_INSTALLED:0:0"
fi

echo "===END_METRICS==="
EOF
chmod +x /tmp/__vps_probe.sh
/bin/sh /tmp/__vps_probe.sh
rm -f /tmp/__vps_probe.sh
`;

  const { stdout } = await executeCommand(serverConfig, script, 12000);
  return parseMetricsOutput(stdout);
}

function parseMetricsOutput(raw: string): ServerMetrics {
  const result: ServerMetrics = {
    hostname: 'unknown',
    os: 'Linux',
    kernel: '',
    uptime: '',
    loadAverage: [0, 0, 0],
    cpuCores: 1,
    cpuUsagePercent: 0,
    memory: { totalMB: 0, usedMB: 0, freeMB: 0, availableMB: 0, usedPercent: 0 },
    swap: { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 },
    disk: { totalMB: 0, usedMB: 0, freeMB: 0, usedPercent: 0 },
    docker: { installed: false, runningContainers: 0, totalContainers: 0 },
    timestamp: new Date().toISOString()
  };

  const lines = raw.split('\n');
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '===START_METRICS===') {
      capturing = true;
      continue;
    }
    if (trimmed === '===END_METRICS===') {
      break;
    }
    if (!capturing) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    const key = trimmed.slice(0, colonIndex);
    const val = trimmed.slice(colonIndex + 1);

    switch (key) {
      case 'HOSTNAME':
        result.hostname = val || result.hostname;
        break;
      case 'OS':
        result.os = val || result.os;
        break;
      case 'KERNEL':
        result.kernel = val || result.kernel;
        break;
      case 'UPTIME':
        result.uptime = val || result.uptime;
        break;
      case 'LOAD': {
        const parts = val.split(' ').map(parseFloat);
        result.loadAverage = parts.length === 3 ? [parts[0], parts[1], parts[2]] : [0, 0, 0];
        break;
      }
      case 'CORES':
        result.cpuCores = parseInt(val, 10) || 1;
        break;
      case 'MEM': {
        const [total, used, free, avail] = val.split(':').map((v) => parseInt(v, 10) || 0);
        const actualAvail = avail > 0 ? avail : free;
        const actualUsed = total > 0 ? Math.max(0, total - actualAvail) : used;
        const usedPercent = total > 0 ? Math.round((actualUsed / total) * 100) : 0;
        result.memory = {
          totalMB: total,
          usedMB: actualUsed,
          freeMB: actualAvail,
          availableMB: actualAvail,
          usedPercent
        };
        break;
      }
      case 'SWAP': {
        const [total, used, free] = val.split(':').map((v) => parseInt(v, 10) || 0);
        const usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;
        result.swap = {
          totalMB: total,
          usedMB: used,
          freeMB: free,
          usedPercent
        };
        break;
      }
      case 'DISK': {
        const [total, used, free, pctStr] = val.split(':');
        const totalMB = parseInt(total, 10) || 0;
        const usedMB = parseInt(used, 10) || 0;
        const freeMB = parseInt(free, 10) || 0;
        const pct = parseInt(pctStr?.replace('%', ''), 10) || (totalMB > 0 ? Math.round((usedMB / totalMB) * 100) : 0);
        result.disk = {
          totalMB,
          usedMB,
          freeMB,
          usedPercent: pct
        };
        break;
      }
      case 'CPU': {
        const parsed = parseFloat(val);
        result.cpuUsagePercent = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, Math.round(parsed * 10) / 10));
        break;
      }
      case 'DOCKER': {
        const [status, running, total] = val.split(':');
        result.docker = {
          installed: status === 'AVAILABLE',
          runningContainers: parseInt(running, 10) || 0,
          totalContainers: parseInt(total, 10) || 0
        };
        break;
      }
    }
  }

  return result;
}
