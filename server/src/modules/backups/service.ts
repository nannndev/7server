import fs from 'fs';
import path from 'path';
import { executeCommand } from '../../infra/ssh.js';
import { dataFile } from '../../config.js';
import type { ServerCredentials } from '../servers/types.js';
import type {
  BackupItem,
  BackupProfile,
  BackupRunResult,
  BackupRestoreResult,
  CreateBackupRequest,
  RestoreBackupRequest,
  DbEngine,
  BackupType
} from './types.js';

const PROFILES_FILE = dataFile('backup-profiles.json');

function readProfilesData(): BackupProfile[] {
  try {
    if (!fs.existsSync(PROFILES_FILE)) return [];
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeProfilesData(profiles: BackupProfile[]): void {
  const tmp = `${PROFILES_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2));
  fs.renameSync(tmp, PROFILES_FILE);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function sanitizeArg(val: string): string {
  // Allow only alphanumeric, dash, underscore, dot, forward slash
  return val.replace(/[^a-zA-Z0-9_\-./]/g, '');
}

export async function scanBackups(target: ServerCredentials): Promise<BackupItem[]> {
  const scanScript = `
dirs="/var/backups/7server /var/backups/vps-yubi /var/backups /backup /root/backups"
for d in $dirs; do
  if [ -d "$d" ]; then
    find "$d" -maxdepth 2 -type f \\( -name "*.sql" -o -name "*.sql.gz" -o -name "*.tar.gz" -o -name "*.tgz" -o -name "*.zip" -o -name "*.dump" -o -name "*.rdb" -o -name "*.sqlite" \\) -exec stat -c "%n|%s|%Y" {} + 2>/dev/null
  fi
done
`;

  const { stdout } = await executeCommand(target, scanScript);
  const items: BackupItem[] = [];
  const seenPaths = new Set<string>();

  const lines = stdout.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;

    const parts = trimmed.split('|');
    if (parts.length < 3) continue;

    const filepath = parts[0].trim();
    if (seenPaths.has(filepath)) continue;
    seenPaths.add(filepath);

    const sizeBytes = parseInt(parts[1].trim(), 10) || 0;
    const epochSec = parseInt(parts[2].trim(), 10) || 0;
    const createdAt = epochSec ? new Date(epochSec * 1000).toISOString() : new Date().toISOString();
    const filename = path.basename(filepath);

    let type: BackupType = 'other';
    let engine: DbEngine | undefined = undefined;

    const lower = filename.toLowerCase();
    if (lower.endsWith('.sql') || lower.endsWith('.sql.gz') || lower.endsWith('.dump')) {
      type = 'database';
      if (lower.includes('pg') || lower.includes('postgre')) {
        engine = 'postgres';
      } else if (lower.includes('mongo')) {
        engine = 'mongodb';
      } else {
        engine = 'mysql';
      }
    } else if (lower.endsWith('.rdb')) {
      type = 'database';
      engine = 'redis';
    } else if (lower.endsWith('.sqlite') || lower.endsWith('.db')) {
      type = 'database';
      engine = 'sqlite';
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.zip')) {
      type = 'files';
    }

    items.push({
      id: Buffer.from(filepath).toString('base64url'),
      filename,
      filepath,
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes),
      createdAt,
      type,
      engine,
      source: (filepath.startsWith('/var/backups/7server') || filepath.startsWith('/var/backups/vps-yubi')) ? '7Server' : 'System'
    });
  }

  // Sort newest first
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function executeBackup(
  target: ServerCredentials,
  req: CreateBackupRequest
): Promise<BackupRunResult> {
  const start = Date.now();
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
  const outDir = '/var/backups/7server';

  let script = `mkdir -p ${outDir}\n`;
  let expectedFile = '';

  if (req.type === 'database') {
    const engine = req.engine || 'mysql';
    const db = req.database ? sanitizeArg(req.database) : '';

    if (engine === 'mysql') {
      const fn = db ? `mysql_${db}_${ts}.sql.gz` : `mysql_all_${ts}.sql.gz`;
      expectedFile = `${outDir}/${fn}`;
      const dumpTarget = db ? `--databases ${db}` : '--all-databases';
      script += `mysqldump --single-transaction --quick ${dumpTarget} 2>/dev/null | gzip > "${expectedFile}"`;
    } else if (engine === 'postgres') {
      const pgDb = db || 'postgres';
      const fn = `pg_${pgDb}_${ts}.sql.gz`;
      expectedFile = `${outDir}/${fn}`;
      script += `pg_dump -U postgres "${pgDb}" 2>/dev/null | gzip > "${expectedFile}"`;
    } else if (engine === 'mongodb') {
      const mDb = db || 'admin';
      const fn = `mongo_${mDb}_${ts}.archive.gz`;
      expectedFile = `${outDir}/${fn}`;
      script += `mongodump --db "${mDb}" --archive="${expectedFile}" --gzip 2>/dev/null`;
    } else if (engine === 'redis') {
      const fn = `redis_${ts}.rdb`;
      expectedFile = `${outDir}/${fn}`;
      script += `redis-cli bgsave && sleep 1 && cp /var/lib/redis/dump.rdb "${expectedFile}" 2>/dev/null`;
    } else if (engine === 'sqlite') {
      const src = req.sourcePath ? sanitizeArg(req.sourcePath) : '/var/www/database.sqlite';
      const fn = `sqlite_${path.basename(src)}_${ts}.sqlite`;
      expectedFile = `${outDir}/${fn}`;
      script += `sqlite3 "${src}" ".backup '${expectedFile}'" 2>/dev/null || cp "${src}" "${expectedFile}"`;
    }
  } else {
    // Files / Web App Directory
    const src = req.sourcePath ? sanitizeArg(req.sourcePath) : '/var/www';
    const base = path.basename(src) || 'files';
    const parent = path.dirname(src);
    const fn = `files_${base}_${ts}.tar.gz`;
    expectedFile = `${outDir}/${fn}`;

    const excludes = (req.excludePatterns || ['node_modules', '.git', '*.cache'])
      .map((e) => `--exclude='${sanitizeArg(e)}'`)
      .join(' ');

    script += `tar ${excludes} -czf "${expectedFile}" -C "${parent}" "${base}" 2>/dev/null`;
  }

  // Retention cleanup if specified
  if (req.retentionCount && req.retentionCount > 0) {
    const prefix = req.type === 'database' ? `${outDir}/${req.engine || 'mysql'}_*` : `${outDir}/files_*`;
    script += `\nls -t ${prefix} 2>/dev/null | tail -n +${req.retentionCount + 1} | xargs -r rm -f\n`;
  }

  const res = await executeCommand(target, script);
  const durationMs = Date.now() - start;

  // Verify file was created and get size
  let item: BackupItem | undefined = undefined;
  if (res.code === 0 && expectedFile) {
    const statRes = await executeCommand(target, `stat -c "%s|%Y" "${expectedFile}" 2>/dev/null || echo "0|0"`);
    const [sizeStr, mtimeStr] = statRes.stdout.trim().split('|');
    const sizeBytes = parseInt(sizeStr, 10) || 0;
    const epoch = parseInt(mtimeStr, 10) || Math.floor(Date.now() / 1000);

    item = {
      id: Buffer.from(expectedFile).toString('base64url'),
      filename: path.basename(expectedFile),
      filepath: expectedFile,
      sizeBytes,
      sizeFormatted: formatBytes(sizeBytes),
      createdAt: new Date(epoch * 1000).toISOString(),
      type: req.type,
      engine: req.engine,
      source: '7Server'
    };
  }

  return {
    success: res.code === 0,
    item,
    stdout: res.stdout,
    stderr: res.stderr,
    durationMs,
    code: res.code
  };
}

export async function restoreBackup(
  target: ServerCredentials,
  req: RestoreBackupRequest
): Promise<BackupRestoreResult> {
  const start = Date.now();
  const file = sanitizeArg(req.filepath);

  let script = `test -f "${file}" || { echo "File not found: ${file}" >&2; exit 1; }\n`;

  if (req.type === 'database') {
    const db = req.targetDatabase ? sanitizeArg(req.targetDatabase) : '';
    if (file.endsWith('.sql.gz')) {
      if (file.includes('pg_')) {
        const pgDb = db || 'postgres';
        script += `gunzip < "${file}" | psql -U postgres "${pgDb}"`;
      } else {
        const mysqlTarget = db ? `"${db}"` : '';
        script += `gunzip < "${file}" | mysql ${mysqlTarget}`;
      }
    } else if (file.endsWith('.sql')) {
      if (file.includes('pg_')) {
        const pgDb = db || 'postgres';
        script += `psql -U postgres "${pgDb}" < "${file}"`;
      } else {
        const mysqlTarget = db ? `"${db}"` : '';
        script += `mysql ${mysqlTarget} < "${file}"`;
      }
    } else if (file.endsWith('.archive.gz')) {
      const mDb = db ? `--nsInclude="${db}.*"` : '';
      script += `mongorestore --archive="${file}" --gzip ${mDb}`;
    } else if (file.endsWith('.rdb')) {
      script += `systemctl stop redis && cp "${file}" /var/lib/redis/dump.rdb && chown redis:redis /var/lib/redis/dump.rdb && systemctl start redis`;
    } else if (file.endsWith('.sqlite')) {
      const targetPath = req.targetDir ? sanitizeArg(req.targetDir) : '/var/www/database.sqlite';
      script += `cp "${file}" "${targetPath}"`;
    }
  } else {
    // Files restore
    const dest = req.targetDir ? sanitizeArg(req.targetDir) : '/';
    script += `mkdir -p "${dest}" && tar -xzf "${file}" -C "${dest}"`;
  }

  const res = await executeCommand(target, script);
  const durationMs = Date.now() - start;

  return {
    success: res.code === 0,
    stdout: res.stdout,
    stderr: res.stderr,
    durationMs,
    code: res.code
  };
}

export async function deleteBackupFile(target: ServerCredentials, filepath: string): Promise<void> {
  const clean = sanitizeArg(filepath);

  // Safety checks: do not delete root or critical system directories
  if (!clean || clean === '/' || clean === '/var' || clean === '/etc') {
    throw new Error('Invalid backup file path');
  }

  const lower = clean.toLowerCase();
  const validExts = ['.sql', '.sql.gz', '.tar.gz', '.tgz', '.zip', '.dump', '.rdb', '.sqlite'];
  const hasValidExt = validExts.some((ext) => lower.endsWith(ext));

  if (!hasValidExt) {
    throw new Error('Cannot delete non-archive file');
  }

  const res = await executeCommand(target, `rm -f "${clean}"`);
  if (res.code !== 0) {
    throw new Error(res.stderr || 'Failed to delete backup file');
  }
}

export function getProfiles(serverId: string): BackupProfile[] {
  const all = readProfilesData();
  return all.filter((p) => p.serverId === serverId);
}

export function saveProfile(
  serverId: string,
  data: Omit<BackupProfile, 'id' | 'createdAt'> & { id?: string }
): BackupProfile {
  const all = readProfilesData();
  const now = new Date().toISOString();

  if (data.id) {
    const idx = all.findIndex((p) => p.id === data.id && p.serverId === serverId);
    if (idx >= 0) {
      all[idx] = {
        ...all[idx],
        ...data,
        serverId
      };
      writeProfilesData(all);
      return all[idx];
    }
  }

  const newProfile: BackupProfile = {
    ...data,
    id: `bp-${Date.now().toString(36)}`,
    serverId,
    createdAt: now
  };
  all.push(newProfile);
  writeProfilesData(all);
  return newProfile;
}

export function deleteProfile(serverId: string, profileId: string): void {
  const all = readProfilesData();
  const filtered = all.filter((p) => !(p.id === profileId && p.serverId === serverId));
  writeProfilesData(filtered);
}

