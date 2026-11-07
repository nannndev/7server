import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { BackgroundTask, StartTaskParams, TaskCategory } from './types';
import { toast } from '@/shared/ui/toast';
import { apiFetch } from '@/shared/api/client';

interface TaskContextType {
  tasks: BackgroundTask[];
  activeTasks: BackgroundTask[];
  startTask: (params: StartTaskParams) => string;
  appendTaskLog: (id: string, chunk: string) => void;
  finishTask: (id: string, result?: { ok?: boolean; error?: string }) => void;
  clearFinishedTasks: () => void;
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
  viewTaskLogs: (id: string) => void;
  runStreamTask: (params: {
    id?: string;
    serverId: string;
    serverName?: string;
    title: string;
    category: TaskCategory;
    url: string;
    body?: any;
    metadata?: Record<string, any>;
    onDone?: (res: any) => void;
    onError?: (err: any) => void;
  }) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | null>(null);

export function TaskManagerProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const activeCountRef = useRef(0);

  // Update elapsed seconds ticker for active tasks
  useEffect(() => {
    const hasRunning = tasks.some((t) => t.status === 'running');
    activeCountRef.current = tasks.filter((t) => t.status === 'running').length;
    if (!hasRunning) return;

    const interval = setInterval(() => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.status === 'running') {
            return {
              ...t,
              durationSec: Math.floor((Date.now() - t.startedAt) / 1000)
            };
          }
          return t;
        })
      );
    }, 1000);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'A server task or deployment is currently running. Reloading will interrupt progress.';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [tasks]);

  const startTask = useCallback((params: StartTaskParams): string => {
    const id = params.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newTask: BackgroundTask = {
      id,
      serverId: params.serverId,
      serverName: params.serverName,
      title: params.title,
      category: params.category,
      status: 'running',
      startedAt: Date.now(),
      durationSec: 0,
      logs: params.initialLog ? [params.initialLog] : [],
      metadata: params.metadata
    };

    setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== id)]);
    return id;
  }, []);

  const appendTaskLog = useCallback((id: string, chunk: string) => {
    if (!chunk) return;
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const lines = chunk.split('\n').filter((l) => l.length > 0);
          // Stage markers are kept apart from the capped log, so a long build can't scroll the early stages away.
          const marks = lines.filter((l) => l.startsWith('@@STAGE ')).map((l) => l.slice(8).trim());
          return {
            ...t,
            logs: [...t.logs, ...lines].slice(-1000), // retain up to 1000 lines
            ...(marks.length ? { stages: [...(t.stages ?? []), ...marks] } : {})
          };
        }
        return t;
      })
    );
  }, []);

  const finishTask = useCallback((id: string, result?: { ok?: boolean; error?: string }) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const ok = result?.ok !== false && !result?.error;
          const status = ok ? 'success' : 'failed';
          const now = Date.now();
          return {
            ...t,
            status,
            finishedAt: now,
            durationSec: Math.max(1, Math.floor((now - t.startedAt) / 1000)),
            error: result?.error
          };
        }
        return t;
      })
    );
  }, []);

  const clearFinishedTasks = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status === 'running'));
    if (selectedTaskId) {
      const isSelectedRunning = tasks.some((t) => t.id === selectedTaskId && t.status === 'running');
      if (!isSelectedRunning) setSelectedTaskId(null);
    }
  }, [selectedTaskId, tasks]);

  const viewTaskLogs = useCallback((id: string) => {
    setSelectedTaskId(id);
    setIsDrawerOpen(true);
  }, []);

  const runStreamTask = useCallback(
    async (params: {
      id?: string;
      serverId: string;
      serverName?: string;
      title: string;
      category: TaskCategory;
      url: string;
      body?: any;
      metadata?: Record<string, any>;
      onDone?: (res: any) => void;
      onError?: (err: any) => void;
    }) => {
      const taskId = startTask({
        id: params.id,
        serverId: params.serverId,
        serverName: params.serverName,
        title: params.title,
        category: params.category,
        metadata: params.metadata,
        initialLog: `Starting: ${params.title}...`
      });

      try {
        const response = await apiFetch(params.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          body: params.body ? JSON.stringify(params.body) : undefined
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status}: Failed to execute task`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Streaming response body is unavailable');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let lastOutput = '';
        let taskOk = true;
        let taskError: string | undefined;

        let taskExitCode: number | undefined;
        let taskSudoRequired = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.type === 'chunk' && payload.chunk) {
                appendTaskLog(taskId, payload.chunk);
                lastOutput += payload.chunk;
              } else if (payload.type === 'error') {
                taskOk = false;
                taskError = payload.error || 'Task failed';
                appendTaskLog(taskId, `\nError: ${taskError}`);
              } else if (payload.type === 'done') {
                if (payload.output) {
                  lastOutput = payload.output;
                }
                if (payload.exitCode !== undefined) taskExitCode = payload.exitCode;
                else if (payload.code !== undefined) taskExitCode = payload.code;

                if (payload.sudoRequired) taskSudoRequired = true;

                if (payload.ok === false) {
                  taskOk = false;
                  const isSudo =
                    taskSudoRequired ||
                    taskExitCode === 126 ||
                    /sudo:.*(password|terminal|askpass)/i.test(lastOutput || '') ||
                    /a terminal is required/i.test(lastOutput || '') ||
                    /a password is required/i.test(lastOutput || '');

                  if (isSudo) {
                    taskSudoRequired = true;
                    taskError = 'Sudo authentication required';
                  } else {
                    taskError = payload.error || `Exit code ${taskExitCode ?? 1}`;
                  }
                }
              }
            } catch {
              // Plain text fallback
              appendTaskLog(taskId, line);
            }
          }
        }

        const isSudoFinal =
          taskSudoRequired ||
          taskExitCode === 126 ||
          /sudo:.*(password|terminal|askpass)/i.test(lastOutput || '') ||
          /a terminal is required/i.test(lastOutput || '') ||
          /a password is required/i.test(lastOutput || '');

        finishTask(taskId, { ok: taskOk, error: taskError });

        if (taskOk) {
          toast.success(`${params.title} completed successfully!`);
          params.onDone?.({ ok: true, output: lastOutput, exitCode: 0 });
        } else {
          if (!isSudoFinal) {
            toast.error(`${params.title} failed: ${taskError || 'Check logs for details'}`);
          }
          const errWithDetails: any = new Error(taskError || 'Task failed');
          errWithDetails.output = lastOutput;
          errWithDetails.sudoRequired = isSudoFinal;
          errWithDetails.exitCode = taskExitCode ?? (isSudoFinal ? 126 : 1);
          params.onError?.(errWithDetails);
        }
      } catch (err: any) {
        appendTaskLog(taskId, `\nFatal Exception: ${err.message || 'Execution error'}`);
        finishTask(taskId, { ok: false, error: err.message });
        toast.error(`${params.title} failed: ${err.message}`);
        params.onError?.(err);
      }
    },
    [startTask, appendTaskLog, finishTask]
  );

  const activeTasks = tasks.filter((t) => t.status === 'running');

  return (
    <TaskContext.Provider
      value={{
        tasks,
        activeTasks,
        startTask,
        appendTaskLog,
        finishTask,
        clearFinishedTasks,
        isDrawerOpen,
        setIsDrawerOpen,
        selectedTaskId,
        setSelectedTaskId,
        viewTaskLogs,
        runStreamTask
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskManager() {
  const ctx = useContext(TaskContext);
  if (!ctx) {
    throw new Error('useTaskManager must be used within a TaskManagerProvider');
  }
  return ctx;
}

