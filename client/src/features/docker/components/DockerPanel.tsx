import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cacheGet, cacheSet } from '@/shared/lib/cache';
import {
  RefreshCw, Play, Square, RotateCw, Pause, Trash2, ScrollText, Terminal as TermIcon, Info, ChevronDown, ChevronRight,
  Box, HardDrive, Layers, Download, X, FolderOpen, AlertTriangle, Plus, Network as NetIcon, Database, ExternalLink,
  CheckCircle2, AlertCircle, KeyRound, Code2, ShieldCheck, Sparkles, Copy, Check
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import {
  fetchDocker,
  inspectDocker,
  dockerContainerAction,
  dockerComposeAction,
  dockerPrune,
  dockerRemoveImage,
  dockerRemoveVolume,
  dockerInspectVolume,
  dockerRemoveNetwork,
  dockerInspectNetwork,
  DockerOverview,
  DockerContainer,
  DockerInspect,
  DockerVolume,
  DockerNetwork
} from '@/features/docker/api';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Skeleton, RowsSkeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import {
  executeSoftwareScript,
  recordTemplateRun,
  updateServer
} from '@/features/servers/api';
import {
  MARKETPLACE_CATALOG,
  generateSingleToolScript,
  formatTerminalCommand
} from '@/features/servers/lib/templates';
import { SudoPasswordModal } from '@/features/servers/components/SudoPasswordModal';

import { PullImageModal } from './PullImageModal';
import { VolumeModal } from './VolumeModal';
import { NetworkModal } from './NetworkModal';
import { RunContainerModal } from './RunContainerModal';
import { ComposeStudioModal } from './ComposeStudioModal';
import { ContainerLogsModal } from './ContainerLogsModal';

interface DockerPanelProps {
  serverId: string;
  serverHost: string;
  serverName?: string;
  serverUsername?: string;
  onLogs: (containerName: string) => void;
  onShell: (command: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenTerminal?: (command?: string) => void;
  onOpenTemplates?: () => void;
}

type View = 'containers' | 'compose' | 'images' | 'volumes' | 'networks' | 'disk';

const stateColor = (c: DockerContainer) =>
  c.health === 'unhealthy' ? 'bg-amber-500' : c.state === 'running' ? 'bg-emerald-500' : c.state === 'paused' ? 'bg-sky-500' : c.state === 'restarting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500';

const barColor = (v: number) => (v >= 90 ? 'bg-red-500' : v >= 70 ? 'bg-amber-400' : 'bg-emerald-500');

// Only public host bindings become links (127.0.0.1 binds aren't reachable from the browser).
const hostPorts = (ports: string) =>
  [...new Set([...ports.matchAll(/(?:0\.0\.0\.0|\[::\]):(\d+)->/g)].map((m) => m[1]))];

export default function DockerPanel({
  serverId,
  serverHost,
  serverName,
  serverUsername,
  onLogs,
  onShell,
  onOpenFolder,
  onOpenTerminal,
  onOpenTemplates
}: DockerPanelProps) {
  const t = useT();
  const cacheKey = `docker:${serverId}`;
  const [data, setData] = useState<DockerOverview | null>(() => cacheGet<DockerOverview>(cacheKey) ?? null);
  const [loading, setLoading] = useState(() => !cacheGet(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('containers');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | 'running' | 'stopped' | 'unhealthy'>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<{ title: string; text: string; ok: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [inspect, setInspect] = useState<DockerInspect | null>(null);
  const [inspectGeneric, setInspectGeneric] = useState<{ title: string; data: any } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Modals state
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [isVolumeModalOpen, setIsVolumeModalOpen] = useState(false);
  const [isNetworkModalOpen, setIsNetworkModalOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [composeModal, setComposeModal] = useState<{
    open: boolean;
    project?: string;
    workingDir?: string;
    configFile?: string;
  }>({ open: false });
  const [logsModal, setLogsModal] = useState<{
    open: boolean;
    id: string;
    name: string;
  }>({ open: false, id: '', name: '' });

  // Docker 1-Click Installer state
  const [installingDocker, setInstallingDocker] = useState(false);
  const [dockerInstallResult, setDockerInstallResult] = useState<{
    ok: boolean;
    exitCode: number;
    output: string;
    durationMs: number;
    sudoRequired?: boolean;
  } | null>(null);
  const [dockerPromptSudo, setDockerPromptSudo] = useState(false);
  const [dockerSudoPassword, setDockerSudoPassword] = useState('');
  const [dockerRememberSudo, setDockerRememberSudo] = useState(true);
  const [sudoModalOpen, setSudoModalOpen] = useState(false);
  const [pendingSudoAction, setPendingSudoAction] = useState<((password: string) => Promise<void>) | null>(null);
  const [showDockerScriptModal, setShowDockerScriptModal] = useState(false);
  const [customDockerScript, setCustomDockerScript] = useState<string | null>(null);
  const [copiedDockerScript, setCopiedDockerScript] = useState(false);

  const dockerTool = useMemo(
    () => MARKETPLACE_CATALOG.find((m) => m.id === 'docker'),
    []
  );

  const activeDockerScript = useMemo(() => {
    if (customDockerScript !== null) return customDockerScript;
    if (dockerTool) return generateSingleToolScript(dockerTool);
    return `#!/usr/bin/env bash\nset -e\nexport DEBIAN_FRONTEND=noninteractive\ncurl -fsSL https://get.docker.com | sh\nsystemctl enable --now docker\ngroupadd -f docker 2>/dev/null || true\n[ -n "$SUDO_USER" ] && usermod -aG docker "$SUDO_USER" 2>/dev/null || true\nusermod -aG docker $(whoami) 2>/dev/null || true\nchmod 666 /var/run/docker.sock 2>/dev/null || true\n`;
  }, [customDockerScript, dockerTool]);

  const handleSudoConfirm = async (password: string, remember: boolean) => {
    if (remember) {
      await updateServer(serverId, { sudoPassword: password }).catch(() => {});
    }
    setDockerSudoPassword(password);
    setSudoModalOpen(false);
    if (pendingSudoAction) {
      const act = pendingSudoAction;
      setPendingSudoAction(null);
      await act(password);
    } else {
      await handleInstallDocker(password);
    }
  };

  const handleInstallDocker = async (overridePassword?: string) => {
    setInstallingDocker(true);
    setDockerInstallResult(null);
    try {
      await recordTemplateRun(serverId, {
        templateName: 'Docker Engine (CE)',
        templateId: 'docker',
        installed: 'docker',
        skipped: ''
      }).catch(() => {});

      const pass = overridePassword !== undefined ? overridePassword : (dockerSudoPassword || undefined);
      const res = await executeSoftwareScript(serverId, activeDockerScript, pass);
      setDockerInstallResult(res);

      const isSudo =
        res.sudoRequired ||
        res.exitCode === 126 ||
        /sudo:.*(password|terminal|askpass|incorrect)/i.test(res.output || '') ||
        /a terminal is required/i.test(res.output || '') ||
        /password.*required/i.test(res.output || '');

      if (isSudo) {
        setDockerPromptSudo(true);
        setPendingSudoAction(() => (pw: string) => handleInstallDocker(pw));
        setSudoModalOpen(true);
        toast.warning('Sudo authentication required to install Docker packages.');
      } else if (res.ok) {
        if (pass && dockerRememberSudo) {
          await updateServer(serverId, { sudoPassword: pass }).catch(() => {});
        }
        setDockerPromptSudo(false);
        setSudoModalOpen(false);
        toast.success('Docker Engine successfully installed!');
        await load(true);
      } else {
        toast.error(`Docker installation completed with exit code ${res.exitCode}`);
      }
    } catch (e: any) {
      setDockerInstallResult({
        ok: false,
        exitCode: 1,
        output: e.message || 'Failed to execute Docker installation on server',
        durationMs: 0
      });
      toast.error(e.message || 'Docker installation failed');
    } finally {
      setInstallingDocker(false);
    }
  };

  const handleOpenDockerInTerminal = () => {
    if (!onOpenTerminal) return;
    const cmd = formatTerminalCommand(activeDockerScript, '/tmp/7server-install-docker.sh');
    onOpenTerminal(cmd);
  };

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await fetchDocker(serverId);
      cacheSet(cacheKey, d);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(!!cacheGet(cacheKey)); }, [serverId]);
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => !document.hidden && load(true), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, serverId]);

  const run = async (key: string, title: string, fn: () => Promise<string>, confirmMsg?: string) => {
    if (confirmMsg) {
      const ok = await confirmModal({
        title,
        message: confirmMsg,
        variant: 'danger',
        confirmText: t('docker.proceed')
      });
      if (!ok) return;
    }
    setBusy(key);
    try {
      const text = await fn();
      setOutput({ title, text: text || 'OK', ok: true });
      await load(true);
    } catch (e: any) {
      setOutput({ title, text: e.message, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const act = (c: DockerContainer, action: string, confirm?: string) =>
    run(`${c.id}:${action}`, `${action} ${c.name}`, () => dockerContainerAction(serverId, c.id, action), confirm);

  const compose = (project: string, dir: string, files: string, action: string, confirm?: string) =>
    run(`compose:${project}:${action}`, `compose ${action} · ${project}`, () => dockerComposeAction(serverId, project, dir, action, files), confirm);

  const openInspect = async (c: DockerContainer) => {
    try {
      setInspect(await inspectDocker(serverId, c.id));
    } catch (e: any) {
      setOutput({ title: `inspect ${c.name}`, text: e.message, ok: false });
    }
  };

  const openInspectVol = async (v: DockerVolume) => {
    try {
      const data = await dockerInspectVolume(serverId, v.name);
      setInspectGeneric({ title: `Volume: ${v.name}`, data });
    } catch (e: any) {
      setOutput({ title: `inspect ${v.name}`, text: e.message, ok: false });
    }
  };

  const openInspectNet = async (n: DockerNetwork) => {
    try {
      const data = await dockerInspectNetwork(serverId, n.name);
      setInspectGeneric({ title: `Network: ${n.name}`, data });
    } catch (e: any) {
      setOutput({ title: `inspect ${n.name}`, text: e.message, ok: false });
    }
  };

  const containers = data?.containers || [];
  const q = query.toLowerCase();
  const filtered = containers.filter((c) => {
    if (q && !`${c.name} ${c.image} ${c.project} ${c.ports}`.toLowerCase().includes(q)) return false;
    if (stateFilter === 'running') return c.state === 'running';
    if (stateFilter === 'stopped') return c.state !== 'running';
    if (stateFilter === 'unhealthy') return c.health === 'unhealthy' || c.state === 'restarting' || c.state === 'exited';
    return true;
  });

  // Group by compose project; standalone containers go last.
  const groups = useMemo(() => {
    const m = new Map<string, DockerContainer[]>();
    for (const c of filtered) {
      const k = c.project || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [filtered]);

  // Extract all compose projects for the compose tab
  const composeProjects = useMemo(() => {
    const map = new Map<string, { project: string; dir: string; files: string; containers: DockerContainer[] }>();
    for (const c of containers) {
      if (!c.project) continue;
      if (!map.has(c.project)) {
        map.set(c.project, {
          project: c.project,
          dir: c.workingDir,
          files: c.configFiles,
          containers: []
        });
      }
      map.get(c.project)!.containers.push(c);
    }
    return [...map.values()].sort((a, b) => a.project.localeCompare(b.project));
  }, [containers]);

  const running = containers.filter((c) => c.state === 'running').length;
  const unhealthy = containers.filter((c) => c.health === 'unhealthy' || c.state === 'restarting').length;
  const totalCpu = containers.reduce((s, c) => s + (c.cpu || 0), 0);

  if (loading && !data) {
    return (
      <div role="status" aria-label={t('docker.reading')} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
        <RowsSkeleton rows={6} className="p-0" />
      </div>
    );
  }
  if (error && !data) return <p role="alert" className="text-xs text-red-500 p-4">{error}</p>;
  if (data && !data.installed) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto py-4">
        {/* Hero Card */}
        <div className="p-6 sm:p-8 rounded-2xl border border-[var(--border)] bg-gradient-to-b from-sky-500/10 via-[var(--card)] to-[var(--card)] relative overflow-hidden shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0 flex items-center justify-center w-16 h-16 shadow-inner">
              <BrandIcon name="docker" className="w-10 h-10" fallback={<Box className="w-10 h-10 text-sky-400" />} />
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-[var(--foreground)] tracking-tight">
                  Docker Engine & Docker Compose
                </h3>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px] font-mono">
                  Not Installed
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-[var(--muted-foreground)] leading-relaxed max-w-2xl">
                Docker is not detected on this server. Run containers, microservices, and Docker Compose application stacks by installing the official Docker Community Edition with 1 click directly via SSH.
              </p>
            </div>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-[var(--border)]/70">
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                <BrandIcon name="docker" className="w-4 h-4 text-sky-400" />
                <span>Docker Engine (CE)</span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                Production-grade container daemon, CLI (<code className="font-mono text-[10px]">docker run</code>, <code className="font-mono text-[10px]">docker ps</code>), and containerd runtime.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Docker Compose v2</span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                Native compose plugin orchestrating multi-container services with <code className="font-mono text-[10px]">docker-compose.yml</code> stacks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/60 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)]">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <span>Buildx & Auto-Start</span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)] leading-snug">
                Multi-architecture builder subsystem enabled and auto-started on system boot via systemd.
              </p>
            </div>
          </div>

          {/* Sudo Password Required Prompt */}
          {dockerPromptSudo && (
            <div className="mt-5 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-3 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <KeyRound className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-amber-300">
                    Sudo Password Required
                  </h4>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    The remote user requires root/sudo privileges to install Docker packages on this server.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="password"
                  placeholder="Enter sudo password..."
                  value={dockerSudoPassword}
                  onChange={(e) => setDockerSudoPassword(e.target.value)}
                  className="h-8 text-xs bg-black/50 border-amber-500/40 text-zinc-100 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && dockerSudoPassword.trim()) {
                      handleInstallDocker(dockerSudoPassword);
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!dockerSudoPassword.trim() || installingDocker}
                  onClick={() => handleInstallDocker(dockerSudoPassword)}
                  className="h-8 text-xs gap-1.5 font-semibold bg-amber-500 hover:bg-amber-600 text-zinc-950 shrink-0"
                >
                  <Play className="w-3 h-3" />
                  <span>Authenticate & Install</span>
                </Button>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={dockerRememberSudo}
                  onChange={(e) => setDockerRememberSudo(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-0"
                />
                <span>Remember sudo password for this server (encrypted with AES-256-GCM)</span>
              </label>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 border-t border-[var(--border)]/70">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                disabled={installingDocker}
                onClick={() => handleInstallDocker()}
                className="h-9 px-4 text-xs gap-2 font-semibold bg-sky-500 hover:bg-sky-600 text-white shadow-md shadow-sky-500/20"
              >
                {installingDocker ? (
                  <RotateCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-white" />
                )}
                <span>
                  {installingDocker ? 'Installing Docker on Server...' : 'Install Docker & Compose Now (Live)'}
                </span>
              </Button>

              {onOpenTerminal && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={installingDocker}
                  onClick={handleOpenDockerInTerminal}
                  className="h-9 text-xs gap-1.5"
                >
                  <TermIcon className="w-3.5 h-3.5" />
                  <span>Open in Terminal</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                disabled={installingDocker}
                onClick={() => setShowDockerScriptModal(true)}
                className="h-9 text-xs gap-1.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>View Setup Script</span>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {onOpenTemplates && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onOpenTemplates}
                  className="h-8 text-xs gap-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Setup Templates</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => load(true)}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Re-check</span>
              </Button>
            </div>
          </div>

          {/* Live Execution Output Box */}
          {(installingDocker || dockerInstallResult) && (
            <div className="mt-5 rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden">
              <div className="px-3.5 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs">
                <span className="font-mono text-[11px] text-zinc-300 flex items-center gap-2">
                  {installingDocker ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                      <span>Setting up Docker GPG key, repository, and installing packages...</span>
                    </>
                  ) : dockerInstallResult?.ok ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">
                        Docker Installation Complete ({(dockerInstallResult.durationMs / 1000).toFixed(1)}s)
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-red-400 font-semibold">
                        Failed (Exit Code: {dockerInstallResult?.exitCode})
                      </span>
                    </>
                  )}
                </span>
              </div>
              {dockerInstallResult && (
                <pre className="p-3.5 text-[11px] font-mono text-zinc-300 max-h-60 overflow-auto whitespace-pre-wrap leading-relaxed">
                  {dockerInstallResult.output || '(No stdout output)'}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Script Inspector Modal */}
        {showDockerScriptModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/20">
                <div className="flex items-center gap-2">
                  <BrandIcon name="docker" className="w-5 h-5 text-sky-400" />
                  <span className="text-sm font-bold text-[var(--foreground)]">
                    Docker Engine & Compose Setup Script
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDockerScriptModal(false)}
                  className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3 flex-1 overflow-y-auto">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Bash Setup Script (Editable)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeDockerScript);
                      setCopiedDockerScript(true);
                      setTimeout(() => setCopiedDockerScript(false), 2000);
                    }}
                    className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1"
                  >
                    {copiedDockerScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedDockerScript ? 'Copied' : 'Copy Script'}</span>
                  </button>
                </div>

                <textarea
                  value={activeDockerScript}
                  onChange={(e) => setCustomDockerScript(e.target.value)}
                  disabled={installingDocker}
                  rows={10}
                  spellCheck={false}
                  className="w-full p-3.5 rounded-xl border border-zinc-800 bg-[#09090b] text-zinc-200 font-mono text-xs leading-relaxed outline-none focus:ring-1 focus:ring-sky-500 resize-y"
                />
              </div>

              <div className="p-4 border-t border-[var(--border)] bg-[var(--muted)]/20 flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDockerScriptModal(false)}
                  className="h-8 text-xs"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  disabled={installingDocker}
                  onClick={() => {
                    setShowDockerScriptModal(false);
                    handleInstallDocker();
                  }}
                  className="h-8 text-xs gap-1.5 font-semibold bg-sky-500 hover:bg-sky-600 text-white"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Execute This Script</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const ActionBtn = ({ k, title, onClick, children, danger }: { k: string; title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
    <Button
      variant="ghost" size="icon" title={title} aria-label={title} onClick={onClick} disabled={!!busy}
      className={`h-6 w-6 ${danger ? 'hover:text-red-500' : ''}`}
    >
      {busy === k ? <RefreshCw className="w-3 h-3 animate-spin" /> : children}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* Top Telemetry Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          [t('docker.containers'), `${running}/${containers.length}`, t('docker.subRunning')],
          [t('docker.unhealthy'), String(unhealthy), unhealthy ? t('docker.subUnhealthy') : t('docker.subHealthy')],
          [t('docker.totalCpu'), `${totalCpu.toFixed(1)}%`, t('docker.allContainers')],
          ['Docker', `v${data?.version}`, `compose ${data?.composeVersion || '–'}`]
        ].map(([label, value, sub], i) => (
          <div key={label} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
            <div className="text-[11px] text-[var(--muted-foreground)]">{label}</div>
            <div className={`text-xl font-bold font-mono ${i === 1 && unhealthy ? 'text-amber-500' : ''}`}>{value}</div>
            <div className="text-[10px] text-[var(--muted-foreground)]">{sub}</div>
          </div>
        ))}
      </div>

      {/* Main Navigation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap rounded-lg border border-[var(--border)] p-0.5 bg-[var(--muted)]/40" role="tablist">
          {([
            ['containers', t('docker.containers'), Box],
            ['compose', t('docker.compose'), Layers],
            ['images', t('docker.images', { count: data?.images.length || 0 }), Download],
            ['volumes', t('docker.volumes', { count: data?.volumes?.length || 0 }), Database],
            ['networks', t('docker.networks', { count: data?.networks?.length || 0 }), NetIcon],
            ['disk', t('docker.disk'), HardDrive]
          ] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md flex items-center gap-1.5 transition-all font-medium ${
                view === v ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm font-semibold' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Action Buttons for current active tab */}
        <div className="flex items-center gap-2">
          {view === 'containers' && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsRunModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> {t('docker.runContainer')}
            </Button>
          )}
          {view === 'compose' && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setComposeModal({ open: true })}>
              <Plus className="w-3.5 h-3.5" /> {t('docker.newStack')}
            </Button>
          )}
          {view === 'images' && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsPullModalOpen(true)}>
              <Download className="w-3.5 h-3.5" /> {t('docker.pullImage')}
            </Button>
          )}
          {view === 'volumes' && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsVolumeModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> {t('docker.createVolume')}
            </Button>
          )}
          {view === 'networks' && (
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setIsNetworkModalOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> {t('docker.createNetwork')}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Sub-toolbar Filters for Containers */}
      {view === 'containers' && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={t('docker.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 w-56 text-xs font-mono"
          />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as typeof stateFilter)}
            aria-label={t('docker.filterStatus')}
            className="h-7 text-[11px] bg-[var(--background)] border border-[var(--border)] rounded px-1.5"
          >
            <option value="all">{t('docker.all')}</option>
            <option value="running">{t('docker.running')}</option>
            <option value="stopped">{t('docker.stopped')}</option>
            <option value="unhealthy">{t('docker.unhealthy')}</option>
          </select>
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            {t('docker.autoRefresh')}
          </label>
        </div>
      )}

      {output && (
        <div className={`p-3 rounded-lg border text-xs relative ${output.ok ? 'border-[var(--border)] bg-[var(--card)]' : 'border-red-500/30 bg-red-500/10'}`}>
          <button onClick={() => setOutput(null)} className="absolute right-2 top-2" aria-label={t('docker.closeOutput')}><X className="w-3.5 h-3.5" /></button>
          <div className={`font-semibold mb-1 ${output.ok ? '' : 'text-red-500'}`}>{output.title}</div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] max-h-60 overflow-auto">{output.text}</pre>
        </div>
      )}

      {/* TAB 1: CONTAINERS */}
      {view === 'containers' && (
        <div className="space-y-3">
          {groups.length === 0 && <p className="text-xs text-[var(--muted-foreground)] text-center py-10">{t('docker.emptyContainers')}</p>}
          {groups.map(([project, list]) => {
            const dir = list[0]?.workingDir || '';
            const files = list[0]?.configFiles || '';
            const isOpen = !collapsed.has(project);
            const up = list.filter((c) => c.state === 'running').length;
            return (
              <div key={project || '_standalone'} className="border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[var(--muted)]">
                  <button
                    className="flex items-center gap-1.5 text-xs font-semibold"
                    aria-expanded={isOpen}
                    onClick={() => setCollapsed((s) => { const n = new Set(s); n.has(project) ? n.delete(project) : n.add(project); return n; })}
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    {project ? <>🐳 {project}</> : t('docker.standalone')}
                    <span className="font-normal text-[var(--muted-foreground)]">({t('docker.groupRunning', { up, total: list.length })})</span>
                  </button>
                  {dir && (
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] truncate sensitive" title={files}>
                      {files ? files.split(',').map((f) => f.split('/').pop()).join(', ') : dir}
                    </span>
                  )}
                  {project && dir && (
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => onOpenFolder(dir)} title={t('docker.openFolder')}>
                        <FolderOpen className="w-3 h-3" /> {t('common.files')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] gap-1"
                        onClick={() => setComposeModal({ open: true, project, workingDir: dir, configFile: files ? files.split(',')[0] : 'docker-compose.yml' })}
                      >
                        <Layers className="w-3 h-3" /> Edit Stack
                      </Button>
                      {([
                        ['restart', t('docker.restart'), RotateCw, t('docker.composeRestartConfirm', { project })],
                        ['pull-up', 'Pull & Up', Download, t('docker.composePullConfirm', { project })],
                        ['up', 'Up', Play, undefined],
                        ['stop', t('docker.stop'), Square, t('docker.composeStopConfirm', { project })]
                      ] as const).map(([a, label, Icon, confirm]) => (
                        <Button
                          key={a} variant="outline" size="sm" className="h-6 text-[10px] gap-1" disabled={!!busy}
                          onClick={() => compose(project, dir, files, a, confirm)}
                        >
                          {busy === `compose:${project}:${a}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />} {label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-[10px] text-[var(--muted-foreground)] text-left">
                        <tr className="border-b border-[var(--border)]">
                          <th className="py-1.5 px-3">{t('docker.thContainer')}</th>
                          <th className="py-1.5 px-3">{t('docker.thStatus')}</th>
                          <th className="py-1.5 px-3 w-28">CPU</th>
                          <th className="py-1.5 px-3 w-36">{t('docker.thMemory')}</th>
                          <th className="py-1.5 px-3">{t('docker.thPorts')}</th>
                          <th className="py-1.5 px-3 text-right">{t('docker.thActions')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {list.map((c) => {
                          const isRunning = c.state === 'running';
                          const links = hostPorts(c.ports);
                          return (
                            <tr key={c.id} className="hover:bg-[var(--muted)]/40">
                              <td className="py-1.5 px-3">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${stateColor(c)}`} aria-hidden />
                                  <div className="min-w-0">
                                    <div className="font-semibold font-mono truncate">{c.name}</div>
                                    <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate max-w-xs flex items-center gap-1" title={c.image}>
                                      <BrandIcon name={c.image} className="w-3 h-3" />
                                      {c.image}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-1.5 px-3 whitespace-nowrap">
                                <span className={c.health === 'unhealthy' ? 'text-amber-500 font-semibold' : isRunning ? '' : 'text-red-500'}>
                                  {c.health === 'unhealthy' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                  {c.status}
                                </span>
                              </td>
                              <td className="py-1.5 px-3">
                                {c.cpu != null && isRunning ? (
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 rounded bg-[var(--muted)] overflow-hidden">
                                      <div className={`h-full ${barColor(c.cpu)}`} style={{ width: `${Math.min(100, c.cpu)}%` }} />
                                    </div>
                                    <span className="font-mono text-[10px] w-10 text-right">{c.cpu.toFixed(1)}%</span>
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]">–</span>}
                              </td>
                              <td className="py-1.5 px-3">
                                {c.memUsage && isRunning ? (
                                  <div title={c.memUsage}>
                                    <div className="h-1.5 rounded bg-[var(--muted)] overflow-hidden">
                                      <div className={`h-full ${barColor(c.memPercent || 0)}`} style={{ width: `${Math.min(100, c.memPercent || 0)}%` }} />
                                    </div>
                                    <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{c.memUsage.split(' / ')[0]}</span>
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]">–</span>}
                              </td>
                              <td className="py-1.5 px-3 font-mono text-[10px]">
                                {links.length ? (
                                  <div className="flex flex-wrap gap-1">
                                    {links.map((p) => (
                                      <a key={p} href={`http://${serverHost}:${p}`} target="_blank" rel="noopener noreferrer"
                                        className="px-1.5 rounded bg-[var(--muted)] border border-[var(--border)] hover:underline">:{p}</a>
                                    ))}
                                  </div>
                                ) : <span className="text-[var(--muted-foreground)]" title={c.ports}>{c.ports ? t('docker.internal') : '–'}</span>}
                              </td>
                              <td className="py-1.5 px-3 text-right whitespace-nowrap">
                                <ActionBtn k={`${c.id}:live-logs`} title={t('docker.liveLogs')} onClick={() => setLogsModal({ open: true, id: c.id, name: c.name })}>
                                  <ScrollText className="w-3 h-3 text-[var(--accent)]" />
                                </ActionBtn>
                                {isRunning && (
                                  <ActionBtn k={`${c.id}:shell`} title={t('docker.shell')} onClick={() => onShell(`docker exec -it ${c.name} sh -c 'command -v bash >/dev/null && exec bash || exec sh'`)}>
                                    <TermIcon className="w-3 h-3" />
                                  </ActionBtn>
                                )}
                                <ActionBtn k={`${c.id}:inspect`} title={t('docker.inspect')} onClick={() => openInspect(c)}><Info className="w-3 h-3" /></ActionBtn>
                                <ActionBtn k={`${c.id}:restart`} title={t('docker.restart')} onClick={() => act(c, 'restart')}><RotateCw className="w-3 h-3" /></ActionBtn>
                                {c.state === 'paused' ? (
                                  <ActionBtn k={`${c.id}:unpause`} title={t('docker.unpause')} onClick={() => act(c, 'unpause')}><Play className="w-3 h-3" /></ActionBtn>
                                ) : isRunning ? (
                                  <>
                                    <ActionBtn k={`${c.id}:pause`} title={t('docker.pause')} onClick={() => act(c, 'pause')}><Pause className="w-3 h-3" /></ActionBtn>
                                    <ActionBtn k={`${c.id}:stop`} title={t('docker.stop')} danger onClick={() => act(c, 'stop', t('docker.stopConfirm', { name: c.name }))}><Square className="w-3 h-3" /></ActionBtn>
                                  </>
                                ) : (
                                  <>
                                    <ActionBtn k={`${c.id}:start`} title={t('docker.start')} onClick={() => act(c, 'start')}><Play className="w-3 h-3" /></ActionBtn>
                                    <ActionBtn k={`${c.id}:rm`} title={t('docker.removeContainer')} danger
                                      onClick={() => act(c, 'rm', t('docker.removeContainerConfirm', { name: c.name }))}>
                                      <Trash2 className="w-3 h-3" />
                                    </ActionBtn>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: COMPOSE STACKS */}
      {view === 'compose' && (
        <div className="space-y-3">
          {composeProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center text-xs text-[var(--muted-foreground)]">
              <Layers className="mx-auto mb-2 h-8 w-8 opacity-40" />
              <p className="font-semibold text-[var(--foreground)]">No Docker Compose stacks found</p>
              <p className="mt-1">Deploy multi-container stacks using the "+ New Stack" button above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {composeProjects.map((cp) => {
                const runningCnt = cp.containers.filter((c) => c.state === 'running').length;
                return (
                  <div key={cp.project} className="metal flex flex-col justify-between rounded-xl border border-[var(--border)] p-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-semibold flex items-center gap-2">
                          <Layers className="w-4 h-4 text-[var(--accent)]" />
                          {cp.project}
                        </span>
                        <span className="font-mono text-xs rounded-full bg-[var(--muted)] px-2 py-0.5">
                          {runningCnt}/{cp.containers.length} active
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <p className="font-mono text-[11px] text-[var(--muted-foreground)] truncate" title={cp.dir}>
                          Dir: {cp.dir}
                        </p>
                        <p className="font-mono text-[11px] text-[var(--muted-foreground)] truncate" title={cp.files}>
                          Config: {cp.files || 'docker-compose.yml'}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cp.containers.map((c) => (
                          <span key={c.id} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-0.5 font-mono text-[10px]">
                            <span className={`w-1.5 h-1.5 rounded-full ${stateColor(c)}`} />
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setComposeModal({ open: true, project: cp.project, workingDir: cp.dir, configFile: cp.files ? cp.files.split(',')[0] : 'docker-compose.yml' })}
                      >
                        <Layers className="w-3 h-3" /> Edit Stack
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => onOpenFolder(cp.dir)}
                        >
                          <FolderOpen className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => compose(cp.project, cp.dir, cp.files, 'restart', t('docker.composeRestartConfirm', { project: cp.project }))}
                        >
                          <RotateCw className="w-3 h-3" /> Restart
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => compose(cp.project, cp.dir, cp.files, 'pull-up', t('docker.composePullConfirm', { project: cp.project }))}
                        >
                          <Download className="w-3 h-3" /> Pull & Up
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: IMAGES */}
      {view === 'images' && (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[var(--muted)] text-[10px] text-[var(--muted-foreground)] text-left">
              <tr>
                <th className="py-2 px-3">{t('docker.thRepository')}</th>
                <th className="py-2 px-3">{t('docker.thTag')}</th>
                <th className="py-2 px-3 text-right">{t('docker.thSize')}</th>
                <th className="py-2 px-3">{t('docker.thCreated')}</th>
                <th className="py-2 px-3">{t('docker.thStatus')}</th>
                <th className="py-2 px-3 text-right">{t('docker.thActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {data?.images.map((img) => {
                const ref = img.repo === '<none>' ? img.id : `${img.repo}:${img.tag}`;
                return (
                  <tr key={img.id + img.tag}>
                    <td className="py-1.5 px-3 max-w-sm truncate" title={img.repo}>
                      <span className="inline-flex items-center gap-1.5">
                        <BrandIcon name={img.repo} className="w-3.5 h-3.5" />
                        {img.repo}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-[var(--muted-foreground)]">{img.tag}</td>
                    <td className="py-1.5 px-3 text-right">{img.size}</td>
                    <td className="py-1.5 px-3 text-[var(--muted-foreground)] font-sans">{img.createdSince}</td>
                    <td className="py-1.5 px-3 font-sans">
                      {img.inUse ? <span className="text-emerald-600 font-medium">{t('docker.inUse')}</span> : <span className="text-[var(--muted-foreground)]">{t('docker.unused')}</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {!img.inUse && (
                        <ActionBtn k={`img:${img.id}`} title={t('docker.removeImage')} danger
                          onClick={() => run(`img:${img.id}`, `rmi ${ref}`, () => dockerRemoveImage(serverId, ref), t('docker.removeImageConfirm', { ref }))}>
                          <Trash2 className="w-3 h-3" />
                        </ActionBtn>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: VOLUMES */}
      {view === 'volumes' && (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[var(--muted)] text-[10px] text-[var(--muted-foreground)] text-left">
              <tr>
                <th className="py-2 px-3">{t('docker.volumeName')}</th>
                <th className="py-2 px-3">{t('docker.driver')}</th>
                <th className="py-2 px-3">{t('docker.scope')}</th>
                <th className="py-2 px-3">{t('docker.attachedContainers')}</th>
                <th className="py-2 px-3 text-right">{t('docker.thActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {(!data?.volumes || data.volumes.length === 0) ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--muted-foreground)]">
                    {t('docker.emptyVolumes')}
                  </td>
                </tr>
              ) : (
                data.volumes.map((vol) => (
                  <tr key={vol.name} className="hover:bg-[var(--muted)]/40">
                    <td className="py-2 px-3 font-semibold text-[var(--foreground)]">{vol.name}</td>
                    <td className="py-2 px-3 text-[var(--muted-foreground)]">{vol.driver}</td>
                    <td className="py-2 px-3 text-[var(--muted-foreground)]">{vol.scope}</td>
                    <td className="py-2 px-3">
                      {vol.containers && vol.containers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {vol.containers.map((c) => (
                            <span key={c} className="rounded bg-[var(--muted)] px-1.5 py-0.2 text-[10px] text-emerald-500 font-medium border border-[var(--border)]">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[var(--muted-foreground)]">{t('docker.unused')}</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right whitespace-nowrap">
                      <ActionBtn k={`vol:insp:${vol.name}`} title="Inspect volume" onClick={() => openInspectVol(vol)}>
                        <Info className="w-3 h-3" />
                      </ActionBtn>
                      {!vol.inUse && (
                        <ActionBtn
                          k={`vol:rm:${vol.name}`}
                          title={t('docker.removeVolume')}
                          danger
                          onClick={() => run(`vol:rm:${vol.name}`, `volume rm ${vol.name}`, () => dockerRemoveVolume(serverId, vol.name), t('docker.removeVolumeConfirm', { name: vol.name }))}
                        >
                          <Trash2 className="w-3 h-3" />
                        </ActionBtn>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: NETWORKS */}
      {view === 'networks' && (
        <div className="overflow-x-auto border border-[var(--border)] rounded-lg">
          <table className="w-full text-xs">
            <thead className="bg-[var(--muted)] text-[10px] text-[var(--muted-foreground)] text-left">
              <tr>
                <th className="py-2 px-3">{t('docker.networkName')}</th>
                <th className="py-2 px-3">ID</th>
                <th className="py-2 px-3">{t('docker.driver')}</th>
                <th className="py-2 px-3">{t('docker.scope')}</th>
                <th className="py-2 px-3">{t('docker.connectedContainers')}</th>
                <th className="py-2 px-3 text-right">{t('docker.thActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] font-mono">
              {(!data?.networks || data.networks.length === 0) ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[var(--muted-foreground)]">
                    {t('docker.emptyNetworks')}
                  </td>
                </tr>
              ) : (
                data.networks.map((net) => {
                  const isDefault = ['bridge', 'host', 'none'].includes(net.name);
                  return (
                    <tr key={net.id || net.name} className="hover:bg-[var(--muted)]/40">
                      <td className="py-2 px-3 font-semibold text-[var(--foreground)]">
                        <div className="flex items-center gap-1.5">
                          {net.name}
                          {isDefault && <span className="rounded bg-[var(--muted)] px-1 py-0.2 text-[9px] text-[var(--muted-foreground)]">default</span>}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{net.id}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{net.driver}</td>
                      <td className="py-2 px-3 text-[var(--muted-foreground)]">{net.scope}</td>
                      <td className="py-2 px-3">
                        <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[11px] font-mono">
                          {net.containersCount || 0}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <ActionBtn k={`net:insp:${net.name}`} title="Inspect network" onClick={() => openInspectNet(net)}>
                          <Info className="w-3 h-3" />
                        </ActionBtn>
                        {!isDefault && (
                          <ActionBtn
                            k={`net:rm:${net.name}`}
                            title={t('docker.removeNetwork')}
                            danger
                            onClick={() => run(`net:rm:${net.name}`, `network rm ${net.name}`, () => dockerRemoveNetwork(serverId, net.name), t('docker.removeNetworkConfirm', { name: net.name }))}
                          >
                            <Trash2 className="w-3 h-3" />
                          </ActionBtn>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 6: DISK */}
      {view === 'disk' && (
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data?.df.map((d) => (
              <div key={d.type} className="p-3 rounded-lg border border-[var(--border)] bg-[var(--card)]">
                <div className="text-[11px] text-[var(--muted-foreground)]">{d.type}</div>
                <div className="text-lg font-bold font-mono">{d.size}</div>
                <div className="text-[10px] text-[var(--muted-foreground)]">{t('docker.activeOf', { active: d.active, total: d.total })}</div>
                <div className={`text-[11px] mt-1 font-mono ${d.reclaimable.startsWith('0B') ? 'text-[var(--muted-foreground)]' : 'text-amber-600 font-semibold'}`}>
                  {t('docker.reclaimable', { size: d.reclaimable })}
                </div>
              </div>
            ))}
          </div>
          <div className="border border-[var(--border)] rounded-lg p-3 space-y-2">
            <h4 className="text-xs font-semibold">{t('docker.pruneTitle')}</h4>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {t('docker.pruneHelpA')} <b>{t('docker.pruneHelpB')}</b> {t('docker.pruneHelpC')}
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                ['build-cache', t('docker.pruneBuildCache'), t('docker.pruneBuildCacheConfirm')],
                ['dangling-images', t('docker.pruneDangling'), t('docker.pruneDanglingConfirm')],
                ['images', t('docker.pruneImages'), t('docker.pruneImagesConfirm')],
                ['containers', t('docker.pruneContainers'), t('docker.pruneContainersConfirm')],
                ['networks', t('docker.pruneNetworks'), t('docker.pruneNetworksConfirm')],
                ['volumes', `⚠ ${t('docker.pruneVolumes')}`, t('docker.pruneVolumesConfirm')]
              ] as const).map(([what, label, confirm]) => (
                <Button
                  key={what} variant={what === 'volumes' ? 'destructive' : 'outline'} size="sm" className="gap-1" disabled={!!busy}
                  onClick={() => run(`prune:${what}`, `prune ${what}`, () => dockerPrune(serverId, what), confirm)}
                >
                  {busy === `prune:${what}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} {label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT DRAWER FOR CONTAINERS */}
      {inspect && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex justify-end fade-in" onClick={() => setInspect(null)}>
          <div
            className="w-full max-w-xl h-full bg-[var(--card)] text-[var(--foreground)] border-l border-[var(--border)] overflow-auto p-4 space-y-4 text-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('docker.inspectOf', { name: inspect.name })}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm font-mono flex-1 truncate">{inspect.name}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setInspect(null)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1">
              {([
                ['docker.inspImage', inspect.image], ['docker.inspStatus', `${inspect.status}${inspect.health ? ` (${inspect.health})` : ''}`],
                ['docker.inspExitCode', String(inspect.exitCode)], ['docker.inspOom', inspect.oomKilled ? t('docker.yes') : t('docker.no')],
                ['docker.inspRestart', t('docker.restartInfo', { n: inspect.restartCount, policy: inspect.restartPolicy || 'no' })],
                ['docker.inspStarted', inspect.startedAt ? new Date(inspect.startedAt).toLocaleString() : '–'], ['docker.inspCommand', inspect.cmd]
              ] as const).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt className="text-[var(--muted-foreground)]">{t(k)}</dt>
                  <dd className={`font-mono break-all ${k === 'docker.inspOom' && inspect.oomKilled ? 'text-red-500' : ''}`}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {([
              [t('docker.inspPorts'), inspect.ports.map((p) => `${p.container} → ${p.host || `(${t('docker.internal')})`}`)],
              [t('docker.inspNetworks'), inspect.networks.map((n) => `${n.name} · ${n.ip || '–'}`)],
              [t('docker.inspMounts'), inspect.mounts.map((m) => `${m.type} ${m.source} → ${m.destination}${m.rw ? '' : ' (ro)'}`)]
            ] as const).map(([title, rows]) => (
              <section key={title}>
                <h4 className="font-semibold mb-1">{title}</h4>
                {rows.length ? <ul className="font-mono space-y-0.5 break-all sensitive">{rows.map((r) => <li key={r}>{r}</li>)}</ul> : <p className="text-[var(--muted-foreground)]">–</p>}
              </section>
            ))}
            <section>
              <div className="flex items-center mb-1">
                <h4 className="font-semibold flex-1">{t('docker.inspEnv', { n: inspect.env.length })}</h4>
                <span className="text-[10px] text-[var(--muted-foreground)]">{t('docker.secretsMasked')}</span>
              </div>
              <ul className="font-mono space-y-0.5 break-all">
                {inspect.env.map((e) => (
                  <li key={e.key}>
                    <span className="text-sky-600">{e.key}</span>=<span className={e.masked ? 'text-[var(--muted-foreground)]' : ''}>{e.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>,
        document.body
      )}

      {/* INSPECT DRAWER FOR GENERIC (VOLUMES & NETWORKS) */}
      {inspectGeneric && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 flex justify-end fade-in" onClick={() => setInspectGeneric(null)}>
          <div
            className="w-full max-w-xl h-full bg-[var(--card)] text-[var(--foreground)] border-l border-[var(--border)] overflow-auto p-4 space-y-4 text-xs shadow-2xl"
            onClick={(e) => e.stopPropagation()} role="dialog" aria-label={inspectGeneric.title}
          >
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm font-mono flex-1 truncate">{inspectGeneric.title}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setInspectGeneric(null)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
            </div>
            <pre className="font-mono text-[11px] whitespace-pre-wrap bg-[var(--muted)]/40 p-3 rounded-lg border border-[var(--border)] overflow-auto max-h-[85vh]">
              {JSON.stringify(inspectGeneric.data, null, 2)}
            </pre>
          </div>
        </div>,
        document.body
      )}

      {/* MODALS */}
      <PullImageModal
        serverId={serverId}
        isOpen={isPullModalOpen}
        onClose={() => setIsPullModalOpen(false)}
        onSuccess={() => load(true)}
      />

      <VolumeModal
        serverId={serverId}
        isOpen={isVolumeModalOpen}
        onClose={() => setIsVolumeModalOpen(false)}
        onSuccess={() => load(true)}
      />

      <NetworkModal
        serverId={serverId}
        isOpen={isNetworkModalOpen}
        onClose={() => setIsNetworkModalOpen(false)}
        onSuccess={() => load(true)}
      />

      <RunContainerModal
        serverId={serverId}
        dockerData={data}
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        onSuccess={() => load(true)}
      />

      <ComposeStudioModal
        serverId={serverId}
        isOpen={composeModal.open}
        initialProject={composeModal.project}
        initialWorkingDir={composeModal.workingDir}
        initialConfigFile={composeModal.configFile}
        onClose={() => setComposeModal({ open: false })}
        onSuccess={() => load(true)}
      />

      <ContainerLogsModal
        serverId={serverId}
        containerId={logsModal.id}
        containerName={logsModal.name}
        isOpen={logsModal.open}
        onClose={() => setLogsModal({ open: false, id: '', name: '' })}
      />

      <SudoPasswordModal
        isOpen={sudoModalOpen}
        onClose={() => setSudoModalOpen(false)}
        onConfirm={handleSudoConfirm}
        serverName={serverName || 'Server'}
        username={serverUsername || 'user'}
        reason="Installing Docker CE, Docker Compose and enabling system services requires root/sudo privileges."
      />
    </div>
  );
}
