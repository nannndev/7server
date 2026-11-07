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
import { useI18n, useT, type MessageKey } from '@/shared/i18n';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { SubscriptionAccounts } from '@/features/ai-gateway/SubscriptionAccounts';
import { Combos } from '@/features/ai-gateway/Combos';
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
  /** i18n keys */
  tagline: MessageKey;
  badge: MessageKey;
  color: string;
  models: string[];
  defaultUrl: string;
  /** literal key format, or an i18n key (Ollama) */
  keyPlaceholder: string;
  docsUrl: string;
}

export const PROVIDERS_META: ProviderMeta[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    tagline: 'aiGw.p.anthropic.tagline',
    badge: 'aiGw.p.anthropic.badge',
    color: 'from-amber-500/20 to-orange-500/10 text-amber-500 border-amber-500/30',
    models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    defaultUrl: 'https://api.anthropic.com',
    keyPlaceholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'aiGw.p.openai.tagline',
    badge: 'aiGw.p.openai.badge',
    color: 'from-emerald-500/20 to-teal-500/10 text-emerald-500 border-emerald-500/30',
    models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    tagline: 'aiGw.p.deepseek.tagline',
    badge: 'aiGw.p.deepseek.badge',
    color: 'from-blue-500/20 to-cyan-500/10 text-blue-500 border-blue-500/30',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultUrl: 'https://api.deepseek.com',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: 'aiGw.p.openrouter.tagline',
    badge: 'aiGw.p.openrouter.badge',
    color: 'from-[var(--foreground)]/10 to-pink-500/10 text-[var(--foreground)] border-[var(--rim)]',
    models: ['openrouter/anthropic/claude-sonnet-4', 'openrouter/openai/gpt-4o-mini'],
    defaultUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'aiGw.p.gemini.tagline',
    badge: 'aiGw.p.gemini.badge',
    color: 'from-red-500/20 to-amber-500/10 text-red-500 border-red-500/30',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro'],
    defaultUrl: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local LLM)',
    tagline: 'aiGw.p.ollama.tagline',
    badge: 'aiGw.p.ollama.badge',
    color: 'from-zinc-500/20 to-stone-500/10 text-zinc-300 border-zinc-500/30',
    models: ['llama3.2', 'deepseek-r1:8b', 'mistral', 'qwen2.5-coder'],
    defaultUrl: 'http://localhost:11434',
    keyPlaceholder: 'aiGw.ollamaNoKey',
    docsUrl: 'https://ollama.com'
  },
  // OpenAI-compatible API-key providers; requests use a "<id>/<model>" prefix (server: compatProviders.ts)
  {
    id: 'groq',
    name: 'Groq',
    tagline: 'aiGw.p.groq.tagline',
    badge: 'aiGw.p.groq.badge',
    color: 'from-orange-500/20 to-red-500/10 text-orange-500 border-orange-500/30',
    models: ['groq/llama-3.3-70b-versatile', 'groq/qwen/qwen3-32b'],
    defaultUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    tagline: 'aiGw.p.mistral.tagline',
    badge: 'aiGw.p.mistral.badge',
    color: 'from-orange-500/20 to-amber-500/10 text-orange-400 border-orange-500/30',
    models: ['mistral/mistral-large-latest', 'mistral/codestral-latest'],
    defaultUrl: 'https://api.mistral.ai/v1',
    keyPlaceholder: '...',
    docsUrl: 'https://console.mistral.ai/api-keys'
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    tagline: 'aiGw.p.xai.tagline',
    badge: 'aiGw.p.xai.badge',
    color: 'from-zinc-500/20 to-zinc-500/10 text-[var(--foreground)] border-[var(--rim)]',
    models: ['xai/grok-4', 'xai/grok-3-mini'],
    defaultUrl: 'https://api.x.ai/v1',
    keyPlaceholder: 'xai-...',
    docsUrl: 'https://console.x.ai'
  },
  {
    id: 'together',
    name: 'Together AI',
    tagline: 'aiGw.p.together.tagline',
    badge: 'aiGw.p.together.badge',
    color: 'from-blue-500/20 to-indigo-500/10 text-blue-400 border-blue-500/30',
    models: ['together/meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    defaultUrl: 'https://api.together.xyz/v1',
    keyPlaceholder: '...',
    docsUrl: 'https://api.together.ai/settings/api-keys'
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    tagline: 'aiGw.p.fireworks.tagline',
    badge: 'aiGw.p.fireworks.badge',
    color: 'from-violet-500/20 to-fuchsia-500/10 text-violet-400 border-violet-500/30',
    models: ['fireworks/accounts/fireworks/models/llama-v3p3-70b-instruct'],
    defaultUrl: 'https://api.fireworks.ai/inference/v1',
    keyPlaceholder: 'fw_...',
    docsUrl: 'https://fireworks.ai/account/api-keys'
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    tagline: 'aiGw.p.cerebras.tagline',
    badge: 'aiGw.p.cerebras.badge',
    color: 'from-orange-500/20 to-rose-500/10 text-orange-400 border-orange-500/30',
    models: ['cerebras/llama-3.3-70b', 'cerebras/qwen-3-32b'],
    defaultUrl: 'https://api.cerebras.ai/v1',
    keyPlaceholder: 'csk-...',
    docsUrl: 'https://cloud.cerebras.ai'
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'aiGw.p.perplexity.tagline',
    badge: 'aiGw.p.perplexity.badge',
    color: 'from-teal-500/20 to-cyan-500/10 text-teal-400 border-teal-500/30',
    models: ['perplexity/sonar', 'perplexity/sonar-pro'],
    defaultUrl: 'https://api.perplexity.ai',
    keyPlaceholder: 'pplx-...',
    docsUrl: 'https://www.perplexity.ai/settings/api'
  },
  {
    id: 'moonshot',
    name: 'Moonshot Kimi',
    tagline: 'aiGw.p.moonshot.tagline',
    badge: 'aiGw.p.moonshot.badge',
    color: 'from-slate-500/20 to-zinc-500/10 text-[var(--foreground)] border-[var(--rim)]',
    models: ['moonshot/kimi-k2-0711-preview'],
    defaultUrl: 'https://api.moonshot.ai/v1',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.moonshot.ai/console/api-keys'
  },
  {
    id: 'dashscope',
    name: 'Alibaba Qwen (DashScope)',
    tagline: 'aiGw.p.dashscope.tagline',
    badge: 'aiGw.p.dashscope.badge',
    color: 'from-orange-500/20 to-amber-500/10 text-orange-400 border-orange-500/30',
    models: ['dashscope/qwen-plus', 'dashscope/qwen3-coder-plus'],
    defaultUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://bailian.console.alibabacloud.com'
  },
  {
    id: 'zai',
    name: 'Z.ai GLM',
    tagline: 'aiGw.p.zai.tagline',
    badge: 'aiGw.p.zai.badge',
    color: 'from-blue-500/20 to-sky-500/10 text-blue-400 border-blue-500/30',
    models: ['zai/glm-4.5', 'zai/glm-4.5-air'],
    defaultUrl: 'https://api.z.ai/api/paas/v4',
    keyPlaceholder: '...',
    docsUrl: 'https://z.ai/manage-apikey/apikey-list'
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    tagline: 'aiGw.p.minimax.tagline',
    badge: 'aiGw.p.minimax.badge',
    color: 'from-rose-500/20 to-pink-500/10 text-rose-400 border-rose-500/30',
    models: ['minimax/MiniMax-M1'],
    defaultUrl: 'https://api.minimax.io/v1',
    keyPlaceholder: '...',
    docsUrl: 'https://www.minimax.io/platform'
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    tagline: 'aiGw.p.nvidia.tagline',
    badge: 'aiGw.p.nvidia.badge',
    color: 'from-lime-500/20 to-green-500/10 text-lime-500 border-lime-500/30',
    models: ['nvidia/meta/llama-3.3-70b-instruct'],
    defaultUrl: 'https://integrate.api.nvidia.com/v1',
    keyPlaceholder: 'nvapi-...',
    docsUrl: 'https://build.nvidia.com'
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    tagline: 'aiGw.p.custom.tagline',
    badge: 'aiGw.p.custom.badge',
    color: 'from-zinc-500/20 to-stone-500/10 text-[var(--muted-foreground)] border-[var(--border)]',
    models: ['custom/<model-name>'],
    defaultUrl: '',
    keyPlaceholder: 'sk-... (optional)',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat'
  }
];

function ModalCard({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl animate-[pop-in_180ms_ease-out]">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[var(--border)]">
        <h2 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">{icon}{title}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function AiGatewayPage({ tab, onTabChange }: AiGatewayPageProps) {
  const { t, locale } = useI18n();

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

  // Providers tab search & filter
  const [apiSearch, setApiSearch] = useState('');
  const [apiFilter, setApiFilter] = useState<'all' | 'connected' | 'native' | 'compat'>('all');

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
        setSelectedKeyId(keysData[0].id);
      }
      setConfig(configData);
      setUsage(usageData);
      setStats(statsData);
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errLoad'));
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
    if (!(await confirmModal({
      title: t('aiGateway.disconnectProvider'),
      message: t('aiGw.disconnectConfirm', { name: providerId }),
      confirmText: t('aiGateway.disconnectProvider'),
      variant: 'danger'
    }))) return;
    try {
      const updated = await disconnectProviderApi(providerId);
      setConfig(updated);
      toast.success(t('aiGateway.disconnectedNotice'));
      setConnectingProvider(null);
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errDisconnect'));
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const newKey = await createGatewayKey(newKeyName.trim(), newKeyProviders);
      setCreatedKeySecret(newKey.key ?? null);
      setKeys((prev) => [newKey, ...prev]);
      setSelectedKeyId(newKey.id);
      setNewKeyName('');
      setNewKeyProviders([]);
      toast.success(t('aiGateway.keyCreatedTitle'));
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errCreateKey'));
    }
  };

  const handleDeleteKey = async (key: VirtualApiKey) => {
    if (!(await confirmModal({
      title: t('aiGateway.revokeKey'),
      message: t('aiGateway.revokeConfirm', { name: key.name }),
      confirmText: t('aiGateway.revokeKey'),
      variant: 'danger'
    }))) return;
    try {
      await deleteGatewayKey(key.id);
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      toast.success(t('aiGw.keyRevoked'));
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errRevoke'));
    }
  };

  const handleToggleKey = async (key: VirtualApiKey) => {
    try {
      const updated = await toggleGatewayKey(key.id, !key.enabled);
      setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
      toast.success(updated.enabled ? t('aiGw.keyEnabled') : t('aiGw.keyDisabled'));
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errToggle'));
    }
  };

  const handleClearUsage = async () => {
    if (!(await confirmModal({
      title: t('aiGateway.clearLogs'),
      message: t('aiGateway.clearLogsConfirm'),
      confirmText: t('aiGateway.clearLogs'),
      variant: 'danger'
    }))) return;
    try {
      await clearGatewayUsage();
      setUsage([]);
      toast.success(t('aiGw.logsCleared'));
    } catch (err: any) {
      toast.error(err.message || t('aiGw.errClearLogs'));
    }
  };

  const gatewayBaseUrl = useMemo(() => {
    return `${window.location.origin}/api/ai`;
  }, []);

  const activeKeyForQuickstart = useMemo(() => {
    // Keys are stored hashed: the full key exists only in the creation response. Otherwise use a
    // placeholder the user replaces with the key they saved.
    if (createdKeySecret) return createdKeySecret;
    return '7s-sk-your-key';
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
            <div className="p-2 rounded-xl bg-[var(--foreground)]/[0.06] text-[var(--foreground)] border border-[var(--rim)] shadow-sm">
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
                  {connectedCount > 0 ? t('aiGw.providersActive', { n: connectedCount }) : t('aiGw.noProviders')}
                </Badge>
              </h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('aiGw.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Global Stats Cards */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-[var(--card)] border border-[var(--border)] flex items-center gap-3 text-xs">
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.connectedProviders')}</div>
              <div className="font-bold font-mono text-emerald-400">{t('aiGw.nActive', { n: connectedCount })}</div>
            </div>
            <div className="w-px h-6 bg-[var(--border)]" />
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.statsActiveKeys')}</div>
              <div className="font-bold font-mono text-[var(--foreground)]">{t('aiGw.nKeys', { n: keys.filter((k) => k.enabled).length })}</div>
            </div>
            <div className="w-px h-6 bg-[var(--border)]" />
            <div>
              <div className="text-[10px] text-[var(--muted-foreground)] uppercase font-semibold">{t('aiGateway.statsTokens')}</div>
              <div className="font-bold font-mono text-[var(--foreground)]">
                {formatTokens((stats?.totalInputTokens || 0) + (stats?.totalOutputTokens || 0))}
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} title={t('aiGw.refresh')}>
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
              ? 'border-[var(--rim)] text-[var(--foreground)] font-semibold'
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
              ? 'border-[var(--rim)] text-[var(--foreground)] font-semibold'
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
              ? 'border-[var(--rim)] text-[var(--foreground)] font-semibold'
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
              ? 'border-[var(--rim)] text-[var(--foreground)] font-semibold'
              : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          {t('aiGateway.tabUsage')}
        </button>
      </div>

      {/* ----------------- TAB 1: PROVIDERS & ACCOUNTS (9ROUTER STYLE) ----------------- */}
      {currentTab === 'providers' && (
        <div className="space-y-5">
          {/* Compact Workflow Callout */}
          <div className="px-3.5 py-2.5 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--rim)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-[var(--foreground)]/[0.06] text-[var(--foreground)] flex items-center justify-center shrink-0">
                <Zap className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--foreground)] truncate">
                  {t('aiGw.step1Title')}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)] truncate">
                  {t('aiGw.step1Desc')}
                </div>
              </div>
            </div>
            {connectedCount > 0 ? (
              <Button size="sm" onClick={() => onTabChange('keys')} className="btn-metal h-7 text-xs shrink-0">
                {t('aiGw.step1Next')}
              </Button>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('aiGw.subsTitle')}</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('aiGw.subsDesc')} <code className="font-mono">alias/model</code> · <code className="font-mono">cc/claude-sonnet-4-6</code> · <code className="font-mono">/v1/chat/completions</code>
              </p>
            </div>
            <SubscriptionAccounts />
          </div>

          <Combos />

          {/* API-Key Providers Section with Search & Filter Pills */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">{t('aiGw.apiKeyTitle')}</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                  {connectedCount}/{PROVIDERS_META.length}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={apiSearch}
                    onChange={(e) => setApiSearch(e.target.value)}
                    placeholder="Filter providers or models…"
                    className="h-7 pl-7 pr-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none focus:border-[var(--rim)] w-44 sm:w-52"
                  />
                </div>
                {([
                  { id: 'all', label: 'All' },
                  { id: 'connected', label: `Connected (${connectedCount})` },
                  { id: 'native', label: 'Core (6)' },
                  { id: 'compat', label: 'OpenAI-Compat (13)' }
                ] as const).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setApiFilter(f.id)}
                    className={`h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors border ${
                      apiFilter === f.id
                        ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent'
                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Compact High-Density Providers Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[...PROVIDERS_META]
                .filter((p) => {
                  const provConfig = config?.providers?.[p.id];
                  const isConnected = provConfig?.connected === true && (provConfig?.apiKey || p.id === 'ollama' || p.id === 'custom');
                  const isNative = ['anthropic', 'openai', 'deepseek', 'openrouter', 'gemini', 'ollama'].includes(p.id);
                  if (apiFilter === 'connected' && !isConnected) return false;
                  if (apiFilter === 'native' && !isNative) return false;
                  if (apiFilter === 'compat' && isNative) return false;
                  if (!apiSearch.trim()) return true;
                  const q = apiSearch.toLowerCase();
                  return (
                    p.name.toLowerCase().includes(q) ||
                    p.id.toLowerCase().includes(q) ||
                    p.models.some((m) => m.toLowerCase().includes(q))
                  );
                })
                .sort((a, b) => {
                  const aConn = config?.providers?.[a.id]?.connected ? 1 : 0;
                  const bConn = config?.providers?.[b.id]?.connected ? 1 : 0;
                  return bConn - aConn;
                })
                .map((p) => {
                  const provConfig = config?.providers?.[p.id];
                  const isConnected = provConfig?.connected === true && (provConfig?.apiKey || p.id === 'ollama' || p.id === 'custom');

                  return (
                    <Card
                      key={p.id}
                      className={`p-3 bg-[var(--card)] border transition-all duration-150 flex flex-col justify-between gap-2.5 ${
                        isConnected
                          ? 'border-emerald-500/40 shadow-sm'
                          : 'border-[var(--border)] hover:border-[var(--rim)]'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center font-bold text-xs shadow-sm shrink-0 bg-gradient-to-br ${p.color}`}>
                              <BrandIcon name={p.id} className="w-4 h-4" fallback={p.name.slice(0, 1)} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs text-[var(--foreground)] truncate">{p.name}</div>
                              <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">{t(p.badge)}</div>
                            </div>
                          </div>

                          {isConnected ? (
                            <span
                              title={provConfig?.latencyMs ? `${provConfig.latencyMs}ms` : t('aiGw.connected')}
                              className="text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center gap-1 font-mono shrink-0"
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                              {provConfig?.latencyMs ? `${provConfig.latencyMs}ms` : t('aiGw.connected')}
                            </span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-[var(--muted)] mt-1.5 shrink-0" title={t('aiGw.disconnected')} />
                          )}
                        </div>

                        <p className="text-[11px] text-[var(--muted-foreground)] line-clamp-1" title={t(p.tagline)}>
                          {t(p.tagline)}
                        </p>

                        <div className="flex flex-wrap gap-1">
                          {p.models.slice(0, 2).map((m) => {
                            const fullModel = m.includes('/') ? m : `${p.id}/${m}`;
                            return (
                              <button
                                key={m}
                                type="button"
                                onClick={() => copyToClipboard(m, `model-${m}`)}
                                title={`Click to copy ${fullModel}`}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)]/80 hover:bg-[var(--muted)] text-[var(--foreground)] truncate max-w-[165px] transition-colors"
                              >
                                {m}
                              </button>
                            );
                          })}
                          {p.models.length > 2 && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--muted)]/50 text-[var(--muted-foreground)]">
                              +{p.models.length - 2}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[var(--border)]/60 flex items-center justify-between gap-2">
                        {isConnected ? (
                          <>
                            <button
                              onClick={() => handleDisconnect(p.id)}
                              className="text-[10.5px] text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
                            >
                              <Unplug className="w-3 h-3" />
                              {t('aiGw.disconnect')}
                            </button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openConnectModal(p)}
                              className="h-6 px-2.5 text-[11px] border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                            >
                              {t('aiGw.configure')}
                            </Button>
                          </>
                        ) : (
                          <>
                            <a
                              href={p.docsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10.5px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
                            >
                              {t('aiGw.getKey')} <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                            <Button
                              size="sm"
                              onClick={() => openConnectModal(p)}
                              className="h-6 px-2.5 text-[11px] btn-metal"
                            >
                              <Plug className="w-2.5 h-2.5 mr-1" />
                              {t('aiGw.connect')}
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2: UNIVERSAL VIRTUAL KEYS (9ROUTER STYLE) ----------------- */}
      {currentTab === 'keys' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--rim)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[var(--foreground)]/[0.06] text-[var(--foreground)] flex items-center justify-center shrink-0 mt-0.5">
                <Key className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[var(--foreground)]">
                  {t('aiGateway.universalKeyNotice')}
                </div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {t('aiGw.keysDesc', { n: connectedCount })}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setCreatedKeySecret(null);
                setShowNewKeyModal(true);
              }}
              className="btn-metal shrink-0"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t('aiGateway.createKey')}
            </Button>
          </div>

          {keys.length === 0 ? (
            <Card className="p-12 text-center bg-[var(--card)] border border-[var(--border)] space-y-3">
              <Key className="w-8 h-8 text-[var(--muted-foreground)]/40 mx-auto" />
              <h3 className="text-sm font-medium text-[var(--foreground)]">{t('aiGateway.noKeys')}</h3>
              <Button size="sm" onClick={() => setShowNewKeyModal(true)} className="btn-metal">
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
                      <th className="py-2.5 px-3">{t('aiGw.colName')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colKey')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colUpstreams')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colRequests')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colTokens')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colLastUsed')}</th>
                      <th className="py-2.5 px-3 text-center">{t('aiGw.colStatus')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {keys.map((k) => (
                      <tr key={k.id} className="hover:bg-[var(--muted)]/30 transition-colors">
                        <td className="py-3 px-3 font-medium text-[var(--foreground)]">
                          <div className="flex items-center gap-2">
                            <Key className="w-3.5 h-3.5 text-[var(--foreground)] shrink-0" />
                            <span>{k.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-[var(--muted-foreground)]">
                          <div className="flex items-center gap-1.5">
                            {/* stored as a hash: only the masked form exists after creation */}
                            <span title={t('aiGw.keyHashedHint')}>{k.keyPrefix}</span>
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
                              <span className="text-[10px] text-amber-500">{t('aiGw.noneConnected')}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{k.totalRequests.toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-mono text-[var(--foreground)]">
                          {formatTokens((k.totalInputTokens || 0) + (k.totalOutputTokens || 0))}
                        </td>
                        <td className="py-3 px-3 text-[var(--muted-foreground)]">
                          {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString(locale) : t('aiGw.never')}
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
                            {k.enabled ? t('aiGw.active') : t('aiGw.disabled')}
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
              <div className="w-8 h-8 rounded-lg bg-[var(--foreground)]/[0.06] text-[var(--foreground)] flex items-center justify-center shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-[var(--foreground)]">{t('aiGateway.selectKey')}</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">{createdKeySecret ? t('aiGw.selectKeyDesc') : t('aiGw.quickstartKeyHint')}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {keys.length > 0 ? (
                <select
                  value={selectedKeyId}
                  onChange={(e) => setSelectedKeyId(e.target.value)}
                  className="h-8 px-2.5 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:ring-1 focus:ring-[var(--ring)]"
                >
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.keyPrefix})
                    </option>
                  ))}
                </select>
              ) : (
                <Button size="sm" onClick={() => setShowNewKeyModal(true)} className="btn-metal">
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
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <BrandIcon name="claude" className="w-[18px] h-[18px]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                    {t('aiGateway.claudeCodeTitle')}
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/30">
                      {t('aiGw.claudeCompatible')}
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
              <div className="text-zinc-500 select-none"># 1. {t('aiGw.cc1')}</div>
              <div className="text-emerald-400">npm install -g @anthropic-ai/claude-code</div>

              <div className="text-zinc-500 select-none pt-2"># 2. {t('aiGw.cc2')}</div>
              <div>
                <span className="text-[var(--foreground)]">export</span> <span className="text-amber-300">ANTHROPIC_BASE_URL</span>=<span className="text-emerald-300">"{gatewayBaseUrl}"</span>
              </div>
              <div>
                <span className="text-[var(--foreground)]">export</span> <span className="text-amber-300">ANTHROPIC_API_KEY</span>=<span className="text-emerald-300">"{activeKeyForQuickstart}"</span>
              </div>

              <div className="text-zinc-500 select-none pt-2"># 3. {t('aiGw.cc3')}</div>
              <div className="text-emerald-400">claude</div>
            </div>
          </Card>

          {/* Cursor & Other Agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-4 bg-[var(--card)] border border-[var(--border)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-xs text-[var(--foreground)]">
                  <Sparkles className="w-4 h-4 text-[var(--foreground)]" />
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
                <div className="text-[var(--foreground)] select-all">{gatewayBaseUrl}/v1</div>
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
                    const curlCmd = `curl ${gatewayBaseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ${activeKeyForQuickstart}" \\\n  -H "content-type: application/json" \\\n  -d '{"model":"cc/claude-sonnet-5","messages":[{"role":"user","content":"Hello 7Server AI!"}]}'`;
                    copyToClipboard(curlCmd, 'curl');
                  }}
                >
                  {copiedSection === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('aiGw.curlDesc')}
              </p>
              <div className="p-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] font-mono text-[10px] text-zinc-400 truncate">
                curl {gatewayBaseUrl}/v1/chat/completions -H "Authorization: Bearer {activeKeyForQuickstart.slice(0, 10)}..." -d '{'{'}"model":"cc/claude-sonnet-5",…{'}'}'
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
                  placeholder={t('aiGw.filterPlaceholder')}
                  className="pl-8 h-8 text-xs w-56"
                />
              </div>
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="h-8 px-2.5 text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)]"
              >
                <option value="all">{t('aiGw.allProviders')}</option>
                {PROVIDERS_META.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                      <th className="py-2.5 px-3">{t('aiGw.colTime')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colStatus')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colProvider')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colModel')}</th>
                      <th className="py-2.5 px-3">{t('aiGw.colVirtualKey')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colPrompt')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colCompletion')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colTotal')}</th>
                      <th className="py-2.5 px-3 text-right">{t('aiGw.colDuration')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {usage.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--muted)]/30 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--muted-foreground)]">
                          {new Date(log.timestamp).toLocaleTimeString(locale)}
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
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--foreground)]/[0.06] text-[var(--foreground)] font-sans">
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
                        <td className="py-2.5 px-3 text-right font-mono font-medium text-[var(--foreground)]">
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
        <Modal onClose={() => setConnectingProvider(null)} className="max-w-md">
          <ModalCard title={t('aiGw.connectTo', { name: connectingProvider.name })} icon={<BrandIcon name={connectingProvider.id} className="w-4 h-4" />} onClose={() => setConnectingProvider(null)}>
          <form onSubmit={handleVerifyAndConnect} className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--foreground)]/[0.03] border border-[var(--rim)] text-xs text-[var(--foreground)] space-y-1">
              <div className="font-semibold flex items-center gap-1.5 text-[var(--foreground)]">
                <Sparkles className="w-3.5 h-3.5" />
                {t('aiGw.liveVerify')}
              </div>
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {t('aiGw.liveVerifyDesc', { name: connectingProvider.name })}
              </p>
            </div>

            {connectingProvider.id !== 'ollama' && (
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('aiGw.apiKeyLabel')}
                </label>
                <div className="relative">
                  <Input
                    required
                    type={revealedKey ? 'text' : 'password'}
                    value={connectApiKey}
                    onChange={(e) => setConnectApiKey(e.target.value)}
                    placeholder={connectingProvider.keyPlaceholder.startsWith('aiGw.') ? t(connectingProvider.keyPlaceholder as MessageKey) : connectingProvider.keyPlaceholder}
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
                {connectingProvider.defaultUrl ? t('aiGw.baseUrlLabel') : t('aiGw.baseUrlRequired')}
              </label>
              <Input
                value={connectBaseUrl}
                onChange={(e) => setConnectBaseUrl(e.target.value)}
                placeholder={connectingProvider.defaultUrl || 'http://localhost:4000/v1'}
                required={!connectingProvider.defaultUrl}
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
                      {t('aiGw.verifyOk', { ms: verificationResult.latencyMs ?? 0 })}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{t('aiGw.verifyFailed')}</span>
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
                  {t('aiGw.disconnect')}
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={() => setConnectingProvider(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isVerifying || (connectingProvider.id !== 'ollama' && !connectApiKey.trim())}
                  className="btn-metal"
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
          </ModalCard>
        </Modal>
      )}

      {/* ----------------- CREATE VIRTUAL KEY MODAL ----------------- */}
      {showNewKeyModal && (
        <Modal
          className="max-w-md"
          onClose={() => {
            setShowNewKeyModal(false);
            setCreatedKeySecret(null);
          }}
        >
          <ModalCard
            title={createdKeySecret ? t('aiGateway.keyCreatedTitle') : t('aiGateway.createKey')}
            icon={<Key className="w-4 h-4 text-[var(--foreground)]" />}
            onClose={() => { setShowNewKeyModal(false); setCreatedKeySecret(null); }}
          >
          {createdKeySecret ? (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{t('aiGateway.keyCreatedWarning')}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('aiGw.yourKey')}
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
                  className="btn-metal"
                >
                  {t('aiGw.done')}
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
                  {t('aiGw.allowedProviders')}
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
                          className="rounded border-[var(--border)] text-[var(--foreground)] focus:ring-[var(--ring)]"
                        />
                        <BrandIcon name={prov.id} className="w-3.5 h-3.5" />
                        <span className="font-medium">{prov.name}</span>
                        {config?.providers?.[prov.id]?.connected && (
                          <span className="text-[10px] text-emerald-400">✓ {t('aiGw.connected')}</span>
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
                <Button type="submit" disabled={!newKeyName.trim()} className="btn-metal">
                  {t('aiGateway.createKey')}
                </Button>
              </div>
            </form>
          )}
          </ModalCard>
        </Modal>
      )}
    </div>
  );
}
