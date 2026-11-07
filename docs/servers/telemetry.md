# Real-Time Telemetry & Monitoring

7Server provides live and historical telemetry for every server in your fleet without installing Prometheus node exporters or Telegraf daemons.

<img class="only-light" src="/screenshots/fleet-matrix-light.png" alt="3D Resource Saturation Matrix">
<img class="only-dark" src="/screenshots/fleet-matrix-dark.png" alt="3D Resource Saturation Matrix">

---

## How Telemetry Works (Agentless)

Every poll interval (configurable per server), 7Server issues lightweight, single-flight POSIX commands over SSH:

```bash
# CPU calculation from /proc/stat differential
cat /proc/stat | grep '^cpu '

# RAM utilization from /proc/meminfo
cat /proc/meminfo

# Disk space and inode status
df -k -P /
```

Because these commands run directly against the Linux kernel virtual filesystem (`/proc`), they produce practically zero CPU and memory footprint on the remote VPS.

---

## Monitored Metrics

1. **CPU Usage & Load Averages**:
   - Total CPU percentage across all cores.
   - 1-minute, 5-minute, and 15-minute load averages (`uptime`).
2. **Memory Breakdown**:
   - Total, Used, Free, Buffers, and Cached RAM.
   - Swap space utilization and swap-in/swap-out activity.
3. **Storage Volumes**:
   - Root filesystem and mounted block volumes.
   - Used vs Available gigabytes with visual threshold warning bars.
4. **Network I/O**:
   - RX/TX throughput per network interface (`eth0`, `ens3`, `wg0`).

---

## Discord & Webhook Alerts

Configure notifications for anomaly spikes:
- Alert when CPU > 90% for 5 consecutive minutes.
- Alert when available disk space drops below 10%.
- Alert immediately if an SSH connection fails or a node goes offline.

