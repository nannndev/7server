import React, { useState, useEffect, useRef } from 'react';
import { Download, X, RefreshCw, Sparkles, Check, RotateCw, Terminal } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useT } from '@/shared/i18n';
import { useTaskManager } from '@/shared/tasks/TaskContext';

interface PullImageModalProps {
  serverId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PRESETS = [
  { name: 'nginx:alpine', label: 'Nginx', desc: 'High-perf reverse proxy' },
  { name: 'node:22-alpine', label: 'Node.js 22', desc: 'JavaScript/TypeScript runtime' },
  { name: 'postgres:16-alpine', label: 'PostgreSQL 16', desc: 'Relational SQL database' },
  { name: 'redis:7-alpine', label: 'Redis 7', desc: 'In-memory key-value cache' },
  { name: 'mysql:8.0', label: 'MySQL 8', desc: 'Relational database' },
  { name: 'python:3.12-alpine', label: 'Python 3.12', desc: 'Python backend runtime' },
  { name: 'golang:alpine', label: 'Go', desc: 'Golang runtime' },
  { name: 'caddy:alpine', label: 'Caddy', desc: 'Auto-HTTPS web server' },
  { name: 'alpine:latest', label: 'Alpine', desc: 'Ultra-lightweight Linux base' }
];

export function PullImageModal({ serverId, isOpen, onClose, onSuccess }: PullImageModalProps) {
  const t = useT();
  const { runStreamTask, tasks } = useTaskManager();
  const [image, setImage] = useState('');
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<{ text: string; ok: boolean } | null>(null);
  const logPreRef = useRef<HTMLPreElement>(null);

  // Find if there is an active pull task for this server
  const currentTask = tasks.find(
    (t) => (activeTaskId && t.id === activeTaskId) || (t.serverId === serverId && t.status === 'running' && t.category === 'docker')
  );

  useEffect(() => {
    if (currentTask && logPreRef.current) {
      logPreRef.current.scrollTop = logPreRef.current.scrollHeight;
    }
  }, [currentTask?.logs]);

  if (!isOpen) return null;

  const isBusy = loading || currentTask?.status === 'running';

  const handlePull = async (targetImage?: string) => {
    const imgToPull = (targetImage || image).trim();
    if (!imgToPull) return;
    setLoading(true);
    setOutput(null);

    const taskId = `pull_${Date.now()}`;
    setActiveTaskId(taskId);

    await runStreamTask({
      id: taskId,
      serverId,
      title: `Pull ${imgToPull}`,
      category: 'docker',
      url: `/api/servers/${serverId}/docker/image/pull?stream=1`,
      body: { image: imgToPull },
      onDone: (res) => {
        setOutput({ text: res.output || 'Image pulled successfully', ok: true });
        setLoading(false);
        onSuccess();
      },
      onError: (err) => {
        setOutput({ text: err.message || 'Failed to pull image', ok: false });
        setLoading(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="metal relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('docker.pullImage')}</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">Download container images from Docker Hub or GHCR</p>
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

        {/* Body */}
        <div className="space-y-4 overflow-y-auto p-5 text-xs">
          <div>
            <label className="mb-1.5 block font-medium text-[var(--foreground)]">
              {t('docker.image')}
            </label>
            <div className="flex gap-2">
              <Input
                placeholder={t('docker.pullPlaceholder')}
                value={image}
                onChange={(e) => setImage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isBusy && handlePull()}
                disabled={isBusy}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => handlePull()}
                disabled={isBusy || !image.trim()}
                className="gap-1.5 whitespace-nowrap"
              >
                {isBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {isBusy ? 'Pulling...' : t('docker.pullImage')}
              </Button>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">
              <Sparkles className="h-3 w-3 text-[var(--accent)]" />
              {t('docker.pullPresets')}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setImage(p.name);
                    handlePull(p.name);
                  }}
                  disabled={isBusy}
                  className="flex flex-col items-start rounded-xl border border-[var(--border)] p-2.5 text-left transition-all hover:border-[var(--primary)] hover:bg-[var(--muted)]/50 disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <BrandIcon name={p.name} className="h-3.5 w-3.5" />
                    <span>{p.label}</span>
                  </div>
                  <span className="mt-1 font-mono text-[10px] text-[var(--muted-foreground)] truncate max-w-full">{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Real-time Streaming Output Terminal */}
          {(currentTask || output) && (
            <div className="rounded-xl border border-zinc-800 bg-[#09090b] overflow-hidden">
              <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs font-mono">
                <span className="text-[11px] text-zinc-300 flex items-center gap-2">
                  {isBusy ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
                      <span>Downloading & extracting layers ({currentTask?.durationSec || 0}s)...</span>
                    </>
                  ) : output?.ok ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Pull Complete</span>
                    </>
                  ) : (
                    <>
                      <X className="w-3.5 h-3.5 text-red-400" />
                      <span className="text-red-400 font-semibold">Pull Failed</span>
                    </>
                  )}
                </span>
                {isBusy && (
                  <span className="text-[10px] text-zinc-400 font-sans">
                    Runs in background · Safe to close
                  </span>
                )}
              </div>
              <pre
                ref={logPreRef}
                className="p-3 font-mono text-[11px] leading-relaxed text-zinc-300 max-h-48 overflow-auto whitespace-pre-wrap select-text"
              >
                {currentTask && currentTask.logs.length > 0
                  ? currentTask.logs.join('\n')
                  : output?.text || '(Contacting Docker registry...)'}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {isBusy ? 'Task continues running even if you navigate away' : ''}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            {isBusy ? 'Run in Background (Close)' : t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

