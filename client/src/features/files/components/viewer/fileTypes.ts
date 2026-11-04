// File classification by name/extension: decides which viewer and editor features a file gets.
export type FileCategory =
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'archive'
  | 'json'
  | 'markdown'
  | 'env'
  | 'log'
  | 'code'
  | 'text'
  | 'binary';

export interface FileClassification {
  category: FileCategory;
  language: string;
  ext: string;
  filename: string;
  canEdit: boolean;
}

export function classifyFile(filePath: string): FileClassification {
  const filename = filePath.split('/').pop() || '';
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop() || '' : '';

  // 1. Images
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext)) {
    return { category: 'image', language: ext.toUpperCase(), ext, filename, canEdit: ext === 'svg' };
  }

  // 2. Audio
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
    return { category: 'audio', language: ext.toUpperCase(), ext, filename, canEdit: false };
  }

  // 3. Video
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) {
    return { category: 'video', language: ext.toUpperCase(), ext, filename, canEdit: false };
  }

  // 4. PDF
  if (ext === 'pdf') {
    return { category: 'pdf', language: 'PDF Document', ext, filename, canEdit: false };
  }

  // 5. Archives & Packages
  if (['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'deb', 'rpm', 'jar', 'war'].includes(ext)) {
    return { category: 'archive', language: 'Archive', ext, filename, canEdit: false };
  }

  // 6. Binary / Executables
  if (['bin', 'exe', 'dll', 'so', 'dylib', 'pyc', 'o', 'db', 'sqlite', 'sqlite3'].includes(ext)) {
    return { category: 'binary', language: 'Binary / Database', ext, filename, canEdit: false };
  }

  // 7. JSON
  if (ext === 'json' || filename.endsWith('.lock')) {
    return { category: 'json', language: 'JSON', ext, filename, canEdit: true };
  }

  // 8. ENV
  if (lower === '.env' || lower.startsWith('.env.')) {
    return { category: 'env', language: 'Environment Config', ext, filename, canEdit: true };
  }

  // 9. Markdown
  if (['md', 'markdown', 'mdown'].includes(ext)) {
    return { category: 'markdown', language: 'Markdown', ext, filename, canEdit: true };
  }

  // 10. Logs
  if (ext === 'log' || lower.includes('.log.')) {
    return { category: 'log', language: 'Log File', ext, filename, canEdit: true };
  }

  // 11. Code & Configs
  if (['php', 'phtml'].includes(ext) || filename === 'artisan') {
    return { category: 'code', language: 'PHP', ext, filename, canEdit: true };
  }
  if (['js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return { category: 'code', language: 'JavaScript', ext, filename, canEdit: true };
  }
  if (['ts', 'tsx', 'mts', 'cts'].includes(ext)) {
    return { category: 'code', language: 'TypeScript', ext, filename, canEdit: true };
  }
  if (['html', 'htm', 'vue', 'svelte'].includes(ext)) {
    return { category: 'code', language: 'HTML', ext, filename, canEdit: true };
  }
  if (['css', 'scss', 'sass', 'less'].includes(ext)) {
    return { category: 'code', language: 'CSS', ext, filename, canEdit: true };
  }
  if (['py', 'pyw', 'wsgi'].includes(ext)) {
    return { category: 'code', language: 'Python', ext, filename, canEdit: true };
  }
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) {
    return { category: 'code', language: 'Shell Script', ext, filename, canEdit: true };
  }
  if (['conf', 'nginx'].includes(ext) || lower.includes('nginx')) {
    return { category: 'code', language: 'Nginx Config', ext, filename, canEdit: true };
  }
  if (['yml', 'yaml'].includes(ext)) {
    return { category: 'code', language: 'YAML', ext, filename, canEdit: true };
  }
  if (['xml'].includes(ext)) {
    return { category: 'code', language: 'XML', ext, filename, canEdit: true };
  }
  if (['sql'].includes(ext)) {
    return { category: 'code', language: 'SQL', ext, filename, canEdit: true };
  }
  if (['ini', 'toml', 'cfg', 'cnf'].includes(ext)) {
    return { category: 'code', language: 'INI / Config', ext, filename, canEdit: true };
  }
  if (filename === 'Dockerfile' || filename.startsWith('docker-compose')) {
    return { category: 'code', language: 'Docker', ext, filename, canEdit: true };
  }

  return { category: 'text', language: 'Plain Text', ext, filename, canEdit: true };
}

export const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};
