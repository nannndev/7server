import { API_BASE, apiFetch, unwrap } from '@/shared/api/client';

export const fetchLogs = async (id: string, type: 'service' | 'docker' | 'pm2' | 'supervisor', name: string, lines = 200) =>
  unwrap<string>(
    await apiFetch(`${API_BASE}/servers/${id}/logs?type=${type}&name=${encodeURIComponent(name)}&lines=${lines}`),
    'Failed to fetch logs'
  );
