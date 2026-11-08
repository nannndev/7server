import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  X,
  ChevronRight,
  Terminal,
  Copy,
  Check,
  Trash2,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { useTaskManager } from './TaskContext';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';

export function BackgroundTasksWidget() {
  const {
    tasks,
    activeTasks,
    isDrawerOpen,
    setIsDrawerOpen,
    selectedTaskId,
    setSelectedTaskId,
    clearFinishedTasks
  } = useTaskManager();

  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logTerminalRef = useRef<HTMLPreElement>(null);

  // Auto-select the first active task if none selected
  useEffect(() => {
    if (!selectedTaskId && activeTasks.length > 0) {
      setSelectedTaskId(activeTasks[0].id);
    } else if (!selectedTaskId && tasks.length > 0) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [selectedTaskId, activeTasks, tasks, setSelectedTaskId]);

  // Auto-scroll terminal when new logs arrive
  useEffect(() => {
    if (autoScroll && logTerminalRef.current) {
      logTerminalRef.current.scrollTop = logTerminalRef.current.scrollHeight;
    }
  }, [tasks, autoScroll]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || tasks[0];

  const handleCopyLogs = () => {
    if (!selectedTask) return;
    navigator.clipboard.writeText(selectedTask.logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // If no tasks ever created, don't show floating pill
  if (tasks.length === 0) return null;

  const hasRunning = activeTasks.length > 0;
  const latestTask = activeTasks[0] || tasks[0];

  return (
    <>
      {/* Floating Bottom Task Pill (placed on bottom-left/center-right so it never collides with AI Copilot bubble) */}
      {!isDrawerOpen && (
        <div className="fixed bottom-6 right-56 z-40 animate-in slide-in-from-bottom duration-300 hidden sm:block">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className={`group flex items-center gap-2.5 px-3.5 py-2 rounded-full border shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              hasRunning
                ? 'bg-[var(--card)] border-sky-500/50 text-[var(--foreground)] shadow-sky-500/10'
                : latestTask.status === 'success'
                ? 'bg-[var(--card)] border-emerald-500/40 text-emerald-600 dark:text-emerald-300 shadow-emerald-500/10'
                : 'bg-[var(--card)] border-red-500/40 text-red-600 dark:text-red-300 shadow-red-500/10'
            }`}
          >
            {hasRunning ? (
              <RotateCw className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-spin shrink-0" />
            ) : latestTask.status === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}

            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="font-semibold text-[var(--foreground)]">
                {hasRunning
                  ? `${activeTasks.length} ${activeTasks.length === 1 ? 'Task' : 'Tasks'} Active`
                  : 'Tasks Completed'}
              </span>
              <span className="text-[var(--muted-foreground)]">•</span>
              <span className="truncate max-w-[200px] text-[var(--muted-foreground)] font-mono text-[11px]">
                {latestTask.title}
              </span>
              {hasRunning && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-600 dark:text-sky-300 font-semibold">
                  {latestTask.durationSec}s
                </span>
              )}
            </div>

            <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] group-hover:translate-x-0.5 transition-transform ml-1" />
          </button>
          {!hasRunning && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearFinishedTasks();
              }}
              title="Dismiss task pill"
              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-[var(--card)] hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] shadow transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Slide-out Task & Live Log Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full sm:w-[560px] h-full bg-[var(--card)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--muted)]/40">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 dark:text-sky-400">
                  <Activity className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                    <span>Operations & Background Tasks</span>
                    {hasRunning && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 animate-pulse font-semibold">
                        {activeTasks.length} running
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    Tasks persist across tabs and execute independently in the background
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={clearFinishedTasks}
                  disabled={tasks.filter((t) => t.status !== 'running').length === 0}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                  title="Clear finished tasks"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition cursor-pointer"
                  title="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Task Item Selector List */}
            <div className="border-b border-[var(--border)] bg-[var(--background)] max-h-48 overflow-y-auto divide-y divide-[var(--border)]/60">
              {tasks.map((t) => {
                const isSelected = selectedTask?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className={`w-full p-3 text-left flex items-center justify-between gap-3 transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/10 text-[var(--foreground)] border-l-2 border-sky-500 font-medium'
                        : 'hover:bg-[var(--muted)]/50 text-[var(--muted-foreground)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {t.status === 'running' ? (
                        <RotateCw className="w-4 h-4 text-sky-500 dark:text-sky-400 animate-spin shrink-0" />
                      ) : t.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <span className="text-xs font-semibold block truncate text-[var(--foreground)]">
                          {t.title}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)] font-mono mt-0.5">
                          {t.serverName && <span>{t.serverName}</span>}
                          <span>•</span>
                           <span>{t.durationSec}s elapsed</span>
                          <span>•</span>
                          <span className="capitalize">{t.status}</span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant={t.status === 'running' ? 'secondary' : t.status === 'success' ? 'success' : 'destructive'}
                      className="text-[10px] font-mono shrink-0"
                    >
                      {t.status === 'running' ? 'Running' : t.status === 'success' ? 'Done' : 'Failed'}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {/* Selected Task Details & Live Terminal Output */}
            {selectedTask ? (
              <div className="flex-1 flex flex-col min-h-0 bg-[var(--background)]">
                {/* Terminal Toolbar */}
                <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center justify-between text-xs bg-[var(--muted)]/30">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                    <span className="font-mono text-[11px] text-[var(--foreground)] font-medium truncate max-w-[280px]">
                      Live Output: {selectedTask.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-[var(--muted-foreground)] select-none">
                      <input
                        type="checkbox"
                        checked={autoScroll}
                        onChange={(e) => setAutoScroll(e.target.checked)}
                        className="rounded border-[var(--border)] bg-[var(--card)] text-sky-500 focus:ring-0"
                      />
                      <span>Auto-scroll</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition cursor-pointer"
                      title="Copy logs"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Terminal Pre Console */}
                <pre
                  ref={logTerminalRef}
                  className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-[var(--foreground)] overflow-auto whitespace-pre-wrap select-text bg-[var(--background)]"
                >
                  {selectedTask.logs.length > 0
                    ? selectedTask.logs.join('\n')
                    : '(Waiting for output from server...)'}
                </pre>

                {/* Footer Status Bar */}
                <div className="p-3 border-t border-[var(--border)] bg-[var(--muted)]/30 flex items-center justify-between text-xs font-mono">
                  <span className="text-[11px] text-[var(--muted-foreground)]">
                    Lines: {selectedTask.logs.length} · Duration: {selectedTask.durationSec}s
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${
                      selectedTask.status === 'running'
                        ? 'text-sky-500 dark:text-sky-400'
                        : selectedTask.status === 'success'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {selectedTask.status === 'running'
                      ? '● Running non-interactively via SSH'
                      : selectedTask.status === 'success'
                      ? '✓ Operation Succeeded'
                      : '✕ Operation Failed'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-xs">
                No task selected
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

