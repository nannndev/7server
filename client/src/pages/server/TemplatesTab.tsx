import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Edit3,
  Undo2,
  Store,
  Package,
  ArrowUpRight,
  AlertCircle
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useServerPage } from './context';
import { fetchSoftware, recordTemplateRun, type SoftwareItem } from '@/features/servers/api';
import { swr } from '@/shared/lib/cache';
import {
  TEMPLATE_PRESETS,
  MARKETPLACE_CATALOG,
  analyzeTemplate,
  generateSingleToolScript,
  formatTerminalCommand,
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

export default function TemplatesTab() {
  const t = useT();
  const ctx = useServerPage();
  const { server } = ctx;

  // Active top-level subtab: 'presets' (Stacks) vs 'marketplace' (Tool Store)
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'marketplace'>('presets');

  // Shared Software Scan Data (from Phase 1)
  const [software, setSoftware] = useState<SoftwareItem[] | null>(null);
  const [loadingSoftware, setLoadingSoftware] = useState(false);
  const [errorSoftware, setErrorSoftware] = useState<string | null>(null);

  // Preset Stack State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('node-app');
  const [versionOverrides, setVersionOverrides] = useState<Record<string, string>>({});
  const [forceAll, setForceAll] = useState(false);
  const [customScript, setCustomScript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [executingPreset, setExecutingPreset] = useState(false);

  // Marketplace State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | MarketplaceTool['category']>('all');
  const [toolVersions, setToolVersions] = useState<Record<string, string>>({});
  const [installingToolId, setInstallingToolId] = useState<string | null>(null);

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

  // Selected Preset Object
  const selectedPreset = useMemo(() => {
    return TEMPLATE_PRESETS.find((p) => p.id === selectedPresetId) || TEMPLATE_PRESETS[0];
  }, [selectedPresetId]);

  // Reset custom script when user picks a different preset
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    setCustomScript(null);
  };

  // Analyze Preset against Phase 1 Scan & Selected Versions
  const analysis = useMemo(() => {
    return analyzeTemplate(selectedPreset, software || [], { forceAll, versionOverrides });
  }, [selectedPreset, software, forceAll, versionOverrides]);

  // The actual bash script to show and run (customized or auto-generated)
  const activeScript = customScript !== null ? customScript : analysis.generatedScript;
  const isScriptCustomized = customScript !== null && customScript !== analysis.generatedScript;

  // Handle version change for preset tools
  const handlePresetVersionChange = (toolId: string, version: string) => {
    setVersionOverrides((prev) => ({ ...prev, [toolId]: version }));
  };

  // Reset custom edits back to auto-generated script
  const handleResetScript = () => {
    setCustomScript(null);
  };

  // Copy active script to clipboard
  const handleCopyScript = () => {
    navigator.clipboard.writeText(activeScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Run Preset in interactive terminal
  const handleRunPresetInTerminal = async () => {
    setExecutingPreset(true);
    try {
      const installedStr = analysis.itemsToInstall.map((i) => i.tool.id).join(',') || 'none';
      const skippedStr = analysis.itemsSkipped.map((i) => i.tool.id).join(',') || 'none';

      // 1. Record run in Audit Log
      await recordTemplateRun(server.id, {
        templateName: selectedPreset.name,
        templateId: selectedPreset.id,
        installed: installedStr,
        skipped: skippedStr
      }).catch((e) => console.warn('Audit record error:', e));

      // 2. Format command to run via temporary shell script for clean interactive stdin
      const terminalCmd = formatTerminalCommand(activeScript, `/tmp/vpshub-setup-${selectedPreset.id}.sh`);

      // 3. Open interactive Web Terminal tab and run
      ctx.openTerminal(terminalCmd);
    } catch (err) {
      console.error(err);
    } finally {
      setExecutingPreset(false);
    }
  };

  // Run Single Tool from Marketplace in interactive terminal
  const handleInstallMarketplaceTool = async (tool: MarketplaceTool) => {
    setInstallingToolId(tool.id);
    try {
      const chosenVersion = toolVersions[tool.id] || tool.defaultVersion;
      const script = generateSingleToolScript(tool, chosenVersion);

      // Record in Audit Log
      await recordTemplateRun(server.id, {
        templateName: tool.name,
        templateId: tool.id,
        installed: tool.id,
        skipped: ''
      }).catch((e) => console.warn('Audit record error:', e));

      // Format and open terminal
      const terminalCmd = formatTerminalCommand(script, `/tmp/vpshub-install-${tool.id}.sh`);
      ctx.openTerminal(terminalCmd);
    } catch (err) {
      console.error(err);
    } finally {
      setInstallingToolId(null);
    }
  };

  // Filtered Marketplace Tools
  const filteredMarketplaceTools = useMemo(() => {
    return MARKETPLACE_CATALOG.filter((tool) => {
      const matchCat = selectedCategory === 'all' || tool.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.id.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [selectedCategory, searchQuery]);

  const installedCount = software?.filter((s) => s.installed).length ?? 0;
  const totalCount = software?.length ?? 0;

  // Tools in selected preset that offer version choices
  const configurableTools = useMemo(() => {
    return selectedPreset.tools.filter((t) => t.versions && t.versions.length > 0);
  }, [selectedPreset]);

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <Card className="p-6 bg-gradient-to-r from-[var(--card)] via-[var(--card)] to-[var(--primary)]/5 border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                {t('templates.pageTitle')}
              </h2>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] max-w-2xl leading-relaxed">
              {t('templates.pageSubtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] block font-semibold">
                {t('templates.serverStatus')}
              </span>
              <span className="text-xs font-mono font-medium text-[var(--foreground)]">
                {software ? t('templates.installedCount', { installed: installedCount, total: totalCount }) : 'Memindai…'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSoftwareData(true)}
              disabled={loadingSoftware}
              className="gap-1.5 h-8 text-xs"
              title={t('software.rescan')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSoftware ? 'animate-spin' : ''}`} />
              <span>{t('software.rescan')}</span>
            </Button>
          </div>
        </div>

        {/* Sub-tabs Navigation */}
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[var(--border)]/70">
          <button
            type="button"
            onClick={() => setActiveSubTab('presets')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSubTab === 'presets'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('templates.tabPresets')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('marketplace')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
              activeSubTab === 'marketplace'
                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>{t('templates.tabMarketplace')}</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono h-4">
              {MARKETPLACE_CATALOG.length}
            </Badge>
          </button>
        </div>
      </Card>

      {/* SUBTAB 1: PRESET STACKS */}
      {activeSubTab === 'presets' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Preset Cards Selection Grid (4 Presets) */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3 block">
              {t('templates.choosePreset')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {TEMPLATE_PRESETS.map((preset) => {
                const isSelected = preset.id === selectedPresetId;
                const presetAnalysis = analyzeTemplate(preset, software || [], { forceAll: false });
                const toInstall = presetAnalysis.itemsToInstall.length;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.id)}
                    className={`p-4 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-[var(--primary)] bg-[var(--primary)]/5 ring-2 ring-[var(--primary)]/30 shadow-md'
                        : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)]/40 hover:bg-[var(--muted)]/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-semibold text-sm text-[var(--foreground)] flex items-center gap-2">
                          {preset.id === 'hardening' ? (
                            <Shield className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <BrandIcon
                              name={preset.tools[0]?.id}
                              className="w-4 h-4"
                              fallback={<Layers className="w-4 h-4 text-sky-400" />}
                            />
                          )}
                          {preset.name}
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

                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mb-3">
                        {preset.description}
                      </p>
                    </div>

                    {/* Package Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[var(--border)]/60">
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
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main Preset Workspace (Diff Analysis + Version Customizer + Editable Script Preview) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Diff vs Tahap 1 Scan & Version Customizer */}
            <div className="lg:col-span-5 space-y-4">
              {/* Version Customizer Card (if preset has configurable tools) */}
              {configurableTools.length > 0 && (
                <Card className="p-4 space-y-3 bg-[var(--card)] border-[var(--border)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[var(--primary)]" />
                      {t('templates.customizeVersions')}
                    </span>
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      Sesuaikan versi paket sebelum pasang
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {configurableTools.map((tool) => {
                      const curVal = versionOverrides[tool.id] || tool.defaultVersion || tool.versions![0].value;
                      return (
                        <div key={tool.id} className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-medium text-[var(--foreground)] flex items-center gap-2">
                            <BrandIcon name={tool.id} className="w-3.5 h-3.5" />
                            {tool.name}
                          </span>
                          <select
                            value={curVal}
                            onChange={(e) => handlePresetVersionChange(tool.id, e.target.value)}
                            className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-2.5 py-1 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] font-mono"
                          >
                            {tool.versions!.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Analysis Diff Breakdown */}
              <Card className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                    <Info className="w-4 h-4 text-sky-400" />
                    {t('templates.analysisTitle')}
                  </h3>

                  <label className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={forceAll}
                      onChange={(e) => setForceAll(e.target.checked)}
                      className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
                    />
                    <span>{t('templates.forceAll')}</span>
                  </label>
                </div>

                <div className="space-y-3">
                  {/* Items to Install */}
                  {analysis.itemsToInstall.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-amber-500 uppercase tracking-wider block">
                        {t('templates.sectionToInstall', { count: analysis.itemsToInstall.length })}:
                      </span>
                      <div className="space-y-1.5">
                        {analysis.itemsToInstall.map(({ tool, reason, chosenVersion }) => (
                          <div
                            key={tool.id}
                            className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                                <BrandIcon
                                  name={tool.id}
                                  className="w-4 h-4"
                                  fallback={<ChevronRight className="w-3.5 h-3.5 text-amber-500" />}
                                />
                                {tool.name}
                                {chosenVersion && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500">
                                    {chosenVersion}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] font-mono text-amber-500 font-medium">
                                {reason}
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                              {tool.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Items Already Installed & Skipped */}
                  {analysis.itemsSkipped.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider block">
                        {t('templates.sectionSkipped', { count: analysis.itemsSkipped.length })}:
                      </span>
                      <div className="space-y-1.5">
                        {analysis.itemsSkipped.map(({ tool, installedVersion }) => (
                          <div
                            key={tool.id}
                            className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-1"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                {tool.name}
                              </span>
                              <span className="text-[10px] font-mono text-emerald-500 font-medium">
                                {installedVersion ? `v${installedVersion}` : 'Terdeteksi'} (Dilewati)
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                              {tool.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.allInstalled && !forceAll && (
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-center space-y-1">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                      <p className="text-xs font-semibold text-emerald-400">
                        Semua komponen template ini sudah terpasang!
                      </p>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        Tidak ada instalasi baru yang diperlukan. Centang "Paksa pasang ulang" bila ingin memperbaiki.
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Safety Notice Box */}
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] flex items-start gap-3 text-xs text-[var(--muted-foreground)] leading-relaxed">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>{t('templates.terminalNotice')}</span>
              </div>
            </div>

            {/* Right Column: Editable Script Preview & Execution */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <Card className="p-5 flex-1 flex flex-col space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[var(--muted-foreground)]" />
                      {t('templates.scriptPreview')}
                    </h3>
                    {isScriptCustomized && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
                        {t('templates.scriptEditedBadge')}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Reset Button (only shown if script was customized) */}
                    {isScriptCustomized && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleResetScript}
                        className="h-7 text-xs gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        title={t('templates.resetScript')}
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        <span>{t('templates.resetScript')}</span>
                      </Button>
                    )}

                    {/* Copy Button */}
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

                <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                  Anda dapat meninjau dan mengedit langsung baris perintah bash di bawah ini sebelum menjalankannya di server.
                </p>

                {/* Editable Bash Script Editor */}
                <div className="flex-1 flex flex-col rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden focus-within:ring-1 focus-within:ring-[var(--primary)] min-h-[380px]">
                  <div className="px-3 py-1.5 border-b border-zinc-800/80 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/40 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500/40 inline-block" />
                      <span className="ml-2 text-zinc-500">bash setup script</span>
                    </span>
                    <span>
                      {activeScript.split('\n').length} baris · {activeScript.length} karakter
                    </span>
                  </div>

                  <textarea
                    value={activeScript}
                    onChange={(e) => setCustomScript(e.target.value)}
                    spellCheck={false}
                    className="w-full flex-1 p-4 bg-transparent text-zinc-200 font-mono text-xs leading-relaxed outline-none resize-none overflow-auto whitespace-pre selection:bg-[var(--primary)]/30 min-h-[350px]"
                  />
                </div>

                {/* Bottom Actions Bar */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border)]">
                  <div className="text-[11px] text-[var(--muted-foreground)]">
                    Target: <span className="font-mono text-[var(--foreground)] font-medium">{server.username}@{server.host}</span>
                  </div>

                  <Button
                    size="default"
                    onClick={handleRunPresetInTerminal}
                    disabled={executingPreset}
                    className="gap-2 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 shadow-lg shadow-[var(--primary)]/20"
                  >
                    {executingPreset ? (
                      <RotateCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Terminal className="w-4 h-4" />
                    )}
                    <span>{t('templates.btnRunInTerminal')}</span>
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: MARKETPLACE / TOOL STORE (1-CLICK INSTALL) */}
      {activeSubTab === 'marketplace' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Marketplace Filter & Search Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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

            {/* Search Input */}
            <div className="relative w-full md:w-72 shrink-0">
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

                const selectedVersion = toolVersions[tool.id] || tool.defaultVersion || tool.versions?.[0]?.value;

                return (
                  <Card
                    key={tool.id}
                    className="p-5 flex flex-col justify-between space-y-4 hover:border-[var(--muted-foreground)]/30 transition-all shadow-sm"
                  >
                    <div className="space-y-3">
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="p-2 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] shrink-0">
                            <BrandIcon
                              name={tool.id}
                              className="w-5 h-5"
                              fallback={<Package className="w-5 h-5 text-[var(--muted-foreground)]" />}
                            />
                          </span>
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-[var(--foreground)] truncate">
                              {tool.name}
                            </h4>
                            <span className="text-[10px] font-mono text-[var(--muted-foreground)] uppercase">
                              {tool.category}
                            </span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <Badge
                          variant={isInstalled ? 'success' : 'outline'}
                          className="text-[10px] py-0.5 px-2 font-mono shrink-0"
                        >
                          {isInstalled
                            ? `✓ ${installedItem.version ? `v${installedItem.version}` : 'Terpasang'}`
                            : 'Belum Ada'}
                        </Badge>
                      </div>

                      {/* Tool Description */}
                      <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                        {tool.description}
                      </p>

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
                            className="bg-[var(--background)] border border-[var(--border)] rounded-md px-2 py-0.5 text-xs text-[var(--foreground)] font-mono"
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

                    {/* Bottom Action Button */}
                    <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)] truncate">
                        ID: {tool.id}
                      </span>

                      <Button
                        size="sm"
                        variant={isInstalled ? 'outline' : 'default'}
                        onClick={() => handleInstallMarketplaceTool(tool)}
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
                          <Terminal className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isInstalled ? 'Pasang Ulang' : t('templates.btnInstallTool')}
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
    </div>
  );
}
