// Installed Software, Active Services & Quick 1-Click Tool Installer
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTaskManager } from '@/shared/tasks/TaskContext';
import {
  RefreshCw,
  Check,
  Minus,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  Activity,
  ArrowUpRight,
  Play,
  Square,
  RotateCw,
  Terminal,
  Plus,
  Wrench,
  X,
  Copy,
  ShieldCheck,
  Package,
  KeyRound,
  ListChecks
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import {
  fetchSoftware,
  fetchSoftwareUpgrades,
  controlSoftwareService,
  executeSoftwareScript,
  recordTemplateRun,
  updateServer,
  type SoftwareItem,
  type SoftwareUpgradeItem
} from '../api';
import {
  MARKETPLACE_CATALOG,
  generateSingleToolScript,
  generateBatchToolsScript,
  formatTerminalCommand,
  type MarketplaceTool
} from '../lib/templates';
import { swr } from '@/shared/lib/cache';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { useT, type MessageKey } from '@/shared/i18n';
import { SudoPasswordModal } from './SudoPasswordModal';

const CATEGORIES: { id: SoftwareItem['category']; label: MessageKey }[] = [
  { id: 'runtime', label: 'software.cat.runtime' },
  { id: 'web', label: 'software.cat.web' },
  { id: 'database', label: 'software.cat.database' },
  { id: 'container', label: 'software.cat.container' },
  { id: 'tooling', label: 'software.cat.tooling' },
  { id: 'security', label: 'software.cat.security' }
];

type StatusFilter = 'installed' | 'services' | 'missing' | 'all';

interface SoftwareCardProps {
  serverId: string;
  serverName?: string;
  serverUsername?: string;
  onOpenTemplates?: () => void;
  onOpenTerminal?: (cmd: string) => void;
}

export default function SoftwareCard({
  serverId,
  serverName,
  serverUsername,
  onOpenTemplates,
  onOpenTerminal
}: SoftwareCardProps) {
  const t = useT();
  const [items, setItems] = useState<SoftwareItem[] | null>(null);
  const [upgrades, setUpgrades] = useState<Record<string, SoftwareUpgradeItem> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | SoftwareItem['category']>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('installed');

  // Service control busy state: `${toolId}:${action}`
  const [serviceBusy, setServiceBusy] = useState<string | null>(null);

  // Quick Tool Installer / Inspector Modal State
  const [activeToolModal, setActiveToolModal] = useState<{
    tool: MarketplaceTool;
    installedInfo?: SoftwareItem;
  } | null>(null);
  const [modalVersion, setModalVersion] = useState<string>('');
  const [modalCustomScript, setModalCustomScript] = useState<string | null>(null);
  const [modalRunning, setModalRunning] = useState(false);
  const [modalResult, setModalResult] = useState<{
    ok: boolean;
    exitCode: number;
    output: string;
    durationMs: number;
    sudoRequired?: boolean;
  } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [sudoModalOpen, setSudoModalOpen] = useState(false);
  const [pendingSudoAction, setPendingSudoAction] = useState<((password: string) => Promise<void>) | null>(null);
  const [promptSudo, setPromptSudo] = useState(false);
  const [sudoPasswordInput, setSudoPasswordInput] = useState('');
  const [rememberSudo, setRememberSudo] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Multi-Task / Batch Install State
  const [batchMode, setBatchMode] = useState(false);
  const [selectedBatchToolIds, setSelectedBatchToolIds] = useState<string[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const { runStreamTask, tasks } = useTaskManager();
  const lastCompletedRef = useRef<number>(Date.now());
  const logPreRef = useRef<HTMLPreElement>(null);

  // Auto-reload software items when any background software task finishes successfully
  useEffect(() => {
    const finishedTask = tasks.find(
      (t) =>
        t.serverId === serverId &&
        t.category === 'software' &&
        t.status === 'success' &&
        t.finishedAt &&
        t.finishedAt > lastCompletedRef.current
    );
    if (finishedTask && finishedTask.finishedAt) {
      lastCompletedRef.current = finishedTask.finishedAt;
      load(true);
    }
  }, [tasks, serverId]);

  // Current active task for open modal (strictly scoped to currently inspected tool)
  const currentModalTask = activeToolModal
    ? tasks.find(
      (t) =>
        t.serverId === serverId &&
        (t.id.includes(activeToolModal.tool.id) ||
          t.title.toLowerCase().includes(activeToolModal.tool.name.toLowerCase())) &&
        t.status === 'running'
    )
    : null;

  useEffect(() => {
    if (currentModalTask && logPreRef.current) {
      logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
    }
  }, [currentModalTask?.logs]);

  const load = async (force = false) => {
    setError(null);
    try {
      await Promise.all([
        swr(`software:${serverId}`, () => fetchSoftware(serverId), setItems, setLoading, force),
        swr(`software-upgrades:${serverId}`, () => fetchSoftwareUpgrades(serverId), setUpgrades, () => { }, force).catch(() => { })
      ]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, [serverId]);

  const getUpgrade = (toolId: string) => {
    if (!upgrades) return null;
    if (upgrades[toolId]) return upgrades[toolId];
    const aliasMap: Record<string, string[]> = {
      node: ['nodejs'],
      docker: ['docker-ce', 'docker.io'],
      compose: ['docker-compose-plugin', 'docker-compose'],
      php: ['php8.3-fpm', 'php8.2-fpm', 'php8.1-fpm', 'php-fpm'],
      nginx: ['nginx', 'nginx-core', 'nginx-full', 'nginx-light'],
      mysql: ['mysql-server', 'mysql-community-server'],
      mariadb: ['mariadb-server'],
      postgres: ['postgresql', 'postgresql-common'],
      redis: ['redis-server', 'redis'],
      fail2ban: ['fail2ban'],
      ufw: ['ufw'],
      supervisor: ['supervisor'],
      autoupdates: ['unattended-upgrades'],
      tailscale: ['tailscale'],
      cloudflared: ['cloudflared'],
      gh: ['gh']
    };
    const aliases = aliasMap[toolId] || [];
    for (const a of aliases) {
      if (upgrades[a]) return upgrades[a];
    }
    return null;
  };

  const installed = useMemo(() => items?.filter((i) => i.installed) ?? [], [items]);
  const missing = useMemo(() => items?.filter((i) => !i.installed) ?? [], [items]);
  const serviceItems = useMemo(
    () => installed.filter((i) => i.service !== undefined),
    [installed]
  );
  const runningServicesCount = useMemo(
    () => installed.filter((i) => i.service === 'active').length,
    [installed]
  );
  const upgradesCount = useMemo(
    () => installed.filter((i) => !!getUpgrade(i.id)).length,
    [installed, upgrades]
  );

  // Filtered items based on statusFilter, category, and search query
  const displayedItems = useMemo(() => {
    if (!items) return [];
    let base: SoftwareItem[] = items;
    if (statusFilter === 'installed') base = installed;
    else if (statusFilter === 'services') base = serviceItems;
    else if (statusFilter === 'missing') base = missing;

    return base.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.version && item.version.toLowerCase().includes(q)) ||
        (item.service && item.service.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [items, installed, serviceItems, missing, statusFilter, selectedCategory, searchQuery]);

  // Handle Start / Stop / Restart service directly from card
  const handleServiceAction = async (
    tool: SoftwareItem,
    action: 'start' | 'stop' | 'restart'
  ) => {
    const key = `${tool.id}:${action}`;
    setServiceBusy(key);
    try {
      const res = await controlSoftwareService(serverId, tool.id, action);
      setItems((prev) =>
        prev
          ? prev.map((it) => (it.id === tool.id ? { ...it, service: res.state } : it))
          : prev
      );
      toast.success(`${tool.name}: service ${action} (${res.state})`);
    } catch (e: any) {
      toast.error(e.message || `Failed to ${action} ${tool.name}`);
    } finally {
      setServiceBusy(null);
    }
  };

  // Open Quick Tool Setup / Reinstall Modal
  const openToolSetup = (item: SoftwareItem) => {
    const marketTool = MARKETPLACE_CATALOG.find((m) => m.id === item.id);
    if (!marketTool) {
      if (onOpenTemplates) onOpenTemplates();
      return;
    }
    const defVer = marketTool.defaultVersion || marketTool.versions?.[0]?.value || '';
    setActiveToolModal({ tool: marketTool, installedInfo: item });
    setModalVersion(defVer);
    setModalCustomScript(null);
    setModalResult(null);
    setPromptSudo(false);
    setSudoPasswordInput('');
    setModalRunning(false);
    setActiveTaskId(null);
  };

  const toggleBatchSelect = (toolId: string) => {
    setSelectedBatchToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  const handleRunBatchInstall = async (overridePassword?: string) => {
    if (selectedBatchToolIds.length === 0) return;
    const tools = MARKETPLACE_CATALOG.filter((m) => selectedBatchToolIds.includes(m.id));
    if (tools.length === 0) return;

    setBatchRunning(true);
    const pass = overridePassword !== undefined ? overridePassword : (sudoPasswordInput || undefined);
    const batchScript = generateBatchToolsScript(tools);
    const toolNames = tools.map((t) => t.name).join(', ');
    const taskId = `batch_install_${Date.now()}`;

    await recordTemplateRun(serverId, {
      templateName: `Multi-Task Batch: ${toolNames}`,
      templateId: 'batch-install',
      installed: selectedBatchToolIds.join(','),
      skipped: ''
    }).catch(() => { });

    toast.info(`Starting batch installation of ${tools.length} tools in background...`);
    setBatchMode(false);
    setSelectedBatchToolIds([]);

    await runStreamTask({
      id: taskId,
      serverId,
      serverName,
      title: `Batch Install (${tools.length} Tools): ${toolNames}`,
      category: 'software',
      url: `/api/servers/${serverId}/software/execute?stream=1`,
      body: { script: batchScript, sudoPassword: pass },
      onDone: async () => {
        if (pass && rememberSudo) {
          await updateServer(serverId, { sudoPassword: pass }).catch(() => { });
        }
        toast.success(`Batch installation of ${tools.length} tools completed successfully!`);
        setBatchRunning(false);
        load(true);
      },
      onError: async (err: any) => {
        const errMsg = `${err.message || ''}\n${err.output || ''}`;
        const isSudo =
          err.sudoRequired ||
          err.exitCode === 126 ||
          /sudo:.*(password|terminal|askpass)/i.test(errMsg) ||
          /a terminal is required/i.test(errMsg) ||
          /a password is required/i.test(errMsg);

        if (isSudo) {
          setPendingSudoAction(() => (pw: string) => handleRunBatchInstall(pw));
          setSudoModalOpen(true);
          toast.warning(`Sudo authentication required for batch installation`);
        } else {
          toast.error(`Batch installation error: ${err.message}`);
        }
        setBatchRunning(false);
      }
    });
  };

  const activeModalScript = useMemo(() => {
    if (!activeToolModal) return '';
    if (modalCustomScript !== null) return modalCustomScript;
    return generateSingleToolScript(activeToolModal.tool, modalVersion || undefined);
  }, [activeToolModal, modalVersion, modalCustomScript]);

  // Execute live installation directly via SSH with background streaming
  const handleRunLiveInstall = async (overridePassword?: string) => {
    if (!activeToolModal) return;
    setModalRunning(true);
    setModalResult(null);

    const toolName = activeToolModal.tool.name;
    const toolId = activeToolModal.tool.id;
    const taskId = `install_${toolId}_${Date.now()}`;
    setActiveTaskId(taskId);

    await recordTemplateRun(serverId, {
      templateName: toolName,
      templateId: toolId,
      installed: toolId,
      skipped: ''
    }).catch(() => { });

    const pass = overridePassword !== undefined ? overridePassword : (sudoPasswordInput || undefined);

    await runStreamTask({
      id: taskId,
      serverId,
      serverName,
      title: `Install ${toolName}`,
      category: 'software',
      url: `/api/servers/${serverId}/software/execute?stream=1`,
      body: { script: activeModalScript, sudoPassword: pass },
      onDone: async (res) => {
        if (pass && rememberSudo) {
          await updateServer(serverId, { sudoPassword: pass }).catch(() => { });
        }
        setModalResult({
          ok: true,
          exitCode: 0,
          output: res.output || 'Installation succeeded',
          durationMs: 0
        });
        setModalRunning(false);
        setPromptSudo(false);
        setSudoModalOpen(false);
        load(true);
      },
      onError: async (err: any) => {
        const errMsg = `${err.message || ''}\n${err.output || ''}`;
        const isSudo =
          err.sudoRequired ||
          err.exitCode === 126 ||
          /sudo:.*(password|terminal|askpass|incorrect)/i.test(errMsg) ||
          /a terminal is required/i.test(errMsg) ||
          /a password is required/i.test(errMsg) ||
          /password.*required/i.test(errMsg);

        if (isSudo) {
          setPromptSudo(true);
          setPendingSudoAction(() => (pw: string) => handleRunLiveInstall(pw));
          setSudoModalOpen(true);
          toast.warning(`Sudo authentication required to install ${toolName}`);
        } else {
          setModalResult({
            ok: false,
            exitCode: err.exitCode || 1,
            output: err.output || errMsg || 'Installation failed',
            durationMs: 0
          });
        }
        setModalRunning(false);
      }
    });
  };

  const handleSudoConfirm = async (password: string, remember: boolean) => {
    if (remember) {
      await updateServer(serverId, { sudoPassword: password }).catch(() => { });
    }
    setSudoPasswordInput(password);
    setSudoModalOpen(false);
    if (pendingSudoAction) {
      const act = pendingSudoAction;
      setPendingSudoAction(null);
      await act(password);
    } else {
      await handleRunLiveInstall(password);
    }
  };

  const handleOpenInTerminal = () => {
    if (!activeToolModal || !onOpenTerminal) return;
    const cmd = formatTerminalCommand(
      activeModalScript,
      `/tmp/7server-install-${activeToolModal.tool.id}.sh`
    );
    setActiveToolModal(null);
    onOpenTerminal(cmd);
  };

  return (
    <Card className="p-5 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[var(--primary)]" />
              {t('software.title')}
            </h3>
            {items && (
              <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 h-4">
                {installed.length} / {items.length} Installed
              </Badge>
            )}
            {runningServicesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {runningServicesCount} {t('software.serviceRunning').toLowerCase()}
              </span>
            )}
            {upgradesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3" />
                {upgradesCount} update{upgradesCount > 1 ? 's' : ''} available
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t('software.summary', { installed: installed.length, total: items?.length ?? 0 })} · Control systemd daemons in real-time or install new packages with 1-click.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenTemplates && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTemplates}
              className="h-8 text-xs gap-1.5 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 font-semibold shadow-sm"
              title={t('templates.btnSetup')}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('templates.btnSetup')}</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => load(true)}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
            title={t('software.rescan')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t('software.rescan')}</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{t('software.failed', { error })}</span>
          <Button variant="ghost" size="sm" onClick={() => load(true)} className="h-6 text-[10px]">
            {t('software.rescan')}
          </Button>
        </div>
      )}

      {/* Mode Switcher + Category Filter + Search */}
      {items && (
        <div className="space-y-3 pt-2 border-t border-[var(--border)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Status View Tabs */}
            <div className="inline-flex items-center p-1 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] w-fit flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter('installed')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${statusFilter === 'installed'
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>Installed ({installed.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('services')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${statusFilter === 'services'
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
              >
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Daemons & Services ({serviceItems.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('missing')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${statusFilter === 'missing'
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
              >
                <Plus className="w-3.5 h-3.5 text-amber-500" />
                <span>Available to Install ({missing.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${statusFilter === 'all'
                    ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm border border-[var(--border)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
              >
                <span>All ({items.length})</span>
              </button>

              <div className="w-px h-4 bg-[var(--border)] mx-0.5 hidden sm:block" />

              <button
                type="button"
                onClick={() => {
                  setBatchMode((v) => {
                    const next = !v;
                    if (next) setStatusFilter('missing');
                    else setSelectedBatchToolIds([]);
                    return next;
                  });
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${batchMode
                    ? 'bg-sky-500 text-white shadow-md ring-1 ring-sky-400 font-bold'
                    : 'text-sky-400 hover:text-sky-300 border border-dashed border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/10'
                  }`}
                title="Select multiple tools to install together in a single pipeline background task"
              >
                <ListChecks className="w-3.5 h-3.5" />
                <span>{batchMode ? `Exit Multi-Task (${selectedBatchToolIds.length})` : 'Multi-Task Install'}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                type="text"
                placeholder={t('software.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs w-full bg-[var(--background)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${selectedCategory === 'all'
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-sm'
                  : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                }`}
            >
              All Categories
            </button>
            {CATEGORIES.map((c) => {
              const sourceList =
                statusFilter === 'installed'
                  ? installed
                  : statusFilter === 'services'
                    ? serviceItems
                    : statusFilter === 'missing'
                      ? missing
                      : items;
              const count = sourceList.filter((i) => i.category === c.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${selectedCategory === c.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-sm'
                      : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                    }`}
                >
                  {t(c.label)} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {!items && !error ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : items && (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Empty / Fresh Server Callout */}
          {installed.length === 0 && statusFilter === 'installed' && (
            <div className="p-6 rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 text-center space-y-3">
              <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center mx-auto">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-[var(--foreground)]">
                  {t('templates.quickCtaTitle')}
                </h4>
                <p className="text-xs text-[var(--muted-foreground)] max-w-md mx-auto leading-relaxed">
                  {t('software.none')} {t('templates.quickCtaDesc')}
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatusFilter('missing')}
                  className="h-8 text-xs gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>View Tool Catalog ({missing.length})</span>
                </Button>
                {onOpenTemplates && (
                  <Button
                    size="sm"
                    onClick={onOpenTemplates}
                    className="h-8 text-xs gap-1.5 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t('templates.openSetup')}</span>
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* No search matches */}
          {displayedItems.length === 0 && !(installed.length === 0 && statusFilter === 'installed') && (
            <div className="py-12 text-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl">
              {t('software.noFilterMatch')}
            </div>
          )}

          {/* Tools Grid Grouped by Category */}
          {displayedItems.length > 0 && (
            <div className="space-y-5">
              {CATEGORIES.map((c) => {
                const list = displayedItems.filter((i) => i.category === c.id);
                if (!list.length) return null;

                return (
                  <section key={c.id} className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                        {t(c.label)}
                        <span className="text-[10px] font-mono text-[var(--muted-foreground)]/70">
                          ({list.length})
                        </span>
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {list.map((tool) => {
                        const isServiceActive = tool.service === 'active';
                        const isServiceFailed = tool.service === 'failed';
                        const hasService = tool.service !== undefined;
                        const up = tool.installed ? getUpgrade(tool.id) : null;
                        const marketMeta = MARKETPLACE_CATALOG.find((m) => m.id === tool.id);
                        const isSelectedForBatch = batchMode && !tool.installed && selectedBatchToolIds.includes(tool.id);

                        return (
                          <div
                            key={tool.id}
                            onClick={() => {
                              if (batchMode && !tool.installed) {
                                toggleBatchSelect(tool.id);
                              }
                            }}
                            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 shadow-sm ${isSelectedForBatch
                                ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/30 cursor-pointer shadow-md'
                                : tool.installed
                                  ? 'border-[var(--border)] bg-[var(--background)] hover:border-[var(--muted-foreground)]/40'
                                  : batchMode
                                    ? 'border-dashed border-sky-500/40 bg-[var(--muted)]/15 hover:border-sky-500 hover:bg-sky-500/5 cursor-pointer'
                                    : 'border-dashed border-[var(--border)] bg-[var(--muted)]/10 hover:bg-[var(--muted)]/25 hover:border-[var(--primary)]/40'
                              }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={`p-1.5 rounded-lg border shrink-0 ${tool.installed
                                        ? 'bg-[var(--muted)]/40 border-[var(--border)]'
                                        : 'bg-[var(--muted)]/20 border-transparent opacity-60'
                                      }`}
                                  >
                                    <BrandIcon
                                      name={tool.id}
                                      mono={!tool.installed}
                                      className="w-4 h-4 shrink-0"
                                      fallback={
                                        tool.installed ? (
                                          <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                        ) : (
                                          <Package className="w-4 h-4 text-zinc-500 shrink-0" />
                                        )
                                      }
                                    />
                                  </span>
                                  <div className="min-w-0">
                                    <span className="text-xs font-semibold text-[var(--foreground)] block truncate">
                                      {tool.name}
                                    </span>
                                    <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                                      {tool.id}
                                      {marketMeta?.defaultPort ? ` · :${marketMeta.defaultPort}` : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {tool.installed ? (
                                    tool.version ? (
                                      <span
                                        className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium truncate max-w-[95px]"
                                        title={tool.version}
                                      >
                                        {tool.id === 'swap' ? `${Math.round(parseFloat(tool.version))}MB` : `v${tool.version}`}
                                      </span>
                                    ) : (
                                      <Badge variant="success" className="text-[10px] py-0 px-1.5">
                                        Active
                                      </Badge>
                                    )
                                  ) : batchMode ? (
                                    <div
                                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelectedForBatch
                                          ? 'bg-sky-500 border-sky-400 text-white shadow-sm'
                                          : 'border-[var(--border)] bg-[var(--background)]/60 text-transparent hover:border-sky-400'
                                        }`}
                                    >
                                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                                    </div>
                                  ) : (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                                      Not installed
                                    </span>
                                  )}

                                  {up && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (onOpenTerminal) {
                                          onOpenTerminal(
                                            formatTerminalCommand(
                                              `apt-get update && apt-get --only-upgrade install -y ${up.package}`,
                                              `/tmp/vpshub-upgrade-${up.package}.sh`
                                            )
                                          );
                                        }
                                      }}
                                      className="inline-flex items-center gap-0.5 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 transition cursor-pointer"
                                      title={`Update available: v${up.newVersion}. Click to upgrade.`}
                                    >
                                      <ArrowUpRight className="w-2.5 h-2.5 text-amber-500" />
                                      <span>Update</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {marketMeta?.description && (
                                <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-relaxed">
                                  {marketMeta.description}
                                </p>
                              )}
                            </div>

                            {/* Bottom Action & Service Control Row */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border)]/60">
                              {(() => {
                                const runningTask = tasks.find(
                                  (t) =>
                                    t.serverId === serverId &&
                                    t.status === 'running' &&
                                    (t.id.includes(tool.id) || t.title.toLowerCase().includes(tool.name.toLowerCase()))
                                );

                                if (runningTask) {
                                  return (
                                    <div className="w-full flex items-center justify-between">
                                      <span className="text-[10px] text-sky-400 flex items-center gap-1.5 font-mono">
                                        <RotateCw className="w-3 h-3 animate-spin text-sky-400" />
                                        <span>Running in background...</span>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const marketTool = MARKETPLACE_CATALOG.find((m) => m.id === tool.id);
                                          if (marketTool) {
                                            setActiveToolModal({ tool: marketTool, installedInfo: tool.installed ? tool : undefined });
                                          }
                                        }}
                                        className="h-6 px-2.5 text-[10px] gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 text-sky-400 font-semibold inline-flex items-center hover:bg-sky-500/20 transition cursor-pointer"
                                        title="Click to view live logs"
                                      >
                                        <span>Inspect ({runningTask.durationSec || 0}s)</span>
                                      </button>
                                    </div>
                                  );
                                }

                                if (tool.installed) {
                                  return (
                                    <>
                                      {hasService ? (
                                        <span
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${isServiceActive
                                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                              : isServiceFailed
                                                ? 'bg-red-500/10 text-red-500 border-red-500/30'
                                                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                                            }`}
                                        >
                                          <span
                                            className={`w-1.5 h-1.5 rounded-full ${isServiceActive
                                                ? 'bg-emerald-500 animate-pulse'
                                                : isServiceFailed
                                                  ? 'bg-red-500'
                                                  : 'bg-zinc-400'
                                              }`}
                                          />
                                          {isServiceActive
                                            ? t('software.serviceRunning')
                                            : isServiceFailed
                                              ? t('software.serviceFailed')
                                              : t('software.serviceStopped')}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-emerald-500/80 font-mono flex items-center gap-1">
                                          <Check className="w-3 h-3 text-emerald-500" /> CLI Ready
                                        </span>
                                      )}

                                      {/* Quick Action Buttons for Installed Tool */}
                                      <div className="flex items-center gap-1">
                                        {hasService && (
                                          <>
                                            {isServiceActive ? (
                                              <>
                                                <button
                                                  type="button"
                                                  disabled={!!serviceBusy}
                                                  onClick={() => handleServiceAction(tool, 'restart')}
                                                  title={`Restart ${tool.name}`}
                                                  className="p-1 rounded-md border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition disabled:opacity-50"
                                                >
                                                  <RotateCw
                                                    className={`w-3 h-3 ${serviceBusy === `${tool.id}:restart` ? 'animate-spin text-[var(--primary)]' : ''
                                                      }`}
                                                  />
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={!!serviceBusy}
                                                  onClick={() => handleServiceAction(tool, 'stop')}
                                                  title={`Stop ${tool.name}`}
                                                  className="p-1 rounded-md border border-[var(--border)] hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 transition disabled:opacity-50"
                                                >
                                                  <Square className="w-3 h-3" />
                                                </button>
                                              </>
                                            ) : (
                                              <button
                                                type="button"
                                                disabled={!!serviceBusy}
                                                onClick={() => handleServiceAction(tool, 'start')}
                                                title={`Start ${tool.name}`}
                                                className="px-2 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-medium inline-flex items-center gap-1 transition disabled:opacity-50"
                                              >
                                                <Play className="w-2.5 h-2.5" />
                                                <span>Start</span>
                                              </button>
                                            )}
                                          </>
                                        )}

                                        {marketMeta && (
                                          <button
                                            type="button"
                                            onClick={() => openToolSetup(tool)}
                                            title={`Configure / Reinstall ${tool.name}`}
                                            className="p-1 rounded-md border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition"
                                          >
                                            <Wrench className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  );
                                }

                                if (batchMode && !tool.installed) {
                                  return (
                                    <div className="w-full flex items-center justify-between">
                                      <span
                                        className={`text-[10px] font-mono ${isSelectedForBatch
                                            ? 'text-sky-400 font-semibold'
                                            : 'text-[var(--muted-foreground)]'
                                          }`}
                                      >
                                        {isSelectedForBatch ? 'Selected for batch' : 'Click to select'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleBatchSelect(tool.id);
                                        }}
                                        className={`h-6 px-2.5 text-[10px] gap-1 rounded-md font-semibold inline-flex items-center transition cursor-pointer border ${isSelectedForBatch
                                            ? 'bg-sky-500 border-sky-400 text-white shadow-sm'
                                            : 'border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20'
                                          }`}
                                      >
                                        {isSelectedForBatch ? (
                                          <Check className="w-3 h-3 stroke-[2.5]" />
                                        ) : (
                                          <Plus className="w-3 h-3" />
                                        )}
                                        <span>{isSelectedForBatch ? 'Selected' : 'Select'}</span>
                                      </button>
                                    </div>
                                  );
                                }

                                return (
                                  <>
                                    <span className="text-[10px] text-[var(--muted-foreground)]">
                                      Ready to install
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => openToolSetup(tool)}
                                      className="h-6 px-2.5 text-[10px] gap-1 border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 font-semibold"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Install</span>
                                    </Button>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {/* Quick CTA to Setup Templates */}
          {onOpenTemplates && (
            <div className="p-4 rounded-xl border border-[var(--primary)]/20 bg-gradient-to-r from-[var(--primary)]/5 via-transparent to-[var(--primary)]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[var(--primary)]" />
                  {t('templates.quickCtaTitle')}
                </span>
                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  {t('templates.quickCtaDesc')}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={onOpenTemplates}
                className="h-8 text-xs gap-1.5 font-semibold border-[var(--primary)]/40 text-[var(--primary)] hover:bg-[var(--primary)]/10 shrink-0"
              >
                <span>{t('templates.openSetup')}</span>
                <ExternalLink className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Floating Batch Action Bar */}
      {batchMode && selectedBatchToolIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl bg-zinc-950/95 border border-sky-500/50 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-zinc-800">
            <span className="w-6 h-6 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
              {selectedBatchToolIds.length}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-100">
                {selectedBatchToolIds.length} {selectedBatchToolIds.length === 1 ? 'Tool' : 'Tools'} Selected
              </span>
              <span className="text-[10px] text-zinc-400">Sequential background pipeline</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedBatchToolIds([])}
              className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              Clear
            </button>
            <Button
              size="sm"
              disabled={batchRunning}
              onClick={() => handleRunBatchInstall()}
              className="h-8 px-4 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-white shadow-lg flex items-center gap-1.5 cursor-pointer"
            >
              {batchRunning ? (
                <RotateCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Install {selectedBatchToolIds.length} Tools in Background</span>
            </Button>
          </div>
        </div>
      )}

      {/* Quick 1-Click Tool Setup & Live Runner Modal */}
      {activeToolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--muted)]/20">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                  <BrandIcon
                    name={activeToolModal.tool.id}
                    className="w-6 h-6"
                    fallback={<Package className="w-6 h-6 text-[var(--primary)]" />}
                  />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[var(--foreground)]">
                      {activeToolModal.installedInfo?.installed ? 'Manage / Reinstall' : 'Install'}{' '}
                      {activeToolModal.tool.name}
                    </h3>
                    <Badge
                      variant={activeToolModal.installedInfo?.installed ? 'success' : 'secondary'}
                      className="text-[10px] font-mono"
                    >
                      {activeToolModal.installedInfo?.installed
                        ? `Installed ${activeToolModal.installedInfo.version ? `(v${activeToolModal.installedInfo.version})` : ''}`
                        : 'Not Installed'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {activeToolModal.tool.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveToolModal(null)}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* Version Picker if available */}
              {activeToolModal.tool.versions && activeToolModal.tool.versions.length > 0 && (
                <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-[var(--foreground)] block">
                      Select Package Version / Variant
                    </span>
                    <span className="text-[11px] text-[var(--muted-foreground)]">
                      Installation script adapts repositories and sources automatically
                    </span>
                  </div>
                  <select
                    value={modalVersion}
                    onChange={(e) => {
                      setModalVersion(e.target.value);
                      setModalCustomScript(null);
                    }}
                    disabled={modalRunning}
                    className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs font-mono text-[var(--foreground)]"
                  >
                    {activeToolModal.tool.versions.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Step Breakdown */}
              {activeToolModal.tool.steps && activeToolModal.tool.steps.length > 0 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] block">
                    Automated Pipeline Steps
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {activeToolModal.tool.steps.map((st, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] flex items-start gap-2 text-xs"
                      >
                        <span className="w-5 h-5 rounded-full bg-[var(--primary)]/15 text-[var(--primary)] font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-[11px] text-[var(--foreground)] leading-snug">{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable Script Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Bash Setup Script (Editable)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeModalScript);
                      setCopiedScript(true);
                      setTimeout(() => setCopiedScript(false), 2000);
                    }}
                    className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1"
                  >
                    {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedScript ? 'Copied' : 'Copy Script'}</span>
                  </button>
                </div>
                <textarea
                  value={activeModalScript}
                  onChange={(e) => setModalCustomScript(e.target.value)}
                  disabled={modalRunning}
                  spellCheck={false}
                  rows={8}
                  className="w-full p-3 rounded-xl border border-zinc-800 bg-[#09090b] text-zinc-200 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-[var(--primary)] resize-y"
                />
              </div>

              {/* Sudo Password Required Prompt */}
              {promptSudo && (
                <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-amber-300">
                        Sudo Password Required
                      </h4>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        The remote user requires root/sudo privileges to install packages on this server.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="password"
                      placeholder="Enter sudo password..."
                      value={sudoPasswordInput}
                      onChange={(e) => setSudoPasswordInput(e.target.value)}
                      className="h-8 text-xs bg-black/50 border-amber-500/40 text-zinc-100 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sudoPasswordInput.trim()) {
                          handleRunLiveInstall(sudoPasswordInput);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!sudoPasswordInput.trim() || modalRunning}
                      onClick={() => handleRunLiveInstall(sudoPasswordInput)}
                      className="h-8 text-xs gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950 shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      <span>Authenticate & Install</span>
                    </Button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
                    <input
                      type="checkbox"
                      checked={rememberSudo}
                      onChange={(e) => setRememberSudo(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0"
                    />
                    <span>Remember sudo password for this server (encrypted with AES-256-GCM)</span>
                  </label>
                </div>
              )}

              {/* Live Execution Output */}
              {(modalRunning || currentModalTask || modalResult) && (
                <div className="rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs font-mono">
                    <span className="text-[11px] text-zinc-300 flex items-center gap-2">
                      {modalRunning || currentModalTask?.status === 'running' ? (
                        <>
                          <RotateCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                          <span>Installing on server via SSH ({currentModalTask?.durationSec || 0}s)...</span>
                        </>
                      ) : (currentModalTask?.status === 'success' || modalResult?.ok) ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">
                            Installation Complete
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-red-400 font-semibold">
                            Failed {modalResult?.exitCode ? `(Exit Code: ${modalResult.exitCode})` : ''}
                          </span>
                        </>
                      )}
                    </span>
                    {(modalRunning || currentModalTask?.status === 'running') && (
                      <span className="text-[10px] text-zinc-400 font-sans">
                        Runs in background · Safe to close
                      </span>
                    )}
                  </div>
                  <pre
                    ref={logPreRef}
                    className="p-3.5 text-[11px] font-mono text-zinc-300 max-h-52 overflow-auto whitespace-pre-wrap leading-relaxed select-text"
                  >
                    {currentModalTask && currentModalTask.logs.length > 0
                      ? currentModalTask.logs.join('\n')
                      : modalResult?.output || '(Executing setup script on remote server...)'}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--muted)]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Executed non-interactively with APT lock protection</span>
              </div>

              <div className="flex items-center gap-2 justify-end">
                {onOpenTerminal && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={modalRunning || currentModalTask?.status === 'running'}
                    onClick={handleOpenInTerminal}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Open in Terminal</span>
                  </Button>
                )}
                {(modalRunning || currentModalTask?.status === 'running') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveToolModal(null)}
                    className="h-8 text-xs border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                  >
                    Run in Background (Close)
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={modalRunning || currentModalTask?.status === 'running'}
                  onClick={() => handleRunLiveInstall()}
                  className="h-8 text-xs gap-1.5 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] shadow-md"
                >
                  {modalRunning || currentModalTask?.status === 'running' ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {modalRunning || currentModalTask?.status === 'running'
                      ? 'Installing...'
                      : activeToolModal.installedInfo?.installed
                        ? 'Reinstall Now'
                        : 'Install Now (Live)'}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sudo Password Required Modal */}
      <SudoPasswordModal
        isOpen={sudoModalOpen}
        onClose={() => setSudoModalOpen(false)}
        onConfirm={handleSudoConfirm}
        serverName={serverName || 'Server'}
        username={serverUsername || 'user'}
        reason={
          activeToolModal
            ? `Installing ${activeToolModal.tool.name} requires root/sudo privileges on this server.`
            : 'Executing this system command requires sudo privileges.'
        }
      />
    </Card>
  );
}
