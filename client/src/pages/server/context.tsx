// Page-level state shared by the server tabs: the server itself, tab navigation, and the few
// cross-tab actions (run a command and show its output, open files/logs, jump to the terminal).
// Everything a single tab needs stays inside that tab.
import React, { createContext, useContext } from 'react';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';
import type { HistoryPoint } from '@/features/servers/api';
import type { ServerTab } from '@/app/router';
import type { Thresholds } from '@/features/monitoring/api';

export type LogsTarget = { type: 'service' | 'docker' | 'pm2' | 'supervisor'; name: string };

export interface ServerPageCtx {
  server: ServerItem;
  history: HistoryPoint[];
  /** Alert thresholds from the monitor; charts draw them as a reference line. */
  thresholds?: Thresholds;
  activeTab: ServerTab;
  setActiveTab: (t: ServerTab) => void;
  onMetricsUpdated: (id: string, m: ServerMetrics) => void;
  /** Runs a shell command on the server; output shows in the banner above the tab. */
  runQuickAction: (label: string, cmd: string) => Promise<void>;
  quickActionRunning: string | null;
  setQuickActionOutput: (out: string | null) => void;
  openFiles: (path?: string, file?: string) => void;
  openLogs: (t: LogsTarget) => void;
  /** Switch to the terminal tab, optionally running `cmd` once it connects. */
  openTerminal: (cmd?: string) => void;
  terminalCmd?: string;
  clearTerminalCmd: () => void;
  refreshMetrics: () => Promise<void>;
}

const Ctx = createContext<ServerPageCtx | null>(null);

export const ServerPageProvider = ({ value, children }: { value: ServerPageCtx; children: React.ReactNode }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

export function useServerPage(): ServerPageCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useServerPage must be used inside <ServerPageProvider>');
  return v;
}

// Single-quote a value for sh so paths from the scan can't break out of the command.
export const sq = (v: string) => `'${v.replace(/'/g, `'\\''`)}'`;

export const formatMB = (mb?: number) => {
  if (!mb) return '0 MB';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
};

export const formatDurationMs = (ms: number) => {
  if (!ms || ms <= 0) return '-';
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};
