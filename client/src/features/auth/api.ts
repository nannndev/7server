import { API_BASE, jsonPost, setToken } from '@/shared/api/client';

export async function login(password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/login`, jsonPost({ password }));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login gagal');
  setToken(data.token);
}
