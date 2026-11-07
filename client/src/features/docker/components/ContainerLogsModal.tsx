import React, { useEffect, useState } from 'react';
import { ScrollText, X, RefreshCw, Copy, Check, Download, Search } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useT } from '@/shared/i18n';
import { dockerContainerLogs } from '../api';

interface ContainerLogsModalProps {
  serverId: string;
  containerId: string;
  containerName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ContainerLogsModal({
  serverId,
  containerId,
  containerName,
  isOpen,
  onClose
}: ContainerLogsModalProps) {
  const t = useT();
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [tail, setTail] = useState(200);
  const [timestamps, setTimestamps] = useState(false);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await dockerContainerLogs(serverId, containerId, tail, timestamps);
      setLogs(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchLogs();
  }, [isOpen, serverId, containerId, tail, timestamps]);

  useEffect(() => {
    if (!isOpen || !autoRefresh) return;
    const interval = setInterval(() => {
      if (!document.hidden) fetchLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh, serverId, containerId, tail, timestamps]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${containerName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLines = logs.split('\n').filter((line) => {
    if (!filter) return true;
    return line.toLowerCase().includes(filter.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 dark:bg-black/70 p-4 backdrop-blur-xs" onClick={onClose}>
      <div
        className="metal relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary)]/10 text-[var(--primary)]">
              <ScrollText className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-sm font-semibold text-[var(--foreground)]">{containerName}</h3>
                <span className="rounded bg-[var(--muted)] px-1.5 py-0.2 font-mono text-[10px] text-[var(--muted-foreground)]">
                  {containerId.slice(0, 12)}
                </span>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">{t('docker.liveLogs')}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Filter logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-7 w-36 pl-8 text-xs font-mono bg-zinc-900 border-zinc-800 text-white"
              />
            </div>

            <select
              value={tail}
              onChange={(e) => setTail(Number(e.target.value))}
              aria-label={t('docker.tail')}
              className="h-7 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-300"
            >
              <option value={100}>100 lines</option>
              <option value={200}>200 lines</option>
              <option value={500}>500 lines</option>
              <option value={1000}>1000 lines</option>
            </select>

            <label className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={timestamps}
                onChange={(e) => setTimestamps(e.target.checked)}
                className="rounded border-zinc-800 bg-zinc-900"
              />
              {t('docker.timestamps')}
            </label>

            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchLogs()}
              disabled={loading}
              className="h-7 gap-1 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="h-7 gap-1 text-xs border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white"
            >
              <Download className="h-3 w-3" />
            </Button>

            <button
              onClick={onClose}
              className="ml-2 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Console Log Area */}
        <div className="flex-1 overflow-auto bg-[var(--background)] p-4 font-mono text-[12px] leading-relaxed text-[var(--foreground)]">
          {loading && !logs ? (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading container logs...
            </div>
          ) : error ? (
            <div className="text-red-400 p-2">{error}</div>
          ) : filteredLines.length === 0 ? (
            <div className="text-zinc-500 italic p-2">No matching log entries found.</div>
          ) : (
            <pre className="whitespace-pre-wrap">{filteredLines.join('\n')}</pre>
          )}
        </div>

        {/* Footer info bar */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-2 text-[11px] font-mono text-zinc-500 bg-zinc-950">
          <span>{filteredLines.length} lines rendered</span>
          <label className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-600'}`} />
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="hidden"
            />
            <span className="cursor-pointer hover:text-zinc-300">Auto-refresh (4s): {autoRefresh ? 'ON' : 'PAUSED'}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

