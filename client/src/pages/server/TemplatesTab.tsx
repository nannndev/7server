import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Layers,
  Info,
  RefreshCw,
  RotateCw,
  Search,
  Sliders,
  Undo2,
  Store,
  Package,
  AlertCircle,
  Play,
  Square,
  Clock,
  Cpu,
  Wrench,
  Code2,
  ListChecks,
  Plus,
  X,
  FolderOpen,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { toast } from '@/shared/ui/toast';
import { useServerPage } from './context';
import {
  fetchSoftware,
  recordTemplateRun,
  executeSoftwareScript,
  controlSoftwareService,
  updateServer,
  type SoftwareItem
} from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import { useTaskManager } from '@/shared/tasks/TaskContext';
import { SudoPasswordModal } from '@/features/servers/components/SudoPasswordModal';
import {
  TEMPLATE_PRESETS,
  MARKETPLACE_CATALOG,
  analyzeTemplate,
  generateSingleToolScript,
  formatTerminalCommand,
  PREFLIGHT_HEADER,
  type TemplatePreset,
  type MarketplaceTool
} from '@/features/servers/lib/templates';
import { useT, type MessageKey } from '@/shared/i18n';

const MARKETPLACE_CATEGORIES: { id: 'all' | MarketplaceTool['category']; label: MessageKey }[] = [
  { id: 'all', label: 'templates.allCategories' },
  { id: 'runtime', label: 'software.cat.runtime' },
  { id: 'web', label: 'software.cat.web' },
  { id: 'database', label: 'software.cat.database' },
  { id: 'container', label: 'software.cat.container' },
  { id: 'tooling', label: 'software.cat.tooling' },
  { id: 'security', label: 'software.cat.security' }
];

const PRESET_CATEGORIES: { id: 'all' | TemplatePreset['category']; label: string }[] = [
  { id: 'all', label: 'All Stacks' },
  { id: 'runtime', label: 'App Runtimes' },
  { id: 'container', label: 'Container & Cloud' },
  { id: 'database', label: 'Database & Cache' },
  { id: 'web', label: 'Edge & Proxy' },
  { id: 'security', label: 'Security & Hardening' },
  { id: 'tooling', label: 'DevOps & Media' }
];

interface LiveStepRunState {
  toolId: string;
  toolName: string;
  version?: string;
  status: 'waiting' | 'running' | 'success' | 'failed';
  durationMs?: number;
  output?: string;
}

export default function TemplatesTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;

  // Top-level sub-tabs: 'presets' (10 Stacks), 'custom' (Custom Stack Builder), 'marketplace' (39 Tools Store)
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'custom' | 'marketplace'>('presets');

  // Shared Software Scan Data
  const [software, setSoftware] = useState<SoftwareItem[] | null>(null);
  const [loadingSoftware, setLoadingSoftware] = useState(false);
  const [errorSoftware, setErrorSoftware] = useState<string | null>(null);

  // Preset Stack State
  const [presetCategory, setPresetCategory] = useState<'all' | TemplatePreset['category']>('all');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('node-app');
  const [versionOverrides, setVersionOverrides] = useState<Record<string, string>>({});
  const [excludedToolIds, setExcludedToolIds] = useState<string[]>([]);
  const [forceAll, setForceAll] = useState(false);
  const [customScript, setCustomScript] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'steps' | 'script'>('steps');
  const [copied, setCopied] = useState(false);
  const [executingPreset, setExecutingPreset] = useState(false);

  // Live Step-by-Step Execution State
  const [liveSteps, setLiveSteps] = useState<LiveStepRunState[] | null>(null);
  const [liveRunning, setLiveRunning] = useState(false);
  const [expandedStepLog, setExpandedStepLog] = useState<string | null>(null);

  // Custom Stack Builder State
  const [customStackIds, setCustomStackIds] = useState<string[]>(['node', 'pm2', 'nginx', 'redis', 'ufw']);

  // Marketplace State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | MarketplaceTool['category']>('all');
  const [marketStatusFilter, setMarketStatusFilter] = useState<'all' | 'installed' | 'missing'>('all');
  const [toolVersions, setToolVersions] = useState<Record<string, string>>({});
  const [installingToolId, setInstallingToolId] = useState<string | null>(null);
  const [serviceBusy, setServiceBusy] = useState<string | null>(null);
  const [inspectTool, setInspectTool] = useState<MarketplaceTool | null>(null);
  const [inspectScript, setInspectScript] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<{
    ok: boolean;
    exitCode: number;
    output: string;
    durationMs: number;
    sudoRequired?: boolean;
  } | null>(null);
  const [promptSudo, setPromptSudo] = useState(false);
  const [sudoPasswordInput, setSudoPasswordInput] = useState('');
  const [rememberSudo, setRememberSudo] = useState(true);
  const [sudoModalOpen, setSudoModalOpen] = useState(false);
  const [pendingSudoAction, setPendingSudoAction] = useState<((password: string) => Promise<void>) | null>(null);

  const { runStreamTask, tasks } = useTaskManager();
  const lastFinishedRef = React.useRef<number>(Date.now());

  useEffect(() => {
    const newlyDone = tasks.find(
      (t) =>
        t.serverId === server.id &&
        (t.category === 'software' || t.category === 'docker') &&
        t.status === 'success' &&
        t.finishedAt &&
        t.finishedAt > lastFinishedRef.current
    );
    if (newlyDone && newlyDone.finishedAt) {
      lastFinishedRef.current = newlyDone.finishedAt;
      loadSoftwareData(true);
    }
  }, [tasks, server.id]);

  const loadSoftwareData = async (force = false) => {
    setErrorSoftware(null);
    try {
      await swr(
        `software:${server.id}`,
        () => fetchSoftware(server.id),
        setSoftware,
        setLoadingSoftware,
        force
      );
    } catch (err: any) {
      setErrorSoftware(err.message || 'Failed to scan installed software');
    }
  };

  useEffect(() => {
    loadSoftwareData();
  }, [server.id]);

  // Filtered Presets by category
  const filteredPresets = useMemo(() => {
    if (presetCategory === 'all') return TEMPLATE_PRESETS;
    return TEMPLATE_PRESETS.filter((p) => p.category === presetCategory);
  }, [presetCategory]);

  // Selected Preset Object (or synthesized Custom Preset when in 'custom' tab)
  const selectedPreset = useMemo<TemplatePreset>(() => {
    if (activeSubTab === 'custom') {
      const selectedTools = customStackIds
        .map((id) => MARKETPLACE_CATALOG.find((m) => m.id === id))
        .filter((m): m is MarketplaceTool => !!m)
        .map((m) => ({
          id: m.id,
          name: m.name,
          description: m.description,
          versions: m.versions,
          defaultVersion: m.defaultVersion,
          steps: m.steps,
          configPath: m.configPath,
          defaultPort: m.defaultPort,
          installScript: m.getInstallScript
        }));
      return {
        id: 'custom-stack',
        name: 'Custom Server Stack',
        category: 'runtime',
        badge: `${selectedTools.length} Selected Components`,
        description: 'Custom stack assembled specifically for your infrastructure needs.',
        tools: selectedTools
      };
    }
    return TEMPLATE_PRESETS.find((p) => p.id === selectedPresetId) || TEMPLATE_PRESETS[0];
  }, [activeSubTab, selectedPresetId, customStackIds]);

  // Reset custom script & exclusions when user picks a different preset
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    setExcludedToolIds([]);
    setCustomScript(null);
    setLiveSteps(null);
  };

  // Toggle individual tool inclusion in preset
  const togglePresetTool = (toolId: string) => {
    setCustomScript(null);
    setExcludedToolIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  // Toggle tool in Custom Stack Builder
  const toggleCustomStackTool = (toolId: string) => {
    setCustomScript(null);
    setLiveSteps(null);
    setCustomStackIds((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    );
  };

  // Analyze Preset against Software Scan, Versions, and Exclusions
  const analysis = useMemo(() => {
    return analyzeTemplate(selectedPreset, software || [], {
      forceAll,
      versionOverrides,
      excludedToolIds: activeSubTab === 'custom' ? [] : excludedToolIds
    });
  }, [selectedPreset, software, forceAll, versionOverrides, excludedToolIds, activeSubTab]);

  // Active bash script (customized or auto-generated)
  const activeScript = customScript !== null ? customScript : analysis.generatedScript;
  const isScriptCustomized = customScript !== null && customScript !== analysis.generatedScript;

  const handlePresetVersionChange = (toolId: string, version: string) => {
    setCustomScript(null);
    setVersionOverrides((prev) => ({ ...prev, [toolId]: version }));
  };

  const handleResetScript = () => {
    setCustomScript(null);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(activeScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSudoFailure = (r: { sudoRequired?: boolean; exitCode?: number; output?: string }) =>
    Boolean(
      r.sudoRequired ||
      r.exitCode === 126 ||
      /sudo:.*(password|terminal|askpass|incorrect)/i.test(r.output || '') ||
      /a terminal is required/i.test(r.output || '') ||
      /a password is required/i.test(r.output || '') ||
      /password.*required/i.test(r.output || '')
    );

  // Run Preset Step-by-Step Live via SSH
  const handleRunLiveStepByStep = async (overridePassword?: string) => {
    if (analysis.itemsToInstall.length === 0 && !isScriptCustomized) {
      toast.info('All selected components are already installed.');
      return;
    }

    const pass = overridePassword !== undefined ? overridePassword : (sudoPasswordInput || undefined);
    setLiveRunning(true);
    const installedStr = analysis.itemsToInstall.map((i) => i.tool.id).join(',') || 'custom';
    const skippedStr = analysis.itemsSkipped.map((i) => i.tool.id).join(',') || 'none';

    await recordTemplateRun(server.id, {
      templateName: selectedPreset.name,
      templateId: selectedPreset.id,
      installed: installedStr,
      skipped: skippedStr
    }).catch(() => {});

    // If user manually edited the raw bash script, run it as one combined step
    if (isScriptCustomized) {
      setLiveSteps([
        {
          toolId: 'custom-script',
          toolName: `${selectedPreset.name} (Custom Script)`,
          status: 'running'
        }
      ]);
      setExpandedStepLog('custom-script');
      const taskId = `template_custom_${selectedPreset.id}_${Date.now()}`;
      let stepOk = true;
      let stepOutput = '';
      let stepErr: any = null;

      try {
        await runStreamTask({
          id: taskId,
          serverId: server.id,
          serverName: server.name,
          title: `${selectedPreset.name} (Custom Script)`,
          category: 'software',
          url: `/api/servers/${server.id}/software/execute?stream=1`,
          body: { script: activeScript, sudoPassword: pass },
          onDone: (res) => {
            stepOk = true;
            stepOutput = res.output || 'Setup completed';
          },
          onError: (err) => {
            stepOk = false;
            stepErr = err;
          }
        });

        setLiveSteps([
          {
            toolId: 'custom-script',
            toolName: `${selectedPreset.name} (Custom Script)`,
            status: stepOk ? 'success' : 'failed',
            output: stepOk ? stepOutput : (stepErr?.output || stepErr?.message || 'Execution failed')
          }
        ]);

        if (stepErr && isSudoFailure(stepErr)) {
          setPendingSudoAction(() => (pw: string) => handleRunLiveStepByStep(pw));
          setSudoModalOpen(true);
          return;
        } else if (stepOk) {
          if (pass && rememberSudo) {
            await updateServer(server.id, { sudoPassword: pass }).catch(() => {});
          }
          toast.success(`Setup for ${selectedPreset.name} completed successfully!`);
          await loadSoftwareData(true);
        } else {
          toast.error(`Setup failed with exit code ${stepErr?.exitCode || 1}`);
        }
      } catch (e: any) {
        setLiveSteps([
          {
            toolId: 'custom-script',
            toolName: `${selectedPreset.name} (Custom Script)`,
            status: 'failed',
            output: e.message
          }
        ]);
      } finally {
        setLiveRunning(false);
      }
      return;
    }

    // Sequential Step-by-Step Execution
    const initialQueue: LiveStepRunState[] = analysis.itemsToInstall.map((item) => ({
      toolId: item.tool.id,
      toolName: item.tool.name,
      version: item.chosenVersion,
      status: 'waiting'
    }));
    setLiveSteps(initialQueue);

    let allOk = true;
    for (let i = 0; i < analysis.itemsToInstall.length; i++) {
      const current = analysis.itemsToInstall[i];
      setExpandedStepLog(current.tool.id);
      setLiveSteps((prev) =>
        prev
          ? prev.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s))
          : prev
      );

      const taskId = `template_${selectedPreset.id}_${current.tool.id}_${Date.now()}`;
      let stepOk = true;
      let stepOutput = '';
      let stepErr: any = null;

      try {
        await runStreamTask({
          id: taskId,
          serverId: server.id,
          serverName: server.name,
          title: `${selectedPreset.name}: ${current.tool.name}`,
          category: 'software',
          url: `/api/servers/${server.id}/software/execute?stream=1`,
          body: { script: current.script, sudoPassword: pass },
          onDone: (res) => {
            stepOk = true;
            stepOutput = res.output || 'Step succeeded';
          },
          onError: (err) => {
            stepOk = false;
            stepErr = err;
          }
        });

        setLiveSteps((prev) =>
          prev
            ? prev.map((s, idx) =>
                idx === i
                  ? {
                      ...s,
                      status: stepOk ? 'success' : 'failed',
                      output: stepOk ? stepOutput : (stepErr?.output || stepErr?.message || 'Execution error')
                    }
                  : s
              )
            : prev
        );

        if (stepErr && isSudoFailure(stepErr)) {
          setPendingSudoAction(() => (pw: string) => handleRunLiveStepByStep(pw));
          setSudoModalOpen(true);
          allOk = false;
          break;
        }
        if (!stepOk) {
          allOk = false;
          toast.error(`Failed at step ${current.tool.name} (Exit code: ${stepErr?.exitCode || 1})`);
          break;
        }
      } catch (err: any) {
        allOk = false;
        setLiveSteps((prev) =>
          prev
            ? prev.map((s, idx) =>
                idx === i
                  ? {
                      ...s,
                      status: 'failed',
                      output: err.message || 'SSH execution error'
                    }
                  : s
              )
            : prev
        );
        toast.error(`Error at step ${current.tool.name}: ${err.message}`);
        break;
      }
    }

    await loadSoftwareData(true);
    if (allOk) {
      if (pass && rememberSudo) {
        await updateServer(server.id, { sudoPassword: pass }).catch(() => {});
      }
      toast.success(`Setup template "${selectedPreset.name}" completed successfully!`);
    }
    setLiveRunning(false);
  };

  // Run Preset in interactive terminal
  const handleRunPresetInTerminal = async () => {
    setExecutingPreset(true);
    try {
      const installedStr = analysis.itemsToInstall.map((i) => i.tool.id).join(',') || 'none';
      const skippedStr = analysis.itemsSkipped.map((i) => i.tool.id).join(',') || 'none';

      await recordTemplateRun(server.id, {
        templateName: selectedPreset.name,
        templateId: selectedPreset.id,
        installed: installedStr,
        skipped: skippedStr
      }).catch(() => {});

      const terminalCmd = formatTerminalCommand(activeScript, `/tmp/vpshub-setup-${selectedPreset.id}.sh`);
      ctx.openTerminal(terminalCmd);
    } catch (err) {
      console.error(err);
    } finally {
      setExecutingPreset(false);
    }
  };

  // Run Single Tool Live in Marketplace
  const handleInstallMarketplaceToolLive = async (tool: MarketplaceTool, customBash?: string, overridePassword?: string) => {
    setInstallingToolId(tool.id);
    setInspectResult(null);
    try {
      const chosenVersion = toolVersions[tool.id] || tool.defaultVersion;
      const script = customBash || generateSingleToolScript(tool, chosenVersion);

      await recordTemplateRun(server.id, {
        templateName: tool.name,
        templateId: tool.id,
        installed: tool.id,
        skipped: ''
      }).catch(() => {});

      const pass = overridePassword !== undefined ? overridePassword : (sudoPasswordInput || undefined);
      const taskId = `install_${tool.id}_${Date.now()}`;

      await runStreamTask({
        id: taskId,
        serverId: server.id,
        serverName: server.name,
        title: `Install ${tool.name}`,
        category: 'software',
        url: `/api/servers/${server.id}/software/execute?stream=1`,
        body: { script, sudoPassword: pass },
        onDone: async (res) => {
          if (inspectTool?.id === tool.id) {
            setInspectResult({
              ok: true,
              exitCode: 0,
              output: res.output || 'Installed successfully',
              durationMs: 0
            });
          }
          if (pass && rememberSudo) {
            await updateServer(server.id, { sudoPassword: pass }).catch(() => {});
          }
          setPromptSudo(false);
          setSudoModalOpen(false);
          toast.success(`${tool.name} successfully installed on ${server.name}!`);
          await loadSoftwareData(true);
        },
        onError: async (err: any) => {
          const errMsg = `${err.message || ''}\n${err.output || ''}`;
          if (inspectTool?.id === tool.id) {
            setInspectResult({
              ok: false,
              exitCode: err.exitCode || 1,
              output: err.output || errMsg,
              durationMs: 0
            });
          }
          if (isSudoFailure(err)) {
            setPendingSudoAction(() => (pw: string) => handleInstallMarketplaceToolLive(tool, customBash, pw));
            setSudoModalOpen(true);
          } else {
            toast.error(`Installation of ${tool.name} failed`);
          }
        }
      });
    } catch (err: any) {
      toast.error(err.message || `Failed to install ${tool.name}`);
    } finally {
      setInstallingToolId(null);
    }
  };

  const handleSudoConfirm = async (password: string, remember: boolean) => {
    if (remember) {
      await updateServer(server.id, { sudoPassword: password }).catch(() => {});
    }
    setSudoPasswordInput(password);
    setSudoModalOpen(false);
    if (pendingSudoAction) {
      const act = pendingSudoAction;
      setPendingSudoAction(null);
      await act(password);
    }
  };

  // Control Service from Marketplace Card
  const handleServiceControl = async (toolId: string, toolName: string, action: 'start' | 'stop' | 'restart') => {
    const key = `${toolId}:${action}`;
    setServiceBusy(key);
    try {
      const res = await controlSoftwareService(server.id, toolId, action);
      setSoftware((prev) =>
        prev ? prev.map((s) => (s.id === toolId ? { ...s, service: res.state } : s)) : prev
      );
      toast.success(`${toolName}: service ${action} (${res.state})`);
    } catch (e: any) {
      toast.error(e.message || `Failed to execute ${action}`);
    } finally {
      setServiceBusy(null);
    }
  };

  // Filtered Marketplace Tools
  const filteredMarketplaceTools = useMemo(() => {
    return MARKETPLACE_CATALOG.filter((tool) => {
      const matchCat = selectedCategory === 'all' || tool.category === selectedCategory;
      const isInst = (software || []).some((s) => s.id === tool.id && s.installed);
      if (marketStatusFilter === 'installed' && !isInst) return false;
      if (marketStatusFilter === 'missing' && isInst) return false;

      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.id.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [selectedCategory, marketStatusFilter, searchQuery, software]);

  const installedCount = software?.filter((s) => s.installed).length ?? 0;
  const totalCount = software?.length ?? MARKETPLACE_CATALOG.length;
  const activeServicesCount = software?.filter((s) => s.installed && s.service === 'active').length ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Studio Header */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                  <span>{t('templates.pageTitle')}</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {TEMPLATE_PRESETS.length} Stacks · {MARKETPLACE_CATALOG.length} Tools
                  </Badge>
                </h2>
                <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
                  {t('templates.pageSubtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Server Software Summary KPIs */}
          <div className="flex items-center gap-3 flex-wrap shrink-0">
            <div className="px-3 py-1.5 rounded-xl bg-[var(--background)] border border-[var(--border)] text-right">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] block font-semibold">
                Detected Packages
              </span>
              <span className="text-xs font-mono font-bold text-[var(--foreground)]">
                {software ? `${installedCount} / ${totalCount} Installed` : 'Scanning…'}
              </span>
            </div>

            <div className="px-3 py-1.5 rounded-xl bg-[var(--background)] border border-[var(--border)] text-right">
              <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] block font-semibold">
                Active Daemons
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400 flex items-center justify-end gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeServicesCount} Running
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSoftwareData(true)}
              disabled={loadingSoftware}
              className="gap-1.5 h-9 text-xs"
              title={t('software.rescan')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSoftware ? 'animate-spin' : ''}`} />
              <span>{t('software.rescan')}</span>
            </Button>
          </div>
        </div>

        {/* 3 Mode Sub-tabs Navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[var(--border)]/70 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('presets');
              setLiveSteps(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSubTab === 'presets'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('templates.tabPresets')}</span>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 px-1.5 font-mono h-4 ${
                activeSubTab === 'presets' ? 'border-white/30 text-current' : ''
              }`}
            >
              {TEMPLATE_PRESETS.length}
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('custom');
              setLiveSteps(null);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSubTab === 'custom'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Custom Stack Builder</span>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 px-1.5 font-mono h-4 ${
                activeSubTab === 'custom' ? 'border-white/30 text-current' : ''
              }`}
            >
              {customStackIds.length} selected
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('marketplace')}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSubTab === 'marketplace'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>{t('templates.tabMarketplace')}</span>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 px-1.5 font-mono h-4 ${
                activeSubTab === 'marketplace' ? 'border-white/30 text-current' : ''
              }`}
            >
              {MARKETPLACE_CATALOG.length}
            </Badge>
          </button>
        </div>
      </Card>

      {errorSoftware && (
        <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center justify-between">
          <span>{errorSoftware}</span>
          <Button variant="ghost" size="sm" onClick={() => loadSoftwareData(true)} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUBTAB 1 & 2: PRESET STACKS & CUSTOM STACK BUILDER                */}
      {/* ================================================================= */}
      {(activeSubTab === 'presets' || activeSubTab === 'custom') && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {activeSubTab === 'presets' ? (
            /* STEP 1: CHOOSE PRESET STACK */
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <label className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                    {t('templates.choosePreset')}
                  </label>
                </div>

                {/* Preset Category Filter */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESET_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPresetCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition border ${
                        presetCategory === cat.id
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                          : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
                {filteredPresets.map((preset) => {
                  const isSelected = preset.id === selectedPresetId;
                  const presetAnalysis = analyzeTemplate(preset, software || [], { forceAll: false });
                  const toInstall = presetAnalysis.itemsToInstall.length;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between space-y-3 ${
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/30 shadow-md'
                          : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]/40 hover:bg-[var(--muted)]/20'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="p-2 rounded-lg bg-[var(--background)] border border-[var(--border)] shrink-0">
                            {preset.id === 'hardening' ? (
                              <Shield className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <BrandIcon
                                name={preset.tools[0]?.id}
                                className="w-4 h-4"
                                fallback={<Layers className="w-4 h-4 text-sky-400" />}
                              />
                            )}
                          </span>
                          <Badge
                            variant={toInstall === 0 ? 'success' : 'secondary'}
                            className="text-[10px] py-0 px-1.5 h-4 shrink-0"
                          >
                            {toInstall === 0
                              ? t('templates.allInstalled')
                              : t('templates.toInstallCount', { n: toInstall })}
                          </Badge>
                        </div>

                        <div>
                          <h4 className="font-bold text-xs text-[var(--foreground)] line-clamp-1">
                            {preset.name}
                          </h4>
                          <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed mt-1 line-clamp-2">
                            {preset.description}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[var(--border)]/60">
                        {/* Meta Info */}
                        {(preset.recommendedRam || preset.estimatedTime) && (
                          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] font-mono">
                            {preset.recommendedRam && (
                              <span className="flex items-center gap-1">
                                <Cpu className="w-3 h-3" /> {preset.recommendedRam}
                              </span>
                            )}
                            {preset.estimatedTime && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {preset.estimatedTime}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Package Pills */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {preset.tools.map((tool) => {
                            const isInstalled = (software || []).some((s) => s.id === tool.id && s.installed);
                            return (
                              <span
                                key={tool.id}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                                  isInstalled
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]'
                                }`}
                              >
                                {isInstalled && <Check className="w-2.5 h-2.5 text-emerald-500" />}
                                {tool.name.split(' ')[0]}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* CUSTOM STACK BUILDER PICKER */
            <Card className="p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-bold flex items-center justify-center">
                    1
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                      Select Components for Your Custom Stack ({customStackIds.length} selected)
                    </h3>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Select runtimes, web servers, databases, or security tools to bundle into a single setup pipeline.
                    </p>
                  </div>
                </div>
                {customStackIds.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCustomStackIds([])}
                    className="h-7 text-xs text-[var(--muted-foreground)]"
                  >
                    Reset Selection
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {MARKETPLACE_CATALOG.map((tool) => {
                  const picked = customStackIds.includes(tool.id);
                  const isInst = (software || []).some((s) => s.id === tool.id && s.installed);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleCustomStackTool(tool.id)}
                      className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between gap-2 ${
                        picked
                          ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] shadow-sm'
                          : 'border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <BrandIcon
                          name={tool.id}
                          className="w-4 h-4 shrink-0"
                          fallback={<Package className="w-4 h-4 shrink-0" />}
                        />
                        <div className="min-w-0">
                          <span className="text-xs font-semibold block truncate">{tool.name}</span>
                          <span className="text-[10px] font-mono opacity-75">
                            {isInst ? '✓ Installed' : tool.category}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          picked
                            ? 'bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]'
                            : 'border-[var(--border)]'
                        }`}
                      >
                        {picked && <Check className="w-3 h-3" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* STEP 2 & STEP 3 WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: STEP 2 — COMPONENT CHECKLIST, VERSIONS & DIFF ANALYSIS */}
            <div className="lg:col-span-5 space-y-4">
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-bold flex items-center justify-center">
                      2
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                      Configure Components & Versions
                    </h3>
                  </div>

                  <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceAll}
                      onChange={(e) => {
                        setCustomScript(null);
                        setForceAll(e.target.checked);
                      }}
                      className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                    />
                    <span>{t('templates.forceAll')}</span>
                  </label>
                </div>

                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  Customize package versions or toggle specific components on/off for this server.
                </p>

                {/* Interactive Component Cards List */}
                <div className="space-y-2.5">
                  {selectedPreset.tools.map((tool) => {
                    const existing = (software || []).find((s) => s.id === tool.id);
                    const isInstalled = !!existing?.installed;
                    const isExcluded = excludedToolIds.includes(tool.id);
                    const willInstall = !isExcluded && (!isInstalled || forceAll);
                    const curVer =
                      versionOverrides[tool.id] ||
                      tool.defaultVersion ||
                      tool.versions?.[0]?.value ||
                      '';

                    return (
                      <div
                        key={tool.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                          isExcluded
                            ? 'border-dashed border-[var(--border)] bg-[var(--muted)]/10 opacity-60'
                            : willInstall
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-emerald-500/30 bg-emerald-500/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-start gap-2.5 cursor-pointer select-none min-w-0">
                            {activeSubTab === 'presets' && (
                              <input
                                type="checkbox"
                                checked={!isExcluded}
                                onChange={() => togglePresetTool(tool.id)}
                                className="mt-0.5 rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                              />
                            )}
                            <BrandIcon
                              name={tool.id}
                              className="w-4 h-4 mt-0.5 shrink-0"
                              fallback={<Package className="w-4 h-4 mt-0.5 shrink-0 text-[var(--primary)]" />}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-semibold text-[var(--foreground)]">
                                  {tool.name}
                                </span>
                                {tool.defaultPort && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                                    :{tool.defaultPort}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed mt-0.5">
                                {tool.description}
                              </p>
                            </div>
                          </label>

                          {/* Status Pill */}
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 font-medium ${
                              isExcluded
                                ? 'bg-zinc-500/10 text-zinc-400'
                                : willInstall
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isExcluded
                              ? 'Skipped'
                              : willInstall
                              ? isInstalled
                                ? 'Reinstall'
                                : 'To Install'
                              : `✓ v${existing?.version || 'Installed'}`}
                          </span>
                        </div>

                        {/* Version Selector if tool has versions */}
                        {!isExcluded && tool.versions && tool.versions.length > 0 && (
                          <div className="pt-2 border-t border-[var(--border)]/50 flex items-center justify-between gap-2 text-xs">
                            <span className="text-[11px] text-[var(--muted-foreground)] font-medium flex items-center gap-1">
                              <Sliders className="w-3 h-3 text-[var(--primary)]" />
                              Select Version / Variant:
                            </span>
                            <select
                              value={curVer}
                              onChange={(e) => handlePresetVersionChange(tool.id, e.target.value)}
                              className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--foreground)] font-mono focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                            >
                              {tool.versions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {analysis.allInstalled && !forceAll && (
                  <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                    <p className="text-xs font-semibold text-emerald-400">
                      All selected components are already installed on this server!
                    </p>
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Enable &ldquo;{t('templates.forceAll')}&rdquo; above if you want to reinstall or update configuration.
                    </p>
                  </div>
                )}
              </Card>

              {/* Safety Notice Box */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-start gap-3 text-xs text-[var(--muted-foreground)] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>
                  Every execution step includes <strong>APT Lock Timeout (60s)</strong> and <code>DEBIAN_FRONTEND=noninteractive</code> guards to prevent hung processes.
                </span>
              </div>
            </div>

            {/* RIGHT COLUMN: STEP 3 — PIPELINE REVIEW, BASH EDITOR & LIVE EXECUTION */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <Card className="p-5 flex-1 flex flex-col space-y-4">
                {/* Header & Mode Switcher (Visual Steps vs Bash Script) */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-bold flex items-center justify-center">
                      3
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                      Review Pipeline & Execute Setup
                    </h3>
                    {isScriptCustomized && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                        {t('templates.scriptEditedBadge')}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('steps')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                          previewMode === 'steps'
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        <ListChecks className="w-3.5 h-3.5" />
                        <span>Pipeline Steps ({analysis.itemsToInstall.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('script')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                          previewMode === 'script'
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        <Code2 className="w-3.5 h-3.5" />
                        <span>Bash Script</span>
                      </button>
                    </div>

                    {isScriptCustomized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetScript}
                        className="h-7 text-xs gap-1"
                        title={t('templates.resetScript')}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>Reset</span>
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyScript}
                      className="h-7 text-xs gap-1.5"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? t('common.copied') : t('common.copy')}</span>
                    </Button>
                  </div>
                </div>

                {/* MODE A: VISUAL STEP-BY-STEP PIPELINE & LIVE TRACKER */}
                {previewMode === 'steps' ? (
                  <div className="flex-1 space-y-3 min-h-[360px]">
                    {analysis.itemsToInstall.length === 0 ? (
                      <div className="h-full min-h-[320px] rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/10 flex flex-col items-center justify-center p-8 text-center space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        <h4 className="text-sm font-semibold text-[var(--foreground)]">
                          No New Installation Steps
                        </h4>
                        <p className="text-xs text-[var(--muted-foreground)] max-w-md">
                          All components in <strong>{selectedPreset.name}</strong> are already detected and active on <code>{server.name}</code>.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {/* Pre-flight Step Banner */}
                        <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono text-[10px] font-semibold">
                              PRE-FLIGHT
                            </span>
                            <span className="text-[var(--foreground)] font-medium">
                              Verify Root/Sudo Access, PATH Environment & APT Lock Timeout
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400">Automatic</span>
                        </div>

                        {/* Sequential Tool Steps */}
                        {analysis.itemsToInstall.map(({ tool, chosenVersion }, idx) => {
                          const liveState = liveSteps?.find((ls) => ls.toolId === tool.id);
                          const isExpanded = expandedStepLog === tool.id;

                          return (
                            <div
                              key={tool.id}
                              className={`rounded-xl border transition-all overflow-hidden ${
                                liveState?.status === 'running'
                                  ? 'border-sky-500/50 bg-sky-500/5 ring-1 ring-sky-500/30'
                                  : liveState?.status === 'success'
                                  ? 'border-emerald-500/40 bg-emerald-500/5'
                                  : liveState?.status === 'failed'
                                  ? 'border-red-500/40 bg-red-500/5'
                                  : 'border-[var(--border)] bg-[var(--background)]'
                              }`}
                            >
                              <div className="p-3.5 flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <span
                                    className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                      liveState?.status === 'running'
                                        ? 'bg-sky-500 text-white animate-pulse'
                                        : liveState?.status === 'success'
                                        ? 'bg-emerald-500 text-white'
                                        : liveState?.status === 'failed'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-[var(--muted)] text-[var(--foreground)] border border-[var(--border)]'
                                    }`}
                                  >
                                    {liveState?.status === 'success' ? (
                                      <Check className="w-3.5 h-3.5" />
                                    ) : liveState?.status === 'running' ? (
                                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      idx + 1
                                    )}
                                  </span>

                                  <div className="space-y-1.5 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <BrandIcon name={tool.id} className="w-4 h-4" />
                                      <span className="text-xs font-bold text-[var(--foreground)]">
                                        {tool.name}
                                      </span>
                                      {chosenVersion && (
                                        <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5">
                                          {chosenVersion}
                                        </Badge>
                                      )}
                                      {tool.configPath && (
                                        <span className="text-[10px] font-mono text-[var(--muted-foreground)] flex items-center gap-1">
                                          <FolderOpen className="w-3 h-3" />
                                          {tool.configPath}
                                        </span>
                                      )}
                                    </div>

                                    {/* Sub-steps list */}
                                    {tool.steps && tool.steps.length > 0 ? (
                                      <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                        {tool.steps.map((st, sIdx) => (
                                          <span
                                            key={sIdx}
                                            className="text-[11px] text-[var(--muted-foreground)] inline-flex items-center gap-1 bg-[var(--muted)]/40 px-2 py-0.5 rounded-md border border-[var(--border)]/60"
                                          >
                                            <ChevronRight className="w-3 h-3 text-[var(--primary)] shrink-0" />
                                            {st}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-[var(--muted-foreground)]">
                                        {tool.description}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {liveState && (
                                    <span className="text-[10px] font-mono">
                                      {liveState.status === 'running' && (
                                        <span className="text-sky-400 font-semibold">Installing...</span>
                                      )}
                                      {liveState.status === 'success' && (
                                        <span className="text-emerald-400 font-semibold">
                                          Completed ({((liveState.durationMs || 0) / 1000).toFixed(1)}s)
                                        </span>
                                      )}
                                      {liveState.status === 'failed' && (
                                        <span className="text-red-400 font-semibold">Failed</span>
                                      )}
                                    </span>
                                  )}

                                  {liveState?.output && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedStepLog(isExpanded ? null : tool.id)
                                      }
                                      className="text-[10px] font-mono px-2 py-0.5 rounded border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--foreground)]"
                                    >
                                      {isExpanded ? 'Hide Logs' : 'View Logs'}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Collapsible Live Step Output Log */}
                              {isExpanded && liveState?.output && (
                                <pre className="p-3 bg-[var(--background)] border-t border-[var(--border)] text-[11px] font-mono text-[var(--foreground)] max-h-48 overflow-auto whitespace-pre-wrap leading-relaxed">
                                  {liveState.output}
                                </pre>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* MODE B: EDITABLE BASH SCRIPT EDITOR */
                  <div className="flex-1 flex flex-col rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden focus-within:ring-1 focus-within:ring-[var(--primary)] min-h-[380px]">
                    <div className="px-3 py-1.5 border-b border-[var(--border)] bg-[var(--muted)]/40 flex items-center justify-between text-[11px] text-[var(--muted-foreground)] font-mono">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500/40 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40 inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-green-500/40 inline-block" />
                        <span className="ml-2 text-[var(--muted-foreground)]">bash setup script ({selectedPreset.id}.sh)</span>
                      </span>
                      <span>
                        {activeScript.split('\n').length} lines · {activeScript.length} characters
                      </span>
                    </div>

                    <textarea
                      value={activeScript}
                      onChange={(e) => setCustomScript(e.target.value)}
                      spellCheck={false}
                      className="w-full flex-1 p-4 bg-transparent text-[var(--foreground)] font-mono text-xs leading-relaxed outline-none resize-none overflow-auto whitespace-pre selection:bg-[var(--primary)]/30 min-h-[350px]"
                    />
                  </div>
                )}

                {/* Bottom Execution Bar */}
                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border)]">
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Target Node:{' '}
                    <span className="font-mono text-[var(--foreground)] font-semibold">
                      {server.username}@{server.host}
                    </span>{' '}
                    · {analysis.itemsToInstall.length} step(s) will be executed
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap justify-end">
                    <Button
                      variant="outline"
                      size="default"
                      onClick={handleRunPresetInTerminal}
                      disabled={executingPreset || liveRunning}
                      className="gap-2 text-xs font-semibold"
                    >
                      {executingPreset ? (
                        <RotateCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Terminal className="w-4 h-4" />
                      )}
                      <span>{t('templates.btnRunInTerminal')}</span>
                    </Button>

                    <Button
                      size="default"
                      onClick={() => handleRunLiveStepByStep()}
                      disabled={liveRunning || (analysis.itemsToInstall.length === 0 && !isScriptCustomized)}
                      className="gap-2 text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 shadow-lg shadow-[var(--primary)]/20"
                    >
                      {liveRunning ? (
                        <RotateCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>
                        {liveRunning
                          ? 'Executing Pipeline...'
                          : `Run Live Setup Now (${analysis.itemsToInstall.length} Steps)`}
                      </span>
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* SUBTAB 3: MARKETPLACE / TOOL STORE (39 CURATED TOOLS)             */}
      {/* ================================================================= */}
      {activeSubTab === 'marketplace' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Marketplace Filter, Status & Search Toolbar */}
          <div className="space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Status Filter */}
              <div className="inline-flex items-center p-1 rounded-xl bg-[var(--card)] border border-[var(--border)] w-fit gap-1">
                <button
                  type="button"
                  onClick={() => setMarketStatusFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    marketStatusFilter === 'all'
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  All ({MARKETPLACE_CATALOG.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMarketStatusFilter('missing')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    marketStatusFilter === 'missing'
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Not Installed ({MARKETPLACE_CATALOG.length - installedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setMarketStatusFilter('installed')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    marketStatusFilter === 'installed'
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Installed ({installedCount})
                </button>
              </div>

              {/* Search Input */}
              <div className="relative w-full md:w-80 shrink-0">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  type="text"
                  placeholder={t('templates.searchMarketplace')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 text-xs w-full bg-[var(--background)]"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {MARKETPLACE_CATEGORIES.map((c) => {
                const count =
                  c.id === 'all'
                    ? MARKETPLACE_CATALOG.length
                    : MARKETPLACE_CATALOG.filter((t) => t.category === c.id).length;

                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategory(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                      selectedCategory === c.id
                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-sm'
                        : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                    }`}
                  >
                    {t(c.label)} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Catalog Grid */}
          {filteredMarketplaceTools.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-2xl bg-[var(--card)]">
              {t('software.noFilterMatch')}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMarketplaceTools.map((tool) => {
                const installedItem = (software || []).find((s) => s.id === tool.id && s.installed);
                const isInstalled = !!installedItem;
                const isInstalling = installingToolId === tool.id;
                const hasService = installedItem?.service !== undefined;
                const isServiceActive = installedItem?.service === 'active';

                const selectedVersion =
                  toolVersions[tool.id] || tool.defaultVersion || tool.versions?.[0]?.value;

                return (
                  <Card
                    key={tool.id}
                    className={`p-5 flex flex-col justify-between space-y-4 transition-all shadow-sm ${
                      isInstalled
                        ? 'border-emerald-500/20 hover:border-emerald-500/40'
                        : 'hover:border-[var(--muted-foreground)]/40'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2.5 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] shrink-0">
                            <BrandIcon
                              name={tool.id}
                              className="w-5 h-5"
                              fallback={<Package className="w-5 h-5 text-[var(--muted-foreground)]" />}
                            />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-[var(--foreground)] truncate">
                              {tool.name}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted-foreground)] uppercase">
                              <span>{tool.category}</span>
                              {tool.defaultPort && <span>· :{tool.defaultPort}</span>}
                            </div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge
                            variant={isInstalled ? 'success' : 'outline'}
                            className="text-[10px] py-0.5 px-2 font-mono"
                          >
                            {isInstalled
                              ? `✓ ${
                                  tool.id === 'swap' && installedItem.version
                                    ? `${Math.round(parseFloat(installedItem.version))}MB`
                                    : installedItem.version
                                    ? `v${installedItem.version}`
                                    : 'Installed'
                                }`
                              : 'Not Installed'}
                          </Badge>

                          {isInstalled && hasService && (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-mono ${
                                isServiceActive ? 'text-emerald-400' : 'text-zinc-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isServiceActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
                                }`}
                              />
                              {isServiceActive ? 'Running' : 'Stopped'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                        {tool.description}
                      </p>

                      {/* Sub-steps preview pills */}
                      {tool.steps && tool.steps.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {tool.steps.map((s, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)]/40 px-2 py-0.5 rounded border border-[var(--border)]/60"
                            >
                              {idx + 1}. {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Version Selector (if applicable) */}
                      {tool.versions && tool.versions.length > 0 && (
                        <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-[var(--muted-foreground)] font-medium">
                            {t('templates.versionLabel')}:
                          </span>
                          <select
                            value={selectedVersion}
                            onChange={(e) =>
                              setToolVersions((prev) => ({ ...prev, [tool.id]: e.target.value }))
                            }
                            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-1 text-xs text-[var(--foreground)] font-mono"
                          >
                            {tool.versions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
                      {/* Service Controls if Installed & Has Service, else Script Inspect */}
                      <div className="flex items-center gap-1">
                        {isInstalled && hasService && (
                          <>
                            {isServiceActive ? (
                              <>
                                <button
                                  type="button"
                                  disabled={!!serviceBusy}
                                  onClick={() => handleServiceControl(tool.id, tool.name, 'restart')}
                                  title="Restart Service"
                                  className="px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--muted)] text-[10px] font-medium text-[var(--foreground)] inline-flex items-center gap-1 transition"
                                >
                                  <RotateCw
                                    className={`w-3 h-3 ${
                                      serviceBusy === `${tool.id}:restart` ? 'animate-spin' : ''
                                    }`}
                                  />
                                  <span>Restart</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!!serviceBusy}
                                  onClick={() => handleServiceControl(tool.id, tool.name, 'stop')}
                                  title="Stop Service"
                                  className="p-1 rounded-md border border-[var(--border)] hover:bg-red-500/10 text-[var(--muted-foreground)] hover:text-red-400 transition"
                                >
                                  <Square className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={!!serviceBusy}
                                onClick={() => handleServiceControl(tool.id, tool.name, 'start')}
                                className="px-2 py-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-medium inline-flex items-center gap-1 transition"
                              >
                                <Play className="w-3 h-3" />
                                <span>Start</span>
                              </button>
                            )}
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setInspectTool(tool);
                            setInspectScript(generateSingleToolScript(tool, selectedVersion));
                            setInspectResult(null);
                          }}
                          className="px-2 py-1 rounded-md border border-[var(--border)] hover:bg-[var(--muted)] text-[10px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1 transition"
                          title="View & Edit Script"
                        >
                          <Code2 className="w-3 h-3" />
                          <span>Script</span>
                        </button>
                      </div>

                      {/* Install Live Button */}
                      <Button
                        size="sm"
                        variant={isInstalled ? 'outline' : 'default'}
                        onClick={() => handleInstallMarketplaceToolLive(tool)}
                        disabled={isInstalling}
                        className={`gap-1.5 h-8 text-xs font-semibold ${
                          !isInstalled
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 shadow-sm'
                            : 'hover:bg-[var(--muted)]'
                        }`}
                      >
                        {isInstalling ? (
                          <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isInstalling
                            ? 'Installing...'
                            : isInstalled
                            ? 'Reinstall'
                            : t('templates.btnInstallTool')}
                        </span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inspect / Custom Tool Runner Modal */}
      {inspectTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[var(--border)] flex items-start justify-between gap-3 bg-[var(--muted)]/20">
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-[var(--background)] border border-[var(--border)]">
                  <BrandIcon
                    name={inspectTool.id}
                    className="w-6 h-6"
                    fallback={<Package className="w-6 h-6 text-[var(--primary)]" />}
                  />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">
                    Setup & Script Inspector: {inspectTool.name}
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {inspectTool.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !installingToolId && setInspectTool(null)}
                className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <textarea
                value={inspectScript || ''}
                onChange={(e) => setInspectScript(e.target.value)}
                rows={10}
                spellCheck={false}
                className="w-full p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />

              {/* Sudo Password Required Prompt */}
              {promptSudo && (
                <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <KeyRound className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-amber-500 dark:text-amber-300">
                        Sudo Password Required
                      </h4>
                      <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
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
                      className="h-8 text-xs bg-[var(--background)] border-amber-500/40 text-[var(--foreground)] flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && sudoPasswordInput.trim() && inspectTool) {
                          handleInstallMarketplaceToolLive(inspectTool, inspectScript || undefined, sudoPasswordInput);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      disabled={!sudoPasswordInput.trim() || !!installingToolId}
                      onClick={() => inspectTool && handleInstallMarketplaceToolLive(inspectTool, inspectScript || undefined, sudoPasswordInput)}
                      className="h-8 text-xs gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-black dark:text-zinc-950 shrink-0"
                    >
                      <Play className="w-3 h-3" />
                      <span>Authenticate & Install</span>
                    </Button>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-[11px] text-[var(--muted-foreground)]">
                    <input
                      type="checkbox"
                      checked={rememberSudo}
                      onChange={(e) => setRememberSudo(e.target.checked)}
                      className="rounded border-[var(--border)] bg-[var(--card)] text-amber-500 focus:ring-0"
                    />
                    <span>Remember sudo password for this server (encrypted with AES-256-GCM)</span>
                  </label>
                </div>
              )}

              {inspectResult && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden">
                  <div className="px-3.5 py-2 border-b border-[var(--border)] bg-[var(--muted)]/40 flex items-center justify-between text-xs font-mono">
                    <span className={inspectResult.ok ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                      {inspectResult.ok ? '✔ Execution Succeeded' : `✖ Failed (Exit ${inspectResult.exitCode})`} ·{' '}
                      {(inspectResult.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <pre className="p-3.5 text-[11px] font-mono text-[var(--foreground)] max-h-52 overflow-auto whitespace-pre-wrap bg-[var(--background)]">
                    {inspectResult.output}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const cmd = formatTerminalCommand(
                    inspectScript || '',
                    `/tmp/vpshub-install-${inspectTool.id}.sh`
                  );
                  setInspectTool(null);
                  ctx.openTerminal(cmd);
                }}
                className="h-8 text-xs gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Open in Interactive Terminal</span>
              </Button>

              <Button
                size="sm"
                disabled={installingToolId === inspectTool.id}
                onClick={() => handleInstallMarketplaceToolLive(inspectTool, inspectScript || undefined)}
                className="h-8 text-xs gap-1.5 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
              >
                {installingToolId === inspectTool.id ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Run Live Setup Now</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Sudo Password Required Modal */}
      <SudoPasswordModal
        isOpen={sudoModalOpen}
        onClose={() => setSudoModalOpen(false)}
        onConfirm={handleSudoConfirm}
        serverName={server.name}
        username={server.username}
        reason="Installing packages and configuring runtime stacks requires root/sudo privileges."
      />
    </div>
  );
}
