import React, { useState } from 'react';
import { Download, X, RefreshCw, Sparkles, Check } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useT } from '@/shared/i18n';
import { dockerPullImage } from '../api';

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
  const [image, setImage] = useState('');
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<{ text: string; ok: boolean } | null>(null);

  if (!isOpen) return null;

  const handlePull = async (targetImage?: string) => {
    const imgToPull = (targetImage || image).trim();
    if (!imgToPull) return;
    setLoading(true);
    setOutput(null);
    try {
      const res = await dockerPullImage(serverId, imgToPull);
      setOutput({ text: res || 'Image pulled successfully', ok: true });
      onSuccess();
    } catch (e: any) {
      setOutput({ text: e.message || 'Failed to pull image', ok: false });
    } finally {
      setLoading(false);
    }
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
                onKeyDown={(e) => e.key === 'Enter' && !loading && handlePull()}
                disabled={loading}
                className="font-mono text-xs"
              />
              <Button
                onClick={() => handlePull()}
                disabled={loading || !image.trim()}
                className="gap-1.5 whitespace-nowrap"
              >
                {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {t('docker.pullImage')}
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
                  disabled={loading}
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

          {/* Output Log */}
          {output && (
            <div
              className={`rounded-xl border p-3 font-mono text-[11px] leading-relaxed ${
                output.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400'
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {output.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {output.ok ? 'Pull completed' : 'Pull failed'}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap">{output.text}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3 bg-[var(--muted)]/30">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </div>
  );
}

