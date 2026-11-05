// Sticky top bar: mobile menu button, breadcrumb, page-level actions, and user RBAC menu.
import React, { useRef, useState } from 'react';
import {
  Plus, Terminal, RefreshCw, Download, Upload, LogOut, Settings2,
  Menu, ChevronRight, Eye, EyeOff, Sparkles, User, Users,
  KeyRound, Shield, ShieldAlert, ChevronDown
} from 'lucide-react';
import { usePrivacy } from '@/shared/hooks/usePrivacy';
import { useAuth, useCan } from '@/features/auth/AuthContext';
import type { ServerItem } from '@/features/servers/types';
import type { Route } from '@/app/router';
import { sectionLabel } from '@/app/serverNav';
import { exportServers, importServers } from '@/features/servers/api';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { useI18n, LANGS, type Lang } from '@/shared/i18n';

interface TopBarProps {
  route: Route;
  navigate: (r: Route) => void;
  managedServer: ServerItem | null;
  serverCount: number;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  isRefreshingAll: boolean;
  onRefreshAll: () => void;
  onOpenBatch: () => void;
  refreshSec: number;
  setRefreshSec: (n: number) => void;
  onAddServer: () => void;
  onImported: () => void;
  onLogout: () => void;
  onToggleCopilot?: () => void;
  onOpenUsers?: () => void;
  onOpenSessions?: () => void;
  onOpenChangePassword?: () => void;
}

export default function TopBar({
  route,
  navigate,
  managedServer,
  serverCount,
  mobileNavOpen,
  setMobileNavOpen,
  isRefreshingAll,
  onRefreshAll,
  onOpenBatch,
  refreshSec,
  setRefreshSec,
  onAddServer,
  onImported,
  onLogout,
  onToggleCopilot,
  onOpenUsers,
  onOpenSessions,
  onOpenChangePassword
}: TopBarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { t, lang, setLang } = useI18n();
  const importRef = useRef<HTMLInputElement>(null);
  const { privacy, togglePrivacy } = usePrivacy();
  const { user } = useAuth();
  const canManageServer = useCan('server.manage');
  const canOpenTerminal = useCan('terminal.open');
  const canManageUsers = useCan('users.manage');

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await importServers(JSON.parse(await file.text()));
      toast.success(t('top.imported', { n }));
      onImported();
    } catch (err: any) {
      toast.error(t('top.importFailed', { error: err.message }));
    }
  };

  const roleBadgeColor =
    user?.role === 'admin'
      ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
      : user?.role === 'operator'
      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
      : 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';

  return (
    <header className="sticky top-0 z-30 h-14 bg-[var(--background)]/85 backdrop-blur-md border-b border-[var(--border)] px-4 sm:px-6 flex items-center gap-3">
      <button
        onClick={() => setMobileNavOpen(true)}
        className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-[var(--muted)]"
        aria-label={t('nav.openMenu')}
        aria-expanded={mobileNavOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      <nav aria-label={t('nav.breadcrumb')} className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-sm min-w-0">
          <li className="shrink-0">
            <button
              onClick={() => navigate({ page: 'fleet' })}
              className={`hover:text-[var(--foreground)] transition ${
                route.page === 'fleet' ? 'font-semibold' : 'text-[var(--muted-foreground)]'
              }`}
            >
              {route.page === 'monitoring'
                ? t('nav.monitoring')
                : route.page === 'ai-gateway'
                ? t('nav.aiGateway')
                : route.page === 'users'
                ? t('nav.users')
                : t('nav.fleet')}
            </button>
          </li>
          {route.page === 'users' && (
            <>
              <li aria-hidden><ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /></li>
              <li className="fade-in text-[var(--foreground)] font-semibold truncate capitalize">
                {route.tab === 'roles' ? t('users.tabRoles') : route.tab === 'sessions' ? t('users.tabSessions') : t('users.tabUsersPlain')}
              </li>
            </>
          )}
          {route.page === 'server' && managedServer && (
            <>
              <li aria-hidden><ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /></li>
              <li className="truncate flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    managedServer.status === 'online'
                      ? 'bg-emerald-500'
                      : managedServer.status === 'offline'
                      ? 'bg-red-500'
                      : 'bg-zinc-400'
                  }`}
                />
                <button
                  onClick={() => navigate({ page: 'server', id: managedServer.id, tab: 'overview' })}
                  className={`truncate hover:text-[var(--foreground)] transition ${
                    route.tab === 'overview' ? 'font-semibold' : 'text-[var(--muted-foreground)]'
                  }`}
                >
                  {managedServer.name}
                </button>
              </li>
              {route.tab !== 'overview' && (
                <>
                  <li aria-hidden><ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /></li>
                  <li key={route.tab} className="fade-in text-[var(--muted-foreground)] truncate">
                    {t(sectionLabel(route.tab))}
                  </li>
                </>
              )}
            </>
          )}
        </ol>
      </nav>

      <div className="flex items-center gap-1.5 shrink-0">
        {route.page === 'fleet' && serverCount > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefreshAll}
              disabled={isRefreshingAll}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] gap-1.5"
              title={t('top.refreshAll')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{t('common.refresh')}</span>
            </Button>
            {canOpenTerminal && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenBatch}
                className="gap-1.5"
                title={t('top.batchTip')}
              >
                <Terminal className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{t('top.batch')}</span>
              </Button>
            )}
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={togglePrivacy}
          aria-pressed={privacy}
          title={t(privacy ? 'top.privacyOn' : 'top.privacyOff')}
          aria-label={t(privacy ? 'top.privacyOn' : 'top.privacyOff')}
          className={privacy ? 'text-amber-500' : ''}
        >
          {privacy ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>

        {/* Global Settings */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            title={t('top.settings')}
            aria-label={t('top.settings')}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((v) => !v)}
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          {showSettings && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSettings(false)} />
              <div className="pop-in absolute right-0 mt-1 w-64 z-50 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-2xl p-3 space-y-3 text-xs">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)]">{t('top.autoRefresh')}</span>
                  <select
                    value={refreshSec}
                    onChange={(e) => setRefreshSec(Number(e.target.value))}
                    className="h-7 bg-[var(--background)] border border-[var(--border)] rounded px-1.5"
                  >
                    <option value={0}>{t('top.off')}</option>
                    {[10, 30, 60, 300].map((n) => (
                      <option key={n} value={n}>
                        {n < 60 ? t('top.seconds', { n }) : t('top.minutes', { n: n / 60 })}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[var(--muted-foreground)]">{t('common.language')}</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Lang)}
                    aria-label={t('common.language')}
                    className="h-7 bg-[var(--background)] border border-[var(--border)] rounded px-1.5"
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                {'Notification' in window && Notification.permission !== 'granted' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => Notification.requestPermission()}
                  >
                    {t('top.enableNotifications')}
                  </Button>
                )}
                {canManageServer && (
                  <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => exportServers().catch((e) => toast.error(e.message))}
                    >
                      <Download className="w-3.5 h-3.5" /> {t('top.export')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1"
                      onClick={() => importRef.current?.click()}
                    >
                      <Upload className="w-3.5 h-3.5" /> {t('top.import')}
                    </Button>
                    <input
                      ref={importRef}
                      type="file"
                      accept="application/json,.json"
                      className="hidden"
                      onChange={handleImport}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onToggleCopilot}
          className="gap-1.5 border-[var(--rim)] text-[var(--foreground)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/[0.06] transition-colors"
          title="7Server AI Copilot (⌘J)"
        >
          <Sparkles className="w-3.5 h-3.5 text-[var(--foreground)] animate-pulse" />
          <span className="hidden md:inline font-medium">Copilot</span>
        </Button>

        {canManageServer && (
          <Button
            variant="default"
            size="sm"
            onClick={onAddServer}
            className="gap-1.5 shadow-sm font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('nav.addServer')}</span>
          </Button>
        )}

        {/* User Profile & RBAC Dropdown */}
        {user && (
          <div className="relative ml-1">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-lg hover:bg-[var(--muted)] border border-[var(--border)] transition"
            >
              <div className="w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-[11px] flex items-center justify-center">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-medium max-w-[90px] truncate hidden sm:inline">
                {user.username}
              </span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium hidden md:inline uppercase ${roleBadgeColor}`}>
                {user.role}
              </span>
              <ChevronDown className="w-3 h-3 text-[var(--muted-foreground)]" />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="pop-in absolute right-0 mt-1 w-56 z-50 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl p-2 space-y-1 text-xs">
                  <div className="px-3 py-2 border-b border-[var(--border)]">
                    <div className="font-semibold text-xs flex items-center gap-1.5">
                      <span>{user.username}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border font-medium uppercase ${roleBadgeColor}`}>
                        {user.role}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5 truncate">
                      {!user.servers || user.servers === '*' ? t('top.allServersAccess') : `${Array.isArray(user.servers) ? user.servers.length : 0} ${t('top.restrictedServersAccess')}`}
                    </p>
                  </div>

                  {canManageUsers && onOpenUsers && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenUsers();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] transition"
                    >
                      <Users className="w-3.5 h-3.5 text-purple-500" />
                      <span>{t('top.userManagement')}</span>
                    </button>
                  )}

                  {onOpenSessions && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenSessions();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] transition"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-blue-500" />
                      <span>{t('top.activeSessions')}</span>
                    </button>
                  )}

                  {onOpenChangePassword && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenChangePassword();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] transition"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t('top.changePassword')}</span>
                    </button>
                  )}

                  <div className="pt-1 border-t border-[var(--border)]">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-red-500 hover:bg-red-500/10 transition"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{t('top.logout')}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
