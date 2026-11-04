import { API_BASE, apiFetch } from '@/shared/api/client';
import type { BatchResultItem } from '@/features/terminal/types';

export async function executeBatchCommand(serverIds: string[], command: string): Promise<BatchResultItem[]> {
  const res = await apiFetch(`${API_BASE}/servers/batch-exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverIds, command })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Batch command execution failed');
  return data.data;
}
