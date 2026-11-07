import React, { useEffect, useState } from 'react';
import { Layers, X, RefreshCw, Play, FileCode, Sparkles, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useT } from '@/shared/i18n';
import { dockerDeployComposeStack, dockerReadComposeFile } from '../api';

interface ComposeStudioModalProps {
  serverId: string;
  isOpen: boolean;
  initialProject?: string;
  initialWorkingDir?: string;
  initialConfigFile?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const STACK_PRESETS = [
  {
    name: 'node-postgres-redis',
    label: 'Node + PostgreSQL + Redis',
    desc: 'Production-ready full stack web service',
    compose: `version: '3.8'

services:
  web:
    image: node:22-alpine
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgres://user:password@postgres:5432/app_db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: app_db
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
`,
    env: `PORT=3000
NODE_ENV=production
POSTGRES_PASSWORD=password
`
  },
  {
    name: 'nginx-proxy',
    label: 'Nginx Reverse Proxy',
    desc: 'High-performance web server & reverse proxy',
    compose: `version: '3.8'

services:
  proxy:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./html:/usr/share/nginx/html:ro
`,
    env: ''
  },
  {
    name: 'fastapi-postgres',
    label: 'FastAPI + PostgreSQL',
    desc: 'Modern Python REST API stack',
    compose: `version: '3.8'

services:
  api:
    image: python:3.12-alpine
    restart: unless-stopped
    ports:
      - "8000:8000"
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    environment:
      - DATABASE_URL=postgresql://user:secret@db:5432/fastapi_db
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: fastapi_db
    volumes:
      - fastapi_pgdata:/var/lib/postgresql/data

volumes:
  fastapi_pgdata:
`,
    env: `API_SECRET_KEY=supersecretkey
`
  }
];

export function ComposeStudioModal({
  serverId,
  isOpen,
  initialProject,
  initialWorkingDir,
  initialConfigFile,
  onClose,
  onSuccess
}: ComposeStudioModalProps) {
  const t = useT();
  const [project, setProject] = useState(initialProject || '');
  const [workingDir, setWorkingDir] = useState(initialWorkingDir || '/srv/compose/app');
  const [configFile, setConfigFile] = useState(initialConfigFile || 'docker-compose.yml');
  const [composeContent, setComposeContent] = useState(STACK_PRESETS[0].compose);
  const [envContent, setEnvContent] = useState(STACK_PRESETS[0].env);
  const [activeTab, setActiveTab] = useState<'compose' | 'env'>('compose');
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  // If opening existing project, read its files
  useEffect(() => {
    if (!isOpen) return;
    if (initialProject && initialWorkingDir) {
      setProject(initialProject);
      setWorkingDir(initialWorkingDir);
      setConfigFile(initialConfigFile || 'docker-compose.yml');
      setReading(true);
      setError(null);
      dockerReadComposeFile(serverId, initialWorkingDir, initialConfigFile || 'docker-compose.yml')
        .then((res) => {
          setComposeContent(res.composeContent);
          setEnvContent(res.envContent);
        })
        .catch((e: any) => {
          setError(e.message || 'Failed to read compose file');
        })
        .finally(() => setReading(false));
    } else {
      setProject('');
      setWorkingDir('/srv/compose/app');
      setComposeContent(STACK_PRESETS[0].compose);
      setEnvContent(STACK_PRESETS[0].env);
      setOutput(null);
      setError(null);
    }
  }, [isOpen, initialProject, initialWorkingDir, initialConfigFile, serverId]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof STACK_PRESETS[0]) => {
    setComposeContent(preset.compose);
    setEnvContent(preset.env);
    if (!project) setProject(preset.name);
  };

  const handleDeploy = async () => {
    if (!project.trim() || !workingDir.trim() || !composeContent.trim()) return;
    setLoading(true);
    setError(null);
    setOutput(null);
    try {
      const res = await dockerDeployComposeStack(serverId, {
        project: project.trim(),
        workingDir: workingDir.trim(),
        composeContent,
        envContent: envContent.trim() ? envContent : undefined,
        configFile: configFile.trim() || 'docker-compose.yml'
      });
      setOutput(res || 'Stack deployed successfully!');
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Deploy failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="metal relative flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {initialProject ? t('docker.editStack') : t('docker.deployStack')}
              </h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Deploy multi-container stacks via Docker Compose with volume & network orchestration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--line)] hover:text-[var(--foreground)]"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Studio Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Metadata Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.projectName')} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. backend-api, shop-stack"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                disabled={loading || reading || !!initialProject}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                {t('docker.workingDir')} <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. /srv/compose/app"
                value={workingDir}
                onChange={(e) => setWorkingDir(e.target.value)}
                disabled={loading || reading}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-[var(--foreground)]">
                Config File
              </label>
              <Input
                placeholder="docker-compose.yml"
                value={configFile}
                onChange={(e) => setConfigFile(e.target.value)}
                disabled={loading || reading}
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>

          {/* Quick Presets (only for new stack) */}
          {!initialProject && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
                <Sparkles className="h-3 w-3 text-[var(--accent)]" />
                {t('docker.composePresets')}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {STACK_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="flex flex-col items-start rounded-xl border border-[var(--border)] p-2.5 text-left transition-all hover:border-[var(--primary)] hover:bg-[var(--muted)]/50"
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">{p.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Editor Tabs: docker-compose.yml vs .env */}
          <div className="rounded-xl border border-[var(--border)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--muted)]/60 px-3 py-1.5">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('compose')}
                  className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                    activeTab === 'compose' ? 'bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  docker-compose.yml
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('env')}
                  className={`rounded-md px-3 py-1 text-xs font-mono transition-colors ${
                    activeTab === 'env' ? 'bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  .env {envContent.trim() ? '(configured)' : ''}
                </button>
              </div>
              <span className="font-mono text-[10px] text-[var(--muted-foreground)]">YAML & Env Editor</span>
            </div>

            <div className="p-3 bg-[var(--background)]">
              {reading ? (
                <div className="flex h-64 items-center justify-center text-xs text-[var(--muted-foreground)]">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading compose configuration...
                </div>
              ) : activeTab === 'compose' ? (
                <textarea
                  value={composeContent}
                  onChange={(e) => setComposeContent(e.target.value)}
                  disabled={loading}
                  rows={13}
                  className="w-full resize-y font-mono text-[12px] leading-relaxed bg-transparent outline-none"
                  placeholder="Paste or type docker-compose.yml content..."
                />
              ) : (
                <textarea
                  value={envContent}
                  onChange={(e) => setEnvContent(e.target.value)}
                  disabled={loading}
                  rows={13}
                  className="w-full resize-y font-mono text-[12px] leading-relaxed bg-transparent outline-none"
                  placeholder="KEY=value (Environment variables passed to Compose)..."
                />
              )}
            </div>
          </div>

          {/* Output / Feedback */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="whitespace-pre-wrap">{error}</div>
            </div>
          )}

          {output && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 font-mono text-[11px] text-emerald-400">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <Check className="h-3.5 w-3.5" /> Deploy Succeeded
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{output}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t('common.close')}
          </Button>
          <Button
            size="sm"
            onClick={handleDeploy}
            disabled={loading || reading || !project.trim() || !workingDir.trim() || !composeContent.trim()}
            className="gap-1.5"
          >
            {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t('docker.saveAndDeploy')}
          </Button>
        </div>
      </div>
    </div>
  );
}

