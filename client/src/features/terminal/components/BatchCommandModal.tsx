import React, { useState } from 'react';
import { X, Play, Server, CheckCircle2, XCircle, Clock, Terminal as TermIcon } from 'lucide-react';
import { executeBatchCommand } from '@/features/terminal/api';
import { ServerItem } from '@/features/servers';
import { BatchResultItem } from '@/features/terminal/types';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { useT } from '@/shared/i18n';

interface BatchCommandModalProps {
  servers: ServerItem[];
  onClose: () => void;
}

export default function BatchCommandModal({ servers, onClose }: BatchCommandModalProps) {
  const t = useT();
  const [selectedIds, setSelectedIds] = useState<string[]>(servers.map((s) => s.id));
  const [command, setCommand] = useState('uname -a && uptime');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BatchResultItem[] | null>(null);

  const toggleSelectAll = () => {
    if (selectedIds.length === servers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(servers.map((s) => s.id));
    }
  };

  const toggleServer = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleRun = async () => {
    if (!command.trim()) return alert('Command cannot be empty');
    if (selectedIds.length === 0) return alert('Pilih minimal satu VPS');

    setIsRunning(true);
    setResults(null);
    try {
      const res = await executeBatchCommand(selectedIds, command);
      setResults(res);
    } catch (err: any) {
      alert(`Batch execution error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const quickCommands = [
    { label: 'Uptime & Info', cmd: 'uname -a && uptime' },
    { label: 'Disk (df -h)', cmd: 'df -h' },
    { label: 'Memory (free -m)', cmd: 'free -m' },
    { label: 'Updates', cmd: 'apt update && apt list --upgradable' },
    { label: 'Ports', cmd: 'ss -tulpn 2>/dev/null || netstat -tulpn' },
    { label: 'Docker PS', cmd: 'docker ps' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-zinc-950 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-md bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
              <TermIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-xs text-zinc-100">{t('batch.title')}</h2>
              <p className="text-[11px] text-zinc-500">{t('batch.subtitle')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Target Node Selector */}
        <div className="px-5 py-2.5 bg-zinc-950/60 border-b border-zinc-800/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-zinc-400">{t('batch.selectServers')} ({selectedIds.length}/{servers.length}):</span>
            <button
              onClick={toggleSelectAll}
              className="text-[11px] text-zinc-400 hover:text-zinc-200 underline"
            >
              {selectedIds.length === servers.length ? t('batch.deselectAll') : t('batch.selectAll')}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
            {servers.map((s) => {
              const isSelected = selectedIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleServer(s.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition ${
                    isSelected
                      ? 'bg-zinc-100 text-zinc-900 border-zinc-200'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Server className="w-3 h-3" />
                  <span>{s.name}</span>
                  <span className="text-[10px] opacity-60 sensitive">({s.host})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Command Editor */}
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/30 space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-400">{t('batch.commandLabel')}</label>
            <div className="flex items-center gap-1 overflow-x-auto text-[11px]">
              <span className="text-zinc-500 font-mono text-[10px]">Snippets:</span>
              {quickCommands.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setCommand(q.cmd)}
                  className="px-2 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-[10px] border border-zinc-800 transition"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative font-mono text-xs">
            <span className="absolute left-3 top-2.5 text-zinc-500 font-bold select-none">$</span>
            <textarea
              rows={3}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t('batch.commandPlaceholder')}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-7 pr-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              onClick={handleRun}
              disabled={isRunning || selectedIds.length === 0}
              className="gap-2"
            >
              <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              {isRunning ? t('batch.running') : t('batch.run', { n: selectedIds.length })}
            </Button>
          </div>
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-900">
          <div className="text-[11px] font-mono text-zinc-500">Output Stream:</div>
          {!results && !isRunning && (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Select nodes, enter bash script, and click 'Run'.
            </div>
          )}

          {isRunning && (
            <div className="flex items-center justify-center py-12 gap-2 text-zinc-400 text-xs font-mono">
              <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              <span>Executing across {selectedIds.length} nodes...</span>
            </div>
          )}

          {results && (
            <div className="space-y-3">
              {results.map((res) => (
                <div
                  key={res.serverId}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs"
                >
                  <div className="px-3 py-2 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {res.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="font-semibold text-zinc-200">{res.serverName}</span>
                      <span className="text-zinc-500 font-normal sensitive">({res.host})</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {res.durationMs}ms
                      </span>
                      {res.code !== undefined && (
                        <span className="text-zinc-500">code: {res.code}</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-900 overflow-x-auto max-h-56 overflow-y-auto font-mono text-[11px]">
                    {res.error && (
                      <div className="text-red-400 whitespace-pre-wrap">{res.error}</div>
                    )}
                    {res.stdout && (
                      <div className="text-zinc-300 whitespace-pre-wrap">{res.stdout}</div>
                    )}
                    {res.stderr && (
                      <div className="text-amber-400 whitespace-pre-wrap mt-1">{res.stderr}</div>
                    )}
                    {!res.error && !res.stdout && !res.stderr && (
                      <div className="text-zinc-500 italic">(Empty output)</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
