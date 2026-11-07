import React, { useState, useEffect, useRef } from 'react';
import { FolderGit2, ArrowLeft, Check, Lock, Globe, RefreshCw, Cpu, Settings2, Plus, Trash2, Server, Play, ShieldCheck, ChevronDown, ChevronRight, Layers, HardDrive, Folder, Sparkles, Radio } from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';
import type { ServerItem } from '@/features/servers/types';
import type { NormalizedRepo, InspectResult, DetectedEngine } from '@/features/git/types';
import type { WebAppInfo } from '@/features/deployments/types';
import { fetchGitHubBranches, inspectGitHubRepo } from '@/features/git/api';
import { useTaskManager } from '@/shared/tasks/TaskContext';
import { updateServer, fetchSoftware } from '@/features/servers/api';
import { MARKETPLACE_CATALOG, generateBatchToolsScript } from '@/features/servers/lib/templates';
import { requiredSoftware, planInstall, freePort } from '@/features/deployments/lib/requirements';
import { fetchListeningPorts } from '@/features/deployments/api';
import { SudoPasswordModal } from '@/features/servers/components/SudoPasswordModal';
import { RepoPicker, useRepoPicker } from './RepoPicker';
import { DeployProgress, type PipelineStage } from './DeployProgress';
import DnsPreFlightBadge from '@/features/tunnels/components/DnsPreFlightBadge';
import { fetchCloudflareTunnelStatus } from '@/features/tunnels/api';
import type { CloudflareTunnelStatus } from '@/features/tunnels/types';

function isPrivateOrTailscaleIp(ip?: string): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^.*@/, '').replace(/:\d+$/, '');
  if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(clean)) return true;
  if (clean === 'localhost' || clean.startsWith('127.')) return true;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(clean)) return true;
  return false;
}

interface NewAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: ServerItem;
  onAppCreated?: (newApp: WebAppInfo) => void;
  onOpenIntegrations?: () => void;
}

type WizardStep = 'repo' | 'config' | 'deploying';

const FRAMEWORK_PRESETS: Array<{
  framework: string;
  engine: DetectedEngine;
  preset: string;
  install: string;
  build: string;
  start: string;
  port: number;
}> = [
  {
    framework: 'Next.js',
    engine: 'native_node',
    preset: 'Next.js SSR / App Router',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm start',
    port: 3000
  },
  {
    framework: 'Nuxt',
    engine: 'native_node',
    preset: 'Nuxt 3 (Nitro SSR / Hybrid)',
    install: 'npm ci',
    build: 'npm run build',
    start: 'node .output/server/index.mjs',
    port: 3000
  },
  {
    framework: 'Node.js',
    engine: 'native_node',
    preset: 'Node.js API Server',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npm start',
    port: 3001
  },
  {
    framework: 'Vite',
    engine: 'static',
    preset: 'Frontend SPA (Vite / Static)',
    install: 'npm ci',
    build: 'npm run build',
    start: '',
    port: 3000
  },
  {
    framework: 'Laravel',
    engine: 'native_php',
    preset: 'Laravel PHP-FPM + Nginx',
    install: 'composer install --no-dev --optimize-autoloader',
    build: 'php artisan config:cache && php artisan route:cache',
    start: '',
    port: 8000
  },
  {
    framework: 'Docker',
    engine: 'docker',
    preset: 'Docker Container',
    install: '',
    build: 'docker build -t app .',
    start: 'docker run -d -p $PORT:$PORT app',
    port: 3000
  },
  {
    framework: 'Python',
    engine: 'native_python',
    preset: 'Python / FastAPI / Gunicorn',
    install: 'pip install -r requirements.txt',
    build: 'python -m compileall .',
    start: 'uvicorn main:app --host 0.0.0.0 --port $PORT',
    port: 8000
  },
  {
    framework: 'Go',
    engine: 'native_go',
    preset: 'Go Binary Service',
    install: 'go mod download',
    build: 'go build -o app .',
    start: './app',
    port: 8080
  }
];

function FrameworkInspectSkeleton() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="w-44 h-4 rounded" />
            <Skeleton className="w-28 h-3 rounded" />
          </div>
        </div>
        <Skeleton className="w-20 h-6 rounded-md" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <Skeleton key={n} className="w-24 h-7 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export default function NewAppModal({
  isOpen,
  onClose,
  server,
  onAppCreated,
  onOpenIntegrations
}: NewAppModalProps) {
  const t = useT();
  const [step, setStep] = useState<WizardStep>('repo');
  const picker = useRepoPicker();
  const { integrations, setSelectedOwner, setSelectedLanguage, loadReposList } = picker;

  // Selected Repo & Branch
  const [selectedRepo, setSelectedRepo] = useState<NormalizedRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('main');
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Inspection & Config
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [overrideBuild, setOverrideBuild] = useState(true);

  // App form config
  const [appName, setAppName] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [exposureMode, setExposureMode] = useState<'public' | 'tunnel' | 'none'>('public');
  const [tunnelStatus, setTunnelStatus] = useState<CloudflareTunnelStatus | null>(null);
  const [rootDir, setRootDir] = useState('/');
  const [availableDirs, setAvailableDirs] = useState<string[]>(['/']);
  const [showDirDropdown, setShowDirDropdown] = useState(false);
  const [dirSearch, setDirSearch] = useState('');
  const rootDirContainerRef = useRef<HTMLDivElement>(null);
  const [installCmd, setInstallCmd] = useState('');
  const [buildCmd, setBuildCmd] = useState('');
  const [startCmd, setStartCmd] = useState('');
  const [internalPort, setInternalPort] = useState<number>(3000);
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([
    { key: 'NODE_ENV', value: 'production' }
  ]);
  const [showBulkEnv, setShowBulkEnv] = useState(false);
  const [bulkEnvText, setBulkEnvText] = useState('');

  // Monorepo Multi-Deploy Stack state
  const [isStackMode, setIsStackMode] = useState(false);
  const [stackServices, setStackServices] = useState<Array<{
    id: string;
    rootDir: string;
    appName: string;
    framework: string;
    detectedEngine: DetectedEngine;
    installCmd: string;
    buildCmd: string;
    startCmd: string;
    internalPort: number;
    customDomain: string;
    envVars: Array<{ key: string; value: string }>;
    selected: boolean;
    inspecting?: boolean;
    inspectResult?: InspectResult;
    stageDefs?: PipelineStage[];
    taskId?: string;
    status: 'waiting' | 'running' | 'completed' | 'failed';
  }>>([]);
  const [activeStackServiceId, setActiveStackServiceId] = useState<string>('');

  // Deployment runs as a background task; this view only reads its streamed log.
  const { tasks, runStreamTask } = useTaskManager();
  const [deployTaskId, setDeployTaskId] = useState<string | null>(null);
  const [stageDefs, setStageDefs] = useState<PipelineStage[]>([]);
  const [sudoModalOpen, setSudoModalOpen] = useState(false);
  const [installedIds, setInstalledIds] = useState<Map<string, string | null> | null>(null);
  const [checkingSoftware, setCheckingSoftware] = useState(false);
  // TCP ports already listening on the server; suggested ports skip these so a new app doesn't land on another app's port.
  const [usedPorts, setUsedPorts] = useState<number[]>([]);
  const usedPortsRef = useRef<number[]>([]);
  const refreshListeningPorts = () => {
    fetchListeningPorts(server.id)
      .then(({ ports, probed }) => {
        // ss misses ports held outside this Linux (Windows host under WSL); the probe catches those.
        const used = [...new Set([...ports.filter((p) => p.proto.startsWith('tcp')).map((p) => Number(p.port)).filter(Boolean), ...(probed ?? [])])];
        usedPortsRef.current = used;
        setUsedPorts(used);
        setInternalPort((cur) => freePort(cur, used));
      })
      .catch(() => {});
  };
  const suggestPort = (p: number) => setInternalPort(freePort(p, usedPortsRef.current));
  const deployTask = tasks.find((tk) => tk.id === deployTaskId);
  // Load Integrations & Repos on open
  useEffect(() => {
    if (!isOpen) return;
    refreshListeningPorts();
    // Coming back to the tab while a deploy still runs: reopen its live view instead of a fresh wizard.
    const running = tasks.find((tk) => tk.serverId === server.id && tk.metadata?.kind === 'deploy' && tk.status === 'running');
    if (running) {
      const m = running.metadata!;
      setSelectedRepo(m.repo);
      setInspectResult(m.inspect);
      setAppName(m.body.appName);
      setSelectedBranch(m.body.branch);
      setRootDir(m.body.rootDir);
      setInstallCmd(m.body.installCmd);
      setBuildCmd(m.body.buildCmd);
      setStartCmd(m.body.startCmd);
      setInternalPort(m.body.port);
      setCustomDomain(m.body.domain);
      setEnvVars(m.body.env);
      setStageDefs(m.stageDefs);
      setDeployTaskId(running.id);
      setStep('deploying');
      return;
    }
    setStep('repo');
    setSelectedRepo(null);
    setSelectedOwner('all');
    setSelectedLanguage('all');
    setInspectResult(null);
    setDeployTaskId(null);
    loadReposList();
  }, [isOpen]);

  // Scan once per config visit so the user sees what the deploy still needs on this server.
  const scanSoftware = () => {
    setCheckingSoftware(true);
    fetchSoftware(server.id)
      .then((items) => setInstalledIds(new Map(items.filter((i) => i.installed).map((i) => [i.id, i.version]))))
      .catch(() => setInstalledIds(null)) // unknown: don't block the deploy
      .finally(() => setCheckingSoftware(false));
  };
  useEffect(() => {
    if (step !== 'config') return;
    scanSoftware();
    refreshListeningPorts();
    fetchCloudflareTunnelStatus(server.id)
      .then((status) => {
        setTunnelStatus(status);
        if (status?.installed && status.active && isPrivateOrTailscaleIp(server.host)) {
          setExposureMode('tunnel');
        }
      })
      .catch(() => {});
  }, [step, server.id]);

  const required = requiredSoftware({ composeSidecar: inspectResult?.compose_sidecar, engine: inspectResult?.detected_engine, installCmd, buildCmd, startCmd, domain: customDomain });
  const nodeMajor = inspectResult?.detected_engine === 'docker' ? undefined : inspectResult?.node_version;
  const plan = installedIds ? planInstall(required, installedIds, nodeMajor) : { missing: [] as string[], versions: {}, nodeTooOld: false };
  const missing = plan.missing;

  const updateAppNameForDir = (repo: NormalizedRepo, dir: string) => {
    const baseName = repo.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    const cleanSub = dir.replace(/^\/+|\/+$/g, '').split('/').pop()?.toLowerCase().replace(/[^a-z0-9-_]/g, '-') || '';
    setAppName(cleanSub ? `${baseName}-${cleanSub}`.slice(0, 62) : baseName);
  };

  // Inspect a specific repo & branch & directory
  const runRepoInspection = async (repo: NormalizedRepo, branchName: string, subDir = '/', autoFollowMonorepo = false) => {
    setInspecting(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      let result = await inspectGitHubRepo({
        owner,
        repo: repoName,
        branch: branchName,
        subDir
      });

      // If inspecting '/' of a monorepo where root has no framework (Static Web) and sub-projects exist, auto-inspect the first sub-project
      const subRoots = (result.project_roots || []).filter((r) => r !== '/');
      if (autoFollowMonorepo && subDir === '/' && result.framework === 'Static Web' && subRoots.length > 0) {
        const firstSub = subRoots[0];
        updateAppNameForDir(repo, firstSub);
        result = await inspectGitHubRepo({
          owner,
          repo: repoName,
          branch: branchName,
          subDir: firstSub
        });
      }

      setInspectResult(result);
      if (result.available_directories && result.available_directories.length > 0) {
        setAvailableDirs(result.available_directories);
      }
      setRootDir(result.suggested_config.root_dir);
      setInstallCmd(result.suggested_config.install_command);
      setBuildCmd(result.suggested_config.build_command);
      setStartCmd(result.suggested_config.start_command);
      suggestPort(result.suggested_config.internal_port);
      if (result.suggested_env && result.suggested_env.length > 0) {
        setEnvVars(result.suggested_env);
      }
    } catch (err: any) {
      toast.error(err.message || t('gitApp.detectFrameworkError'));
    } finally {
      setInspecting(false);
    }
  };

  const handleSelectRootDir = async (selectedDir: string) => {
    setRootDir(selectedDir);
    setShowDirDropdown(false);
    if (selectedRepo) {
      updateAppNameForDir(selectedRepo, selectedDir);
      await runRepoInspection(selectedRepo, selectedBranch, selectedDir);
    }
  };

  // Initialize Monorepo Multi-Deploy Stack
  const initStackMode = async (roots: string[]) => {
    setIsStackMode(true);
    if (!roots || roots.length === 0) return;

    const baseName = selectedRepo ? selectedRepo.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-') : 'app';
    const allocatedPorts = [...usedPortsRef.current];

    const initialSvcs = roots.map((dir, idx) => {
      const cleanSub = dir.replace(/^\/+|\/+$/g, '').split('/').pop()?.toLowerCase().replace(/[^a-z0-9-_]/g, '-') || `svc-${idx}`;
      const isFront = cleanSub.includes('front') || cleanSub.includes('web') || cleanSub.includes('client') || cleanSub.includes('landing');
      const defaultP = isFront ? 3000 : 8000;
      const freeP = freePort(defaultP, allocatedPorts);
      allocatedPorts.push(freeP);

      return {
        id: dir,
        rootDir: dir,
        appName: `${baseName}-${cleanSub}`.slice(0, 62),
        framework: isFront ? 'Frontend (SPA)' : 'Node.js',
        detectedEngine: 'native_node' as DetectedEngine,
        installCmd: 'npm ci',
        buildCmd: 'npm run build',
        startCmd: isFront ? '' : 'npm start',
        internalPort: freeP,
        customDomain: '',
        envVars: [{ key: 'NODE_ENV', value: 'production' }],
        selected: true,
        inspecting: true,
        stageDefs: [],
        status: 'waiting' as const
      };
    });

    setStackServices(initialSvcs);
    setActiveStackServiceId(initialSvcs[0]?.id || '');

    if (selectedRepo) {
      const [owner, repoName] = selectedRepo.full_name.split('/');
      for (const dir of roots) {
        try {
          const res = await inspectGitHubRepo({
            owner,
            repo: repoName,
            branch: selectedBranch,
            subDir: dir
          });
          setStackServices((prev) =>
            prev.map((s) => {
              if (s.id !== dir) return s;
              const port = freePort(res.suggested_config.internal_port, allocatedPorts);
              allocatedPorts.push(port);
              return {
                ...s,
                framework: res.framework,
                detectedEngine: res.detected_engine,
                installCmd: res.suggested_config.install_command,
                buildCmd: res.suggested_config.build_command,
                startCmd: res.suggested_config.start_command,
                internalPort: port,
                envVars: res.suggested_env && res.suggested_env.length > 0 ? res.suggested_env : s.envVars,
                inspectResult: res,
                inspecting: false
              };
            })
          );
        } catch {
          setStackServices((prev) => prev.map((s) => (s.id === dir ? { ...s, inspecting: false } : s)));
        }
      }
    }
  };

  const activeStackSvc = isStackMode ? stackServices.find((s) => s.id === activeStackServiceId) || stackServices[0] : undefined;

  const updateActiveStackSvc = (patch: Partial<typeof stackServices[0]>) => {
    if (!activeStackSvc) return;
    setStackServices((prev) =>
      prev.map((s) => (s.id === activeStackSvc.id ? { ...s, ...patch } : s))
    );
  };

  // Close directory dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootDirContainerRef.current && !rootDirContainerRef.current.contains(e.target as Node)) {
        setShowDirDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle selecting a repo -> jumps directly to unified 2-column Config & Architecture studio!
  const handleSelectRepo = async (repo: NormalizedRepo) => {
    setSelectedRepo(repo);
    setIsStackMode(false);
    setStackServices([]);
    setActiveStackServiceId('');
    const cleanName = repo.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    setAppName(cleanName);
    const defaultBr = repo.default_branch || 'main';
    setSelectedBranch(defaultBr);
    setStep('config');

    // Fetch branches & inspect concurrently
    setLoadingBranches(true);
    const [owner, repoName] = repo.full_name.split('/');
    fetchGitHubBranches(owner, repoName)
      .then((branchList) => {
        setBranches(branchList);
        if (branchList.length > 0 && !branchList.includes(defaultBr)) {
          setSelectedBranch(branchList[0]);
        }
      })
      .catch((err: any) => {
        toast.error(err.message || t('gitApp.loadBranchError'));
      })
      .finally(() => {
        setLoadingBranches(false);
      });

    await runRepoInspection(repo, defaultBr, '/', true);
  };

  const handleBranchChange = async (newBranch: string) => {
    setSelectedBranch(newBranch);
    if (selectedRepo) {
      await runRepoInspection(selectedRepo, newBranch, rootDir);
    }
  };

  const applyFrameworkPreset = (p: (typeof FRAMEWORK_PRESETS)[number]) => {
    if (isStackMode && activeStackSvc) {
      updateActiveStackSvc({
        framework: p.framework,
        detectedEngine: p.engine,
        installCmd: p.install,
        buildCmd: p.build,
        startCmd: p.start,
        internalPort: freePort(p.port, usedPortsRef.current)
      });
      return;
    }
    setInspectResult({
      detected_engine: p.engine,
      framework: p.framework,
      build_preset: p.preset,
      suggested_config: {
        root_dir: rootDir || '/',
        install_command: p.install,
        build_command: p.build,
        start_command: p.start,
        internal_port: p.port
      }
    });
    setInstallCmd(p.install);
    setBuildCmd(p.build);
    setStartCmd(p.start);
    suggestPort(p.port);
  };

  const currentEnvVars = isStackMode && activeStackSvc ? activeStackSvc.envVars : envVars;

  const handleAddEnv = () => {
    const next = [...currentEnvVars, { key: '', value: '' }];
    if (isStackMode && activeStackSvc) {
      updateActiveStackSvc({ envVars: next });
    } else {
      setEnvVars(next);
    }
  };

  const handleRemoveEnv = (index: number) => {
    const next = currentEnvVars.filter((_, i) => i !== index);
    if (isStackMode && activeStackSvc) {
      updateActiveStackSvc({ envVars: next });
    } else {
      setEnvVars(next);
    }
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...currentEnvVars];
    next[index][field] = val;
    if (isStackMode && activeStackSvc) {
      updateActiveStackSvc({ envVars: next });
    } else {
      setEnvVars(next);
    }
  };

  const handleParseBulkEnv = () => {
    const lines = bulkEnvText.split('\n');
    const parsed: Array<{ key: string; value: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        let v = trimmed.substring(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (k) parsed.push({ key: k, value: v });
      }
    }

    if (parsed.length > 0) {
      if (isStackMode && activeStackSvc) {
        updateActiveStackSvc({ envVars: parsed });
      } else {
        setEnvVars(parsed);
      }
      setShowBulkEnv(false);
      toast.success(t('gitApp.envImportSuccess', { count: parsed.length }));
    } else {
      toast.error(t('gitApp.envImportError'));
    }
  };

  // body + stageDefs live in the task metadata, so retry and tab-switch resume don't depend on form state.
  const runDeploy = async (body: Record<string, any>, defs: PipelineStage[], sudoPassword?: string) => {
    const taskId = `deploy_${body.appName}_${Date.now()}`;
    setStageDefs(defs);
    setDeployTaskId(taskId);
    const fw = inspectResult?.framework || 'Node.js';
    await runStreamTask({
      id: taskId,
      serverId: server.id,
      serverName: server.name,
      title: `Deploy ${body.repo} → ${body.appName}`,
      category: 'git',
      url: `/api/servers/${server.id}/webapps/deploy?stream=1`,
      body: { ...body, sudoPassword },
      metadata: { kind: 'deploy', body, stageDefs: defs, repo: selectedRepo, inspect: inspectResult },
      onDone: () => {
        onAppCreated?.({
          name: body.appName,
          type: fw,
          domain: body.domain || '',
          ports: String(body.port),
          gitBranch: body.branch,
          path: `/var/www/${body.appName}`,
          modified: t('gitApp.justNow')
        });
      },
      onError: (err: any) => {
        if (err.sudoRequired) setSudoModalOpen(true);
      }
    });
  };

  const retryDeploy = (sudoPassword?: string) => {
    if (isStackMode) {
      const selected = stackServices.filter((s) => s.selected);
      runStackDeploy(selected, sudoPassword);
      return;
    }
    const m = deployTask?.metadata;
    if (m) runDeploy(m.body, m.stageDefs, sudoPassword);
  };

  const runStackDeploy = async (selected: typeof stackServices, sudoPassword?: string) => {
    const toInstall = MARKETPLACE_CATALOG.filter((tool) => missing.includes(tool.id));

    for (let i = 0; i < selected.length; i++) {
      const svc = selected[i];
      setStackServices((prev) =>
        prev.map((s) => (s.id === svc.id ? { ...s, status: 'running' } : s))
      );

      const defs: PipelineStage[] = [
        ...(toInstall.length && i === 0
          ? [{ id: 'deps', label: 'Install Server Software', sub: toInstall.map((tool) => tool.name).join(', '), brand: 'linux', status: 'waiting' as const }]
          : []),
        { id: 'clone', label: 'Clone Git Repository', sub: `${selectedRepo?.full_name} @ ${selectedBranch}`, brand: 'git', status: 'waiting' },
        { id: 'env', label: 'Inject Environment (.env)', sub: `${svc.envVars.filter((e) => e.key).length} variables (0600)`, brand: 'linux', status: 'waiting' },
        { id: 'install', label: 'Install Dependencies', sub: svc.installCmd || '—', brand: svc.installCmd.includes('composer') ? 'composer' : svc.installCmd.includes('pip') ? 'python' : 'npm', status: 'waiting' },
        { id: 'build', label: 'Compile & Build Artifact', sub: svc.buildCmd || '—', brand: svc.framework, status: 'waiting' },
        { id: 'process', label: 'Process Manager & Port', sub: `${svc.detectedEngine === 'docker' ? 'Docker' : 'PM2'} :${svc.internalPort}`, brand: svc.detectedEngine === 'docker' ? 'docker' : 'pm2', status: 'waiting' },
        { id: 'health', label: 'Reverse Proxy & Health Check', sub: svc.customDomain || `http://127.0.0.1:${svc.internalPort}`, brand: 'nginx', status: 'waiting' }
      ];

      const taskId = `deploy_${svc.appName}_${Date.now()}`;
      setStackServices((prev) =>
        prev.map((s) => (s.id === svc.id ? { ...s, taskId, stageDefs: defs } : s))
      );

      let stepFailed = false;
      await runStreamTask({
        id: taskId,
        serverId: server.id,
        serverName: server.name,
        title: `Deploy ${selectedRepo?.full_name} (${svc.rootDir}) → ${svc.appName}`,
        category: 'git',
        url: `/api/servers/${server.id}/webapps/deploy?stream=1`,
        body: {
          appName: svc.appName,
          repo: selectedRepo?.full_name,
          branch: selectedBranch,
          rootDir: svc.rootDir,
          installCmd: svc.installCmd,
          buildCmd: svc.buildCmd,
          startCmd: svc.startCmd,
          port: svc.internalPort,
          domain: exposureMode === 'none' ? '' : svc.customDomain,
          exposure: exposureMode,
          tunnelName: tunnelStatus?.tunnelName || tunnelStatus?.tunnelId,
          engine: svc.detectedEngine,
          env: svc.envVars.filter((e) => e.key.trim()),
          composeSidecar: !!svc.inspectResult?.compose_sidecar,
          preScript: toInstall.length && i === 0 ? `echo "@@STAGE deps"\n${generateBatchToolsScript(toInstall, plan.versions)}` : undefined,
          sudoPassword
        },
        metadata: { kind: 'deploy', body: svc, stageDefs: defs, repo: selectedRepo, inspect: svc.inspectResult },
        onDone: () => {
          setStackServices((prev) =>
            prev.map((s) => (s.id === svc.id ? { ...s, status: 'completed' } : s))
          );
          onAppCreated?.({
            name: svc.appName,
            type: svc.framework,
            domain: svc.customDomain || '',
            ports: String(svc.internalPort),
            gitBranch: selectedBranch,
            path: `/var/www/${svc.appName}`,
            modified: t('gitApp.justNow')
          });
        },
        onError: (err: any) => {
          stepFailed = true;
          setStackServices((prev) =>
            prev.map((s) => (s.id === svc.id ? { ...s, status: 'failed' } : s))
          );
          if (err.sudoRequired) setSudoModalOpen(true);
        }
      });

      if (stepFailed) {
        break;
      }
    }
  };

  const handleStartDeploy = () => {
    if (isStackMode) {
      const selected = stackServices.filter((s) => s.selected);
      if (selected.length === 0) {
        toast.error('Please select at least one package to deploy in the stack.');
        return;
      }
      for (const s of selected) {
        if (!s.appName.trim()) {
          toast.error(`App name is required for package ${s.rootDir}`);
          return;
        }
      }
      setStep('deploying');
      runStackDeploy(selected);
      return;
    }
    if (!appName.trim()) {
      toast.error(t('gitApp.nameRequired'));
      return;
    }
    const fw = inspectResult?.framework || 'Node.js';
    const toInstall = MARKETPLACE_CATALOG.filter((tool) => missing.includes(tool.id)); // catalog order = dependency order (node before pm2)
    const defs: PipelineStage[] = [
      ...(toInstall.length
        ? [{ id: 'deps', label: 'Install Server Software', sub: toInstall.map((tool) => tool.name).join(', '), brand: 'linux', status: 'waiting' as const }]
        : []),
      { id: 'clone', label: 'Clone Git Repository', sub: `${selectedRepo?.full_name} @ ${selectedBranch}`, brand: 'git', status: 'waiting' },
      { id: 'env', label: 'Inject Environment (.env)', sub: `${envVars.filter((e) => e.key).length} variables (0600)`, brand: 'linux', status: 'waiting' },
      { id: 'install', label: 'Install Dependencies', sub: installCmd || '—', brand: installCmd.includes('composer') ? 'composer' : installCmd.includes('pip') ? 'python' : 'npm', status: 'waiting' },
      { id: 'build', label: 'Compile & Build Artifact', sub: buildCmd || '—', brand: fw, status: 'waiting' },
      { id: 'process', label: 'Process Manager & Port', sub: `${inspectResult?.detected_engine === 'docker' ? 'Docker' : 'PM2'} :${internalPort}`, brand: inspectResult?.detected_engine === 'docker' ? 'docker' : 'pm2', status: 'waiting' },
      { id: 'health', label: 'Reverse Proxy & Health Check', sub: customDomain || `http://127.0.0.1:${internalPort}`, brand: 'nginx', status: 'waiting' }
    ];
    const body = {
      appName, repo: selectedRepo?.full_name, branch: selectedBranch, rootDir,
      installCmd, buildCmd, startCmd, port: internalPort,
      domain: exposureMode === 'none' ? '' : customDomain,
      exposure: exposureMode,
      tunnelName: tunnelStatus?.tunnelName || tunnelStatus?.tunnelId,
      engine: inspectResult?.detected_engine, env: envVars.filter((e) => e.key.trim()), nodeMajor,
      composeSidecar: !!inspectResult?.compose_sidecar,
      preScript: toInstall.length ? `echo "@@STAGE deps"\n${generateBatchToolsScript(toInstall, plan.versions)}` : undefined
    };
    setStep('deploying');
    runDeploy(body, defs);
  };

  const handleSudoConfirm = async (password: string, remember: boolean) => {
    setSudoModalOpen(false);
    if (remember) await updateServer(server.id, { sudoPassword: password }).catch(() => {});
    retryDeploy(password);
  };

  const handleAskAiPreflight = () => {
    const prompt = isStackMode
      ? `Tolong lakukan Pre-Flight Architecture Review untuk Monorepo stack "${selectedRepo?.full_name}" branch "${selectedBranch}".
Packages yang dipilih:
${stackServices.filter((s) => s.selected).map((s) => `- ${s.rootDir} -> app: ${s.appName}, port: ${s.internalPort}, framework: ${s.framework}, env vars: ${s.envVars.filter((e) => e.key).length}`).join('\n')}

Periksa apakah ada potensi port collision, dependency antar-service, atau variabel environment penting yang mungkin terlewat sebelum saya mulai deploy di server ${server.name} (${server.host}).`
      : `Tolong lakukan Pre-Flight Architecture Review untuk aplikasi "${appName}" (repo: ${selectedRepo?.full_name}, branch: ${selectedBranch}).
Framework terdeteksi: ${activeFramework}, Root Directory: ${rootDir}, Port: ${internalPort}.
Periksa apakah ada konfigurasi port, Docker compose, atau variabel environment yang perlu disesuaikan sebelum di-deploy di server ${server.name} (${server.host}).`;

    window.dispatchEvent(
      new CustomEvent('7server-copilot-ask', {
        detail: { prompt }
      })
    );
  };

  if (!isOpen) return null;

  const ghAccount = integrations.find((i) => i.provider === 'github');
  const activeFramework = inspectResult?.framework || selectedRepo?.language || 'Node.js';

  return (
    <div className="space-y-5 fade-in">
      {/* ================= TOP WORKSPACE HEADER BAR ================= */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="gap-1.5 h-8 text-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t('gitApp.backToApps')}</span>
            </Button>

            <div className="h-5 w-[1px] bg-[var(--border)] hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                <BrandIcon name="github" className="w-4 h-4" fallback={<FolderGit2 className="w-4 h-4" />} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold tracking-tight text-[var(--foreground)]">
                    {t('gitApp.deployTitle')}
                  </h2>
                  <Badge variant="secondary" className="text-[10px] gap-1 font-mono">
                    <BrandIcon name={server.metrics?.os || 'linux'} className="w-3 h-3" fallback={<Server className="w-3 h-3" />} />
                    <span>{server.name}</span>
                    <span className="opacity-60 sensitive">({server.host})</span>
                  </Badge>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {t('integrations.subtitle')}
                </p>
              </div>
            </div>
          </div>

          {/* Stepper & Connected Account */}
          <div className="flex items-center gap-3 flex-wrap justify-between lg:justify-end">
            {ghAccount && (
              <button
                type="button"
                onClick={onOpenIntegrations}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[var(--muted)]/60 border border-[var(--border)] hover:border-[var(--primary)]/40 transition text-xs"
                title={t('gitApp.orOAuth')}
              >
                <img src={ghAccount.avatar_url} alt={ghAccount.username} className="w-4 h-4 rounded-full" />
                <span className="font-mono text-[11px] text-[var(--foreground)]">@{ghAccount.username}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </button>
            )}

            {/* Step Indicator Pills */}
            <div className="flex items-center gap-1.5 bg-[var(--muted)]/50 p-1 rounded-lg border border-[var(--border)] text-xs">
              {[
                { key: 'repo', num: 1, label: t('gitApp.step1') },
                { key: 'config', num: 2, label: t('gitApp.step3') },
                { key: 'deploying', num: 3, label: t('gitApp.step4') }
              ].map((s, idx) => {
                const isCurrent = step === s.key;
                const isPassed =
                  (s.key === 'repo' && step !== 'repo') ||
                  (s.key === 'config' && step === 'deploying');

                return (
                  <React.Fragment key={s.key}>
                    {idx > 0 && <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)] opacity-50" />}
                    <button
                      type="button"
                      disabled={!isPassed && !isCurrent}
                      onClick={() => {
                        if (s.key === 'repo' && step === 'config') setStep('repo');
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition ${
                        isCurrent
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold shadow-xs'
                          : isPassed
                          ? 'text-emerald-500 font-medium hover:bg-[var(--card)] cursor-pointer'
                          : 'text-[var(--muted-foreground)] opacity-60 cursor-default'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                          isCurrent
                            ? 'bg-[var(--primary-foreground)] text-[var(--primary)] font-bold'
                            : isPassed
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                            : 'bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)]'
                        }`}
                      >
                        {isPassed ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : s.num}
                      </span>
                      <span>{s.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {/* ================= STEP 1: FULL-WIDTH REPOSITORY EXPLORER ================= */}
      {step === 'repo' && (
        <RepoPicker picker={picker} onSelectRepo={handleSelectRepo} onOpenIntegrations={onOpenIntegrations} />
      )}

      {/* ================= STEP 2: 2-COLUMN CONFIGURATION & ARCHITECTURE STUDIO ================= */}
      {step === 'config' && selectedRepo && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN (8 COLS): CONFIGURATION CARDS */}
          <div className="lg:col-span-8 space-y-4">
            {/* Card 1: Repository, Branch & Root Directory */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-3">
                  {selectedRepo.owner?.avatar_url ? (
                    <img
                      src={selectedRepo.owner.avatar_url}
                      alt={selectedRepo.owner.login}
                      className="w-9 h-9 rounded-lg border border-[var(--border)]"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center">
                      <BrandIcon name="github" className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] font-semibold">
                      {t('gitApp.selectedRepo')}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold font-mono text-[var(--foreground)]">
                        {selectedRepo.full_name}
                      </span>
                      <Badge variant={selectedRepo.private ? 'secondary' : 'outline'} className="text-[9px]">
                        {selectedRepo.private ? 'Private' : 'Public'}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('repo')}
                  className="h-7 text-xs gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  {t('gitApp.changeRepo')}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                    {t('gitApp.chooseBranch')}
                  </label>
                  {loadingBranches ? (
                    <Skeleton className="h-9 w-full rounded-md" />
                  ) : (
                    <select
                      value={selectedBranch}
                      onChange={(e) => handleBranchChange(e.target.value)}
                      className="w-full h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-mono text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    >
                      {branches.map((b) => (
                        <option key={b} value={b}>
                          {b} {b === selectedRepo.default_branch ? t('gitApp.defaultBranchBadge') : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                    {t('gitApp.branchHint')}
                  </p>
                </div>

                <div className="relative" ref={rootDirContainerRef}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-[var(--foreground)]">
                      {t('gitApp.rootDir')}
                    </label>
                    {availableDirs.length > 1 && (
                      <span className="text-[10px] text-[var(--primary)] font-mono">
                        {availableDirs.length} {t('gitApp.dirsFound')}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none">
                      <Folder className="w-3.5 h-3.5" />
                    </div>
                    <Input
                      type="text"
                      value={rootDir}
                      onFocus={() => setShowDirDropdown(true)}
                      onChange={(e) => {
                        setRootDir(e.target.value);
                        setDirSearch(e.target.value);
                        setShowDirDropdown(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSelectRootDir(rootDir);
                        }
                      }}
                      placeholder="/"
                      className="pl-8 pr-8 h-9 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDirDropdown(!showDirDropdown)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-0.5"
                    >
                      <ChevronDown className={`w-3.5 h-3.5 transition ${showDirDropdown ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Autocomplete Dropdown Menu */}
                  {showDirDropdown && availableDirs.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto z-30 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl py-1 text-xs">
                      {availableDirs
                        .filter((d) => !dirSearch.trim() || d.toLowerCase().includes(dirSearch.toLowerCase().trim()))
                        .map((dir) => {
                          const isCurrent = rootDir === dir;
                          return (
                            <button
                              key={dir}
                              type="button"
                              onClick={() => handleSelectRootDir(dir)}
                              className={`w-full px-3 py-1.5 text-left font-mono flex items-center justify-between transition ${
                                isCurrent
                                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                                  : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Folder className={`w-3 h-3 shrink-0 ${isCurrent ? 'text-current' : 'text-amber-500'}`} />
                                <span className="truncate">{dir}</span>
                                {dir === '/' && (
                                  <span className={`text-[10px] ${isCurrent ? 'opacity-80' : 'text-[var(--muted-foreground)]'}`}>
                                    (root)
                                  </span>
                                )}
                              </div>
                              {isCurrent && <Check className="w-3 h-3 shrink-0" />}
                            </button>
                          );
                        })}
                      {availableDirs.filter((d) => !dirSearch.trim() || d.toLowerCase().includes(dirSearch.toLowerCase().trim())).length === 0 && (
                        <div className="px-3 py-2 text-[11px] text-[var(--muted-foreground)] italic">
                          {t('gitApp.noMatchingDirs')}
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                    {t('gitApp.rootDirHint')}
                  </p>

                  {/* Monorepo Project Roots Quick-Selector / Stack Composer */}
                  {inspectResult?.project_roots && inspectResult.project_roots.filter((r) => r !== '/').length > 0 && (
                    <div className="mt-2.5 p-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary)]/5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-[var(--primary)]" />
                          <span className="text-xs font-bold text-[var(--foreground)]">
                            Monorepo Detected ({inspectResult.project_roots.filter((r) => r !== '/').length} packages)
                          </span>
                        </div>

                        <div className="flex items-center gap-1 bg-[var(--muted)]/80 p-0.5 rounded-lg border border-[var(--border)] text-xs">
                          <button
                            type="button"
                            onClick={() => setIsStackMode(false)}
                            className={`px-2.5 py-1 rounded-md transition ${
                              !isStackMode
                                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-xs font-semibold'
                                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            Single App
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isStackMode) {
                                initStackMode(inspectResult.project_roots!.filter((r) => r !== '/'));
                              }
                            }}
                            className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                              isStackMode
                                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs font-semibold'
                                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                            }`}
                          >
                            <span>⚡ Deploy Stack</span>
                          </button>
                        </div>
                      </div>

                      {!isStackMode ? (
                        <div>
                          <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">
                            Select a package to configure as a single app:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {inspectResult.project_roots.map((pkgDir) => {
                              const active = rootDir === pkgDir;
                              return (
                                <button
                                  key={pkgDir}
                                  type="button"
                                  onClick={() => handleSelectRootDir(pkgDir)}
                                  className={`px-2 py-1 rounded-md text-[11px] font-mono border transition flex items-center gap-1 ${
                                    active
                                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent font-semibold'
                                      : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--primary)]/50'
                                  }`}
                                >
                                  <Folder className="w-3 h-3 opacity-75" />
                                  <span>{pkgDir}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          <div className="text-[11px] text-[var(--muted-foreground)]">
                            Packages to include in this deployment stack:
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {stackServices.map((svc) => (
                              <div
                                key={svc.id}
                                onClick={() => {
                                  setStackServices((prev) =>
                                    prev.map((s) => (s.id === svc.id ? { ...s, selected: !s.selected } : s))
                                  );
                                }}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between transition cursor-pointer select-none ${
                                  svc.selected
                                    ? 'border-[var(--primary)]/60 bg-[var(--card)] text-[var(--foreground)] shadow-xs'
                                    : 'border-[var(--border)] bg-[var(--muted)]/20 text-[var(--muted-foreground)] opacity-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <input
                                    type="checkbox"
                                    checked={svc.selected}
                                    readOnly
                                    className="rounded accent-[var(--primary)] pointer-events-none"
                                  />
                                  <BrandIcon name={svc.framework} className="w-3.5 h-3.5 shrink-0" />
                                  <span className="font-mono font-medium truncate">{svc.rootDir}</span>
                                </div>
                                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                                  :{svc.internalPort}
                                </Badge>
                              </div>
                            ))}
                          </div>

                          {/* Tabs to select active service for the forms below */}
                          {stackServices.filter((s) => s.selected).length > 0 && (
                            <div className="pt-2 border-t border-[var(--border)]/60 flex items-center gap-1.5 overflow-x-auto">
                              <span className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] shrink-0">
                                Configure:
                              </span>
                              {stackServices.filter((s) => s.selected).map((svc) => {
                                const isActive = activeStackServiceId === svc.id;
                                return (
                                  <button
                                    key={svc.id}
                                    type="button"
                                    onClick={() => setActiveStackServiceId(svc.id)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-mono flex items-center gap-1.5 transition border shrink-0 ${
                                      isActive
                                        ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent font-semibold shadow-xs'
                                        : 'bg-[var(--card)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--muted)]'
                                    }`}
                                  >
                                    <BrandIcon name={svc.framework} className="w-3.5 h-3.5" />
                                    <span>{svc.rootDir}</span>
                                    <span className="text-[10px] opacity-75">(:{svc.internalPort})</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Card 2: Framework Detection & Runtime Presets */}
            <Card className="p-5 space-y-4">
              {inspecting ? (
                <FrameworkInspectSkeleton />
              ) : (
                <>
                  {inspectResult && (
                    <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--muted)]/40 metal flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)] shrink-0">
                          <BrandIcon
                            name={inspectResult.framework}
                            className="w-5 h-5"
                            fallback={<Cpu className="w-5 h-5" />}
                          />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                            <span>{t('gitApp.detected', { framework: inspectResult.framework })}</span>
                          </div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {t('gitApp.enginePreset')} <span className="font-mono text-[var(--foreground)]">{inspectResult.build_preset}</span>
                          </div>
                        </div>
                      </div>

                      <Badge variant="secondary" className="text-[10px] uppercase font-mono self-start sm:self-center">
                        {inspectResult.detected_engine}
                      </Badge>
                    </div>
                  )}

                  {/* Preset Quick Switcher */}
                  <div className="space-y-2">
                    <span className="block text-[11px] font-medium text-[var(--muted-foreground)]">
                      {t('gitApp.presetSwitch')}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {FRAMEWORK_PRESETS.map((p) => {
                        const isSelected = inspectResult?.framework.toLowerCase().includes(p.framework.toLowerCase());
                        return (
                          <button
                            key={p.framework}
                            type="button"
                            onClick={() => applyFrameworkPreset(p)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition border flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent shadow-xs'
                                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                            }`}
                          >
                            <BrandIcon
                              name={p.framework}
                              mono={isSelected}
                              className="w-3.5 h-3.5"
                              fallback={<Cpu className="w-3.5 h-3.5" />}
                            />
                            <span>{p.framework}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* Card 3: Identity, Domain & Build Settings */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-[var(--muted-foreground)]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                    {t('gitApp.buildSettings')}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOverrideBuild(!overrideBuild)}
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-md transition ${
                    overrideBuild
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)]'
                  }`}
                >
                  {overrideBuild ? t('gitApp.customActive') : t('gitApp.modifySettings')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                    {t('gitApp.appName')}
                  </label>
                  <Input
                    type="text"
                    value={isStackMode && activeStackSvc ? activeStackSvc.appName : appName}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
                      if (isStackMode) updateActiveStackSvc({ appName: val });
                      else setAppName(val);
                    }}
                    className="h-9 text-xs font-mono"
                    placeholder="e.g. my-app"
                    required
                  />
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    <span>{t('gitApp.serverPath')}</span>
                    <span className="font-mono text-[var(--foreground)]">/var/www/{(isStackMode && activeStackSvc ? activeStackSvc.appName : appName) || 'my-app'}</span>
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-[var(--foreground)]">
                      {t('gitApp.domain')}
                    </label>
                    <div className="flex items-center gap-1 p-0.5 bg-[var(--muted)]/60 rounded text-[10px]">
                      <button
                        type="button"
                        onClick={() => setExposureMode('public')}
                        className={`px-2 py-0.5 rounded transition ${
                          exposureMode === 'public'
                            ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-xs'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                        title="Standard Public IP with Nginx & Let's Encrypt SSL"
                      >
                        Public Nginx
                      </button>
                      <button
                        type="button"
                        onClick={() => setExposureMode('tunnel')}
                        className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                          exposureMode === 'tunnel'
                            ? 'bg-amber-500/20 text-amber-300 font-semibold shadow-xs'
                            : 'text-[var(--muted-foreground)] hover:text-amber-400'
                        }`}
                        title="Cloudflare Tunnel (for local servers, WSL, or private NAT/Tailscale)"
                      >
                        <Radio className="w-2.5 h-2.5" />
                        CF Tunnel
                      </button>
                      <button
                        type="button"
                        onClick={() => setExposureMode('none')}
                        className={`px-2 py-0.5 rounded transition ${
                          exposureMode === 'none'
                            ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold shadow-xs'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                        title="Internal port only"
                      >
                        Port Only
                      </button>
                    </div>
                  </div>

                  {exposureMode !== 'none' ? (
                    <>
                      <Input
                        type="text"
                        value={isStackMode && activeStackSvc ? activeStackSvc.customDomain : customDomain}
                        onChange={(e) => {
                          const val = e.target.value.toLowerCase().trim();
                          if (isStackMode) updateActiveStackSvc({ customDomain: val });
                          else setCustomDomain(val);
                        }}
                        className="h-9 text-xs font-mono"
                        placeholder={exposureMode === 'tunnel' ? "e.g. mainwarewolf.supraairways.space" : "e.g. app.domainanda.com"}
                      />

                      {exposureMode === 'public' && (
                        <>
                          <DnsPreFlightBadge
                            domain={isStackMode && activeStackSvc ? activeStackSvc.customDomain : customDomain}
                            serverIp={server.host}
                          />
                          <p className="text-[10px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1.5">
                            <BrandIcon name="nginx" className="w-3 h-3" />
                            <span>{t('gitApp.domainHint')}</span>
                          </p>
                        </>
                      )}

                      {exposureMode === 'tunnel' && (
                        <div className="mt-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold flex items-center gap-1">
                              <Radio className="w-3 h-3 text-amber-400" />
                              Tunnel: {tunnelStatus?.tunnelName || tunnelStatus?.tunnelId || 'Auto-detecting...'}
                            </span>
                            {tunnelStatus?.active ? (
                              <Badge variant="success" className="text-[9px] py-0">● Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[9px] py-0">Checking...</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-amber-200/70 leading-relaxed">
                            Automatically appends route to <code>config.yml</code> and executes <code>cloudflared tunnel route dns</code> without exposing firewall ports.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] text-[var(--muted-foreground)] italic py-1">
                      No public domain. Served internally on port <code>{isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort}</code>.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--border)]/60">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] mb-1">
                    <BrandIcon name="npm" className="w-3 h-3" />
                    <span>{t('gitApp.installCmd')}</span>
                  </label>
                  <Input
                    type="text"
                    value={isStackMode && activeStackSvc ? activeStackSvc.installCmd : installCmd}
                    onChange={(e) => {
                      if (isStackMode) updateActiveStackSvc({ installCmd: e.target.value });
                      else setInstallCmd(e.target.value);
                    }}
                    disabled={!overrideBuild}
                    className="h-8 text-xs font-mono disabled:opacity-75"
                    placeholder="e.g. npm ci"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] mb-1">
                    <Layers className="w-3 h-3" />
                    <span>{t('gitApp.buildCmd')}</span>
                  </label>
                  <Input
                    type="text"
                    value={isStackMode && activeStackSvc ? activeStackSvc.buildCmd : buildCmd}
                    onChange={(e) => {
                      if (isStackMode) updateActiveStackSvc({ buildCmd: e.target.value });
                      else setBuildCmd(e.target.value);
                    }}
                    disabled={!overrideBuild}
                    className="h-8 text-xs font-mono disabled:opacity-75"
                    placeholder="e.g. npm run build"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] mb-1">
                    <BrandIcon name="pm2" className="w-3 h-3" />
                    <span>{t('gitApp.startCmd')}</span>
                  </label>
                  <Input
                    type="text"
                    value={isStackMode && activeStackSvc ? activeStackSvc.startCmd : startCmd}
                    onChange={(e) => {
                      if (isStackMode) updateActiveStackSvc({ startCmd: e.target.value });
                      else setStartCmd(e.target.value);
                    }}
                    disabled={!overrideBuild}
                    className="h-8 text-xs font-mono disabled:opacity-75"
                    placeholder="e.g. npm start"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]">
                      <Globe className="w-3 h-3" />
                      <span>{t('gitApp.internalPort')}</span>
                    </label>
                    {(usedPorts.includes(isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort) || (isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort) === 80 || (isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort) === 443) ? (
                      <button
                        type="button"
                        onClick={() => {
                          const p = freePort(isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort, usedPorts);
                          if (isStackMode) updateActiveStackSvc({ internalPort: p });
                          else setInternalPort(p);
                        }}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
                      >
                        Busy → Use :{freePort(isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort, usedPorts)}
                      </button>
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Port Free
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    value={isStackMode && activeStackSvc ? activeStackSvc.internalPort : internalPort}
                    onChange={(e) => {
                      const p = parseInt(e.target.value, 10) || 3000;
                      if (isStackMode) updateActiveStackSvc({ internalPort: p });
                      else setInternalPort(p);
                    }}
                    disabled={!overrideBuild}
                    className="h-8 text-xs font-mono disabled:opacity-75"
                    placeholder="3000"
                  />
                </div>
              </div>
            </Card>

            {/* Card 4: Environment Variables (.env) */}
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                    {t('gitApp.envVars')}
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    .env (0600)
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBulkEnv(!showBulkEnv)}
                    className="text-[11px] text-[var(--primary)] hover:underline font-medium"
                  >
                    {showBulkEnv ? t('gitApp.rowView') : t('gitApp.pasteEnv')}
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddEnv}
                    className="h-7 px-2 text-[11px] gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t('gitApp.addEnv')}</span>
                  </Button>
                </div>
              </div>

              {showBulkEnv ? (
                <div className="space-y-2.5">
                  <textarea
                    rows={5}
                    value={bulkEnvText}
                    onChange={(e) => setBulkEnvText(e.target.value)}
                    placeholder="NODE_ENV=production&#10;PORT=3000&#10;DATABASE_URL=postgres://..."
                    className="w-full text-xs font-mono p-3 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleParseBulkEnv}
                    className="h-7 text-xs"
                  >
                    {t('gitApp.applyEnv')}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {currentEnvVars.map((env, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="text"
                        placeholder="KEY"
                        value={env.key}
                        onChange={(e) => handleEnvChange(idx, 'key', e.target.value)}
                        className="h-8 text-xs font-mono flex-1 uppercase"
                      />
                      <span className="text-xs text-[var(--muted-foreground)] font-mono">=</span>
                      <Input
                        type="text"
                        placeholder="VALUE"
                        value={env.value}
                        onChange={(e) => handleEnvChange(idx, 'value', e.target.value)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      {currentEnvVars.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEnv(idx)}
                          className="text-red-500 hover:text-red-600 p-1.5 rounded-md hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* RIGHT COLUMN (4 COLS): STICKY DEPLOYMENT BLUEPRINT SUMMARY */}
          <div className="lg:col-span-4 lg:sticky lg:top-4 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--primary)]" />
                  <span>{t('gitApp.blueprintTitle')}</span>
                </h3>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5 leading-relaxed">
                  {t('gitApp.blueprintSub')}
                </p>
              </div>

              {/* Blueprint Stack Rows */}
              <div className="space-y-2.5 text-xs">
                {isStackMode ? (
                  <div className="space-y-2.5">
                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <BrandIcon name="github" className="w-3.5 h-3.5 text-[var(--foreground)]" />
                        <span>{t('gitApp.bpSource')}</span>
                      </div>
                      <span className="font-mono font-semibold text-[var(--foreground)] truncate max-w-[160px]">
                        {selectedRepo.name} ({selectedBranch})
                      </span>
                    </div>

                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] pt-1 flex items-center justify-between">
                      <span>Stack Services ({stackServices.filter((s) => s.selected).length}):</span>
                    </div>

                    <div className="space-y-2">
                      {stackServices.filter((s) => s.selected).map((svc) => (
                        <div key={svc.id} className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 text-xs space-y-1">
                          <div className="flex items-center justify-between font-mono font-bold text-[var(--foreground)]">
                            <div className="flex items-center gap-1.5 truncate">
                              <BrandIcon name={svc.framework} className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{svc.appName}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">:{svc.internalPort}</Badge>
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)] flex items-center gap-2 flex-wrap">
                            <span>{svc.rootDir}</span>
                            <span>•</span>
                            <span>{svc.detectedEngine === 'docker' ? 'Docker' : 'PM2'}</span>
                            <span>•</span>
                            <span>{svc.envVars.filter((e) => e.key).length} env vars</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <BrandIcon name="github" className="w-3.5 h-3.5 text-[var(--foreground)]" />
                        <span>{t('gitApp.bpSource')}</span>
                      </div>
                      <span className="font-mono font-semibold text-[var(--foreground)] truncate max-w-[160px]">
                        {selectedRepo.name} ({selectedBranch})
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <BrandIcon
                          name={activeFramework}
                          className="w-3.5 h-3.5"
                          fallback={<Cpu className="w-3.5 h-3.5 text-[var(--foreground)]" />}
                        />
                        <span>{t('gitApp.bpRuntime')}</span>
                      </div>
                      <span className="font-mono font-semibold text-[var(--foreground)]">
                        {activeFramework}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <BrandIcon
                          name={inspectResult?.detected_engine === 'docker' ? 'docker' : 'pm2'}
                          className="w-3.5 h-3.5"
                          fallback={<Server className="w-3.5 h-3.5" />}
                        />
                        <span>{t('gitApp.bpProcess')}</span>
                      </div>
                      <span className="font-mono text-[var(--foreground)]">
                        {inspectResult?.detected_engine === 'docker' ? 'Docker' : 'PM2'} (:{internalPort})
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <BrandIcon name="nginx" className="w-3.5 h-3.5" />
                        <span>{t('gitApp.bpProxy')}</span>
                      </div>
                      <span className="font-mono text-[var(--foreground)] truncate max-w-[150px]">
                        {customDomain || `${server.host}:${internalPort}`}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--muted)]/40 border border-[var(--border)] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Lock className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{t('gitApp.bpEnv')}</span>
                      </div>
                      <span className="font-mono text-[var(--foreground)]">
                        {t('gitApp.bpEnvCount', { count: envVars.filter((e) => e.key).length })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Server software the deploy needs */}
              <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--foreground)]">
                  <span>{t('gitApp.requirements')}</span>
                  <button type="button" onClick={scanSoftware} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label={t('gitApp.recheck')}>
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingSoftware ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {required.map((id) => {
                    const ok = installedIds?.has(id) && !missing.includes(id);
                    return (
                      <span
                        key={id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono ${
                          !installedIds
                            ? 'border-[var(--border)] text-[var(--muted-foreground)]'
                            : ok
                            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                            : 'border-amber-500/40 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {installedIds && (ok ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />)}
                        {id}
                        {id === 'node' && plan.nodeTooOld && ` ${installedIds?.get('node')} → ${nodeMajor}`}
                      </span>
                    );
                  })}
                </div>
                {missing.length > 0 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">{t('gitApp.reqMissing', { count: missing.length })}</p>
                )}
              </div>

              {/* Safe Preview Notice */}
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{t('gitApp.previewModeNotice')}</span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAskAiPreflight}
                  className="w-full text-xs gap-1.5 h-8 text-[var(--muted-foreground)] hover:text-amber-500 hover:bg-amber-500/10 transition border border-dashed border-[var(--border)] hover:border-amber-500/30"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>{t('gitApp.aiPreflight')}</span>
                </Button>

                <Button
                  size="lg"
                  variant="default"
                  onClick={handleStartDeploy}
                  disabled={inspecting || checkingSoftware}
                  className="w-full text-xs font-semibold gap-2 h-10"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isStackMode
                      ? `Deploy Stack (${stackServices.filter((s) => s.selected).length} Services)`
                      : (missing.length ? t('gitApp.installAndDeploy', { count: missing.length }) : t('gitApp.startDeploy'))}
                  </span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep('repo')}
                  className="w-full text-xs gap-1.5 h-8"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{t('gitApp.changeRepo')}</span>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ================= STEP 3: FULL-WIDTH MISSION CONTROL LIVE DEPLOYMENT ================= */}
      {step === 'deploying' && (
        <DeployProgress
          task={isStackMode ? undefined : deployTask}
          stageDefs={stageDefs}
          server={server}
          framework={activeFramework}
          repoName={selectedRepo?.full_name}
          branch={selectedBranch}
          appName={appName}
          port={internalPort}
          domain={customDomain}
          services={
            isStackMode
              ? stackServices
                  .filter((s) => s.selected)
                  .map((s) => ({
                    id: s.id,
                    appName: s.appName,
                    rootDir: s.rootDir,
                    framework: s.framework,
                    port: s.internalPort,
                    domain: s.customDomain,
                    task: tasks.find((tk) => tk.id === s.taskId),
                    stageDefs: s.stageDefs || [],
                    status: s.status
                  }))
              : undefined
          }
          onBackToConfig={() => setStep('config')}
          onRetry={() => (isStackMode ? handleStartDeploy() : retryDeploy())}
          onDone={onClose}
        />
      )}
      <SudoPasswordModal
        isOpen={sudoModalOpen}
        onClose={() => setSudoModalOpen(false)}
        onConfirm={handleSudoConfirm}
        serverName={server.name}
        username={server.username}
        hasExistingPassword={server.hasSudoPassword}
        reason={t('gitApp.sudoReason')}
      />
    </div>
  );
}
