import { API_BASE, apiFetch, jsonPost, unwrap } from '@/shared/api/client';
import type { ProcessInfo, ServicesResponse, Pm2ProcessInfo, SupervisorProcessInfo } from '@/features/processes/types';

export async function fetchProcesses(id: string): Promise<ProcessInfo[]> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/processes`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch processes');
  return data.data;
}

export async function killProcess(id: string, pid: number | string, action = 'kill'): Promise<any> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/processes/kill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid, action })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to kill process');
  return data;
}

export async function fetchServices(id: string): Promise<ServicesResponse> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/services`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to fetch services');
  return data.data;
}

export async function controlService(id: string, serviceName: string, action: string): Promise<any> {
  const res = await apiFetch(`${API_BASE}/servers/${id}/services/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceName, action })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to control service');
  return data;
}

export async function fetchPm2AndSupervisor(id: string): Promise<{ pm2: Pm2ProcessInfo[]; supervisor: SupervisorProcessInfo[] }> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/pm2`), 'Failed to fetch PM2 & Supervisor processes');
}

export async function controlPm2(id: string, target: string | number, action: 'restart' | 'stop' | 'start' | 'reload' | 'flush'): Promise<any> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/pm2/control`, jsonPost({ target, action })), 'Failed to control PM2 process');
}

export async function controlSupervisor(id: string, target: string, action: 'restart' | 'stop' | 'start'): Promise<any> {
  return unwrap(await apiFetch(`${API_BASE}/servers/${id}/supervisor/control`, jsonPost({ target, action })), 'Failed to control Supervisor process');
}
