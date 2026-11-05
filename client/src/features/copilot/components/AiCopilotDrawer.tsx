import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot,
  Sparkles,
  X,
  Send,
  Square,
  Copy,
  Check,
  Terminal,
  Trash2,
  Server,
  AlertTriangle,
  ChevronDown,
  Layers,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/toast';
import { streamCopilotChat } from '../api';
import type { ChatMessage, CopilotContext } from '../types';
import type { ServerItem } from '@/features/servers/types';

interface AiCopilotDrawerProps {
  open: boolean;
  onClose: () => void;
  servers: ServerItem[];
  activeServer: ServerItem | null;
  activeTab?: string;
  onRunInTerminal: (command: string, server: ServerItem) => void;
}

const QUICK_ACTIONS = [
  {
    icon: '⚡',
    label: 'Troubleshoot High CPU / Memory',
    prompt: 'Bantu analisa dan carikan penyebab tingginya penggunaan CPU atau Memory di server ini, serta berikan perintah Linux untuk mengidentifikasi proses yang paling membebani.'
  },
  {
    icon: '🔍',
    label: 'Analyze Error Logs',
    prompt: 'Bagaimana cara memeriksa error log terbaru dari Nginx, Docker, dan Systemd journal di Linux? Berikan perintah ringkasnya.'
  },
  {
    icon: '🐳',
    label: 'Docker Container Health',
    prompt: 'Berikan perintah untuk memeriksa container Docker yang mati/unhealthy dan cara melihat log 50 baris terakhir dari container yang bermasalah.'
  },
  {
    icon: '🛡️',
    label: 'Audit Security & Open Ports',
    prompt: 'Berikan langkah dan perintah untuk memeriksa port apa saja yang terbuka dan status firewall (UFW/iptables) di server ini.'
  }
];

export default function AiCopilotDrawer({
  open,
  onClose,
  servers,
  activeServer,
  activeTab,
  onRunInTerminal
}: AiCopilotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('7server_copilot_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string>(activeServer?.id || '');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const targetServer = useMemo(() => {
    return servers.find((s) => s.id === selectedServerId) || activeServer || (servers.length > 0 ? servers[0] : null);
  }, [servers, selectedServerId, activeServer]);

  // Sync selectedServerId if activeServer changes
  useEffect(() => {
    if (activeServer) {
      setSelectedServerId(activeServer.id);
    } else if (servers.length > 0 && !selectedServerId) {
      setSelectedServerId(servers[0].id);
    }
  }, [activeServer, servers, selectedServerId]);

  // Persist messages in session
  useEffect(() => {
    try {
      sessionStorage.setItem('7server_copilot_history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [open]);

  // Keyboard shortcut Cmd+J or Ctrl+J to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (open) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Handle external prompts (e.g. from Analyze with AI buttons in logs)
  useEffect(() => {
    const handleAsk = (e: any) => {
      const prompt = e.detail?.prompt;
      if (prompt) {
        setTimeout(() => handleSend(prompt), 100);
      }
    };
    window.addEventListener('7server-copilot-ask', handleAsk);
    return () => window.removeEventListener('7server-copilot-ask', handleAsk);
  }, [targetServer, activeTab, isStreaming, messages]);

  const handleSend = async (overridePrompt?: string) => {
    const userPrompt = (overridePrompt || input).trim();
    if (!userPrompt || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userPrompt,
      timestamp: Date.now()
    };

    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };

    const nextMessages = [...messages, userMessage];
    setMessages([...nextMessages, assistantMessage]);
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const context: CopilotContext = {
      serverId: targetServer?.id,
      serverName: targetServer?.name,
      host: targetServer?.host,
      os: targetServer?.os?.distro || targetServer?.os?.platform,
      tab: activeTab
    };

    try {
      await streamCopilotChat(
        nextMessages,
        context,
        (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: m.content + delta } : m
            )
          );
        },
        controller.signal
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: m.content ? `${m.content}\n\n❌ ${err.message}` : `❌ ${err.message}` }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem('7server_copilot_history');
    } catch {}
  };

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    toast.success('Command copied to clipboard');
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const isRiskyCommand = (cmd: string): boolean => {
    const dangerousPatterns = [
      /\brm\s+-[rf]{1,2}\b/i,
      /\bdrop\s+(database|table)\b/i,
      /\biptables\s+-F\b/i,
      /\breboot\b/i,
      /\bshutdown\b/i,
      /\bmkfs\b/i,
      /\bdd\s+if=/i
    ];
    return dangerousPatterns.some((pattern) => pattern.test(cmd));
  };

  // Helper to render message content with interactive code blocks
  const renderMessageContent = (rawContent: any, msgId: string) => {
    const content = typeof rawContent === 'string' ? rawContent : String(rawContent || '');
    if (!content.includes('```')) {
      return (
        <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
          {content}
        </div>
      );
    }

    const parts = content.split(/(```[\s\S]*?```)/g);
    return (
      <div className="space-y-2 text-[13px] leading-relaxed">
        {parts.map((part, index) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const firstLineBreak = part.indexOf('\n');
            const lang = firstLineBreak !== -1 ? part.slice(3, firstLineBreak).trim() : 'bash';
            const code = firstLineBreak !== -1 ? part.slice(firstLineBreak + 1, -3).trim() : part.slice(3, -3).trim();
            const blockId = `${msgId}-code-${index}`;
            const risky = isRiskyCommand(code);

            return (
              <div key={index} className="rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 my-2">
                {/* Code Block Header */}
                <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-purple-500" />
                    <span>{lang || 'bash'}</span>
                    {risky && (
                      <Badge variant="outline" className="text-[9px] bg-red-500/10 text-red-400 border-red-500/30 flex items-center gap-1">
                        <ShieldAlert className="w-2.5 h-2.5" /> Risky Command
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyCode(code, blockId)}
                      className="px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-300 flex items-center gap-1 text-[10px] transition-colors"
                      title="Copy code"
                    >
                      {copiedCodeId === blockId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedCodeId === blockId ? 'Copied' : 'Copy'}</span>
                    </button>
                    {targetServer && (
                      <button
                        onClick={() => onRunInTerminal(code, targetServer)}
                        className="px-2 py-0.5 rounded bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 flex items-center gap-1 text-[10px] font-medium transition-colors"
                        title={`Run in terminal on ${targetServer.name}`}
                      >
                        <Terminal className="w-3 h-3 text-purple-300" />
                        <span>Run on Server</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Code Block Body */}
                <pre className="p-3 overflow-x-auto font-mono text-[11px] text-zinc-200 select-all leading-normal">
                  <code>{code}</code>
                </pre>
              </div>
            );
          }

          return (
            <div key={index} className="whitespace-pre-wrap">
              {part}
            </div>
          );
        })}
      </div>
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity sm:hidden"
        aria-hidden
      />

      <aside
        aria-label="7Server AI Copilot"
        className="fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] bg-[var(--card)] border-l border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-200 ease-out"
      >
        {/* Header */}
        <div className="h-14 px-4 border-b border-[var(--border)] flex items-center justify-between gap-3 shrink-0 bg-[var(--background)]/60 backdrop-blur-md">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-[var(--foreground)] flex items-center gap-1.5">
                <span>7Server AI Copilot</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                Site Reliability Engineer (SRE) Assistant
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearHistory}
                title="Clear Chat History"
                className="h-8 w-8 text-[var(--muted-foreground)] hover:text-red-500"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close Copilot (⌘J)"
              className="h-8 w-8 text-[var(--muted-foreground)]"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Server Context Pill Bar */}
        <div className="px-4 py-2 bg-[var(--muted)]/40 border-b border-[var(--border)] flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-[var(--muted-foreground)]">
            <Server className="w-3.5 h-3.5 shrink-0 text-purple-500" />
            <span>Target Server:</span>
          </div>

          <div className="flex items-center gap-1.5">
            {servers.length > 0 ? (
              <select
                value={selectedServerId}
                onChange={(e) => setSelectedServerId(e.target.value)}
                className="h-6 px-2 text-[11px] rounded bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 max-w-[190px] truncate"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.host})
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-[var(--muted-foreground)]">No servers added</span>
            )}
            {activeTab && (
              <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0">
                {activeTab}
              </Badge>
            )}
          </div>
        </div>

        {/* Chat Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center px-4 space-y-5">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 border border-purple-500/20 flex items-center justify-center shadow-inner">
                <Bot className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-sm text-[var(--foreground)]">Halo! Ada yang bisa saya bantu?</h3>
                <p className="text-xs text-[var(--muted-foreground)] max-w-xs">
                  Saya dapat menganalisis log error, membuat script Linux aman, dan mengecek kesehatan server Anda.
                </p>
              </div>

              {/* Quick action chips */}
              <div className="w-full space-y-2 text-left pt-2">
                <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider px-1">
                  Quick Prompts
                </div>
                {QUICK_ACTIONS.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(action.prompt)}
                    className="w-full p-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-purple-500/50 hover:bg-purple-500/5 text-left text-xs transition flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-sm">{action.icon}</span>
                      <span className="font-medium text-[var(--foreground)] truncate">{action.label}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] group-hover:text-purple-500 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-tr-sm shadow-sm'
                      : 'bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--foreground)] rounded-tl-sm'
                  }`}
                >
                  {renderMessageContent(msg.content, msg.id)}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--background)] shrink-0 space-y-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative flex items-end gap-2"
          >
            <textarea
              ref={textareaRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                targetServer
                  ? `Tanya Copilot mengenai ${targetServer.name}...`
                  : 'Tanya Copilot mengenai server atau Linux...'
              }
              className="flex-1 resize-none rounded-xl bg-[var(--card)] border border-[var(--border)] p-2.5 text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
            />

            {isStreaming ? (
              <Button
                type="button"
                size="icon"
                onClick={handleStop}
                className="h-9 w-9 rounded-xl bg-red-600 hover:bg-red-700 text-white shrink-0 shadow-sm"
                title="Stop generation"
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                className="h-9 w-9 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white shrink-0 shadow-sm"
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </form>

          <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] px-1">
            <span>Shift + Enter untuk baris baru</span>
            <span>Shortcut: <kbd className="font-mono bg-[var(--muted)] px-1 rounded border border-[var(--border)]">⌘J</kbd></span>
          </div>
        </div>
      </aside>
    </>
  );
}
