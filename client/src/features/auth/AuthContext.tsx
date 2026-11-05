import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken } from '@/shared/api/client';
import { fetchMe, login as apiLogin, logoutApi } from './api';
import type { AuthUser, Permission } from './types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  canAccessServer: (serverId: string) => boolean;
  login: (password: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchMe();
      setUser(data.user);
    } catch {
      setUser(null);
      setToken('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const onLogout = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('vps-hub-logout', onLogout);
    return () => window.removeEventListener('vps-hub-logout', onLogout);
  }, [refreshUser]);

  const login = async (password: string, username = 'admin') => {
    setLoading(true);
    try {
      const res = await apiLogin(password, username);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await logoutApi();
    } finally {
      setUser(null);
    }
  };

  const can = useCallback((permission: Permission): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) ?? false;
  }, [user]);

  const canAccessServer = useCallback((serverId: string): boolean => {
    if (!user) return false;
    if (user.role === 'admin' || !user.servers || user.servers === '*') return true;
    return Array.isArray(user.servers) && user.servers.includes(serverId);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        can,
        canAccessServer,
        login,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export function useCan(permission: Permission): boolean {
  const { can } = useAuth();
  return can(permission);
}
