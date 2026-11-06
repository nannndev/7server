import { API_BASE, apiFetch } from '@/shared/api/client';
import type {
  SafeGitIntegration,
  GitOAuthConfig,
  NormalizedRepo,
  InspectResult
} from './types';

export async function fetchGitIntegrations(): Promise<SafeGitIntegration[]> {
  const res = await apiFetch(`${API_BASE}/git/integrations`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal memuat integrasi Git');
  return data.data || [];
}

export async function deleteGitIntegration(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/git/integrations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal menghapus integrasi Git');
}

export async function fetchGitOAuthConfig(): Promise<GitOAuthConfig> {
  const res = await apiFetch(`${API_BASE}/git/oauth-config`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal memuat konfigurasi OAuth');
  return data.data;
}

export async function saveGitOAuthConfig(payload: {
  githubClientId?: string;
  githubClientSecret?: string;
}): Promise<void> {
  const res = await apiFetch(`${API_BASE}/git/oauth-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal menyimpan konfigurasi OAuth');
}

export async function connectGitViaToken(token: string): Promise<SafeGitIntegration> {
  const res = await apiFetch(`${API_BASE}/git/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal menghubungkan token GitHub');
  return data.data;
}

export async function getGitHubAuthUrl(): Promise<string> {
  const res = await apiFetch(`${API_BASE}/auth/github/redirect`, {
    headers: { Accept: 'application/json' }
  });
  const data = await res.json();
  if (!res.ok || !data.url) throw new Error(data.error || 'Gagal memulai otentikasi GitHub');
  return data.url;
}

export async function fetchGitHubRepos(options?: {
  page?: number;
  per_page?: number;
  search?: string;
  type?: string;
  integrationId?: string;
}): Promise<NormalizedRepo[]> {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.per_page) params.set('per_page', String(options.per_page));
  if (options?.search) params.set('search', options.search);
  if (options?.type) params.set('type', options.type);
  if (options?.integrationId) params.set('integrationId', options.integrationId);

  const res = await apiFetch(`${API_BASE}/git/github/repos?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal memuat repositori GitHub');
  return data.data || [];
}

export async function fetchGitHubBranches(
  owner: string,
  repo: string,
  integrationId?: string
): Promise<string[]> {
  const params = new URLSearchParams();
  if (integrationId) params.set('integrationId', integrationId);

  const res = await apiFetch(
    `${API_BASE}/git/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?${params.toString()}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal memuat branch repositori');
  return data.branches || [];
}

export async function inspectGitHubRepo(payload: {
  owner: string;
  repo: string;
  branch: string;
  subDir?: string;
  integrationId?: string;
}): Promise<InspectResult> {
  const res = await apiFetch(`${API_BASE}/git/github/inspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gagal menginspeksi proyek');
  return data.data;
}

