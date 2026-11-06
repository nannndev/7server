import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Terminal as TermIcon, Copy, Check, Sparkles } from 'lucide-react';
import { fetchLogs } from '@/features/logs/api';
import { Button } from '@/shared/ui/button';
import { Modal } from '@/shared/ui/modal';
import { useT } from '@/shared/i18n';

interface LogsModalProps {
  serverId: string;
  type: 'service' | 'docker' | 'pm2' | 'supervisor';
  name: string;
  onClose: () => void;
}

export default function LogsModal({ serverId, type, name, onClose }: LogsModalProps) {
  const t = useT();
  const [logs, setLogs] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(200);
  const [follow, setFollow] = useState(false);
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await fetchLogs(serverId, type, name, lines));
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [lines]);
  useEffect(() => {
    if (!follow) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [follow, lines]);
  useEffect(() => {
    preRef.current?.scrollTo(0, preRef.current.scrollHeight);
  }, [logs]);

  const prefixLabel =
    type === 'docker'
      ? 'docker logs'
      : type === 'pm2'
      ? 'pm2 logs'
      : type === 'supervisor'
      ? 'supervisorctl tail'
      : 'journalctl -u';

  const copyLogs = () => {
    navigator.clipboard.writeText(logs);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const analyzeWithAi = () => {
    if (!logs) return;
    window.dispatchEvent(
      new CustomEvent('7server-copilot-ask', {
        detail: {
          prompt: t('logs.analyzePrompt', { name, cmd: prefixLabel, logs: logs.slice(-2500) })
        }
      })
    );
  };

  return (
    <Modal onClose={onClose} className="max-w-5xl h-[82vh]">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl w-full h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2 bg-[var(--background)]">
          <TermIcon className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
          <span className="font-mono text-xs text-[var(--foreground)] truncate flex-1 font-medium">
            <span className="text-[var(--muted-foreground)]">{prefixLabel}</span> {name}
          </span>
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            className="h-7 text-[11px] bg-[var(--card)] border border-[var(--border)] rounded px-2 text-[var(--foreground)]"
            aria-label={t('logs.lines')}
          >
            {[100, 200, 500, 1000, 2000].map((n) => (
              <option key={n} value={n}>{t('logs.linesOption', { n })}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] cursor-pointer select-none px-1.5">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
              className="rounded border-[var(--border)]"
            />
            {t('logs.live')}
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={analyzeWithAi}
            disabled={!logs || loading}
            className="h-7 text-[11px] gap-1 btn-metal"
            title={t('logs.analyzeTitle')}
          >
            <Sparkles className="w-3 h-3" />
            <span className="hidden sm:inline">{t('logs.analyze')}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={copyLogs} title={t('logs.copy')} className="h-7 w-7">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} title={t('common.refresh')} className="h-7 w-7">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} title={t('common.close')} className="h-7 w-7">
            <X className="w-4 h-4" />
          </Button>
        </div>
        {error && (
          <p role="alert" className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
            {error}
          </p>
        )}
        <pre
          ref={preRef}
          className="flex-1 overflow-auto p-4 text-[11px] leading-relaxed font-mono bg-[var(--background)] text-[var(--foreground)] whitespace-pre-wrap"
        >
          {logs || (loading ? t('logs.loading') : t('logs.empty'))}
        </pre>
      </div>
    </Modal>
  );
}
