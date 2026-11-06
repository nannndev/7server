import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FolderGit2, GitBranch, ArrowLeft, ArrowRight, Check,
  Search, Lock, Globe, ExternalLink, RefreshCw, Cpu,
  Settings2, Plus, Trash2, Server, Terminal,
  Copy, CheckCircle2, Play, Activity, ShieldCheck, Zap,
  Building2, User, ChevronDown, ChevronRight, Users,
  Layers, HardDrive, Code2, Calendar, Folder, CornerDownRight
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { toast } from '@/shared/ui/toast';
import { useT } from '@/shared/i18n';
import type { ServerItem } from '@/features/servers/types';
import type { SafeGitIntegration, NormalizedRepo, InspectResult, DetectedEngine } from '@/features/git/types';
import type { WebAppInfo } from '@/features/webapps/types';
import {
  fetchGitIntegrations,
  fetchGitHubRepos,
  fetchGitHubBranches,
  inspectGitHubRepo,
  connectGitViaToken
} from '@/features/git/api';

interface NewAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: ServerItem;
  onAppCreated?: (newApp: WebAppInfo) => void;
  onOpenIntegrations?: () => void;
}

type WizardStep = 'repo' | 'config' | 'deploying';

interface PipelineStage {
  id: string;
  label: string;
  sub: string;
  brand: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  duration?: string;
}

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
    preset: 'Frontend SPA (Vite)',
    install: 'npm ci',
    build: 'npm run build',
    start: 'npx serve -s dist -l 3000',
    port: 3000
  },
  {
    framework: 'Laravel',
    engine: 'native_php',
    preset: 'Laravel PHP-FPM + Nginx',
    install: 'composer install --no-dev --optimize-autoloader',
    build: 'php artisan config:cache && php artisan route:cache',
    start: 'php-fpm',
    port: 9000
  },
  {
    framework: 'Docker',
    engine: 'docker',
    preset: 'Docker Container',
    install: 'docker pull',
    build: 'docker build -t app .',
    start: 'docker run -d -p 3000:3000 app',
    port: 3000
  },
  {
    framework: 'Python',
    engine: 'native_python',
    preset: 'Python / FastAPI / Gunicorn',
    install: 'pip install -r requirements.txt',
    build: 'python -m compileall .',
    start: 'uvicorn main:app --host 0.0.0.0 --port 8000',
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

function RepoGridSkeleton() {
  return (
    <div className="space-y-4">
      {[4, 2].map((count, gIdx) => (
        <div key={gIdx} className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)]">
          <div className="px-4 py-3 bg-[var(--muted)]/50 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-32 h-4 rounded" />
              <Skeleton className="w-16 h-4 rounded" />
            </div>
            <Skeleton className="w-20 h-4 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
            {Array.from({ length: count }, (_, rIdx) => (
              <div key={rIdx} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/40 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="w-32 h-3.5 rounded" />
                      <Skeleton className="w-20 h-2.5 rounded" />
                    </div>
                  </div>
                  <Skeleton className="w-20 h-7 rounded-md" />
                </div>
                <Skeleton className="w-full h-3 rounded" />
                <div className="flex items-center gap-3 pt-1">
                  <Skeleton className="w-16 h-3 rounded" />
                  <Skeleton className="w-14 h-3 rounded" />
                  <Skeleton className="w-20 h-3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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

  // Integrations & Repos
  const [integrations, setIntegrations] = useState<SafeGitIntegration[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [repos, setRepos] = useState<NormalizedRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoTypeFilter, setRepoTypeFilter] = useState<'all' | 'public' | 'private'>('all');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [collapsedOwners, setCollapsedOwners] = useState<Record<string, boolean>>({});
  const [inlineToken, setInlineToken] = useState('');
  const [connectingToken, setConnectingToken] = useState(false);

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

  // Deployment simulation state
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [deployFinished, setDeployFinished] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [copiedLog, setCopiedLog] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const loadReposList = async () => {
    try {
      setLoadingIntegrations(true);
      const ints = await fetchGitIntegrations();
      setIntegrations(ints);

      if (ints.length > 0) {
        setLoadingRepos(true);
        const repoList = await fetchGitHubRepos();
        setRepos(repoList);
      }
    } catch (err: any) {
      toast.error(err.message || t('gitApp.loadRepoError'));
    } finally {
      setLoadingIntegrations(false);
      setLoadingRepos(false);
    }
  };

  // Load Integrations & Repos on open
  useEffect(() => {
    if (!isOpen) return;
    setStep('repo');
    setSelectedRepo(null);
    setSelectedOwner('all');
    setSelectedLanguage('all');
    setInspectResult(null);
    setDeployFinished(false);
    setLogs([]);
    setElapsedSec(0);
    loadReposList();
  }, [isOpen]);

  const handleInlineConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineToken.trim()) return;

    try {
      setConnectingToken(true);
      const saved = await connectGitViaToken(inlineToken.trim());
      setIntegrations([saved]);
      toast.success(t('integrations.tokenConnected', { username: saved.username }));

      setLoadingRepos(true);
      const repoList = await fetchGitHubRepos();
      setRepos(repoList);
    } catch (err: any) {
      toast.error(err.message || t('integrations.invalidToken'));
    } finally {
      setConnectingToken(false);
      setLoadingRepos(false);
    }
  };

  const toggleOwnerCollapse = (owner: string) => {
    setCollapsedOwners((prev) => ({ ...prev, [owner]: !prev[owner] }));
  };

  // Extract distinct owners & count
  const ownerStats = useMemo(() => {
    const map = new Map<string, { owner: string; avatar_url?: string; type?: string; count: number }>();
    for (const r of repos) {
      const o = r.owner?.login || r.full_name.split('/')[0] || 'other';
      const existing = map.get(o) || {
        owner: o,
        avatar_url: r.owner?.avatar_url,
        type: r.owner?.type,
        count: 0
      };
      existing.count += 1;
      map.set(o, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [repos]);

  // Extract distinct languages & count
  const languageStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of repos) {
      if (r.language) {
        map.set(r.language, (map.get(r.language) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([lang, count]) => ({ lang, count }))
      .sort((a, b) => b.count - a.count);
  }, [repos]);

  // Filter repos by search, type, owner, and language
  const filteredRepos = useMemo(() => {
    return repos.filter((r) => {
      const ownerName = r.owner?.login || r.full_name.split('/')[0] || '';
      if (selectedOwner !== 'all' && ownerName !== selectedOwner) return false;
      if (selectedLanguage !== 'all' && r.language !== selectedLanguage) return false;
      if (repoTypeFilter === 'public' && r.private) return false;
      if (repoTypeFilter === 'private' && !r.private) return false;
      if (!repoSearch.trim()) return true;
      const q = repoSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.full_name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    });
  }, [repos, selectedOwner, selectedLanguage, repoTypeFilter, repoSearch]);

  // Group filtered repos by owner
  const groupedRepos = useMemo(() => {
    const map = new Map<string, {
      owner: string;
      avatar_url?: string;
      type?: string;
      repos: NormalizedRepo[];
    }>();

    for (const r of filteredRepos) {
      const o = r.owner?.login || r.full_name.split('/')[0] || 'other';
      if (!map.has(o)) {
        map.set(o, {
          owner: o,
          avatar_url: r.owner?.avatar_url,
          type: r.owner?.type,
          repos: []
        });
      }
      map.get(o)!.repos.push(r);
    }

    return Array.from(map.values());
  }, [filteredRepos]);

  // Inspect a specific repo & branch & directory
  const runRepoInspection = async (repo: NormalizedRepo, branchName: string, subDir = '/') => {
    setInspecting(true);
    try {
      const [owner, repoName] = repo.full_name.split('/');
      const result = await inspectGitHubRepo({
        owner,
        repo: repoName,
        branch: branchName,
        subDir
      });

      setInspectResult(result);
      if (result.available_directories && result.available_directories.length > 0) {
        setAvailableDirs(result.available_directories);
      }
      setRootDir(result.suggested_config.root_dir);
      setInstallCmd(result.suggested_config.install_command);
      setBuildCmd(result.suggested_config.build_command);
      setStartCmd(result.suggested_config.start_command);
      setInternalPort(result.suggested_config.internal_port);
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
      await runRepoInspection(selectedRepo, selectedBranch, selectedDir);
    }
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

    await runRepoInspection(repo, defaultBr, '/');
  };

  const handleBranchChange = async (newBranch: string) => {
    setSelectedBranch(newBranch);
    if (selectedRepo) {
      await runRepoInspection(selectedRepo, newBranch, rootDir);
    }
  };

  const applyFrameworkPreset = (p: (typeof FRAMEWORK_PRESETS)[number]) => {
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
    setInternalPort(p.port);
  };

  const handleAddEnv = () => {
    setEnvVars([...envVars, { key: '', value: '' }]);
  };

  const handleRemoveEnv = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleEnvChange = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...envVars];
    next[index][field] = val;
    setEnvVars(next);
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
      setEnvVars(parsed);
      setShowBulkEnv(false);
      toast.success(t('gitApp.envImportSuccess', { count: parsed.length }));
    } else {
      toast.error(t('gitApp.envImportError'));
    }
  };

  // Start UI Deployment Simulation (Safe, without hitting real remote server)
  const handleStartDeploy = () => {
    if (!appName.trim()) {
      toast.error(t('gitApp.nameRequired'));
      return;
    }

    setStep('deploying');
    setDeployFinished(false);
    setLogs([]);
    setElapsedSec(0);

    const fw = inspectResult?.framework || 'Node.js';
    const initialStages: PipelineStage[] = [
      { id: 'clone', label: 'Clone Git Repository', sub: `${selectedRepo?.full_name} @ ${selectedBranch}`, brand: 'git', status: 'waiting' },
      { id: 'env', label: 'Inject Environment (.env)', sub: `${envVars.filter((e) => e.key).length} variables (0600)`, brand: 'linux', status: 'waiting' },
      { id: 'install', label: 'Install Dependencies', sub: installCmd || 'npm ci', brand: installCmd.includes('composer') ? 'composer' : installCmd.includes('pip') ? 'python' : 'npm', status: 'waiting' },
      { id: 'build', label: 'Compile & Build Artifact', sub: buildCmd || 'npm run build', brand: fw, status: 'waiting' },
      { id: 'process', label: 'Process Manager & Port', sub: `PM2 / Runtime :${internalPort}`, brand: inspectResult?.detected_engine === 'docker' ? 'docker' : 'pm2', status: 'waiting' },
      { id: 'health', label: 'Reverse Proxy & Health Check', sub: customDomain || `http://127.0.0.1:${internalPort}`, brand: 'nginx', status: 'waiting' }
    ];
    setStages(initialStages);

    const timer = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    const logEvents: Array<{
      delay: number;
      stageId?: string;
      stageStatus?: PipelineStage['status'];
      stageDuration?: string;
      text: string;
    }> = [
      { delay: 400, stageId: 'clone', stageStatus: 'running', text: `\x1b[35m[7Server]\x1b[0m Inisialisasi pipeline deployment ke target ${server.name} (${server.host})...` },
      { delay: 800, text: `\x1b[35m[7Server]\x1b[0m Membuat workspace direktori: /var/www/${appName}` },
      { delay: 1300, text: `\x1b[36m[git]\x1b[0m git clone --depth=1 --branch ${selectedBranch} https://github.com/${selectedRepo?.full_name}.git /var/www/${appName}` },
      { delay: 1900, text: `\x1b[36m[git]\x1b[0m Receiving objects: 100% (238/238), 1.84 MiB | 4.82 MiB/s, done.` },
      { delay: 2300, stageId: 'clone', stageStatus: 'completed', stageDuration: '1.9s', text: `\x1b[32m✔ [git]\x1b[0m Checked out branch '${selectedBranch}' (commit: 7b89f2a).` },

      { delay: 2600, stageId: 'env', stageStatus: 'running', text: `\x1b[33m[env]\x1b[0m Menyiapkan file konfigurasi /var/www/${appName}/.env...` },
      { delay: 3000, stageId: 'env', stageStatus: 'completed', stageDuration: '0.4s', text: `\x1b[32m✔ [env]\x1b[0m ${envVars.filter((e) => e.key).length} environment variables berhasil diinjeksi dengan mode 0600.` },

      { delay: 3300, stageId: 'install', stageStatus: 'running', text: `\x1b[34m[install]\x1b[0m Menjalankan perintah: ${installCmd || 'npm ci'}` },
      { delay: 4200, text: `\x1b[34m[install]\x1b[0m [pkg] Resolving dependency tree & lockfile...` },
      { delay: 5100, text: `\x1b[34m[install]\x1b[0m [pkg] Added 382 packages in 2.14s` },
      { delay: 5500, stageId: 'install', stageStatus: 'completed', stageDuration: '2.2s', text: `\x1b[32m✔ [install]\x1b[0m Dependensi berhasil dipasang tanpa vulnerabilitas kritis.` },

      { delay: 5800, stageId: 'build', stageStatus: 'running', text: `\x1b[34m[build]\x1b[0m Menjalankan: ${buildCmd || 'npm run build'}` },
      { delay: 6700, text: `\x1b[34m[build]\x1b[0m Creating an optimized production build (${fw})...` },
      { delay: 7600, text: `\x1b[34m[build]\x1b[0m Compiled successfully. Client bundle (482 kB) + Server runtime (1.2 MB).` },
      { delay: 8100, stageId: 'build', stageStatus: 'completed', stageDuration: '2.3s', text: `\x1b[32m✔ [build]\x1b[0m Build artifact siap di /var/www/${appName}.` },

      { delay: 8400, stageId: 'process', stageStatus: 'running', text: `\x1b[35m[pm2]\x1b[0m Mendaftarkan process runner: "${appName}"` },
      { delay: 9200, text: `\x1b[35m[pm2]\x1b[0m Executing: ${startCmd || 'npm start'} (internal port :${internalPort})` },
      { delay: 9700, stageId: 'process', stageStatus: 'completed', stageDuration: '1.3s', text: `\x1b[32m✔ [pm2]\x1b[0m App "${appName}" status: ONLINE (PID: 34182, Memory: 42MB).` },

      { delay: 10000, stageId: 'health', stageStatus: 'running', text: `\x1b[36m[nginx]\x1b[0m ${customDomain ? `Membuat Nginx reverse proxy untuk ${customDomain} -> 127.0.0.1:${internalPort}` : `Mengaktifkan bind port lokal :${internalPort}`}` },
      { delay: 10600, text: `\x1b[32m[health]\x1b[0m HTTP GET http://127.0.0.1:${internalPort}/ -> Status: 200 OK (latency: 14ms).` },
      { delay: 11200, stageId: 'health', stageStatus: 'completed', stageDuration: '1.2s', text: `\x1b[32m🎉 [7Server]\x1b[0m Aplikasi berhasil dideploy dan siap melayani trafik!` }
    ];

    logEvents.forEach((evt) => {
      setTimeout(() => {
        setLogs((prev) => [...prev, evt.text]);
        if (evt.stageId && evt.stageStatus) {
          setStages((prev) =>
            prev.map((s) =>
              s.id === evt.stageId
                ? { ...s, status: evt.stageStatus!, duration: evt.stageDuration || s.duration }
                : s
            )
          );
        }
      }, evt.delay);
    });

    // Complete deployment
    setTimeout(() => {
      clearInterval(timer);
      setDeployFinished(true);

      const createdApp: WebAppInfo = {
        name: appName,
        type: inspectResult?.framework || 'Node.js',
        domain: customDomain || '',
        ports: String(internalPort),
        gitBranch: selectedBranch,
        path: `/var/www/${appName}`,
        modified: t('gitApp.justNow')
      };

      onAppCreated?.(createdApp);
      toast.success(t('gitApp.deploySuccess'));
    }, 11600);
  };

  const copyLogText = () => {
    const raw = logs.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '')).join('\n');
    navigator.clipboard.writeText(raw);
    setCopiedLog(true);
    setTimeout(() => setCopiedLog(false), 2000);
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
        <>
          {integrations.length === 0 && !loadingIntegrations ? (
            <Card className="p-8 max-w-xl mx-auto space-y-5">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)] mx-auto">
                  <BrandIcon name="github" className="w-6 h-6" fallback={<FolderGit2 className="w-6 h-6" />} />
                </div>
                <h3 className="text-base font-bold text-[var(--foreground)]">{t('integrations.connectGitHub')}</h3>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed max-w-md mx-auto">
                  {t('integrations.patNoDomain')}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--foreground)]">{t('integrations.patBestFor')}</span>
                  <Badge variant="success" className="text-[9px]">{t('integrations.zeroConfig')}</Badge>
                </div>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user,admin:repo_hook&description=7Server+Control+Panel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-xs shadow-xs hover:opacity-90 transition"
                >
                  <span>{t('integrations.generateTokenGithub')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {t('integrations.copyTokenInstruction')}
                </p>
              </div>

              <form onSubmit={handleInlineConnectToken} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                    {t('integrations.patLabel')}:
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={inlineToken}
                    onChange={(e) => setInlineToken(e.target.value)}
                    className="h-9 text-xs font-mono"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  variant="default"
                  disabled={connectingToken}
                  className="w-full h-9 text-xs gap-1.5"
                >
                  <Zap className={`w-3.5 h-3.5 text-amber-500 ${connectingToken ? 'animate-spin' : ''}`} />
                  <span>{connectingToken ? t('gitApp.connectingToken') : t('gitApp.connectAndLoad')}</span>
                </Button>
              </form>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT SIDEBAR: ACCOUNTS, STACK & VISIBILITY FILTERS */}
              <div className="lg:col-span-3 space-y-4">
                {/* Accounts & Orgs Card */}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                      {t('gitApp.accountsHeader')}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {ownerStats.length}
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSelectedOwner('all')}
                      className={`w-full px-2.5 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                        selectedOwner === 'all'
                          ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                          : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{t('gitApp.allOwners')}</span>
                      </div>
                      <span className="text-[10px] font-mono opacity-75">{repos.length}</span>
                    </button>

                    {ownerStats.map((os) => {
                      const isActive = selectedOwner === os.owner;
                      return (
                        <button
                          key={os.owner}
                          type="button"
                          onClick={() => setSelectedOwner(os.owner)}
                          className={`w-full px-2.5 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between ${
                            isActive
                              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                              : 'text-[var(--foreground)] hover:bg-[var(--muted)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {os.avatar_url ? (
                              <img src={os.avatar_url} alt={os.owner} className="w-4 h-4 rounded-full shrink-0" />
                            ) : os.type === 'Organization' ? (
                              <Building2 className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate font-mono">{os.owner}</span>
                          </div>
                          <span className="text-[10px] font-mono opacity-75">{os.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {/* Tech Stack / Language Filter Card */}
                {languageStats.length > 0 && (
                  <Card className="p-4 space-y-3">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                      {t('gitApp.languagesHeader')}
                    </span>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedLanguage('all')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border ${
                          selectedLanguage === 'all'
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                            : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                        }`}
                      >
                        {t('gitApp.allLanguages')}
                      </button>

                      {languageStats.map(({ lang, count }) => {
                        const active = selectedLanguage === lang;
                        return (
                          <button
                            key={lang}
                            type="button"
                            onClick={() => setSelectedLanguage(active ? 'all' : lang)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border flex items-center gap-1.5 ${
                              active
                                ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                                : 'bg-[var(--background)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border-[var(--border)]'
                            }`}
                          >
                            <BrandIcon
                              name={lang}
                              mono={active}
                              className="w-3 h-3"
                              fallback={<Code2 className="w-3 h-3" />}
                            />
                            <span>{lang}</span>
                            <span className="opacity-60 font-mono text-[10px]">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Visibility Filter Card */}
                <Card className="p-4 space-y-3">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    {t('gitApp.visibilityHeader')}
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-[var(--muted)] p-1 rounded-lg border border-[var(--border)]">
                    {[
                      { key: 'all', label: t('gitApp.filterAll') },
                      { key: 'public', label: t('gitApp.filterPublic') },
                      { key: 'private', label: t('gitApp.filterPrivate') }
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRepoTypeFilter(key as any)}
                        className={`py-1.5 px-2 rounded-md text-[11px] font-medium capitalize transition ${
                          repoTypeFilter === key
                            ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs'
                            : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Card>
              </div>

              {/* RIGHT MAIN AREA: SEARCH & REPOSITORY CARDS GRID */}
              <div className="lg:col-span-9 space-y-4">
                {/* Search Bar */}
                <Card className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                    <Input
                      type="text"
                      placeholder={t('gitApp.searchRepo')}
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      className="pl-9 h-8 text-xs bg-[var(--background)]"
                    />
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
                      {t('gitApp.showingRepos', { filtered: filteredRepos.length, total: repos.length })}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={loadReposList}
                      disabled={loadingRepos}
                      className="h-8 gap-1.5 text-xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingRepos ? 'animate-spin' : ''}`} />
                      <span>{t('common.refresh')}</span>
                    </Button>
                  </div>
                </Card>

                {/* Repo Cards Grid or Skeleton */}
                {loadingRepos || loadingIntegrations ? (
                  <RepoGridSkeleton />
                ) : filteredRepos.length === 0 ? (
                  <Card className="text-center py-16 px-4 text-xs text-[var(--muted-foreground)] space-y-2">
                    <FolderGit2 className="w-8 h-8 mx-auto opacity-30" />
                    <p className="font-semibold text-[var(--foreground)]">{t('gitApp.noRepos')}</p>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {groupedRepos.map((group) => {
                      const isCollapsed = Boolean(collapsedOwners[group.owner]);
                      return (
                        <div
                          key={group.owner}
                          className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--card)] shadow-xs transition"
                        >
                          {/* Owner Group Header */}
                          <div
                            onClick={() => toggleOwnerCollapse(group.owner)}
                            className="px-4 py-3 bg-[var(--muted)]/50 border-b border-[var(--border)] flex items-center justify-between cursor-pointer select-none hover:bg-[var(--muted)] transition"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-[var(--muted-foreground)]">
                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </span>

                              {group.avatar_url ? (
                                <img
                                  src={group.avatar_url}
                                  alt={group.owner}
                                  className="w-6 h-6 rounded-full border border-[var(--border)]"
                                />
                              ) : group.type === 'Organization' ? (
                                <div className="w-6 h-6 rounded-md bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                                  <Building2 className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-md bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center text-[var(--foreground)]">
                                  <User className="w-3.5 h-3.5" />
                                </div>
                              )}

                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs font-mono text-[var(--foreground)]">
                                  {group.owner}
                                </span>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-normal">
                                  {group.type === 'Organization' ? t('gitApp.orgAccount') : t('gitApp.personalAccount')}
                                </Badge>
                              </div>
                            </div>

                            <Badge variant="outline" className="text-[10px] font-mono">
                              {t('gitApp.reposCount', { count: group.repos.length })}
                            </Badge>
                          </div>

                          {/* 2-Column Cards Grid inside each Owner Group */}
                          {!isCollapsed && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                              {group.repos.map((repo) => (
                                <div
                                  key={repo.id}
                                  className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)]/40 hover:bg-[var(--muted)]/40 hover:border-[var(--primary)]/40 transition flex flex-col justify-between gap-3 group"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                                          <BrandIcon
                                            name={repo.language || 'git'}
                                            className="w-4 h-4"
                                            fallback={<FolderGit2 className="w-4 h-4 text-[var(--muted-foreground)]" />}
                                          />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-xs text-[var(--foreground)] truncate">
                                              {repo.name}
                                            </span>
                                            {repo.private ? (
                                              <Badge variant="secondary" className="text-[9px] gap-0.5 px-1.5 py-0">
                                                <Lock className="w-2.5 h-2.5" /> Private
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-[9px] gap-0.5 px-1.5 py-0">
                                                <Globe className="w-2.5 h-2.5" /> Public
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
                                            {repo.full_name}
                                          </div>
                                        </div>
                                      </div>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleSelectRepo(repo)}
                                        className="h-7 text-xs gap-1 group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-foreground)] group-hover:border-transparent transition shrink-0"
                                      >
                                        <span>{t('gitApp.import')}</span>
                                        <ArrowRight className="w-3 h-3" />
                                      </Button>
                                    </div>

                                    <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 min-h-[2rem] leading-relaxed">
                                      {repo.description || t('gitApp.noDescription')}
                                    </p>
                                  </div>

                                  {/* Metadata Footer */}
                                  <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2 text-[10px] text-[var(--muted-foreground)] font-mono">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      {repo.language && (
                                        <span className="inline-flex items-center gap-1 text-[var(--foreground)]">
                                          <BrandIcon name={repo.language} className="w-3 h-3" />
                                          {repo.language}
                                        </span>
                                      )}
                                      <span className="inline-flex items-center gap-1">
                                        <GitBranch className="w-3 h-3" />
                                        {repo.default_branch}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      {repo.updated_at && (
                                        <span className="inline-flex items-center gap-1">
                                          <Calendar className="w-2.5 h-2.5" />
                                          {new Date(repo.updated_at).toLocaleDateString()}
                                        </span>
                                      )}
                                      <a
                                        href={repo.html_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="hover:text-[var(--foreground)] p-0.5"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
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
                    value={appName}
                    onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))}
                    className="h-9 text-xs font-mono"
                    placeholder="e.g. my-app"
                    required
                  />
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    <span>{t('gitApp.serverPath')}</span>
                    <span className="font-mono text-[var(--foreground)]">/var/www/{appName || 'my-app'}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                    {t('gitApp.domain')}
                  </label>
                  <Input
                    type="text"
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
                    className="h-9 text-xs font-mono"
                    placeholder="e.g. app.domainanda.com"
                  />
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1.5">
                    <BrandIcon name="nginx" className="w-3 h-3" />
                    <span>{t('gitApp.domainHint')}</span>
                  </p>
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
                    value={installCmd}
                    onChange={(e) => setInstallCmd(e.target.value)}
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
                    value={buildCmd}
                    onChange={(e) => setBuildCmd(e.target.value)}
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
                    value={startCmd}
                    onChange={(e) => setStartCmd(e.target.value)}
                    disabled={!overrideBuild}
                    className="h-8 text-xs font-mono disabled:opacity-75"
                    placeholder="e.g. npm start"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] mb-1">
                    <Globe className="w-3 h-3" />
                    <span>{t('gitApp.internalPort')}</span>
                  </label>
                  <Input
                    type="number"
                    value={internalPort}
                    onChange={(e) => setInternalPort(parseInt(e.target.value, 10) || 3000)}
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
                  {envVars.map((env, idx) => (
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
                      {envVars.length > 1 && (
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
              </div>

              {/* Safe Preview Notice */}
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{t('gitApp.previewModeNotice')}</span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <Button
                  size="lg"
                  variant="default"
                  onClick={handleStartDeploy}
                  disabled={inspecting}
                  className="w-full text-xs font-semibold gap-2 h-10"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{t('gitApp.startDeploy')}</span>
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
        <div className="space-y-5">
          {/* Top Mission Control Status Card */}
          <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[var(--muted)] border border-[var(--border)] flex items-center justify-center shrink-0">
                <BrandIcon
                  name={activeFramework}
                  className="w-6 h-6"
                  fallback={<Cpu className="w-6 h-6 text-[var(--foreground)]" />}
                />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-base font-bold text-[var(--foreground)]">
                    {deployFinished ? t('gitApp.deploySuccess') : t('gitApp.deployInProgress')}
                  </h3>
                  {deployFinished ? (
                    <Badge variant="success" className="text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {t('gitApp.statusLive')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] gap-1 animate-pulse">
                      <Activity className="w-3 h-3 text-emerald-400" /> {t('gitApp.statusBuilding', { sec: elapsedSec })}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-[var(--muted-foreground)] font-mono mt-1 flex items-center gap-2 flex-wrap">
                  <span>{selectedRepo?.full_name}</span>
                  <span>•</span>
                  <span>Branch: {selectedBranch}</span>
                  <span>•</span>
                  <span>Path: /var/www/{appName}</span>
                  <span>•</span>
                  <span>Port: :{internalPort}</span>
                </div>
              </div>
            </div>

            {deployFinished && (
              <div className="flex items-center gap-2">
                <a
                  href={`http://${customDomain || `${server.host}:${internalPort}`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition"
                >
                  <span>{t('gitApp.visitApp')}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <Button
                  variant="default"
                  size="sm"
                  onClick={onClose}
                  className="h-9 px-4 text-xs"
                >
                  {t('gitApp.done')}
                </Button>
              </div>
            )}
          </Card>

          {/* 2-Column Pipeline Stages + Wide Terminal Console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (4 cols): Vertical Pipeline Stages */}
            <Card className="lg:col-span-4 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                  {t('gitApp.pipelineStages')}
                </span>
                <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                  {stages.filter((s) => s.status === 'completed').length}/{stages.length}
                </span>
              </div>

              <div className="space-y-2">
                {stages.map((stg) => (
                  <div
                    key={stg.id}
                    className={`p-3 rounded-xl border text-xs transition flex items-center justify-between gap-3 ${
                      stg.status === 'completed'
                        ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400'
                        : stg.status === 'running'
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)] shadow-xs'
                        : 'border-[var(--border)] bg-[var(--background)]/40 text-[var(--muted-foreground)] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center justify-center shrink-0">
                        <BrandIcon
                          name={stg.brand}
                          className="w-3.5 h-3.5"
                          fallback={<Terminal className="w-3.5 h-3.5" />}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs truncate text-[var(--foreground)]">
                          {stg.label}
                        </div>
                        <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
                          {stg.sub}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)]">
                        {stg.duration || (stg.status === 'running' ? t('gitApp.statusRunning') : t('gitApp.statusWaiting'))}
                      </span>
                      {stg.status === 'completed' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      ) : stg.status === 'running' ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--foreground)]" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-[var(--border)]" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Right Column (8 cols): Wide Live Terminal Console */}
            <div className="lg:col-span-8 rounded-xl border border-[var(--border)] overflow-hidden bg-[#0a0e17] shadow-xl">
              <div className="px-4 py-2.5 bg-[#101726] border-b border-[var(--border)] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 ml-2">
                    <Terminal className="w-3.5 h-3.5" /> build-pipeline.log — {server.name} ({server.host})
                  </span>
                </div>

                <button
                  type="button"
                  onClick={copyLogText}
                  className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded hover:bg-zinc-800 transition"
                >
                  {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLog ? t('gitApp.copiedLog') : t('gitApp.copyLog')}</span>
                </button>
              </div>

              <div
                ref={terminalRef}
                className="p-5 font-mono text-xs leading-relaxed text-zinc-300 min-h-[420px] max-h-[540px] overflow-y-auto space-y-1.5 select-text"
              >
                {logs.map((log, index) => {
                  const cleaned = log
                    .replace(/\x1b\[35m/g, '<span class="text-purple-400">')
                    .replace(/\x1b\[36m/g, '<span class="text-cyan-400">')
                    .replace(/\x1b\[32m/g, '<span class="text-emerald-400 font-medium">')
                    .replace(/\x1b\[33m/g, '<span class="text-amber-400">')
                    .replace(/\x1b\[34m/g, '<span class="text-blue-400">')
                    .replace(/\x1b\[0m/g, '</span>');

                  return (
                    <div
                      key={index}
                      dangerouslySetInnerHTML={{ __html: cleaned }}
                      className="whitespace-pre-wrap break-all"
                    />
                  );
                })}

                {!deployFinished && (
                  <div className="flex items-center gap-2 text-zinc-500 animate-pulse pt-2">
                    <span className="inline-block w-2 h-4 bg-emerald-400" />
                    <span>{t('gitApp.executingStep')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
