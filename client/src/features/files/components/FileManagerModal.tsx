import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Folder,
  FileText,
  FileCode,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
  Archive,
  ArrowUp,
  RefreshCw,
  Download,
  Upload,
  Search,
  Eye,
  Edit2,
  Lock,
  Sparkles
} from 'lucide-react';
import { listFiles, uploadFile, downloadFile, RemoteFile } from '@/features/files/api';
import { ServerItem } from '@/features/servers';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Modal } from '@/shared/ui/modal';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { FileTableSkeleton } from '@/shared/ui/skeleton';
import FileViewer, { classifyFile } from '@/features/files/components/FileViewer';
import { useT } from '@/shared/i18n';

const join = (dir: string, name: string) => (dir.endsWith('/') ? dir : dir + '/') + name;
const parent = (dir: string) => dir.replace(/\/[^/]+\/?$/, '') || '/';
const fmtSize = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b > 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`;

interface FileManagerModalProps {
  server: ServerItem;
  onClose: () => void;
  initialPath?: string;
  initialFile?: string;
}

const BOOKMARKS = [
  { label: '/var/www', path: '/var/www' },
  { label: '/etc/nginx/sites-enabled', path: '/etc/nginx/sites-enabled' },
  { label: '/etc/supervisor/conf.d', path: '/etc/supervisor/conf.d' },
  { label: '/var/log', path: '/var/log' },
  { label: '/root', path: '/root' }
];

function FileItemIcon({ name, isDir }: { name: string; isDir: boolean }) {
  if (isDir) {
    return <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  }
  const meta = classifyFile(name);
  switch (meta.category) {
    case 'image':
      return <ImageIcon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    case 'audio':
      return <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
    case 'video':
      return <VideoIcon className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    case 'archive':
      return <Archive className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case 'json':
      return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'env':
      return <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'code':
      return <FileCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    default:
      return <FileText className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />;
  }
}

export default function FileManagerModal({
  server,
  onClose,
  initialPath,
  initialFile
}: FileManagerModalProps) {
  const t = useT();
  const defaultDir =
    initialPath ||
    (initialFile ? parent(initialFile) : server.username === 'root' ? '/var/www' : `/home/${server.username}`);
  const [dir, setDir] = useState(defaultDir);
  const [pathInput, setPathInput] = useState(defaultDir);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active open file for Preview / Editor
  const [activeFile, setActiveFile] = useState<string | null>(initialFile || null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = async (d = dir) => {
    setLoading(true);
    setError(null);
    try {
      setFiles(await listFiles(server.id, d));
      setDir(d);
      setPathInput(d);
      setSearchFilter('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(defaultDir);
  }, [server.id]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const target = join(dir, file.name);
    if (files.some((f) => f.name === file.name)) {
      const ok = await confirmModal({
        title: t('files.overwriteTitle'),
        message: t('files.overwriteConfirm', { name: file.name }),
        variant: 'warning',
        confirmText: t('files.overwriteTitle')
      });
      if (!ok) return;
    }
    setLoading(true);
    try {
      await uploadFile(server.id, target, file);
      toast.success(t('files.uploaded', { name: file.name }));
      await load();
    } catch (err: any) {
      setError(err.message);
      toast.error(t('files.uploadFailed', { error: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const visibleFiles = files.filter((f) =>
    searchFilter ? f.name.toLowerCase().includes(searchFilter.toLowerCase()) : true
  );

  return (
    <Modal onClose={onClose} className="max-w-5xl h-[88vh]">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full h-full flex flex-col overflow-hidden shadow-2xl">
        {/* If a file is selected, render the adaptive FileViewer */}
        {activeFile ? (
          <FileViewer
            server={server}
            path={activeFile}
            onClose={() => setActiveFile(null)}
            onSaved={() => load()}
          />
        ) : (
          /* Main Directory Explorer View */
          <>
            {/* Top Header */}
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--background)] flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--foreground)] shrink-0">
                SFTP · {server.name}
              </span>

              <form
                className="flex-1 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  load(pathInput || '/');
                }}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  title={t('files.upOneFolder')}
                  onClick={() => load(parent(dir))}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </Button>
                <Input
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  className="h-7 text-xs font-mono sensitive"
                  aria-label={t('files.path')}
                />
              </form>

              <div className="relative hidden sm:block w-44">
                <Search className="w-3 h-3 text-[var(--muted-foreground)] absolute left-2.5 top-2" />
                <Input
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={t('files.filterPlaceholder')}
                  className="h-7 pl-7 text-xs"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('common.refresh')}
                onClick={() => load()}
                disabled={loading}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => uploadRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" /> {t('files.upload')}
              </Button>
              <input ref={uploadRef} type="file" className="hidden" onChange={onUpload} />

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={t('common.close')}
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Quick Bookmarks Bar */}
            <div className="px-4 py-1.5 border-b border-[var(--border)] bg-[var(--muted)]/40 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-[var(--muted-foreground)] font-medium mr-1">{t('files.shortcuts')}</span>
              {BOOKMARKS.map((b) => (
                <button
                  key={b.path}
                  onClick={() => load(b.path)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition whitespace-nowrap ${
                    dir === b.path
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                      : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <span className="ml-auto text-[10px] text-[var(--muted-foreground)] font-mono">
                {t('files.itemCount', { n: visibleFiles.length })}
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between"
              >
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  ✕
                </button>
              </p>
            )}

            {/* File & Folder Table */}
            <div className="flex-1 overflow-auto">
              {loading && files.length === 0 ? (
                <FileTableSkeleton rows={8} />
              ) : (
                <table className="w-full text-xs">
                  <thead className="bg-[var(--muted)]/60 text-[var(--muted-foreground)] border-b border-[var(--border)] sticky top-0 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-4 text-left font-medium">{t('files.name')}</th>
                      <th className="py-2 px-3 text-left font-medium">{t('files.type')}</th>
                      <th className="py-2 px-3 text-right font-medium">{t('files.size')}</th>
                      <th className="py-2 px-3 text-left font-medium hidden sm:table-cell">{t('webapps.thModified')}</th>
                      <th className="py-2 px-3 text-right font-medium">{t('files.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleFiles.map((f) => {
                      const meta = f.isDir ? null : classifyFile(f.name);
                      return (
                        <tr key={f.name} className="hover:bg-[var(--muted)]/50 transition">
                          <td className="py-1.5 px-4">
                            <button
                              className="flex items-center gap-2.5 text-left text-[var(--foreground)] hover:underline"
                              onClick={() =>
                                f.isDir ? load(join(dir, f.name)) : setActiveFile(join(dir, f.name))
                              }
                            >
                              <FileItemIcon name={f.name} isDir={f.isDir} />
                              <span className="font-mono">{f.name}</span>
                            </button>
                          </td>
                          <td className="py-1.5 px-3">
                            {f.isDir ? (
                              <span className="text-[10px] text-[var(--muted-foreground)]">{t('files.folder')}</span>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 font-mono text-[var(--muted-foreground)]">
                                {meta?.language}
                              </Badge>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-[var(--muted-foreground)] font-mono text-right">
                            {f.isDir ? '-' : fmtSize(f.size)}
                          </td>
                          <td className="py-1.5 px-3 text-[var(--muted-foreground)] font-mono hidden sm:table-cell">
                            {new Date(f.mtime).toLocaleString()}
                          </td>
                          <td className="py-1.5 px-3 text-right whitespace-nowrap">
                            {!f.isDir && (
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px] gap-1 text-sky-400 hover:text-sky-300"
                                  title={t('files.previewAndEdit')}
                                  onClick={() => setActiveFile(join(dir, f.name))}
                                >
                                  {meta?.canEdit ? <Edit2 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                  {meta?.canEdit ? t('common.edit') : t('files.preview')}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                  title={t('files.download')}
                                  onClick={() => downloadFile(server.id, join(dir, f.name))}
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && visibleFiles.length === 0 && !error && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[var(--muted-foreground)]">
                          {t('files.emptyFolder')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
