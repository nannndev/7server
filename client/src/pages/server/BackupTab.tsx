import React, { useState, useEffect, useMemo } from 'react';
import {
  Archive,
  Database,
  FolderArchive,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  Calendar,
  HardDrive,
  Clock,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Terminal,
  ShieldCheck,
  Layers,
  FileText
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { Modal } from '@/shared/ui/modal';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { useServerPage } from './context';
import {
  fetchBackups,
  runBackup,
  restoreBackup,
  deleteBackupFile,
  downloadBackupFile,
  fetchBackupProfiles,
  saveBackupProfile,
  deleteBackupProfile,
  type BackupItem,
  type BackupProfile,
  type BackupRunResult,
  type BackupRestoreResult,
  type BackupDbEngine
} from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import { useT } from '@/shared/i18n';

export default function BackupTab() {
  const t = useT();
  const { server } = useServerPage();

  const [activeSubTab, setActiveSubTab] = useState<'archives' | 'profiles'>('archives');
  const [backups, setBackups] = useState<BackupItem[] | null>(null);
  const [profiles, setProfiles] = useState<BackupProfile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [modalMode, setModalMode] = useState<'instant' | 'profile'>('instant');
  const [formType, setFormType] = useState<'database' | 'files'>('database');
  const [formEngine, setFormEngine] = useState<BackupDbEngine>('mysql');
  const [formDbName, setFormDbName] = useState('');
  const [formSourcePath, setFormSourcePath] = useState('/var/www');
  const [formProfileName, setFormProfileName] = useState('');
  const [formSchedule, setFormSchedule] = useState('0 2 * * *');
  const [formRetention, setFormRetention] = useState(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Restore Modal
  const [restoreItem, setRestoreItem] = useState<BackupItem | null>(null);
  const [restoreTargetDb, setRestoreTargetDb] = useState('');
  const [restoreTargetDir, setRestoreTargetDir] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // Result Output Modal
  const [runResult, setRunResult] = useState<{
    title: string;
    durationMs: number;
    code: number;
    stdout: string;
    stderr: string;
  } | null>(null);

  const loadData = async (force = false) => {
    setError(null);
    try {
      await Promise.all([
        swr(`backups:${server.id}`, () => fetchBackups(server.id), setBackups, setLoading, force),
        swr(`backup-profiles:${server.id}`, () => fetchBackupProfiles(server.id), setProfiles, () => {}, force)
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to load backup archives');
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id]);

  const totalBytes = useMemo(() => {
    if (!backups) return 0;
    return backups.reduce((acc, b) => acc + (b.sizeBytes || 0), 0);
  }, [backups]);

  const formatTotalSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const filteredBackups = useMemo(() => {
    if (!backups) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return backups;
    return backups.filter(
      (b) =>
        b.filename.toLowerCase().includes(q) ||
        b.filepath.toLowerCase().includes(q) ||
        (b.engine && b.engine.toLowerCase().includes(q))
    );
  }, [backups, searchQuery]);

  const handleOpenCreateModal = (mode: 'instant' | 'profile') => {
    setModalMode(mode);
    setFormType('database');
    setFormEngine('mysql');
    setFormDbName('');
    setFormSourcePath('/var/www');
    setFormProfileName(mode === 'profile' ? 'Daily Database Backup' : '');
    setFormSchedule('0 2 * * *');
    setFormRetention(7);
    setShowCreateModal(true);
  };

  const handleSaveOrRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (modalMode === 'instant') {
        const res = await runBackup(server.id, {
          type: formType,
          engine: formType === 'database' ? formEngine : undefined,
          database: formType === 'database' ? formDbName.trim() : undefined,
          sourcePath: formType === 'files' ? formSourcePath.trim() : undefined,
          retentionCount: formRetention
        });

        setShowCreateModal(false);
        if (res.success && res.item) {
          toast.success(t('backup.createSuccess', { file: res.item.filename, size: res.item.sizeFormatted }));
          loadData(true);
        } else {
          setRunResult({
            title: t('backup.outputTitle'),
            durationMs: res.durationMs,
            code: res.code,
            stdout: res.stdout,
            stderr: res.stderr
          });
        }
      } else {
        // Create scheduled profile
        await saveBackupProfile(server.id, {
          name: formProfileName.trim() || 'Custom Backup Profile',
          type: formType,
          target: formType === 'database' ? formDbName.trim() || 'all' : formSourcePath.trim(),
          engine: formType === 'database' ? formEngine : undefined,
          schedule: formSchedule.trim(),
          retentionCount: formRetention,
          destination: 'local'
        });

        setShowCreateModal(false);
        toast.success('Backup profile created successfully');
        loadData(true);
        setActiveSubTab('profiles');
      }
    } catch (err: any) {
      toast.error(err.message || 'Backup operation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerProfile = async (profile: BackupProfile) => {
    try {
      toast.info(`Executing profile: ${profile.name}…`);
      const res = await runBackup(server.id, {
        name: profile.name,
        type: profile.type,
        engine: profile.engine,
        database: profile.type === 'database' && profile.target !== 'all' ? profile.target : undefined,
        sourcePath: profile.type === 'files' ? profile.target : undefined,
        retentionCount: profile.retentionCount
      });

      if (res.success && res.item) {
        toast.success(`Backup finished for ${profile.name}!`);
        loadData(true);
      } else {
        setRunResult({
          title: t('backup.outputTitle'),
          durationMs: res.durationMs,
          code: res.code,
          stdout: res.stdout,
          stderr: res.stderr
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to execute profile');
    }
  };

  const handleDeleteProfile = async (profile: BackupProfile) => {
    const ok = await confirmModal({
      title: 'Delete Backup Profile',
      message: `Delete profile "${profile.name}"? Existing backup archives created by this profile will not be deleted.`,
      variant: 'danger',
      confirmText: 'Delete Profile'
    });
    if (!ok) return;

    try {
      await deleteBackupProfile(server.id, profile.id);
      toast.success('Profile deleted');
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete profile');
    }
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreItem) return;

    setIsRestoring(true);
    try {
      const res = await restoreBackup(server.id, {
        filepath: restoreItem.filepath,
        type: restoreItem.type as 'database' | 'files', // Restore button only exists for these two
        targetDatabase: restoreTargetDb.trim() || undefined,
        targetDir: restoreTargetDir.trim() || undefined
      });

      setRestoreItem(null);
      if (res.success) {
        toast.success(t('backup.restoreSuccess', { ms: res.durationMs }));
      } else {
        setRunResult({
          title: 'Restore Output Log',
          durationMs: res.durationMs,
          code: res.code,
          stdout: res.stdout,
          stderr: res.stderr
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore backup');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteFile = async (item: BackupItem) => {
    const ok = await confirmModal({
      title: t('backup.delete'),
      message: t('backup.confirmDelete', { file: item.filename }),
      variant: 'danger',
      confirmText: t('backup.delete')
    });
    if (!ok) return;

    try {
      await deleteBackupFile(server.id, item.filepath);
      toast.success(t('backup.deleteSuccess'));
      loadData(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete backup file');
    }
  };

  const getEngineBadge = (item: BackupItem) => {
    if (item.type === 'files') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
          <FolderArchive className="w-3 h-3" />
          Tar Archive
        </span>
      );
    }

    const eng = item.engine || 'mysql';
    const colorMap: Record<string, string> = {
      mysql: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      postgres: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      mongodb: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      redis: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      sqlite: 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    };

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border font-semibold ${
          colorMap[eng] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
        }`}
      >
        <Database className="w-3 h-3" />
        {eng.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Archive className="w-5 h-5 text-emerald-400" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('backup.title')}</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('backup.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono mr-2">
              <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {t('backup.totalBackups', {
                  count: backups?.length || 0,
                  size: formatTotalSize(totalBytes)
                })}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={loading}
              className="gap-1.5 h-8 text-xs font-medium"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenCreateModal('profile')}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>{t('backup.newProfile')}</span>
            </Button>

            <Button
              size="sm"
              onClick={() => handleOpenCreateModal('instant')}
              className="gap-1.5 h-8 text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('backup.backupNow')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => loadData(true)} className="h-6 text-[10px]">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Sub-tab Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2">
        <button
          onClick={() => setActiveSubTab('archives')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeSubTab === 'archives'
              ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold border border-[var(--primary)]/20'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          <span>{t('backup.tabArchives', { count: backups?.length || 0 })}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('profiles')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
            activeSubTab === 'profiles'
              ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-semibold border border-[var(--primary)]/20'
              : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{t('backup.tabProfiles', { count: profiles?.length || 0 })}</span>
        </button>
      </div>

      {/* Archives View */}
      {activeSubTab === 'archives' && (
        <div className="space-y-4">
          {/* Search bar */}
          {backups && backups.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  type="text"
                  placeholder={t('backup.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-[var(--card)]"
                />
              </div>
            </div>
          )}

          {!backups && !error ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : backups && filteredBackups.length === 0 ? (
            <Card className="p-12 text-center space-y-3">
              <Archive className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
              <p className="text-xs text-[var(--muted-foreground)]">{t('backup.emptyArchives')}</p>
              <Button size="sm" onClick={() => handleOpenCreateModal('instant')} className="text-xs gap-1.5 font-semibold">
                <Plus className="w-3.5 h-3.5" />
                <span>{t('backup.backupNow')}</span>
              </Button>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {filteredBackups.map((item) => (
                <Card
                  key={item.id}
                  className="p-4 bg-[var(--card)] border-[var(--border)] hover:border-[var(--muted-foreground)]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getEngineBadge(item)}

                      <span className="font-mono text-xs font-semibold text-[var(--foreground)] truncate">
                        {item.filename}
                      </span>

                      {item.source && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border bg-zinc-900 text-zinc-400 border-zinc-800">
                          {item.source}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] font-mono">
                      <span className="truncate max-w-md" title={item.filepath}>
                        {item.filepath}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1 shrink-0">
                        <Calendar className="w-3 h-3 opacity-60" />
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)]">
                      {item.sizeFormatted}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadBackupFile(server.id, item.filepath, item.filename)}
                      className="h-8 text-xs gap-1.5"
                      title={t('backup.download')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{t('backup.download')}</span>
                    </Button>

                    {/* the server can only restore database and file archives */}
                    {(item.type === 'database' || item.type === 'files') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRestoreItem(item);
                        setRestoreTargetDb('');
                        setRestoreTargetDir('');
                      }}
                      className="h-8 text-xs gap-1.5 text-amber-400 hover:text-amber-300 border-amber-500/20 hover:bg-amber-500/10"
                      title={t('backup.restore')}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t('backup.restore')}</span>
                    </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteFile(item)}
                      className="h-8 w-8 text-[var(--muted-foreground)] hover:text-red-400"
                      title={t('backup.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profiles View */}
      {activeSubTab === 'profiles' && (
        <div className="space-y-4">
          {!profiles && !error ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : profiles && profiles.length === 0 ? (
            <Card className="p-12 text-center space-y-3">
              <Clock className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
              <p className="text-xs text-[var(--muted-foreground)]">{t('backup.emptyProfiles')}</p>
              <Button size="sm" onClick={() => handleOpenCreateModal('profile')} className="text-xs gap-1.5 font-semibold">
                <Plus className="w-3.5 h-3.5" />
                <span>{t('backup.newProfile')}</span>
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles?.map((p) => (
                <Card
                  key={p.id}
                  className="p-5 space-y-3.5 bg-[var(--card)] border-[var(--border)] shadow-sm flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {p.type === 'database' ? (
                          <Database className="w-4 h-4 text-sky-400" />
                        ) : (
                          <FolderArchive className="w-4 h-4 text-[var(--foreground)]" />
                        )}
                        <h4 className="text-sm font-semibold text-[var(--foreground)] truncate">{p.name}</h4>
                      </div>

                      <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
                        Keep {p.retentionCount}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-xs font-mono text-[var(--muted-foreground)] bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                      <div>
                        <span className="text-zinc-500">Target:</span> {p.target}
                      </div>
                      <div>
                        <span className="text-zinc-500">Cron:</span> {p.schedule}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                    <div className="text-[11px] text-[var(--muted-foreground)] font-mono flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Active Profile
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTriggerProfile(p)}
                        className="h-7 text-xs gap-1 text-[var(--primary)]"
                        title="Run Now"
                      >
                        <Play className="w-3 h-3 text-emerald-400" />
                        <span>Run Now</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteProfile(p)}
                        className="h-7 w-7 text-[var(--muted-foreground)] hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / New Profile Modal */}
      {showCreateModal && (
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} className="max-w-lg">
          <Card className="w-full p-5 space-y-4 bg-[var(--card)] border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Archive className="w-4 h-4 text-[var(--primary)]" />
                {modalMode === 'instant' ? t('backup.modalTitleCreate') : t('backup.newProfile')}
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOrRun} className="space-y-4">
              {modalMode === 'profile' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t('backup.labelProfileName')}
                  </label>
                  <Input
                    type="text"
                    value={formProfileName}
                    onChange={(e) => setFormProfileName(e.target.value)}
                    placeholder="e.g. Daily Production Database"
                    className="text-xs"
                    required
                  />
                </div>
              )}

              {/* Target Type Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  {t('backup.labelType')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormType('database')}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition ${
                      formType === 'database'
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] font-semibold'
                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Database className="w-4 h-4 text-sky-400" />
                    <span>{t('backup.typeDatabase')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormType('files')}
                    className={`p-2.5 rounded-xl border text-xs font-medium flex items-center gap-2 transition ${
                      formType === 'files'
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] font-semibold'
                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    <FolderArchive className="w-4 h-4 text-[var(--foreground)]" />
                    <span>{t('backup.typeFiles')}</span>
                  </button>
                </div>
              </div>

              {/* If Database Type */}
              {formType === 'database' ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--foreground)]">
                      {t('backup.labelDbEngine')}
                    </label>
                    <select
                      value={formEngine}
                      onChange={(e) => setFormEngine(e.target.value as BackupDbEngine)}
                      className="w-full h-8 px-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none"
                    >
                      <option value="mysql">MySQL / MariaDB</option>
                      <option value="postgres">PostgreSQL</option>
                      <option value="mongodb">MongoDB</option>
                      <option value="redis">Redis (RDB)</option>
                      <option value="sqlite">SQLite</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--foreground)]">
                      {t('backup.labelDbName')}
                    </label>
                    <Input
                      type="text"
                      value={formDbName}
                      onChange={(e) => setFormDbName(e.target.value)}
                      placeholder="e.g. app_production (blank for all)"
                      className="font-mono text-xs"
                    />
                  </div>
                </>
              ) : (
                /* If Files Type */
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t('backup.labelSourcePath')}
                  </label>
                  <Input
                    type="text"
                    value={formSourcePath}
                    onChange={(e) => setFormSourcePath(e.target.value)}
                    placeholder="/var/www/my-app"
                    className="font-mono text-xs"
                    required
                  />
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    Automatically excludes node_modules, .git, and cache files.
                  </span>
                </div>
              )}

              {/* Retention Policy */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  {t('backup.labelRetention')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={formRetention}
                  onChange={(e) => setFormRetention(parseInt(e.target.value, 10) || 7)}
                  className="font-mono text-xs"
                />
              </div>

              {/* If Profile Mode: Schedule */}
              {modalMode === 'profile' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t('backup.labelSchedule')}
                  </label>
                  <select
                    value={formSchedule}
                    onChange={(e) => setFormSchedule(e.target.value)}
                    className="w-full h-8 px-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-xs text-[var(--foreground)] outline-none"
                  >
                    <option value="0 2 * * *">{t('backup.schedDaily')}</option>
                    <option value="0 3 * * 0">{t('backup.schedWeekly')}</option>
                  </select>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSubmitting}
                  className="text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  {isSubmitting
                    ? t('backup.creating')
                    : modalMode === 'instant'
                    ? t('backup.backupNow')
                    : t('common.save')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Restore Confirmation Modal */}
      {restoreItem && (
        <Modal isOpen={!!restoreItem} onClose={() => setRestoreItem(null)} className="max-w-md">
          <Card className="w-full p-5 space-y-4 bg-[var(--card)] border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-rose-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t('backup.restoreWarningTitle')}
              </h3>
              <button
                onClick={() => setRestoreItem(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-xs text-rose-300 leading-relaxed">
              {t('backup.restoreWarningBody', { file: restoreItem.filename })}
            </div>

            <form onSubmit={handleConfirmRestore} className="space-y-3">
              <div className="space-y-1 text-xs font-mono text-[var(--muted-foreground)] bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                <div>
                  <span className="text-zinc-500">File:</span> {restoreItem.filename}
                </div>
                <div>
                  <span className="text-zinc-500">Size:</span> {restoreItem.sizeFormatted}
                </div>
              </div>

              {restoreItem.type === 'database' ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t('backup.restoreTargetDb')}
                  </label>
                  <Input
                    type="text"
                    value={restoreTargetDb}
                    onChange={(e) => setRestoreTargetDb(e.target.value)}
                    placeholder="e.g. app_production"
                    className="font-mono text-xs"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[var(--foreground)]">
                    {t('backup.restoreTargetDir')}
                  </label>
                  <Input
                    type="text"
                    value={restoreTargetDir}
                    onChange={(e) => setRestoreTargetDir(e.target.value)}
                    placeholder="/"
                    className="font-mono text-xs"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRestoreItem(null)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isRestoring}
                  className="text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  {isRestoring ? t('backup.restoring') : t('backup.restore')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Result Output Drawer / Modal */}
      {runResult && (
        <Modal isOpen={!!runResult} onClose={() => setRunResult(null)} className="max-w-2xl">
          <Card className="w-full p-5 space-y-3 bg-[var(--card)] border-[var(--border)] flex flex-col max-h-[85vh] shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{runResult.title}</h3>
                <Badge
                  variant={runResult.code === 0 ? 'success' : 'destructive'}
                  className="text-[10px] font-mono py-0 h-4"
                >
                  Exit: {runResult.code}
                </Badge>
              </div>
              <button
                onClick={() => setRunResult(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[var(--muted-foreground)] flex items-center justify-between font-mono pb-2 border-b border-[var(--border)]">
              <span>Execution Output</span>
              <span>{runResult.durationMs}ms</span>
            </div>

            <div className="flex-1 rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-200 overflow-auto whitespace-pre leading-relaxed border border-zinc-800">
              {runResult.stdout || runResult.stderr || '(No stdout/stderr produced)'}
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={() => setRunResult(null)} className="text-xs">
                {t('common.close')}
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}

