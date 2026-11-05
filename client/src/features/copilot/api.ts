import { API_BASE, apiFetch, getToken, jsonPost, unwrap } from '@/shared/api/client';
import type { ChatMessage, CopilotContext } from './types';

export async function streamCopilotChat(
  messages: ChatMessage[],
  context: CopilotContext | undefined,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  model?: string
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/ai-copilot/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      context,
      model
    }),
    signal
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = 'Failed to communicate with AI Copilot';
    try {
      const parsed = JSON.parse(errText);
      msg = parsed.error || msg;
    } catch {
      msg = errText || msg;
    }
    throw new Error(msg);
  }

  if (!res.body) return;

  const reader = res.body.getReader();
  const textDecoder = new TextDecoder();
  let lineBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    lineBuffer += textDecoder.decode(value, { stream: true });
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr === '[DONE]') {
          return;
        }
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr);
            if (data.delta) {
              onDelta(data.delta);
            }
          } catch {
            // Ignore parse failures on partial lines
          }
        }
      }
    }
  }
}


/** Runs one command on a server over SSH (same endpoint as the terminal quick actions; audited server-side). */
export async function execOnServer(serverId: string, command: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const res = await apiFetch(`${API_BASE}/servers/${encodeURIComponent(serverId)}/exec`, jsonPost({ command }));
  return unwrap(res, 'Command failed');
}
