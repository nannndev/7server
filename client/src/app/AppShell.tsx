// Layout shell: sidebar + top bar + the routed page, and the app-wide modals.
import React, { useEffect, useState } from 'react';
import { Server } from 'lucide-react';
import type { ServerItem } from '@/features/servers/types';
import { createServer, updateServer, deleteServer } from '@/features/servers/api';
import { useServers } from '@/features/servers/hooks/useServers';
import { useMonitorSettings } from '@/features/monitoring/hooks/useMonitorSettings';
import AddServerModal from '@/features/servers/components/AddServerModal';
import TerminalModal from '@/features/terminal/components/TerminalModal';
import BatchCommandModal from '@/features/terminal/components/BatchCommandModal';
import ProcessServiceModal from '@/features/processes/components/ProcessServiceModal';
import FileManagerModal from '@/features/files/components/FileManagerModal';
import MonitoringPage from '@/features/monitoring/components/MonitoringPage';
import FleetPage from '@/pages/FleetPage';
import ServerPage from '@/pages/ServerPage';
import AiGatewayPage from '@/pages/AiGatewayPage';
import AiCopilotDrawer from '@/features/copilot/components/AiCopilotDrawer';
import AiCopilotTrigger from '@/features/copilot/components/AiCopilotTrigger';
import type { CopilotLiveStatus } from '@/features/copilot/types';
import { BackgroundTasksWidget } from '@/shared/tasks/BackgroundTasksWidget';
import UsersPage from '@/pages/UsersPage';
import IntegrationsPage from '@/pages/IntegrationsPage';
import ChangePasswordModal from '@/features/users/components/ChangePasswordModal';
import { useAuth, useCan } from '@/features/auth/AuthContext';
import { useTheme } from '@/shared/hooks/useTheme';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { useRoute, type FleetView, type ServerTab } from './router';
import { useT } from '@/shared/i18n';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';

const VIEW_KEY = 'vps_hub_view';
const readView = (): FleetView => {
  try { return (localStorage.getItem(VIEW_KEY) as FleetView) || 'grid'; } catch { return 'grid'; }
};

export default function AppShell({ onLogout }: { onLogout: () => void }) {
  const { servers, loading, history, reload, refreshAll, isRefreshingAll, refreshSec, setRefreshSec, onMetricsUpdated, reorder } = useServers();
  const monitor = useMonitorSettings(servers);
  const { theme, toggleTheme } = useTheme();
  const t = useT();
  const [route, navigate] = useRoute();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteSignal, setPaletteSignal] = useState(0);

  // Modals opened from more than one place live here; the rest live with the component that opens them.
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingServer, setEditingServer] = useState<ServerItem | null>(null);
  const [terminalServer, setTerminalServer] = useState<ServerItem | null>(null);
  const [terminalInitialCommand, setTerminalInitialCommand] = useState<string | undefined>(undefined);
  const [processServer, setProcessServer] = useState<ServerItem | null>(null);
  const [filesServer, setFilesServer] = useState<ServerItem | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotStatus, setCopilotStatus] = useState<CopilotLiveStatus>({ state: 'idle' });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const { user } = useAuth();

  // Fleet view comes from the URL; the last one used is remembered for the plain "#/" link.
  const [lastView, setLastView] = useState<FleetView>(readView);
  const view: FleetView = route.page === 'fleet' && route.view ? route.view : lastView;
  useEffect(() => {
    if (route.page === 'fleet' && route.view && route.view !== lastView) {
      setLastView(route.view);
      try { localStorage.setItem(VIEW_KEY, route.view); } catch { /* private mode */ }
    }
  }, [route]);

  useEffect(() => {
    const handleAsk = () => setCopilotOpen(true);
    window.addEventListener('7server-copilot-ask', handleAsk);
    return () => window.removeEventListener('7server-copilot-ask', handleAsk);
  }, []);

  const managedServerId = route.page === 'server' ? route.id : null;
  const managedServer = servers.find((s) => s.id === managedServerId) || null;
  const openManageServer = (s: ServerItem, tab: ServerTab = 'overview') => navigate({ page: 'server', id: s.id, tab });
  const openAdd = () => { setEditingServer(null); setShowAddModal(true); };
  const openEdit = (s: ServerItem) => { setEditingServer(s); setShowAddModal(true); };

  const handleSaveServer = async (data: any) => {
    if (editingServer) await updateServer(editingServer.id, data);
    else await createServer(data);
    setEditingServer(null);
    reload();
  };

  const handleDeleteServer = async (id: string) => {
    if (!(await confirmModal({
      title: t('fleet.deleteServer'),
      message: t('fleet.deleteConfirm'),
      variant: 'danger',
      confirmText: t('common.delete')
    }))) return;
    try {
      await deleteServer(id);
      if (managedServerId === id) navigate({ page: 'fleet' }, { replace: true });
      toast.success(t('fleet.deleted'));
      reload();
    } catch (err: any) {
      toast.error(t('fleet.deleteFailed', { error: err.message }));
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex font-sans transition-colors duration-200">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-[80] focus:top-2 focus:left-2 focus:px-3 focus:py-2 focus:rounded-md focus:bg-[var(--card)] focus:border focus:border-[var(--border)]">
        {t('common.skipToContent')}
      </a>
      <Sidebar
        servers={servers}
        route={route}
        navigate={navigate}
        fleetView={view}
        alertsFor={monitor.alertsFor}
        activeAlertCount={monitor.activeAlertCount}
        theme={theme}
        onToggleTheme={toggleTheme}
        onAddServer={() => { openAdd(); setMobileNavOpen(false); }}
        onOpenPalette={() => { setPaletteSignal((n) => n + 1); setMobileNavOpen(false); }}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onReorder={reorder}
        onEditServer={openEdit}
      />

      <div className="flex-1 min-w-0 flex flex-col carbon-bg">
        <TopBar
          route={route}
          navigate={navigate}
          managedServer={managedServer}
          serverCount={servers.length}
          mobileNavOpen={mobileNavOpen}
          setMobileNavOpen={setMobileNavOpen}
          isRefreshingAll={isRefreshingAll}
          onRefreshAll={() => refreshAll()}
          onOpenBatch={() => setShowBatchModal(true)}
          refreshSec={refreshSec}
          setRefreshSec={setRefreshSec}
          onAddServer={openAdd}
          onImported={reload}
          onLogout={onLogout}
          onToggleCopilot={() => setCopilotOpen((v) => !v)}
          copilotStatus={copilotStatus}
          onOpenUsers={() => navigate({ page: 'users', tab: 'users' })}
          onOpenSessions={() => navigate({ page: 'users', tab: 'sessions' })}
          onOpenChangePassword={() => setShowChangePasswordModal(true)}
        />

        <main id="main" key={route.page === 'server' ? `server:${route.id}` : route.page} className="page-enter flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
          {route.page === 'monitoring' ? (
            <MonitoringPage
              tab={route.tab}
              onTabChange={(t) => navigate({ page: 'monitoring', tab: t })}
              onThresholdsSaved={monitor.setThresholds}
              onAlertsChanged={monitor.setActiveAlertCount}
            />
          ) : route.page === 'ai-gateway' ? (
            <AiGatewayPage
              tab={route.tab || 'quickstart'}
              onTabChange={(t) => navigate({ page: 'ai-gateway', tab: t })}
            />
          ) : route.page === 'users' ? (
            <UsersPage
              tab={route.tab || 'users'}
              onTabChange={(t) => navigate({ page: 'users', tab: t })}
              servers={servers}
            />
          ) : route.page === 'integrations' ? (
            <IntegrationsPage />
          ) : route.page === 'server' ? (
            managedServer ? (
              <ServerPage
                key={managedServer.id}
                server={managedServer}
                tab={route.tab}
                onTabChange={(t) => navigate({ page: 'server', id: managedServer.id, tab: t })}
                history={history[managedServer.id] || []}
                thresholds={monitor.thresholds}
                onEdit={openEdit}
                onMetricsUpdated={onMetricsUpdated}
                onServerUpdated={reload}
              />
            ) : loading ? (
              <div role="status" aria-label={t('fleet.loading')} className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-9 w-full max-w-xl" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                </div>
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : (
              <div className="text-center py-20 max-w-md mx-auto space-y-3">
                <Server className="w-8 h-8 mx-auto opacity-30" />
                <h2 className="font-semibold text-sm">{t('server.notFoundTitle')}</h2>
                <p className="text-xs text-[var(--muted-foreground)]">{t('server.notFoundBody')}</p>
                <Button size="sm" onClick={() => navigate({ page: 'fleet' }, { replace: true })}>{t('server.backToFleet')}</Button>
              </div>
            )
          ) : (
            <FleetPage
              servers={servers}
              loading={loading}
              history={history}
              view={view}
              setView={(v) => navigate({ page: 'fleet', view: v })}
              alertsFor={monitor.alertsFor}
              openManageServer={openManageServer}
              onAddServer={openAdd}
              onEditServer={openEdit}
              onDeleteServer={handleDeleteServer}
              onMetricsUpdated={onMetricsUpdated}
              setTerminalServer={setTerminalServer}
              setProcessServer={setProcessServer}
              setFilesServer={setFilesServer}
              onReorder={reorder}
            />
          )}
        </main>
      </div>

      <CommandPalette
        servers={servers}
        navigate={navigate}
        openManageServer={openManageServer}
        setTerminalServer={setTerminalServer}
        setFilesServer={setFilesServer}
        theme={theme}
        toggleTheme={toggleTheme}
        openBatch={() => setShowBatchModal(true)}
        openSignal={paletteSignal}
        onEscape={() => setMobileNavOpen(false)}
      />

      {showAddModal && (
        <AddServerModal server={editingServer} onSave={handleSaveServer} onClose={() => { setShowAddModal(false); setEditingServer(null); }} />
      )}
      {terminalServer && (
        <TerminalModal
          server={terminalServer}
          initialCommand={terminalInitialCommand}
          onClose={() => {
            setTerminalServer(null);
            setTerminalInitialCommand(undefined);
          }}
        />
      )}
      {processServer && <ProcessServiceModal server={processServer} onClose={() => setProcessServer(null)} />}
      {filesServer && <FileManagerModal server={filesServer} onClose={() => setFilesServer(null)} />}
      {showBatchModal && <BatchCommandModal servers={servers} onClose={() => setShowBatchModal(false)} />}

      {showChangePasswordModal && (
        <ChangePasswordModal
          open={showChangePasswordModal}
          onClose={() => setShowChangePasswordModal(false)}
        />
      )}

      <AiCopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        servers={servers}
        activeServer={managedServer}
        activeTab={route.page === 'server' ? route.tab : undefined}
        onStatusChange={setCopilotStatus}
        onRunInTerminal={(cmd, srv) => {
          setTerminalInitialCommand(cmd);
          setTerminalServer(srv);
        }}
      />
      <AiCopilotTrigger
        open={copilotOpen}
        onClick={() => setCopilotOpen(true)}
        status={copilotStatus}
      />
      <BackgroundTasksWidget />
    </div>
  );
}
