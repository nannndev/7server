// HTTP client shared by every feature: auth token, fetch wrapper, JSON helpers, authenticated downloads.
import { cacheClear } from '@/shared/lib/cache';

export const API_BASE = '/api';
const TOKEN_KEY = 'vps_hub_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
export const setToken = (t: string) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else {
    localStorage.removeItem(TOKEN_KEY);
    cacheClear(); // never show one session's server data to the next login
  }
};

// Every API call goes through here so the token is attached and a 401 logs the user out.
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401 && !url.endsWith('/login')) {
    setToken('');
    window.dispatchEvent(new Event('vps-hub-logout'));
  }
  return res;
}

export const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

export async function unwrap<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || fallback);
  return data.data;
}

// Downloads go through fetch (not a plain link) so the auth header is sent.
export async function downloadBlob(url: string, filename: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob());
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
