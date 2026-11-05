# Systemd Services & Cron Jobs

Manage background daemons, application workers, and scheduled recurring tasks without touching the command line.

---

## Systemd Services & PM2

- **Service Status**: Inspect systemd units (`nginx`, `postgresql`, `docker`, `redis`).
- **Unit Actions**: Start, stop, restart, enable on boot, or reload unit configurations.
- **Node.js PM2 Workers**: View active PM2 clusters, memory per process, uptime, and restart counts.
- **Top CPU & Memory Consumers**: View running processes sorted by resource consumption (`ps aux`), with options to signal or kill runaway processes.

---

## Visual Crontab Editor

- **Cron Expressions**: Human-readable translation of standard 5-part cron syntax (e.g., `0 2 * * *` -> "Every day at 02:00 AM").
- **Quick Presets**: Hourly, Daily, Weekly, and Monthly presets.
- **Execution Testing**: Trigger cron commands on-demand to test their exit code and verify stdout/stderr output.

