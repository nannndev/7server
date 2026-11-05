import { API_BASE, apiFetch, jsonPost, setToken, unwrap } from '@/shared/api/client';
import type { AuthUser, ManagedUser, Role, UserSession } from './types';

export interface LoginResult {
  token: string;
  user: AuthUser;
  permissions: string[];
  session: { id: string; expiresAt: string };
}

export async function login(password: string, username = 'admin'): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/login`, jsonPost({ username, password }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login gagal');
  setToken(data.token);
  return data;
}

export async function fetchMe(): Promise<{ user: AuthUser; sessionId: string }> {
  const res = await apiFetch(`${API_BASE}/auth/me`);
  return unwrap<{ user: AuthUser; sessionId: string }>(res, 'Gagal memuat profil pengguna');
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/auth/change-password`, jsonPost({ oldPassword, newPassword }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal mengubah password');
}

export async function logoutApi(): Promise<void> {
  try {
    await apiFetch(`${API_BASE}/auth/logout`, jsonPost({}));
  } finally {
    setToken('');
  }
}

// ---------------- Sessions Management ----------------
export async function fetchSessions(): Promise<UserSession[]> {
  const res = await apiFetch(`${API_BASE}/sessions`);
  return unwrap<UserSession[]>(res, 'Gagal memuat daftar sesi');
}

export async function revokeSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/sessions/${sessionId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal mencabut sesi');
}

// ---------------- User Management (Admin Only) ----------------
export async function fetchUsers(): Promise<ManagedUser[]> {
  const res = await apiFetch(`${API_BASE}/users`);
  return unwrap<ManagedUser[]>(res, 'Gagal memuat daftar pengguna');
}

export async function createUser(data: {
  username: string;
  password?: string;
  role: Role;
  servers?: string[] | '*';
}): Promise<ManagedUser> {
  const res = await apiFetch(`${API_BASE}/users`, jsonPost(data));
  return unwrap<ManagedUser>(res, 'Gagal menambah pengguna');
}

export async function updateUser(
  id: string,
  data: {
    role?: Role;
    servers?: string[] | '*';
    disabled?: boolean;
    password?: string;
  }
): Promise<ManagedUser> {
  const res = await apiFetch(`${API_BASE}/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return unwrap<ManagedUser>(res, 'Gagal memperbarui pengguna');
}

export async function deleteUser(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal menghapus pengguna');
}

export async function resetUserPassword(id: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/users/${id}/reset-password`, jsonPost({ newPassword }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal mereset password pengguna');
}
