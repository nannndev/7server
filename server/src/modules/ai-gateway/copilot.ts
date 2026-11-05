import type { Request, Response } from 'express';
import { getInternalConfig, addUsageLog } from './store.js';
import type { AiProviderId } from './types.js';

interface CopilotChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CopilotContext {
  serverId?: string;
  serverName?: string;
  host?: string;
  os?: string;
  tab?: string;
  errorSnippet?: string;
}

function buildSystemPrompt(context?: CopilotContext): string {
  let prompt = `You are 7Server AI Copilot, an elite Site Reliability Engineer (SRE) and DevOps Assistant embedded directly inside the 7Server VPS Management Dashboard.
You assist system administrators and developers with server troubleshooting, Linux automation, Docker orchestration, Nginx tuning, database management, and system security.

Core Guidelines:
1. Be actionable, concise, and technically accurate.
2. When suggesting Linux commands, wrap them strictly inside \`\`\`bash ... \`\`\` code blocks so the dashboard can provide a 1-click "Run on Server" terminal trigger.
3. Highlight critical safety warnings for destructive actions (such as \`rm -rf\`, \`DROP DATABASE\`, \`iptables -F\`, or \`reboot\`).
4. If the user asks in Indonesian, answer in professional Indonesian. If in English, answer in English.`;

  if (context?.serverName || context?.host) {
    prompt += `\n\n--- ACTIVE SERVER CONTEXT ---`;
    if (context.serverName) prompt += `\nServer Name: ${context.serverName}`;
    if (context.host) prompt += `\nHost / IP: ${context.host}`;
    if (context.os) prompt += `\nOperating System: ${context.os}`;
    if (context.tab) prompt += `\nCurrent Dashboard View: ${context.tab}`;
  }

  if (context?.errorSnippet) {
    prompt += `\n\n--- LOG / ERROR SNIPPET UNDER INVESTIGATION ---\n${context.errorSnippet.slice(0, 3000)}`;
  }

  return prompt;
}

export async function handleCopilotChat(req: Request, res: Response): Promise<void> {
  const { messages, context } = req.body as {
    messages?: CopilotChatMessage[];
    context?: CopilotContext;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'Messages array is required' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendDelta = (text: string) => {
    res.write(`data: ${JSON.stringify({ delta: text })}\n\n`);
  };

  const sendDone = () => {
    res.write(`data: [DONE]\n\n`);
    res.end();
  };

  const cfg = getInternalConfig();
  const p = cfg.providers;

  // Pick best connected provider: Anthropic > OpenAI > DeepSeek > Gemini > OpenRouter > Ollama
  let activeProviderId: AiProviderId | null = null;
  if (p.anthropic?.connected && p.anthropic?.apiKey) {
    activeProviderId = 'anthropic';
  } else if (p.openai?.connected && p.openai?.apiKey) {
    activeProviderId = 'openai';
  } else if (p.deepseek?.connected && p.deepseek?.apiKey) {
    activeProviderId = 'deepseek';
  } else if (p.gemini?.connected && p.gemini?.apiKey) {
    activeProviderId = 'gemini';
  } else if (p.openrouter?.connected && p.openrouter?.apiKey) {
    activeProviderId = 'openrouter';
  } else if (p.ollama?.enabled) {
    activeProviderId = 'ollama';
  } else if (p.anthropic?.apiKey) {
    activeProviderId = 'anthropic';
  } else if (p.openai?.apiKey) {
    activeProviderId = 'openai';
  } else if (p.deepseek?.apiKey) {
    activeProviderId = 'deepseek';
  }

  if (!activeProviderId) {
    sendDelta(
      `⚠️ **Belum Ada Provider AI yang Terhubung**\n\n` +
      `Sama seperti di 9Router, Anda perlu menghubungkan / login ke provider Anda terlebih dahulu:\n\n` +
      `1. Buka menu **AI Gateway ➔ Providers** di sidebar.\n` +
      `2. Pilih provider Anda (misal **Anthropic Claude**, **OpenAI**, **DeepSeek**, dll.) lalu klik **Connect**.\n` +
      `3. Masukkan API Key dan klik **Verify & Connect** untuk memastikan kredensial valid.\n\n` +
      `Setelah terhubung, Anda akan memiliki **Universal API Key** dan AI Copilot siap membantu!`
    );
    sendDone();
    return;
  }

  const systemPrompt = buildSystemPrompt(context);
  const provider = cfg.providers[activeProviderId]!;
  const startTime = Date.now();
  let accumulatedOutput = '';

  try {
    if (activeProviderId === 'anthropic') {
      const model = provider.defaultModel || 'claude-3-7-sonnet-20250219';
      const baseUrl = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
      const upstreamRes = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': provider.apiKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 3000,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          })),
          stream: true
        })
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        if (upstreamRes.status === 401 || upstreamRes.status === 403) {
          sendDelta(
            `❌ **Autentikasi Provider Gagal (HTTP ${upstreamRes.status})**\n\n` +
            `API Key untuk provider **${activeProviderId}** ditolak oleh server provider. Kemungkinan key tidak valid, kedaluwarsa, atau kuota habis.\n\n` +
            `💡 **Solusi**: Silakan buka **AI Gateway ➔ Providers**, pilih ${activeProviderId}, lalu masukkan API Key Anda dan klik **Verify & Connect**.`
          );
        } else {
          sendDelta(`❌ Error from Anthropic API (${upstreamRes.status}): ${errText}`);
        }
        sendDone();
        return;
      }

      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        sendDone();
        return;
      }

      let lineBuffer = '';
      const textDecoder = new TextDecoder();

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
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const eventData = JSON.parse(jsonStr);
                if (eventData.type === 'content_block_delta' && eventData.delta?.text) {
                  accumulatedOutput += eventData.delta.text;
                  sendDelta(eventData.delta.text);
                }
              } catch {
                // Ignore parse errors on raw stream lines
              }
            }
          }
        }
      }

      sendDone();
      addUsageLog({
        keyId: 'copilot-internal',
        keyName: '7Server In-Dashboard Copilot',
        provider: 'anthropic',
        model,
        inputTokens: Math.round(systemPrompt.length / 4),
        outputTokens: Math.round(accumulatedOutput.length / 4),
        durationMs: Date.now() - startTime,
        status: 'success',
        statusCode: 200,
        streaming: true
      });
      return;
    }

    // OpenAI, DeepSeek & OpenRouter compatible streaming
    if (activeProviderId === 'openai' || activeProviderId === 'deepseek' || activeProviderId === 'openrouter') {
      const isDeepSeek = activeProviderId === 'deepseek';
      const isOpenRouter = activeProviderId === 'openrouter';
      const defaultM = isDeepSeek ? 'deepseek-chat' : (isOpenRouter ? 'anthropic/claude-3.7-sonnet' : 'gpt-4o');
      const model = provider.defaultModel || defaultM;
      const defaultUrl = isDeepSeek ? 'https://api.deepseek.com' : (isOpenRouter ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
      const baseUrl = (provider.baseUrl || defaultUrl).replace(/\/+$/, '');

      const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content }))
      ];

      const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${provider.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: formattedMessages,
          stream: true
        })
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        if (upstreamRes.status === 401 || upstreamRes.status === 403) {
          sendDelta(
            `❌ **Autentikasi Provider Gagal (HTTP ${upstreamRes.status})**\n\n` +
            `API Key untuk provider **${activeProviderId}** ditolak oleh server provider.\n\n` +
            `💡 **Solusi**: Silakan buka **AI Gateway ➔ Providers**, pilih ${activeProviderId}, lalu masukkan API Key Anda dan klik **Verify & Connect**.`
          );
        } else {
          sendDelta(`❌ Error from ${activeProviderId} API (${upstreamRes.status}): ${errText}`);
        }
        sendDone();
        return;
      }

      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        sendDone();
        return;
      }

      let lineBuffer = '';
      const textDecoder = new TextDecoder();

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
              break;
            }
            if (jsonStr) {
              try {
                const eventData = JSON.parse(jsonStr);
                const deltaContent = eventData.choices?.[0]?.delta?.content;
                if (deltaContent) {
                  accumulatedOutput += deltaContent;
                  sendDelta(deltaContent);
                }
              } catch {
                // Ignore
              }
            }
          }
        }
      }

      sendDone();
      addUsageLog({
        keyId: 'copilot-internal',
        keyName: '7Server In-Dashboard Copilot',
        provider: activeProviderId,
        model,
        inputTokens: Math.round(systemPrompt.length / 4),
        outputTokens: Math.round(accumulatedOutput.length / 4),
        durationMs: Date.now() - startTime,
        status: 'success',
        statusCode: 200,
        streaming: true
      });
      return;
    }

    // Ollama streaming
    if (activeProviderId === 'ollama') {
      const model = provider.defaultModel || 'llama3.2';
      const baseUrl = (provider.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const upstreamRes = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map((m) => ({ role: m.role, content: m.content }))
          ],
          stream: true
        })
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        sendDelta(`❌ Error from Ollama (${upstreamRes.status}): ${errText}`);
        sendDone();
        return;
      }

      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        sendDone();
        return;
      }

      let lineBuffer = '';
      const textDecoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += textDecoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            try {
              const eventData = JSON.parse(trimmed);
              if (eventData.message?.content) {
                accumulatedOutput += eventData.message.content;
                sendDelta(eventData.message.content);
              }
            } catch {
              // Ignore
            }
          }
        }
      }

      sendDone();
      return;
    }

    sendDelta(`Provider ${activeProviderId} belum diimplementasikan untuk copilot chat.`);
    sendDone();
  } catch (err: any) {
    sendDelta(`\n\n❌ Copilot communication error: ${err.message}`);
    sendDone();
  }
}

