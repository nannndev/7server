import { API_BASE, apiFetch, getToken, jsonPost, unwrap } from '@/shared/api/client';
import type { ChatMessage, CopilotContext } from './types';

/**
 * Compacts older tool outputs and oversized conversation history before sending over the wire,
 * keeping the most recent 6 messages intact while shrinking older 3,000-char terminal dumps.
 */
export function compactMessagesForWire(messages: ChatMessage[]): { role: 'user' | 'assistant'; content: string }[] {
  const cleaned = messages
    .map((m) => ({
      ...m,
      content:
        m.role === 'assistant'
          ? m.content
              .replace(/(^|\n)\s*❌[^\n]*(\n(?!\n)[^\n]*)*/g, '')
              .replace(/^_[^\n]*trying the next account…_\s*/gm, '')
              .replace(/<final_answer>[\s\S]*?<\/final_answer>/gi, '')
              .trim()
          : m.content
    }))
    .filter((m) => m.content.trim() || m.role === 'user');

  const recentStart = Math.max(0, cleaned.length - 6);
  return cleaned.map((m, idx) => {
    if (idx >= recentStart) {
      return { role: m.role, content: m.content };
    }
    // Older tool outputs: keep the header + first 2 & last 3 lines instead of full 3000-char terminal output
    if (m.kind === 'tool' || m.content.includes('<<<UNTRUSTED_OUTPUT')) {
      const compacted = m.content.replace(
        /(<<<UNTRUSTED_OUTPUT[^\n]*\n)([\s\S]*?)(\n<<<END_UNTRUSTED_OUTPUT[^>]*>>>)/g,
        (_all, head: string, body: string, tail: string) => {
          const lines = body.trim().split('\n');
          if (lines.length <= 6 && body.length <= 400) return `${head}${body}${tail}`;
          const snippet = [...lines.slice(0, 2), `... [${lines.length - 5} lines compacted] ...`, ...lines.slice(-3)].join('\n').slice(0, 450);
          return `${head}${snippet}${tail}`;
        }
      );
      return { role: m.role, content: compacted };
    }
    // Older assistant replies: trim long code/log blocks if over 1200 chars
    if (m.role === 'assistant' && m.content.length > 1200) {
      return { role: m.role, content: `${m.content.slice(0, 900)}\n...[earlier response compacted]...\n${m.content.slice(-200)}` };
    }
    return { role: m.role, content: m.content };
  });
}

export async function streamCopilotChat(
  messages: ChatMessage[],
  context: CopilotContext | undefined,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  model?: string,
  onError?: (error: import('./types').CopilotError) => void,
  onModel?: (model: string) => void
): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/ai-copilot/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      messages: compactMessagesForWire(messages),
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
            } else if (data.model && onModel) {
              onModel(data.model);
            } else if (data.error && onError) {
              onError(data.error);
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
