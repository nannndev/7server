import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Plus,
  Play,
  RotateCw,
  RefreshCw,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Sliders,
  Terminal,
  ChevronRight,
  ExternalLink
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
  fetchCronJobs,
  addCronJob,
  saveCronJobs,
  deleteCronJob,
  testRunCronJob,
  type CronJobItem,
  type CronRunResult
} from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import { useT } from '@/shared/i18n';

const PRESETS = [
  { label: 'cron.presetEveryMinute', value: '* * * * *' },
  { label: 'cron.presetEvery5Min', value: '*/5 * * * *' },
  { label: 'cron.presetHourly', value: '0 * * * *' },
  { label: 'cron.presetDaily', value: '0 0 * * *' },
  { label: 'cron.presetWeekly', value: '0 0 * * 0' }
];

export default function CronTab() {
  const t = useT();
  const { server } = useServerPage();

  const [jobs, setJobs] = useState<CronJobItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobItem | null>(null);

  // Form Fields
  const [formSchedule, setFormSchedule] = useState('* * * * *');
  const [formCommand, setFormCommand] = useState('');
  const [formComment, setFormComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Test Run Output Modal
  const [testResult, setTestResult] = useState<{ job: CronJobItem; result: CronRunResult } | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  const loadJobs = async (force = false) => {
    setError(null);
    try {
      await swr(`cron:${server.id}`, () => fetchCronJobs(server.id), setJobs, setLoading, force);
    } catch (err: any) {
      setError(err.message || 'Failed to load cron jobs');
    }
  };

  useEffect(() => {
    loadJobs();
  }, [server.id]);

  const handleOpenAdd = () => {
    setEditingJob(null);
    setFormSchedule('* * * * *');
    setFormCommand('');
    setFormComment('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (job: CronJobItem) => {
    setEditingJob(job);
    setFormSchedule(job.schedule);
    setFormCommand(job.command);
    setFormComment(job.comment || '');
    setShowAddModal(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSchedule.trim() || !formCommand.trim()) return;

    setSubmitting(true);
    try {
      if (editingJob) {
        // Edit existing
        const updated = (jobs || []).map((j) =>
          j.id === editingJob.id
            ? { ...j, schedule: formSchedule.trim(), command: formCommand.trim(), comment: formComment.trim() }
            : j
        );
        const res = await saveCronJobs(server.id, updated);
        setJobs(res);
      } else {
        // Add new
        const res = await addCronJob(server.id, {
          schedule: formSchedule.trim(),
          command: formCommand.trim(),
          comment: formComment.trim(),
          enabled: true
        });
        setJobs(res);
      }
      setShowAddModal(false);
      toast.success(t('cron.saveSuccess'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to save cron job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleJob = async (job: CronJobItem) => {
    const updated = (jobs || []).map((j) => (j.id === job.id ? { ...j, enabled: !j.enabled } : j));
    setJobs(updated);
    try {
      const res = await saveCronJobs(server.id, updated);
      setJobs(res);
      toast.success(job.enabled ? t('cron.toggleDisabled') : t('cron.toggleEnabled'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
      loadJobs(true);
    }
  };

  const handleDelete = async (job: CronJobItem) => {
    const ok = await confirmModal({
      title: t('cron.deleteJob'),
      message: t('cron.confirmDelete', { cmd: job.command }),
      variant: 'danger',
      confirmText: t('cron.deleteJob')
    });
    if (!ok) return;
    try {
      const res = await deleteCronJob(server.id, job.id);
      setJobs(res);
      toast.success(t('cron.deleteSuccess'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete cron job');
    }
  };

  const handleTestRun = async (job: CronJobItem) => {
    setRunningJobId(job.id);
    try {
      const result = await testRunCronJob(server.id, job.command);
      setTestResult({ job, result });
      if (result.code === 0) {
        toast.success(`Test run succeeded (Exit 0 in ${result.durationMs}ms)`);
      } else {
        toast.warning(`Test run exited with code: ${result.code}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to test run cron job');
    } finally {
      setRunningJobId(null);
    }
  };

  const filteredJobs = useMemo(() => {
    if (!jobs) return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.command.toLowerCase().includes(q) ||
        j.schedule.toLowerCase().includes(q) ||
        (j.comment && j.comment.toLowerCase().includes(q))
    );
  }, [jobs, searchQuery]);

  const activeCount = jobs?.filter((j) => j.enabled).length || 0;
  const pausedCount = jobs?.filter((j) => !j.enabled).length || 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Clock className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('cron.title')}</h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('cron.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono mr-2">
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {activeCount} {t('cron.enabled').toLowerCase()}
              </span>
              {pausedCount > 0 && (
                <span className="px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                  {pausedCount} {t('cron.disabled').toLowerCase()}
                </span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadJobs(true)}
              disabled={loading}
              className="gap-1.5 h-8 text-xs"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>

            <Button
              size="sm"
              onClick={handleOpenAdd}
              className="gap-1.5 h-8 text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('cron.addJob')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => loadJobs(true)} className="h-6 text-[10px]">
            {t('common.retry')}
          </Button>
        </div>
      )}

      {/* Search Bar */}
      {jobs && jobs.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              type="text"
              placeholder={t('cron.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-[var(--card)]"
            />
          </div>
        </div>
      )}

      {/* Cronjobs List */}
      {!jobs && !error ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : jobs && filteredJobs.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Clock className="w-8 h-8 text-[var(--muted-foreground)] mx-auto opacity-50" />
          <p className="text-xs text-[var(--muted-foreground)]">{t('cron.empty')}</p>
          <Button size="sm" onClick={handleOpenAdd} className="text-xs gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            <span>{t('cron.addJob')}</span>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const isRunning = runningJobId === job.id;

            return (
              <Card
                key={job.id}
                className={`p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  !job.enabled ? 'opacity-60 bg-[var(--card)]/60' : 'bg-[var(--card)]'
                }`}
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Schedule Badge */}
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)]">
                      {job.schedule}
                    </span>

                    {/* Status Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleJob(job)}
                      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full transition flex items-center gap-1 border ${
                        job.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${job.enabled ? 'bg-emerald-400' : 'bg-zinc-400'}`} />
                      {job.enabled ? t('cron.enabled') : t('cron.disabled')}
                    </button>

                    {/* Comment Label */}
                    {job.comment && (
                      <span className="text-xs text-[var(--foreground)] font-medium">
                        {job.comment}
                      </span>
                    )}
                  </div>

                  {/* Bash Command */}
                  <div className="p-2 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-200 border border-zinc-800/80 overflow-x-auto whitespace-pre">
                    {job.command}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestRun(job)}
                    disabled={isRunning}
                    className="h-8 text-xs gap-1.5"
                    title={t('cron.testRun')}
                  >
                    {isRunning ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-[var(--primary)]" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{isRunning ? t('cron.running') : t('cron.testRun')}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(job)}
                    className="h-8 w-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    title={t('cron.editJob')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(job)}
                    className="h-8 w-8 text-[var(--muted-foreground)] hover:text-red-400"
                    title={t('cron.deleteJob')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add / Edit Cronjob Modal */}
      {showAddModal && (
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} className="max-w-lg">
          <Card className="w-full p-5 space-y-4 bg-[var(--card)] border-[var(--border)] shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Clock className="w-4 h-4 text-[var(--primary)]" />
                {editingJob ? t('cron.editJob') : t('cron.addJob')}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              {/* Preset Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--muted-foreground)]">
                  {t('cron.presetLabel')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setFormSchedule(p.value)}
                      className={`px-2 py-1.5 rounded-lg text-left text-xs font-mono transition border ${
                        formSchedule === p.value
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                          : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <div className="font-semibold text-[11px] truncate">{t(p.label as any)}</div>
                      <div className="text-[10px] opacity-75">{p.value}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Schedule Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">
                  {t('cron.schedule')} <span className="font-mono text-zinc-500">(min hour dom month dow)</span>
                </label>
                <Input
                  type="text"
                  value={formSchedule}
                  onChange={(e) => setFormSchedule(e.target.value)}
                  placeholder="0 * * * *"
                  className="font-mono text-xs"
                  required
                />
              </div>

              {/* Command Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">{t('cron.command')}</label>
                <Input
                  type="text"
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                  placeholder="cd /var/www/my-app && php artisan schedule:run"
                  className="font-mono text-xs"
                  required
                />
              </div>

              {/* Description Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--foreground)]">{t('cron.comment')}</label>
                <Input
                  type="text"
                  value={formComment}
                  onChange={(e) => setFormComment(e.target.value)}
                  placeholder={t('cron.commentPlaceholder')}
                  className="text-xs"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  {submitting ? t('cron.saving') : t('cron.saveJob')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}

      {/* Test Run Output Drawer Modal */}
      {testResult && (
        <Modal isOpen={!!testResult} onClose={() => setTestResult(null)} className="max-w-2xl">
          <Card className="w-full p-5 space-y-3 bg-[var(--card)] border-[var(--border)] flex flex-col max-h-[85vh] shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-[var(--primary)]" />
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('cron.testOutput')}</h3>
                <Badge
                  variant={testResult.result.code === 0 ? 'success' : 'destructive'}
                  className="text-[10px] font-mono py-0 h-4"
                >
                  Exit: {testResult.result.code}
                </Badge>
              </div>
              <button
                onClick={() => setTestResult(null)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[var(--muted-foreground)] flex items-center justify-between font-mono pb-2 border-b border-[var(--border)]">
              <span className="truncate max-w-md">$ {testResult.job.command}</span>
              <span>{testResult.result.durationMs}ms</span>
            </div>

            <div className="flex-1 rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-200 overflow-auto whitespace-pre leading-relaxed border border-zinc-800">
              {testResult.result.stdout || testResult.result.stderr || t('cron.noOutput')}
            </div>

            <div className="pt-2 flex justify-end">
              <Button size="sm" onClick={() => setTestResult(null)} className="text-xs">
                {t('common.close')}
              </Button>
            </div>
          </Card>
        </Modal>
      )}
    </div>
  );
}

