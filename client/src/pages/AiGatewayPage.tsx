import React, { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  Key,
  Sliders,
  Activity,
  Plus,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Lock,
  Cpu,
  Sparkles,
  Server,
  Layers,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Radio,
  Plug,
  Unplug,
  Zap,
  Globe
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';
import { Modal } from '@/shared/ui/modal';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { useT } from '@/shared/i18n';
import type { AiGatewayTab } from '@/app/router';
import {
  fetchGatewayKeys,
  createGatewayKey,
  deleteGatewayKey,
  toggleGatewayKey,
  fetchGatewayConfig,
  fetchGatewayUsage,
  clearGatewayUsage,
  fetchGatewayStats,
  verifyProvider,
  connectProviderApi,
  disconnectProviderApi
} from '@/features/ai-gateway/api';
import type {
  VirtualApiKey,
  AiGatewayConfig,
  AiUsageLog,
  AiGatewayStats,
  AiProviderId,
  ProviderVerificationResult
} from '@/features/ai-gateway/types';

interface AiGatewayPageProps {
  tab: AiGatewayTab;
  onTabChange: (tab: AiGatewayTab) => void;
}

interface ProviderMeta {
  id: AiProviderId;
  name: string;
  tagline: string;
  badge: string;
  color: string;
  models: string[];
  defaultUrl: string;
  keyPlaceholder: string;
  docsUrl: string;
}

const PROVIDERS_META: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    tagline: 'Claude 3.7 Sonnet, Claude 3.5 Sonnet & Haiku (Native Claude Code CLI target)',
    badge: 'Claude Code',
    color: 'from-amber-500/20 to-orange-500/10 text-amber-500 border-amber-500/30',
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-4o, GPT-4o-mini, o1, o3-mini reasoning models',
    badge: 'OpenAI API',
    color: 'from-emerald-500/20 to-teal-500/10 text-emerald-500 border-emerald-500/30',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'DeepSeek-V3 and DeepSeek-R1 open reasoning models with ultra-low cost',
    badge: 'High Performance',
    color: 'from-blue-500/20 to-cyan-500/10 text-blue-500 border-blue-500/30',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultUrl: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'Unified gateway routing to 100+ LLMs with a single account and subscription',
    badge: 'Universal Hub',
    color: 'from-purple-500/20 to-pink-500/10 text-purple-400 border-purple-500/30',
    models: ['anthropic/claude-3.7-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-r1'],
    defaultUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Gemini 2.0 Flash, Gemini 1.5 Pro & multimodal capabilities',
    badge: 'Google Cloud',
    color: 'from-red-500/20 to-amber-500/10 text-red-500 border-red-500/30',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    defaultUrl: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local LLM)',
    tagline: 'Self-hosted open models running on your server or local hardware',
    badge: '100% Private',
    color: 'from-zinc-500/20 to-stone-500/10 text-zinc-300 border-zinc-500/30',
    models: ['llama3.2', 'deepseek-r1:8b', 'mistral', 'qwen2.5-coder'],
    defaultUrl: 'http://localhost:11434',
    keyPlaceholder: 'No API key needed for local Ollama',
    docsUrl: 'https://ollama.com'
  }
];

export default function AiGatewayPage({ tab, onTabChange }: AiGatewayPageProps) {
  const t = useT();

  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<VirtualApiKey[]>([]);
  const [config, setConfig] = useState<AiGatewayConfig | null>(null);
  const [usage, setUsage] = useState<AiUsageLog[]>([]);
  const [stats, setStats] = useState<AiGatewayStats | null>(null);

  // Quickstart key selection
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // New Key modal
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyProviders, setNewKeyProviders] = useState<AiProviderId[]>([]);
  const [createdKeySecret, setCreatedKeySecret] = useState<string | null>(null);

  // Provider Connection Modal
  const [connectingProvider, setConnectingProvider] = useState<ProviderMeta | null>(null);
  const [connectApiKey, setConnectApiKey] = useState('');
  const [connectBaseUrl, setConnectBaseUrl] = useState('');
  const [revealedKey, setRevealedKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<ProviderVerificationResult | null>(null);

  // Usage tab filters
  const [usageSearch, setUsageSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      const [keysData, configData, usageData, statsData] = await Promise.all([
        fetchGatewayKeys().catch(() => []),
        fetchGatewayConfig().catch(() => null),
        fetchGatewayUsage(150).catch(() => []),
        fetchGatewayStats().catch(() => null)
      ]);

      setKeys(keysData);
      if (keysData.length > 0 && !selectedKeyId) {
        setSelectedKeyId(keysData[0].key || keysData[0].keyPrefix);
      }
      setConfig(configData);
      setUsage(usageData);
      setStats(statsData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load AI Gateway data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    toast.success(t('aiGateway.copied'));
    setTimeout(() => {
      setCopiedSection((prev) => (prev === sectionId ? null : prev));
    }, 2000);
  };

  const openConnectModal = (p: ProviderMeta) => {
    const existing = config?.providers?.[p.id];
    setConnectingProvider(p);
    setConnectApiKey(existing?.apiKey || '');
    setConnectBaseUrl(existing?.baseUrl || p.defaultUrl);
    setRevealedKey(false);
    setVerificationResult(null);
  };

  const handleVerifyAndConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingProvider) return;

    try {
      setIsVerifying(true);
      setVerificationResult(null);

      const res = await connectProviderApi(
        connectingProvider.id,
        connectApiKey.trim(),
        connectBaseUrl.trim() || connectingProvider.defaultUrl
      );

      setVerificationResult(res.verification);
      setConfig(res.config);
      toast.success(t('aiGateway.connectionVerified'));
      setTimeout(() => {
        setConnectingProvider(null);
      }, 1200);
    } catch (err: any) {
      setVerificationResult({
        providerId: connectingProvider.id,
        valid: false,
        error: err.message || t('aiGateway.connectionFailed')
      });
      toast.error(err.message || t('aiGateway.connectionFailed'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async (providerId: AiProviderId) => {
    confirmModal({
      title: t('aiGateway.disconnectProvider'),
      message: `Putuskan sambungan ke provider ${providerId}? Kredensial akan dihapus dari server.`,
      confirmText: t('aiGateway.disconnectProvider'),
      danger: true,
      onConfirm: async () => {
        try {
          const updated = await disconnectProviderApi(providerId);
          setConfig(updated);
          toast.success(t('aiGateway.disconnectedNotice'));
          setConnectingProvider(null);
        } catch (err: any) {
          toast.error(err.message || 'Failed to disconnect');
        }
      }
    });
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const newKey = await createGatewayKey(newKeyName.trim(), newKeyProviders);
      setCreatedKeySecret(newKey.key);
      setKeys((prev) => [newKey, ...prev]);
      setSelectedKeyId(newKey.key);
      setNewKeyName('');
      setNewKeyProviders([]);
      toast.success(t('aiGateway.keyCreatedTitle'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to create virtual key');
    }
  };

  const handleDeleteKey = (key: VirtualApiKey) => {
    confirmModal({
      title: t('aiGateway.revokeKey'),
      message: t('aiGateway.revokeConfirm', { name: key.name }),
      confirmText: t('aiGateway.revokeKey'),
      danger: true,
      onConfirm: async () => {
        try {
          await deleteGatewayKey(key.id);
          setKeys((prev) => prev.filter((k) => k.id !== key.id));
          toast.success('Virtual key revoked successfully');
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke key');
        }
      }
    });
  };

  const handleToggleKey = async (key: VirtualApiKey) => {
    try {
      const updated = await toggleGatewayKey(key.id, !key.enabled);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      toast.success(`Key ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update key status');
    }
  };

  const handleClearUsage = () => {
    confirmModal({
      title: t('aiGateway.clearLogs'),
      message: t('aiGateway.clearLogsConfirm'),
      confirmText: t('aiGateway.clearLogs'),
      danger: true,
      onConfirm: async () => {
        try {
          await clearGatewayUsage();
          setUsage([]);
          toast.success('Usage logs cleared');
        } catch (err: any) {
          toast.error(err.message || 'Failed to clear logs');
        }
      }
    });
  };

  const gatewayBaseUrl = useMemo(() => {
    return `${window.location.origin}/api/ai`;
  }, []);

  const activeKeyForQuickstart = useMemo(() => {
    const found = keys.find((k) => k.key === selectedKeyId || k.id === selectedKeyId);
    if (found) return found.key || found.keyPrefix;
    return selectedKeyId || (keys.length > 0 ? keys[0].key || keys[0].keyPrefix : '7s-sk-your-virtual-key');
  }, [keys, selectedKeyId]);

  const connectedCount = useMemo(() => {
    if (!config?.providers) return 0;
    return Object.values(config.providers).filter((p) => p && p.connected).length;
  }, [config]);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return n.toLocaleString();
  };

  const currentTab = tab === 'config' ? 'providers' : tab;

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20 shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2">
                {t('aiGateway.title')}
                <Badge
                  variant="outline"
                  className={`text-[10px] flex items-center gap-1 font-mono ${
                    connectedCount > 0
                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${connectedCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {connectedCount > 0 ? `${connectedCount} Provider Active` : 'No Providers Connected'}
                </Badge>
              </h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                Hubungkan akun provider AI Anda, lalu gunakan 1 Kunci Universal untuk Claude Code, Cursor, dan Copilot.
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats Cards */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center gap-3 text-xs">
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.connectedProviders')}</div>
              <div className="font-bold font-mono text-emerald-400">{connectedCount} Active</div>
            </div>
            <div className="w-px h-6 bg-[var(--border)]" />
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.statsActiveKeys')}</div>
              <div className="font-bold font-mono text-purple-400">{keys.filter((k) => k.enabled).length} Keys</div>
            </div>
            <div className="w-px h-6 bg-[var(--border)]" />
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.statsTokens')}</div>
              <div className="font-bold font-mono text-[var(--foreground)]">
                {formatTokens((stats?.totalInputTokens || 0) + (stats?.totalOutputTokens || 0))}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} title="Refresh Gateway">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-px">
        <button
          onClick={() => onTabChange('providers')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === 'providers'
              ? 'border-purple-500 text-purple-500 font-semibold'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Plug className="w-3.5 h-3.5" />
          {t('aiGateway.tabProviders')}
          {connectedCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-mono">
              {connectedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('keys')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === 'keys'
              ? 'border-purple-500 text-purple-500 font-semibold'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          {t('aiGateway.tabUniversalKeys')}
          {keys.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] font-mono">
              {keys.length}
            </span>
          )}
        </button>
        <button
          onClick={() => onTabChange('quickstart')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === 'quickstart'
              ? 'border-purple-500 text-purple-500 font-semibold'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          {t('aiGateway.tabQuickstart')}
        </button>
        <button
          onClick={() => onTabChange('usage')}
          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            currentTab === 'usage'
              ? 'border-purple-500 text-purple-500 font-semibold'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          {t('aiGateway.tabUsage')}
        </button>
      </div>

      {/* ----------------- TAB 1: PROVIDERS & ACCOUNTS (9ROUTER STYLE) ----------------- */}
      {currentTab === 'providers' && (
        <div className="space-y-6">
          {/* Workflow callout */}
          <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Zap className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--foreground)]">
                  Langkah 1: Hubungkan Akun / Provider AI Anda
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Setelah provider diverifikasi dan tersambung, Anda bisa membuat <strong>Kunci API Universal</strong> di tab sebelah untuk digunakan di semua tools coding Anda (Claude Code, Cursor, Cline, dll).
                </div>
              </div>
            </div>
            {connectedCount > 0 ? (
              <Button size="sm" onClick={() => onTabChange('keys')} className="bg-purple-600 hover:bg-purple-700 text-white shrink-0">
                Lanjut: Buat Kunci Universal
              </Button>
            ) : null}
          </div>

          {/* Providers Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PROVIDERS_META.map((p) => {
              const provConfig = config?.providers?.[p.id];
              const isConnected = provConfig?.connected === true && (provConfig?.apiKey || p.id === 'ollama');

              return (
                <Card
                  key={p.id}
                  className={`p-4 bg-[var(--card)] border transition-all duration-200 flex flex-col justify-between ${
                    isConnected
                      ? 'border-emerald-500/40 shadow-sm'
                      : 'border-[var(--border)] hover:border-[var(--border)]/80'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-sm shadow-sm bg-gradient-to-br ${p.color}`}>
                          {p.name.slice(0, 1)}
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-[var(--foreground)]">{p.name}</div>
                          <div className="text-[10px] text-[var(--muted-foreground)] font-mono">{p.badge}</div>
                        </div>
                      </div>

                      {isConnected ? (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1 font-mono">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Connected
                          {provConfig?.latencyMs ? ` (${provConfig.latencyMs}ms)` : ''}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-[var(--muted-foreground)] bg-[var(--muted)]/50">
                          Disconnected
                        </Badge>
                      )}
                    </div>

                    <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-2 min-h-[32px]">
                      {p.tagline}
                    </p>

                    <div className="space-y-1 pt-1">
                      <div className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase">Supported Models:</div>
                      <div className="flex flex-wrap gap-1">
                        {p.models.slice(0, 2).map((m) => (
                          <span key={m} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--foreground)]">
                            {m}
                          </span>
                        ))}
                        {p.models.length > 2 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                            +{p.models.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[var(--border)] mt-4 flex items-center justify-between gap-2">
                    {isConnected ? (
                      <>
                        <button
                          onClick={() => handleDisconnect(p.id)}
                          className="text-[11px] text-red-500 hover:text-red-600 transition-colors flex items-center gap-1"
                        >
                          <Unplug className="w-3 h-3" />
                          Disconnect
                        </button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openConnectModal(p)}
                          className="h-7 text-xs border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                        >
                          Configure
                        </Button>
                      </>
                    ) : (
                      <>
                        <a
                          href={p.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[var(--muted-foreground)] hover:text-purple-400 transition-colors flex items-center gap-1"
                        >
                          Get API Key <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        <Button
                          size="sm"
                          onClick={() => openConnectModal(p)}
                          className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <Plug className="w-3 h-3 mr-1" />
                          Connect
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: UNIVERSAL VIRTUAL KEYS (9ROUTER STYLE) ----------------- */}
      {currentTab === 'keys' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                <Key className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--foreground)]">
                  {t('aiGateway.universalKeyNotice')}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Kunci ini otomatis merutekan ke provider yang terhubung ({connectedCount} aktif). Jika Anda memanggil model Claude, diteruskan ke Anthropic. Jika memanggil model DeepSeek atau GPT-4o, diteruskan ke provider terkait.
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setCreatedKeySecret(null);
                setShowNewKeyModal(true);
              }}
              className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('aiGateway.createKey')}
            </Button>
          </div>

          {keys.length === 0 ? (
            <Card className="p-12 text-center bg-[var(--card)] border border-[var(--border)] space-y-3">
              <Key className="w-8 h-8 text-[var(--muted-foreground)]/40 mx-auto" />
              <h3 className="text-sm font-medium text-[var(--foreground)]">{t('aiGateway.noKeys')}</h3>
              <Button size="sm" onClick={() => setShowNewKeyModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t('aiGateway.createKey')}
              </Button>
            </Card>
          ) : (
            <Card className="bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] text-[var(--muted-foreground)] font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Name / Label</th>
                      <th className="py-2.5 px-3">Universal API Key</th>
                      <th className="py-2.5 px-3">Connected Upstreams</th>
                      <th className="py-2.5 px-3 text-right">Requests</th>
                      <th className="py-2.5 px-3 text-right">Total Tokens</th>
                      <th className="py-2.5 px-3">Last Used</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {keys.map((k) => (
                      <tr key={k.id} className="hover:bg-[var(--muted)]/30 transition-colors">
                        <td className="py-3 px-3 font-medium text-[var(--foreground)]">
                          <div className="flex items-center gap-2">
                            <Key className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span>{k.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-[var(--muted-foreground)]">
                          <div className="flex items-center gap-1.5">
                            <span>{k.key ? `${k.key.slice(0, 10)}...${k.key.slice(-4)}` : k.keyPrefix}</span>
                            {k.key && (
                              <button
                                onClick={() => copyToClipboard(k.key, k.id)}
                                className="p-1 hover:text-[var(--foreground)]"
                                title="Copy Key"
                              >
                                {copiedSection === k.id ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {PROVIDERS_META.filter(p => config?.providers?.[p.id]?.connected).map(p => (
                              <Badge key={p.id} variant="outline" className="text-[9px] uppercase border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
                                {p.id}
                              </Badge>
                            ))}
                            {connectedCount === 0 && (
                              <span className="text-[10px] text-amber-500">None connected</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{k.totalRequests.toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-mono text-purple-400">
                          {formatTokens((k.totalInputTokens || 0) + (k.totalOutputTokens || 0))}
                        </td>
                        <td className="py-3 px-3 text-[var(--muted-foreground)]">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleToggleKey(k)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                              k.enabled
                                ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                : 'bg-zinc-500/10 text-zinc-500 hover:bg-zinc-500/20'
                            }`}
                          >
                            {k.enabled ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteKey(k)}
                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 w-7 p-0"
                            title={t('aiGateway.revokeKey')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ----------------- TAB 3: QUICKSTART & CLIENT SETUP ----------------- */}
      {currentTab === 'quickstart' && (
        <div className="space-y-6">
          <Card className="p-4 bg-[var(--card)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--foreground)]">{t('aiGateway.selectKey')}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">Pilih kunci virtual untuk mengisi sampel kode di bawah secara otomatis</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {keys.length > 0 ? (
                <select
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  className="h-8 px-2.5 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:ring-1 focus:ring-purple-500"
                >
                  {keys.map((k) => (
                    <option key={k.id} value={k.key || k.keyPrefix}>
                      {k.name} ({k.keyPrefix})
                    </option>
                  ))}
                </select>
              ) : (
                <Button size="sm" onClick={() => setShowNewKeyModal(true)} className="bg-purple-600 hover:bg-purple-700 text-white">
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t('aiGateway.createKey')}
                </Button>
              )}
            </div>
          </Card>

          {/* Claude Code CLI Card */}
          <Card className="p-5 bg-[var(--card)] border border-[var(--border)] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0 font-bold text-sm">
                  C
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                    {t('aiGateway.claudeCodeTitle')}
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                      Claude Code CLI Compatible
                    </Badge>
                  </h3>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    {t('aiGateway.claudeCodeDesc')}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const cmd = `export ANTHROPIC_BASE_URL="${gatewayBaseUrl}"\nexport ANTHROPIC_API_KEY="${activeKeyForQuickstart}"\nclaude`;
                  copyToClipboard(cmd, 'claude-full');
                }}
              >
                {copiedSection === 'claude-full' ? <Check className="w-3.5 h-3.5 text-emerald-500 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {t('aiGateway.copyCommand')}
              </Button>
            </div>

            <div className="relative rounded-xl bg-zinc-950 p-4 font-mono text-xs text-zinc-100 border border-zinc-800 space-y-2">
              <div className="text-zinc-500 select-none"># 1. Install Claude Code CLI (jika belum terpasang)</div>
              <div className="text-emerald-400">npm install -g @anthropic-ai/claude-code</div>

              <div className="text-zinc-500 select-none pt-2"># 2. Arahkan Base URL ke 7Server & masukkan Universal Virtual Key</div>
              <div>
                <span className="text-purple-400">export</span> <span className="text-amber-300">ANTHROPIC_BASE_URL</span>=<span className="text-emerald-300">"{gatewayBaseUrl}"</span>
              </div>
              <div>
                <span className="text-purple-400">export</span> <span className="text-amber-300">ANTHROPIC_API_KEY</span>=<span className="text-emerald-300">"{activeKeyForQuickstart}"</span>
              </div>

              <div className="text-zinc-500 select-none pt-2"># 3. Jalankan Claude Code</div>
              <div className="text-emerald-400">claude</div>
            </div>
          </Card>

          {/* Cursor & Other Agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 bg-[var(--card)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-xs text-[var(--foreground)]">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  {t('aiGateway.cursorTitle')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const c = `Base URL: ${gatewayBaseUrl}/v1\nAPI Key: ${activeKeyForQuickstart}`;
                    copyToClipboard(c, 'cursor');
                  }}
                >
                  {copiedSection === 'cursor' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('aiGateway.cursorDesc')}
              </p>
              <div className="p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] font-mono text-[11px] space-y-1">
                <div className="text-[var(--muted-foreground)]">Base URL:</div>
                <div className="text-purple-400 select-all">{gatewayBaseUrl}/v1</div>
                <div className="text-[var(--muted-foreground)] pt-1">API Key:</div>
                <div className="text-emerald-400 select-all">{activeKeyForQuickstart}</div>
              </div>
            </Card>

            <Card className="p-4 bg-[var(--card)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-xs text-[var(--foreground)]">
                  <Terminal className="w-4 h-4 text-emerald-500" />
                  {t('aiGateway.curlTitle')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const curlCmd = `curl -X POST ${gatewayBaseUrl}/v1/messages \\\n  -H "x-api-key: ${activeKeyForQuickstart}" \\\n  -H "anthropic-version: 2023-06-01" \\\n  -H "content-type: application/json" \\\n  -d '{"model":"claude-3-7-sonnet-20250219","max_tokens":100,"messages":[{"role":"user","content":"Hello 7Server AI!"}]}'`;
                    copyToClipboard(curlCmd, 'curl');
                  }}
                >
                  {copiedSection === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Kirim permintaan pengujian langsung dari terminal Anda untuk memverifikasi streaming dan otentikasi.
              </p>
              <div className="p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] font-mono text-[10px] text-zinc-400 truncate">
                curl -X POST {gatewayBaseUrl}/v1/messages -H "x-api-key: {activeKeyForQuickstart.slice(0, 10)}..."
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ----------------- TAB 4: USAGE LOGS ----------------- */}
      {currentTab === 'usage' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <Input
                  value={usageSearch}
                  onChange={(e) => setUsageSearch(e.target.value)}
                  placeholder="Filter by model, key, or IP..."
                  className="pl-8 h-8 text-xs w-56"
                />
              </div>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-8 px-2.5 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
              >
                <option value="all">All Providers</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="deepseek">DeepSeek</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleClearUsage}
              disabled={usage.length === 0}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              {t('aiGateway.clearLogs')}
            </Button>
          </div>

          {usage.length === 0 ? (
            <Card className="p-12 text-center bg-[var(--card)] border border-[var(--border)] space-y-2">
              <Activity className="w-8 h-8 text-[var(--muted-foreground)]/40 mx-auto" />
              <p className="text-xs text-[var(--muted-foreground)]">{t('aiGateway.noLogs')}</p>
            </Card>
          ) : (
            <Card className="bg-[var(--card)] border border-[var(--border)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--muted)]/50 border-b border-[var(--border)] text-[var(--muted-foreground)] font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Provider</th>
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Virtual Key</th>
                      <th className="py-2.5 px-3 text-right">Prompt</th>
                      <th className="py-2.5 px-3 text-right">Completion</th>
                      <th className="py-2.5 px-3 text-right">Total</th>
                      <th className="py-2.5 px-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {usage.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--muted)]/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              log.status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-500'
                                : 'bg-red-500/10 text-red-500'
                            }`}
                          >
                            {log.statusCode || (log.status === 'success' ? 200 : 500)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {log.provider}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--foreground)]">
                          <div className="flex items-center gap-1.5">
                            <span>{log.model}</span>
                            {log.streaming && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/10 text-purple-500 font-sans">
                                SSE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--muted-foreground)] truncate max-w-[120px]">
                          {log.keyName}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[var(--muted-foreground)]">
                          {log.inputTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[var(--muted-foreground)]">
                          {log.outputTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-purple-400">
                          {log.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-[var(--muted-foreground)]">
                          {log.durationMs}ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ----------------- CONNECT PROVIDER MODAL ----------------- */}
      {connectingProvider && (
        <Modal
          title={`Connect to ${connectingProvider.name}`}
          onClose={() => setConnectingProvider(null)}
        >
          <form onSubmit={handleVerifyAndConnect} className="space-y-4">
            <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20 text-xs text-[var(--foreground)] space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-purple-400">
                <Sparkles className="w-3.5 h-3.5" />
                Live Connection Verification
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                Kredensial Anda akan diverifikasi langsung ke server upstream {connectingProvider.name}. Jika valid, kunci akan dienkripsi dengan AES-256-GCM.
              </p>
            </div>

            {connectingProvider.id !== 'ollama' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  API Key / Token
                </label>
                <div className="relative">
                  <Input
                    required
                    type={revealedKey ? 'text' : 'password'}
                    value={connectApiKey}
                    onChange={(e) => setConnectApiKey(e.target.value)}
                    placeholder={connectingProvider.keyPlaceholder}
                    className="font-mono text-xs pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealedKey(!revealedKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  >
                    {revealedKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">
                Base URL Endpoint (Opsional)
              </label>
              <Input
                value={connectBaseUrl}
                onChange={(e) => setConnectBaseUrl(e.target.value)}
                placeholder={connectingProvider.defaultUrl}
                className="font-mono text-xs"
              />
            </div>

            {verificationResult && (
              <div
                className={`p-3 rounded-lg text-xs border ${
                  verificationResult.valid
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                {verificationResult.valid ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Koneksi Berhasil! Terverifikasi dalam {verificationResult.latencyMs}ms.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>Verifikasi Gagal</span>
                    </div>
                    <div className="text-[11px] opacity-90 pl-6">
                      {verificationResult.error}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
              {config?.providers?.[connectingProvider.id]?.connected ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleDisconnect(connectingProvider.id)}
                  className="text-red-500 hover:text-red-600 hover:bg-red-500/10 text-xs"
                >
                  <Unplug className="w-3.5 h-3.5 mr-1" />
                  Disconnect
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setConnectingProvider(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isVerifying || (connectingProvider.id !== 'ollama' && !connectApiKey.trim())}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                      {t('aiGateway.testingConnection')}
                    </>
                  ) : (
                    <>
                      <Plug className="w-3.5 h-3.5 mr-1" />
                      {t('aiGateway.verifyAndConnect')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ----------------- CREATE VIRTUAL KEY MODAL ----------------- */}
      {showNewKeyModal && (
        <Modal
          title={createdKeySecret ? t('aiGateway.keyCreatedTitle') : t('aiGateway.createKey')}
          onClose={() => {
            setShowNewKeyModal(false);
            setCreatedKeySecret(null);
          }}
        >
          {createdKeySecret ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('aiGateway.keyCreatedWarning')}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  Your Universal Virtual API Key
                </label>
                <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-400 break-all select-all flex items-center justify-between gap-2">
                  <span>{createdKeySecret}</span>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(createdKeySecret, 'modal-key')}
                    className="shrink-0 bg-zinc-800 hover:bg-zinc-700 text-white h-7 px-2"
                  >
                    {copiedSection === 'modal-key' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  onClick={() => {
                    setShowNewKeyModal(false);
                    setCreatedKeySecret(null);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  {t('aiGateway.keyName')}
                </label>
                <Input
                  required
                  autoFocus
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('aiGateway.keyNamePlaceholder')}
                  className="text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                  Allowed Providers (kosongkan untuk akses ke semua provider yang terhubung)
                </label>
                <div className="space-y-2">
                  {PROVIDERS_META.map((prov) => {
                    const checked = newKeyProviders.includes(prov.id);
                    return (
                      <label key={prov.id} className="flex items-center gap-2 text-xs text-[var(--foreground)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewKeyProviders((prev) => [...prev, prov.id]);
                            } else {
                              setNewKeyProviders((prev) => prev.filter((p) => p !== prov.id));
                            }
                          }}
                          className="rounded border-[var(--border)] text-purple-600 focus:ring-purple-500"
                        />
                        <span className="capitalize font-medium">{prov.name}</span>
                        {config?.providers?.[prov.id]?.connected && (
                          <span className="text-[10px] text-emerald-400">✓ Connected</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowNewKeyModal(false)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={!newKeyName.trim()} className="bg-purple-600 hover:bg-purple-700 text-white">
                  {t('aiGateway.createKey')}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
