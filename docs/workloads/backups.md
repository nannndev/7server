# Backups & Retention Schedules

Protecting server data is an essential operation. 7Server provides an automated backup manager for files, directories, and databases.

<img class="only-light" src="/screenshots/backups-light.png" alt="Backups and Retention">
<img class="only-dark" src="/screenshots/backups-dark.png" alt="Backups and Retention">

---

## Backup Types

1. **Database Dumps**:
   - Automated `pg_dump` for PostgreSQL
   - Automated `mysqldump` for MySQL / MariaDB
   - Compressed archive generation (`.sql.gz`)
2. **Directory & Configuration Archives**:
   - Compress application folders, `/etc/nginx/`, or Docker volume directories into `.tar.gz`.

---

## Retention Policies & Restoration

- **Retention Limits**: Configure retention windows (e.g. keep last 7 daily backups, prune older archives automatically to save disk space).
- **One-Click Download**: Download backups directly to your local computer over SFTP.
- **One-Click Restore**: Restore databases or archives back into the target server with safety verification checks.

