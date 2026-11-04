import { API_BASE, apiFetch, jsonPost, unwrap, downloadBlob } from '@/shared/api/client';

export type RemoteFile = { name: string; isDir: boolean; size: number; mtime: number };
const q = (p: string) => encodeURIComponent(p);
export const listFiles = async (id: string, path: string) =>
  unwrap<RemoteFile[]>(await apiFetch(`${API_BASE}/servers/${id}/files?path=${q(path)}`), 'Failed to list files');
export const readFile = async (id: string, path: string) =>
  unwrap<string>(await apiFetch(`${API_BASE}/servers/${id}/files/read?path=${q(path)}`), 'Failed to read file');
export const writeFile = async (id: string, path: string, content: string) =>
  unwrap<void>(await apiFetch(`${API_BASE}/servers/${id}/files/write`, jsonPost({ path, content })), 'Failed to save file');
export const uploadFile = async (id: string, path: string, file: File) =>
  unwrap<void>(
    await apiFetch(`${API_BASE}/servers/${id}/files/upload?path=${q(path)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file
    }),
    'Upload failed'
  );
export const downloadFile = (id: string, path: string) =>
  downloadBlob(`${API_BASE}/servers/${id}/files/download?path=${q(path)}`, path.split('/').pop() || 'file');

export const fetchFileBlob = async (id: string, path: string): Promise<Blob> => {
  const res = await apiFetch(`${API_BASE}/servers/${id}/files/download?path=${q(path)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Gagal memuat file');
  return await res.blob();
};
