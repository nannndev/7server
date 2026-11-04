// One server: header + output banner + the active tab. Each tab is its own component in pages/server/.
import React, { useState } from 'react';
import { Terminal as TermIcon, Settings, RefreshCw, Check, Copy, FolderOpen } from 'lucide-react';
import type { ServerItem, ServerMetrics } from '@/features/servers/types';
import { fetchServerMetrics, type HistoryPoint } from '@/features/servers/api';
import { apiFetch } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import FileManagerModal from '@/features/files/components/FileManagerModal';
import LogsModal from '@/features/logs/components/LogsModal';
import { SERVER_SECTIONS, sectionLabel } from '@/app/serverNav';
import type { ServerTab } from '@/app/router';
import { ServerPageProvider, type LogsTarget, type ServerPageCtx } from './server/context';
import OverviewTab from './server/OverviewTab';
import TopologyTab from './server/TopologyTab';
import WebAppsTab from './server/WebAppsTab';
import Pm2Tab from './server/Pm2Tab';
import DockerTab from './server/DockerTab';
import DatabasesTab from './server/DatabasesTab';
import ServicesTab from './server/ServicesTab';
import NginxTab from './server/NginxTab';
import PortsTab from './server/PortsTab';
import TerminalTab from './server/TerminalTab';
import { useT } from '@/shared/i18n';

const TABS: Record<ServerTab, React.FC> = {
  overview: OverviewTab,
  topology: TopologyTab,
  webapps: WebAppsTab,
  pm2: Pm2Tab,
  docker: DockerTab,
  databases: DatabasesTab,
  services: ServicesTab,
  nginx: NginxTab,
  ports: PortsTab,
  terminal: TerminalTab
};

interface ServerPageProps {
  server: ServerItem;
  tab: ServerTab;
  onTabChange: (t: ServerTab) => void;
  history?: HistoryPoint[];
  onEdit: (server: ServerItem) => void;
  onMetricsUpdated: (id: string, metrics: ServerMetrics) => void;
}

export default function ServerPage({ server, tab, onTabChange, history = [], onEdit, onMetricsUpdated }: ServerPageProps) {
  const [refreshing, setRefreshing] = useState(false);
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [quickActionRunning, setQuickActionRunning] = useState<string | null>(null);
  const [quickActionOutput, setQuickActionOutput] = useState<string | null>(null);
  const [filesModal, setFilesModal] = useState<{ path?: string; file?: string } | null>(null);
  const [logsModal, setLogsModal] = useState<LogsTarget | null>(null);
  const [terminalCmd, setTerminalCmd] = useState<string | undefined>(undefined);

  const refreshMetrics = async () => {
    setRefreshing(true);
    try {
      onMetricsUpdated(server.id, await fetchServerMetrics(server.id));
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  const runQuickAction = async (label: string, cmd: string) => {
    if (label === 'Reboot Server' && !window.confirm(t('server.rebootConfirm'))) return;
    setQuickActionRunning(label);
    setQuickActionOutput(null);
    try {
      const res = await apiFetch(`/api/servers/${server.id}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd })
      });
      const data = await res.json();
      setQuickActionOutput(data.data?.stdout || data.data?.stderr || data.error || t('server.commandDone'));
      setTimeout(refreshMetrics, 1200);
    } catch (err: any) {
      setQuickActionOutput(`Error: ${err.message}`);
    } finally {
      setQuickActionRunning(null);
    }
  };

  const ctx: ServerPageCtx = {
    server,
    history,
    activeTab: tab,
    setActiveTab: onTabChange,
    onMetricsUpdated,
    runQuickAction,
    quickActionRunning,
    setQuickActionOutput,
    openFiles: (path, file) => setFilesModal({ path, file }),
    openLogs: setLogsModal,
    openTerminal: (cmd) => { setTerminalCmd(cmd); onTabChange('terminal'); },
    terminalCmd,
    clearTerminalCmd: () => setTerminalCmd(undefined),
    refreshMetrics
  };

  const Tab = TABS[tab];
  const Icon = SERVER_SECTIONS.find((x) => x.id === tab)?.icon;
  const ssh = `ssh ${server.username}@${server.host} -p ${server.port || 22}`;

  return (
    <ServerPageProvider value={ctx}>
      <div className="space-y-6">
        {/* Section navigation lives in the sidebar (nested under this server). */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 key={tab} className="fade-in text-xl font-semibold tracking-tight text-[var(--foreground)] flex items-center gap-2">
              {Icon && <Icon className="w-5 h-5 text-[var(--muted-foreground)]" />}
              {t(sectionLabel(tab))}
            </h1>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] font-mono mt-1">
              <span className="truncate sensitive">{server.username}@{server.host}:{server.port || 22}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(ssh); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="hover:text-[var(--foreground)] transition"
                aria-label={t('server.copySsh')}
                title={t('server.copySsh')}
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="ghost" size="sm" onClick={refreshMetrics} disabled={refreshing} className="gap-1.5" title={t('server.refreshMetrics')}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setFilesModal({ path: '/var/www' })} className="gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t('common.files')}</span>
            </Button>
            {tab !== 'terminal' && (
              <Button variant="outline" size="sm" onClick={() => onTabChange('terminal')} className="gap-1.5">
                <TermIcon className="w-3.5 h-3.5" />
                <span>{t('common.terminal')}</span>
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => onEdit(server)} title={t('server.editServer')} aria-label={t('server.editServer')}>
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div key={tab} className="page-enter space-y-6">
          {quickActionOutput && (
            <div className="p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg text-xs font-mono text-[var(--foreground)] relative shadow-sm">
              <button
                onClick={() => setQuickActionOutput(null)}
                className="absolute right-2.5 top-2.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                aria-label={t('server.closeOutput')}
              >
                ✕
              </button>
              <span className="text-[var(--muted-foreground)] block mb-1 font-sans font-semibold">
                {t('server.output', { label: quickActionRunning || t('server.outputDone') })}
              </span>
              <pre className="whitespace-pre-wrap max-h-48 overflow-y-auto bg-[var(--background)] p-2.5 rounded border border-[var(--border)]">
                {quickActionOutput}
              </pre>
            </div>
          )}
          <Tab />
        </div>

        {filesModal && (
          <FileManagerModal server={server} initialPath={filesModal.path} initialFile={filesModal.file} onClose={() => setFilesModal(null)} />
        )}
        {logsModal && (
          <LogsModal serverId={server.id} type={logsModal.type} name={logsModal.name} onClose={() => setLogsModal(null)} />
        )}
      </div>
    </ServerPageProvider>
  );
}
