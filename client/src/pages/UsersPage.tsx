import React, { useEffect, useState, useMemo } from 'react';
import {
  Users, UserPlus, Shield, ShieldCheck, ShieldAlert, KeyRound,
  Trash2, Edit2, RefreshCw, Server, Search, Filter, Check, X,
  Globe, Laptop, Smartphone, AlertTriangle, ArrowRight, CheckCircle2,
  Lock, Eye, EyeOff
} from 'lucide-react';
import {
  fetchUsers, createUser, updateUser, deleteUser, resetUserPassword,
  fetchSessions, revokeSession
} from '@/features/auth/api';
import type { ManagedUser, Role, UserSession, Permission } from '@/features/auth/types';
import type { ServerItem } from '@/features/servers/types';
import type { UsersTab } from '@/app/router';
import { useAuth, useCan } from '@/features/auth/AuthContext';
import { useI18n, type MessageKey } from '@/shared/i18n';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';

interface UsersPageProps {
  tab: UsersTab;
  onTabChange: (t: UsersTab) => void;
  servers: ServerItem[];
}

interface RoleConfig {
  id: Role;
  labelKey: MessageKey;
  descKey: MessageKey;
  color: string;
  badgeClass: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'admin',
    labelKey: 'users.roleAdmin',
    descKey: 'users.roleAdminDesc',
    color: 'text-purple-600 dark:text-purple-400',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
  },
  {
    id: 'operator',
    labelKey: 'users.roleOperator',
    descKey: 'users.roleOperatorDesc',
    color: 'text-blue-600 dark:text-blue-400',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  },
  {
    id: 'viewer',
    labelKey: 'users.roleViewer',
    descKey: 'users.roleViewerDesc',
    color: 'text-zinc-600 dark:text-zinc-400',
    badgeClass: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
  }
];

const PERMISSIONS_MATRIX: {
  id: Permission;
  category: string;
  admin: boolean;
  operator: boolean;
  viewer: boolean;
}[] = [
  { id: 'server.read', category: 'server', admin: true, operator: true, viewer: true },
  { id: 'server.manage', category: 'server', admin: true, operator: false, viewer: false },
  { id: 'service.control', category: 'operations', admin: true, operator: true, viewer: false },
  { id: 'terminal.open', category: 'operations', admin: true, operator: true, viewer: false },
  { id: 'db.read', category: 'database', admin: true, operator: true, viewer: true },
  { id: 'db.write', category: 'database', admin: true, operator: true, viewer: false },
  { id: 'copilot.chat', category: 'ai-copilot', admin: true, operator: true, viewer: true },
  { id: 'copilot.execute', category: 'ai-copilot', admin: true, operator: true, viewer: false },
  { id: 'gateway.manage', category: 'admin', admin: true, operator: false, viewer: false },
  { id: 'firewall.manage', category: 'security', admin: true, operator: false, viewer: false },
  { id: 'users.manage', category: 'security', admin: true, operator: false, viewer: false },
];

export default function UsersPage({ tab, onTabChange, servers }: UsersPageProps) {
  const { t, locale } = useI18n();
  const { user: currentUser } = useAuth();
  const canManageUsers = useCan('users.manage');

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Add / Edit User Drawer/Dialog State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<Role>('operator');
  const [formAllServers, setFormAllServers] = useState(true);
  const [formSelectedServers, setFormSelectedServers] = useState<string[]>([]);
  const [formDisabled, setFormDisabled] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Reset password dialog state
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Active sessions action state
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const loadUsersData = async () => {
    if (!canManageUsers) return;
    setLoadingUsers(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error(err.message || t('common.loadFailed'));
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSessionsData = async () => {
    setLoadingSessions(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (err: any) {
      toast.error(err.message || t('common.loadFailed'));
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (tab === 'users') {
      loadUsersData();
    } else if (tab === 'sessions') {
      loadSessionsData();
    }
  }, [tab, canManageUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery = !q || u.username.toLowerCase().includes(q) || u.id.toLowerCase().includes(q);
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? !u.disabled
          : !!u.disabled;
      return matchQuery && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const openAdd = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormPassword('');
    setFormRole('operator');
    setFormAllServers(true);
    setFormSelectedServers([]);
    setFormDisabled(false);
    setEditorOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditingUser(u);
    setFormUsername(u.username);
    setFormPassword('');
    setFormRole(u.role);
    setFormAllServers(!u.servers || u.servers === '*');
    setFormSelectedServers(Array.isArray(u.servers) ? u.servers : []);
    setFormDisabled(!!u.disabled);
    setEditorOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const serverScope = formAllServers ? '*' : formSelectedServers;
      if (editingUser) {
        await updateUser(editingUser.id, {
          role: formRole,
          servers: serverScope,
          disabled: formDisabled
        });
        toast.success(t('users.userUpdated', { username: editingUser.username }));
      } else {
        if (!formPassword || formPassword.length < 8) {
          throw new Error(t('users.pwMinLength'));
        }
        await createUser({
          username: formUsername,
          password: formPassword,
          role: formRole,
          servers: serverScope
        });
        toast.success(t('users.userCreated', { username: formUsername }));
      }
      setEditorOpen(false);
      loadUsersData();
    } catch (err: any) {
      toast.error(err.message || t('common.saveFailed'));
    } finally {
      setSavingUser(false);
    }
  };

  const handleDeleteUser = async (u: ManagedUser) => {
    if (u.id === currentUser?.id) {
      toast.error(t('users.cannotDeleteSelf'));
      return;
    }
    const confirmed = await confirmModal({
      title: t('users.deleteConfirmTitle'),
      message: t('users.deleteConfirmMsg', { username: u.username }),
      variant: 'danger',
      confirmText: t('users.delete')
    });
    if (!confirmed) return;

    try {
      await deleteUser(u.id);
      toast.success(t('users.userDeleted', { username: u.username }));
      setUsers((prev) => prev.filter((item) => item.id !== u.id));
    } catch (err: any) {
      toast.error(err.message || t('common.deleteFailed'));
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget || !newPassword || newPassword.length < 8) {
      toast.error(t('users.pwMinLength'));
      return;
    }
    setResetting(true);
    try {
      await resetUserPassword(resetTarget.id, newPassword);
      toast.success(t('users.pwResetSuccess', { username: resetTarget.username }));
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.message || t('common.saveFailed'));
    } finally {
      setResetting(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await revokeSession(sessionId);
      toast.success(t('sessions.revoked'));
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err: any) {
      toast.error(err.message || t('common.deleteFailed'));
    } finally {
      setRevokingSessionId(null);
    }
  };

  const toggleServerSelect = (sid: string) => {
    setFormSelectedServers((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  const parseUserAgent = (ua: string) => {
    if (!ua || ua === 'unknown') return t('sessions.unknownBrowser');
    let browser = 'Web Browser';
    let os = 'Unknown OS';

    if (ua.includes('Chrome/')) browser = 'Google Chrome';
    else if (ua.includes('Firefox/')) browser = 'Mozilla Firefox';
    else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Apple Safari';
    else if (ua.includes('Edge/')) browser = 'Microsoft Edge';

    if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('iPhone')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';

    return `${browser} on ${os}`;
  };

  return (
    <div className="space-y-6">
      {/* ---------------- HEADER BANNER ---------------- */}
      <Card className="metal p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
                  {t('users.title')}
                </h1>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {t('users.subtitle')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => (tab === 'users' ? loadUsersData() : loadSessionsData())}
              disabled={loadingUsers || loadingSessions}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers || loadingSessions ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>

            {canManageUsers && tab === 'users' && (
              <Button
                variant="default"
                size="sm"
                onClick={openAdd}
                className="gap-1.5 h-8 text-xs font-semibold shadow-sm"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{t('users.addUser')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* ---------------- NAVIGATION TABS ---------------- */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--border)] overflow-x-auto">
          <button
            onClick={() => onTabChange('users')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              tab === 'users'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{t('users.tabUsers', { n: users.length })}</span>
          </button>

          <button
            onClick={() => onTabChange('roles')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              tab === 'roles'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{t('users.tabRoles')}</span>
          </button>

          <button
            onClick={() => onTabChange('sessions')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition ${
              tab === 'sessions'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{t('users.tabSessions')}</span>
          </button>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* TAB 1: USERS LIST                                                         */}
      {/* ========================================================================= */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 space-y-1">
              <span className="text-[11px] font-mono text-[var(--muted-foreground)] uppercase">{t('users.totalUsers')}</span>
              <div className="text-2xl font-bold font-mono">{users.length}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-[11px] font-mono text-purple-500 uppercase">{t('users.roleAdmin')}</span>
              <div className="text-2xl font-bold font-mono">{users.filter((u) => u.role === 'admin').length}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-[11px] font-mono text-blue-500 uppercase">{t('users.roleOperator')}</span>
              <div className="text-2xl font-bold font-mono">{users.filter((u) => u.role === 'operator').length}</div>
            </Card>
            <Card className="p-4 space-y-1">
              <span className="text-[11px] font-mono text-zinc-500 uppercase">{t('users.roleViewer')}</span>
              <div className="text-2xl font-bold font-mono">{users.filter((u) => u.role === 'viewer').length}</div>
            </Card>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
              <Input
                type="text"
                placeholder={t('users.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 text-xs bg-[var(--card)]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="h-9 rounded-md bg-[var(--card)] border border-[var(--border)] px-2.5 text-xs text-[var(--foreground)]"
              >
                <option value="all">{t('users.filterAllRoles')}</option>
                <option value="admin">{t('users.roleAdmin')}</option>
                <option value="operator">{t('users.roleOperator')}</option>
                <option value="viewer">{t('users.roleViewer')}</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-9 rounded-md bg-[var(--card)] border border-[var(--border)] px-2.5 text-xs text-[var(--foreground)]"
              >
                <option value="all">{t('users.filterAllStatus')}</option>
                <option value="active">{t('users.filterActive')}</option>
                <option value="disabled">{t('users.filterDisabled')}</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <Card className="overflow-hidden border-[var(--border)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] font-medium text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3">{t('users.thUser')}</th>
                    <th className="px-5 py-3">{t('users.thRole')}</th>
                    <th className="px-5 py-3">{t('users.thScope')}</th>
                    <th className="px-5 py-3">{t('users.thStatus')}</th>
                    <th className="px-5 py-3">{t('users.thLastLogin')}</th>
                    <th className="px-5 py-3 text-right">{t('users.thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {loadingUsers && users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--muted-foreground)]">
                        {t('users.loading')}
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[var(--muted-foreground)]">
                        {t('users.emptyList')}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const roleInfo = ROLES.find((r) => r.id === u.role) || ROLES[1];
                      const isSelf = u.id === currentUser?.id;

                      return (
                        <tr key={u.id} className="hover:bg-[var(--muted)]/20 transition">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border border-primary/20">
                                {u.username.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-[var(--foreground)] text-sm">{u.username}</span>
                                  {isSelf && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-primary/20 text-primary font-medium">
                                      {t('users.you')}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[var(--muted-foreground)] font-mono">
                                  ID: {u.id}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${roleInfo.badgeClass}`}>
                              <Shield className="w-3 h-3" />
                              {t(roleInfo.labelKey)}
                            </span>
                          </td>

                          <td className="px-5 py-3.5">
                            {!u.servers || u.servers === '*' ? (
                              <span className="text-[var(--foreground)] font-medium flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                {t('users.allServers')}
                              </span>
                            ) : Array.isArray(u.servers) && u.servers.length > 0 ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--muted)] text-[11px] font-medium">
                                  <Server className="w-3 h-3 text-sky-400" /> {t('users.serversRestricted', { count: u.servers.length })}
                                </span>
                                <div className="flex flex-wrap gap-1 max-w-xs">
                                  {u.servers.map((sid) => {
                                    const srv = servers.find((s) => s.id === sid);
                                    return (
                                      <span key={sid} className="px-1.5 py-0.2 rounded bg-[var(--card)] border border-[var(--border)] text-[10px] font-mono">
                                        {srv?.name || sid.slice(0, 8)}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-amber-500 font-medium text-xs">{t('users.noServers')}</span>
                            )}
                          </td>

                          <td className="px-5 py-3.5">
                            {u.disabled ? (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-red-500/10 text-red-500 font-semibold border border-red-500/20">
                                {t('users.disabled')}
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold border border-emerald-500/20 flex items-center gap-1 w-fit">
                                <CheckCircle2 className="w-3 h-3" /> {t('users.active')}
                              </span>
                            )}
                          </td>

                          <td className="px-5 py-3.5 text-[var(--muted-foreground)] font-mono text-[11px]">
                            {u.lastLoginAt
                              ? new Date(u.lastLoginAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
                              : t('users.neverLoggedIn')}
                          </td>

                          <td className="px-5 py-3.5 text-right">
                            {canManageUsers && (
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEdit(u)}
                                  className="h-8 gap-1 text-xs"
                                  title={t('users.edit')}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>{t('users.edit')}</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setResetTarget(u)}
                                  className="h-8 gap-1 text-xs text-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                  title={t('users.resetPw')}
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  <span>{t('users.resetPw')}</span>
                                </Button>
                                {!isSelf && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteUser(u)}
                                    className="h-8 gap-1 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                                    title={t('users.delete')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{t('users.delete')}</span>
                                  </Button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ROLES & PERMISSIONS MATRIX                                         */}
      {/* ========================================================================= */}
      {tab === 'roles' && (
        <div className="space-y-6">
          {/* Role Cards Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ROLES.map((r) => (
              <Card key={r.id} className="p-5 space-y-3 border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className={`p-2 rounded-lg bg-[var(--muted)] font-semibold ${r.color}`}>
                    <Shield className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-sm">{t(r.labelKey)}</h3>
                    <span className="text-[10px] font-mono uppercase text-[var(--muted-foreground)]">Role: {r.id}</span>
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  {t(r.descKey)}
                </p>
              </Card>
            ))}
          </div>

          {/* Granular Permission Comparison Matrix */}
          <Card className="overflow-hidden border-[var(--border)]">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]/30">
              <h3 className="text-sm font-semibold">{t('users.matrixTitle')}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('users.matrixSubtitle')}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] font-semibold text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-5 py-3 w-40">{t('users.thCategory')}</th>
                    <th className="px-5 py-3">{t('users.thPermission')}</th>
                    <th className="px-5 py-3 text-center w-28">{t('users.roleAdmin')}</th>
                    <th className="px-5 py-3 text-center w-36">{t('users.roleOperator')}</th>
                    <th className="px-5 py-3 text-center w-36">{t('users.roleViewer')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {PERMISSIONS_MATRIX.map((p) => (
                    <tr key={p.id} className="hover:bg-[var(--muted)]/20 transition">
                      <td className="px-5 py-3 font-medium text-[var(--muted-foreground)]">
                        {t(`users.permCat.${p.category}` as MessageKey)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-[var(--foreground)]">{t(`users.perm.${p.id}` as MessageKey)}</div>
                        <code className="text-[10px] text-[var(--muted-foreground)] font-mono">{p.id}</code>
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.admin ? (
                          <span className="inline-flex p-1 rounded-full bg-emerald-500/10 text-emerald-500">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-zinc-500">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.operator ? (
                          <span className="inline-flex p-1 rounded-full bg-emerald-500/10 text-emerald-500">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-zinc-500">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.viewer ? (
                          <span className="inline-flex p-1 rounded-full bg-emerald-500/10 text-emerald-500">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="text-zinc-500">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ACTIVE SESSIONS                                                    */}
      {/* ========================================================================= */}
      {tab === 'sessions' && (
        <Card className="overflow-hidden border-[var(--border)] space-y-4 p-5">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h3 className="text-sm font-semibold">{t('sessions.title')}</h3>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('sessions.subtitle')}
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--muted-foreground)]">
              {t('sessions.totalCount', { n: sessions.length })}
            </span>
          </div>

          <div className="space-y-3">
            {loadingSessions && sessions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted-foreground)]">
                {t('sessions.loading')}
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[var(--muted-foreground)]">
                {t('sessions.empty')}
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition ${
                    s.isCurrent
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-[var(--border)] bg-[var(--background)] hover:bg-[var(--muted)]/30'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="p-2.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] mt-0.5">
                      {s.userAgent.toLowerCase().includes('mobile') ? (
                        <Smartphone className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Laptop className="w-5 h-5 text-blue-500" />
                      )}
                    </div>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--foreground)]">
                          {parseUserAgent(s.userAgent)}
                        </span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                            {t('sessions.current')}
                          </span>
                        )}
                        {s.username && (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--muted)] font-mono text-[var(--muted-foreground)]">
                            {t('sessions.user', { username: s.username })}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-[var(--muted-foreground)] font-mono">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3" /> {s.ip}
                        </span>
                        <span>•</span>
                        <span>{t('sessions.lastActive', { time: new Date(s.lastUsedAt).toLocaleString(locale) })}</span>
                      </div>
                    </div>
                  </div>

                  {!s.isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={revokingSessionId === s.id}
                      onClick={() => handleRevokeSession(s.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 shrink-0 gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{t('sessions.revoke')}</span>
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT USER MODAL                                                     */}
      {/* ========================================================================= */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-sm font-semibold">
                {editingUser ? t('users.editUser', { username: editingUser.username }) : t('users.addUser')}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setEditorOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              {!editingUser && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">{t('users.username')}</span>
                  <Input
                    type="text"
                    required
                    autoFocus
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                    placeholder="mis. andi_devops"
                  />
                </label>
              )}

              {!editingUser && (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">{t('users.initialPassword')}</span>
                  <Input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                </label>
              )}

              <div className="space-y-2">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">{t('users.selectRole')}</span>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <label
                      key={r.id}
                      onClick={() => setFormRole(r.id)}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        formRole === r.id
                          ? 'border-primary bg-primary/5'
                          : 'border-[var(--border)] hover:bg-[var(--muted)]/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="role"
                        className="mt-1"
                        checked={formRole === r.id}
                        onChange={() => setFormRole(r.id)}
                      />
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold">{t(r.labelKey)}</div>
                        <p className="text-[11px] text-[var(--muted-foreground)] leading-relaxed">
                          {t(r.descKey)}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Server Access Scope */}
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--muted-foreground)]">
                    {t('users.serverScope')}
                  </span>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formAllServers}
                      onChange={(e) => setFormAllServers(e.target.checked)}
                      className="rounded"
                    />
                    <span>{t('users.allServers')}</span>
                  </label>
                </div>

                {!formAllServers && (
                  <div className="max-h-40 overflow-y-auto p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-1 text-xs">
                    {servers.length === 0 ? (
                      <div className="text-center py-2 text-[var(--muted-foreground)]">
                        {t('users.noServers')}
                      </div>
                    ) : (
                      servers.map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--muted)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={formSelectedServers.includes(s.id)}
                            onChange={() => toggleServerSelect(s.id)}
                            className="rounded"
                          />
                          <span className="font-medium truncate">{s.name}</span>
                          <span className="text-[10px] text-[var(--muted-foreground)] font-mono ml-auto">
                            {s.host}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {editingUser && editingUser.id !== currentUser?.id && (
                <div className="pt-2 border-t border-[var(--border)]">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formDisabled}
                      onChange={(e) => setFormDisabled(e.target.checked)}
                      className="rounded text-red-500"
                    />
                    <span className="text-red-500 font-medium">{t('users.disableAccount')}</span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={savingUser}>
                  {savingUser ? t('users.saving') : t('users.saveUser')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RESET PASSWORD DIALOG                                                     */}
      {/* ========================================================================= */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[var(--border)]">
              <KeyRound className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="text-sm font-semibold">{t('users.resetPwTitle')}</h3>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  User: <span className="font-bold text-[var(--foreground)]">{resetTarget.username}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[var(--muted-foreground)]">
                  {t('users.newPassword')}
                </span>
                <Input
                  type="password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setResetTarget(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" size="sm" disabled={resetting || newPassword.length < 8}>
                  {resetting ? t('users.resetting') : t('users.resetPwAction')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
