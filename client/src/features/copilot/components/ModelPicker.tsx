import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Search,
  ChevronDown,
  Check,
  Star,
  Layers,
  X,
  Zap,
  Brain,
  Code2
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { useI18n } from '@/shared/i18n';

const PINNED_STORAGE_KEY = '7server_pinned_models';

export interface ProviderMetaInfo {
  label: string;
  shortLabel: string;
  brand: string;
  badgeColor: string;
  kind: 'combo' | 'subscription' | 'apikey';
}

const PROVIDER_MAP: Record<string, ProviderMetaInfo> = {
  auto: {
    label: 'Model Combos',
    shortLabel: 'Combo',
    brand: 'sparkles',
    badgeColor: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    kind: 'combo'
  },
  cc: {
    label: 'Claude (Pro / Max)',
    shortLabel: 'Claude',
    brand: 'claude',
    badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/25',
    kind: 'subscription'
  },
  cx: {
    label: 'ChatGPT / Codex',
    shortLabel: 'Codex',
    brand: 'codex',
    badgeColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25',
    kind: 'subscription'
  },
  gh: {
    label: 'GitHub Copilot',
    shortLabel: 'Copilot',
    brand: 'copilot',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    kind: 'subscription'
  },
  gc: {
    label: 'Gemini CLI',
    shortLabel: 'Gemini',
    brand: 'gemini-cli',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    kind: 'subscription'
  },
  km: {
    label: 'Kimi Code',
    shortLabel: 'Kimi',
    brand: 'kimi',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    kind: 'subscription'
  },
  kc: {
    label: 'Kilo Code',
    shortLabel: 'Kilo',
    brand: 'kilocode',
    badgeColor: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/25',
    kind: 'subscription'
  },
  mu: {
    label: 'Muse Code',
    shortLabel: 'Muse',
    brand: 'muse',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    kind: 'subscription'
  },
  ns: {
    label: 'Nous Research',
    shortLabel: 'Nous',
    brand: 'nous',
    badgeColor: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/25',
    kind: 'subscription'
  },
  anthropic: {
    label: 'Anthropic API',
    shortLabel: 'Anthropic',
    brand: 'anthropic',
    badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/25',
    kind: 'apikey'
  },
  openai: {
    label: 'OpenAI API',
    shortLabel: 'OpenAI',
    brand: 'openai',
    badgeColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25',
    kind: 'apikey'
  },
  deepseek: {
    label: 'DeepSeek',
    shortLabel: 'DeepSeek',
    brand: 'deepseek',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    kind: 'apikey'
  },
  openrouter: {
    label: 'OpenRouter',
    shortLabel: 'OpenRouter',
    brand: 'openrouter',
    badgeColor: 'text-pink-400 bg-pink-500/10 border-pink-500/25',
    kind: 'apikey'
  },
  gemini: {
    label: 'Google Gemini API',
    shortLabel: 'Gemini API',
    brand: 'gemini',
    badgeColor: 'text-red-400 bg-red-500/10 border-red-500/25',
    kind: 'apikey'
  },
  ollama: {
    label: 'Ollama (Local)',
    shortLabel: 'Ollama',
    brand: 'ollama',
    badgeColor: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/25',
    kind: 'apikey'
  },
  groq: {
    label: 'Groq',
    shortLabel: 'Groq',
    brand: 'groq',
    badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    kind: 'apikey'
  },
  mistral: {
    label: 'Mistral AI',
    shortLabel: 'Mistral',
    brand: 'mistral',
    badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    kind: 'apikey'
  },
  xai: {
    label: 'xAI Grok',
    shortLabel: 'xAI',
    brand: 'xai',
    badgeColor: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/25',
    kind: 'apikey'
  },
  together: {
    label: 'Together AI',
    shortLabel: 'Together',
    brand: 'together',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    kind: 'apikey'
  },
  fireworks: {
    label: 'Fireworks AI',
    shortLabel: 'Fireworks',
    brand: 'fireworks',
    badgeColor: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
    kind: 'apikey'
  },
  cerebras: {
    label: 'Cerebras',
    shortLabel: 'Cerebras',
    brand: 'cerebras',
    badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    kind: 'apikey'
  },
  perplexity: {
    label: 'Perplexity',
    shortLabel: 'Perplexity',
    brand: 'perplexity',
    badgeColor: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
    kind: 'apikey'
  },
  moonshot: {
    label: 'Moonshot Kimi',
    shortLabel: 'Moonshot',
    brand: 'moonshot',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
    kind: 'apikey'
  },
  dashscope: {
    label: 'Alibaba Qwen',
    shortLabel: 'Qwen',
    brand: 'dashscope',
    badgeColor: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    kind: 'apikey'
  },
  zai: {
    label: 'Z.ai GLM',
    shortLabel: 'Z.ai',
    brand: 'zai',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    kind: 'apikey'
  },
  minimax: {
    label: 'MiniMax',
    shortLabel: 'MiniMax',
    brand: 'minimax',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    kind: 'apikey'
  },
  nvidia: {
    label: 'NVIDIA NIM',
    shortLabel: 'NVIDIA',
    brand: 'nvidia',
    badgeColor: 'text-lime-400 bg-lime-500/10 border-lime-500/25',
    kind: 'apikey'
  },
  custom: {
    label: 'Custom OpenAI',
    shortLabel: 'Custom',
    brand: 'custom',
    badgeColor: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/25',
    kind: 'apikey'
  }
};

export type ModelTag = 'FREE' | 'REASONING' | 'CODING' | 'FAST';

export interface ParsedModelItem {
  id: string;
  prefix: string;
  rawName: string;
  cleanName: string;
  subVendor?: string;
  provider: ProviderMetaInfo;
  tags: ModelTag[];
  subtitle?: string;
}

export function getProviderMeta(prefix: string): ProviderMetaInfo {
  return (
    PROVIDER_MAP[prefix] || {
      label: prefix.toUpperCase(),
      shortLabel: prefix,
      brand: prefix,
      badgeColor: 'text-[var(--muted-foreground)] bg-[var(--muted)] border-[var(--border)]',
      kind: 'apikey'
    }
  );
}

export function parseModelItem(id: string, combos?: Record<string, string[]>): ParsedModelItem {
  const slashIdx = id.indexOf('/');
  const prefix = slashIdx > 0 ? id.slice(0, slashIdx) : 'auto';
  const rawName = slashIdx > 0 ? id.slice(slashIdx + 1) : id;
  const provider = getProviderMeta(prefix);

  const tags: ModelTag[] = [];
  if (/:free$/i.test(rawName)) tags.push('FREE');
  if (/(^|[-/])(o1|o3|o4|r1|reasoner|thinking|qwq)([-/]|$)/i.test(rawName)) tags.push('REASONING');
  if (/(codex|coder|coding|codestral|devstral|starcoder)/i.test(rawName)) tags.push('CODING');
  if (/(mini|flash|haiku|instant|nano|air|lite|fast)/i.test(rawName)) tags.push('FAST');

  let withoutFree = rawName.replace(/:free$/i, '');
  let subVendor: string | undefined;
  const innerSlash = withoutFree.indexOf('/');
  if (innerSlash > 0) {
    subVendor = withoutFree.slice(0, innerSlash);
    withoutFree = withoutFree.slice(innerSlash + 1);
  }

  const subtitle =
    prefix === 'auto' && combos?.[rawName]
      ? combos[rawName].join(' → ')
      : undefined;

  return {
    id,
    prefix,
    rawName,
    cleanName: withoutFree,
    subVendor,
    provider,
    tags,
    subtitle
  };
}

function loadPinnedModels(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function savePinnedModels(list: string[]) {
  try {
    localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore private mode */
  }
}

interface ModelPickerProps {
  /** Currently selected model ID ("" for Auto in chat mode) */
  value: string;
  /** Called when user picks a model */
  onChange: (modelId: string) => void;
  /** List of routable model strings (`alias/model`, `auto/combo`, `provider/model`) */
  options: string[];
  /** Optional combo definitions to display target chains */
  combos?: Record<string, string[]>;
  /** Whether to include the "Auto (Smart Fallback)" option at the top (default true) */
  allowAuto?: boolean;
  /** Custom placeholder when used as an adder (e.g. in Combos builder) */
  placeholder?: string;
  /** Popover placement relative to trigger button */
  placement?: 'top' | 'bottom';
  /** Compact trigger style for chat composer vs full-width input style for forms */
  variant?: 'chip' | 'input';
  disabled?: boolean;
}

export function ModelPicker({
  value,
  onChange,
  options,
  combos,
  allowAuto = true,
  placeholder,
  placement = 'top',
  variant = 'chip',
  disabled = false
}: ModelPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [pinned, setPinned] = useState<string[]>(loadPinnedModels);
  const [highlightIdx, setHighlightIdx] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Deduplicate options while preserving order
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: ParsedModelItem[] = [];
    for (const opt of options) {
      if (!opt || seen.has(opt)) continue;
      seen.add(opt);
      out.push(parseModelItem(opt, combos));
    }
    return out;
  }, [options, combos]);

  // Provider tabs present in current options
  const providerTabs = useMemo(() => {
    const counts = new Map<string, { prefix: string; meta: ProviderMetaInfo; count: number }>();
    for (const item of items) {
      const existing = counts.get(item.prefix);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(item.prefix, { prefix: item.prefix, meta: item.provider, count: 1 });
      }
    }
    return Array.from(counts.values());
  }, [items]);

  const pinnedItems = useMemo(
    () => items.filter((it) => pinned.includes(it.id)),
    [items, pinned]
  );

  // Filtered items based on search query and active provider pill
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeFilter === 'pinned' && !pinned.includes(it.id)) return false;
      if (activeFilter !== 'all' && activeFilter !== 'pinned' && it.prefix !== activeFilter) return false;
      if (!q) return true;
      return (
        it.id.toLowerCase().includes(q) ||
        it.cleanName.toLowerCase().includes(q) ||
        it.provider.label.toLowerCase().includes(q) ||
        it.provider.shortLabel.toLowerCase().includes(q) ||
        (it.subVendor && it.subVendor.toLowerCase().includes(q)) ||
        it.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [items, search, activeFilter, pinned]);

  // Group filtered items by provider prefix for clean sticky section headers
  const groupedSections = useMemo(() => {
    const groups: { key: string; title: string; prefix: string; meta: ProviderMetaInfo; list: ParsedModelItem[] }[] = [];
    const byPrefix = new Map<string, ParsedModelItem[]>();
    for (const it of filteredItems) {
      const list = byPrefix.get(it.prefix) || [];
      list.push(it);
      byPrefix.set(it.prefix, list);
    }
    for (const [prefix, list] of byPrefix.entries()) {
      const meta = getProviderMeta(prefix);
      groups.push({
        key: prefix,
        title: meta.label,
        prefix,
        meta,
        list
      });
    }
    return groups;
  }, [filteredItems]);

  // Flat navigable list for keyboard up/down
  const flatSelectable = useMemo(() => {
    const list: string[] = [];
    if (allowAuto && activeFilter === 'all' && !search.trim()) {
      list.push('');
    }
    for (const g of groupedSections) {
      for (const it of g.list) {
        list.push(it.id);
      }
    }
    return list;
  }, [allowAuto, activeFilter, search, groupedSections]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [search, activeFilter, open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setSearch('');
    }
  }, [open]);

  const togglePin = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      savePinnedModels(next);
      return next;
    });
  };

  const selectModel = (modelId: string) => {
    onChange(modelId);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!flatSelectable.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % flatSelectable.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => (i - 1 + flatSelectable.length) % flatSelectable.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatSelectable[highlightIdx];
      if (target !== undefined) selectModel(target);
    }
  };

  const currentParsed = useMemo(() => (value ? parseModelItem(value, combos) : null), [value, combos]);

  return (
    <div ref={containerRef} className={`relative ${variant === 'input' ? 'flex-1 min-w-0' : ''}`}>
      {/* Trigger Button */}
      {variant === 'chip' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          title={
            currentParsed
              ? `${currentParsed.provider.label}: ${currentParsed.id}`
              : `${t('copilot.model')}: ${t('copilot.modelAuto')}`
          }
          className={`h-7 px-2 rounded-lg text-[11px] flex items-center gap-1.5 min-w-0 max-w-[200px] transition-colors border ${
            open
              ? 'bg-[var(--muted)] text-[var(--foreground)] border-[var(--rim)]'
              : currentParsed
              ? 'bg-[var(--foreground)]/[0.04] text-[var(--foreground)] border-[var(--border)] hover:border-[var(--rim)]'
              : 'text-[var(--muted-foreground)] border-transparent hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
          }`}
        >
          {currentParsed ? (
            <>
              <BrandIcon
                name={currentParsed.subVendor || currentParsed.provider.brand}
                className="w-3 h-3 shrink-0"
                fallback={<Sparkles className="w-3 h-3 shrink-0" />}
              />
              <span className="font-mono text-[10px] px-1 py-px rounded bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0">
                {currentParsed.prefix}
              </span>
              <span className="truncate font-mono text-[11px]">{currentParsed.cleanName}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 shrink-0 text-emerald-500" />
              <span className="truncate font-medium">{placeholder || t('copilot.modelAuto')}</span>
            </>
          )}
          <ChevronDown className={`w-3 h-3 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-[var(--rim)] px-2.5 text-left font-mono text-[11px] flex items-center justify-between gap-2 disabled:opacity-40 transition-colors"
        >
          <span className="flex items-center gap-1.5 truncate text-[var(--muted-foreground)]">
            <Search className="w-3 h-3 shrink-0" />
            <span className="truncate">{placeholder || t('combo.pick')}</span>
          </span>
          <span className="flex items-center gap-1 shrink-0 text-[10px] text-[var(--muted-foreground)]">
            <span className="px-1.5 py-0.2 rounded bg-[var(--muted)] font-mono">{items.length}</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      )}

      {/* Popover Panel */}
      {open && (
        <div
          onKeyDown={handleKeyDown}
          className={`fixed sm:absolute z-50 left-2 right-2 sm:left-0 sm:right-auto sm:w-[390px] rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden flex flex-col animate-[pop-in_150ms_ease-out] ${
            placement === 'top' ? 'bottom-16 sm:bottom-full sm:mb-2' : 'top-auto sm:top-full mt-1.5'
          }`}
        >
          {/* Search Bar */}
          <div className="p-2.5 border-b border-[var(--border)] bg-[var(--background)]/70 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models, providers, or tags (free, coding, fast)…"
              className="w-full bg-transparent text-xs text-[var(--foreground)] placeholder-[var(--muted-foreground)] outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="p-0.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-[10px] font-mono text-[var(--muted-foreground)] px-1.5 py-0.5 rounded bg-[var(--muted)] shrink-0">
              {filteredItems.length}
            </span>
          </div>

          {/* Horizontal Provider Filter Pills */}
          {providerTabs.length > 1 && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-[var(--border)] bg-[var(--background)]/40 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className={`px-2 py-1 rounded-lg text-[10px] font-medium shrink-0 transition-colors ${
                  activeFilter === 'all'
                    ? 'bg-[var(--foreground)] text-[var(--background)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]'
                }`}
              >
                All ({items.length})
              </button>

              {pinnedItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter('pinned')}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium shrink-0 flex items-center gap-1 transition-colors ${
                    activeFilter === 'pinned'
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20'
                  }`}
                >
                  <Star className="w-2.5 h-2.5 fill-current" />
                  {pinnedItems.length}
                </button>
              )}

              {providerTabs.map((tab) => {
                const active = activeFilter === tab.prefix;
                return (
                  <button
                    key={tab.prefix}
                    type="button"
                    onClick={() => setActiveFilter(active ? 'all' : tab.prefix)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium shrink-0 flex items-center gap-1.5 transition-colors border ${
                      active
                        ? 'bg-[var(--foreground)] text-[var(--background)] border-transparent'
                        : 'border-[var(--border)]/70 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/60'
                    }`}
                  >
                    <BrandIcon
                      name={tab.meta.brand}
                      className="w-2.5 h-2.5"
                      mono={active}
                      fallback={<span className="font-mono text-[9px] uppercase">{tab.prefix}</span>}
                    />
                    <span>{tab.meta.shortLabel}</span>
                    <span className="opacity-60 font-mono text-[9px]">{tab.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Scrollable Grouped Model List */}
          <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]/40">
            {/* Auto Smart Fallback Option */}
            {allowAuto && activeFilter === 'all' && !search.trim() && (
              <div className="p-1.5">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ''}
                  onClick={() => selectModel('')}
                  className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between gap-2 transition-colors ${
                    value === '' || flatSelectable[highlightIdx] === ''
                      ? 'bg-emerald-500/10 text-[var(--foreground)] border border-emerald-500/30'
                      : 'hover:bg-[var(--muted)]/60 text-[var(--foreground)] border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <span>{t('copilot.modelAuto')}</span>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          SMART FALLBACK
                        </span>
                      </div>
                      <div className="text-[10px] text-[var(--muted-foreground)] truncate">
                        Automatically routes across connected accounts & API keys
                      </div>
                    </div>
                  </div>
                  {value === '' && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                </button>
              </div>
            )}

            {/* Pinned Section when viewing All without search */}
            {activeFilter === 'all' && !search.trim() && pinnedItems.length > 0 && (
              <div className="py-1">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-500 flex items-center gap-1 bg-[var(--background)]/60 sticky top-0 backdrop-blur-sm z-10">
                  <Star className="w-2.5 h-2.5 fill-current" /> Pinned Models
                </div>
                <div className="px-1.5 space-y-0.5">
                  {pinnedItems.map((it) => (
                    <ModelOptionRow
                      key={`pin-${it.id}`}
                      item={it}
                      selected={value === it.id}
                      highlighted={flatSelectable[highlightIdx] === it.id}
                      isPinned={true}
                      onSelect={() => selectModel(it.id)}
                      onTogglePin={(e) => togglePin(e, it.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Grouped Provider Sections */}
            {groupedSections.length === 0 ? (
              <div className="py-8 px-4 text-center space-y-1">
                <div className="text-xs font-medium text-[var(--foreground)]">No matching models</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Try another search keyword or clear the provider filter.
                </div>
              </div>
            ) : (
              groupedSections.map((group) => (
                <div key={group.key} className="py-1">
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center justify-between bg-[var(--background)]/80 sticky top-0 backdrop-blur-sm z-10">
                    <span className="flex items-center gap-1.5">
                      <BrandIcon
                        name={group.meta.brand}
                        className="w-3 h-3"
                        fallback={<Layers className="w-3 h-3" />}
                      />
                      <span>{group.title}</span>
                      <code className="font-mono text-[9px] px-1 rounded bg-[var(--muted)] text-[var(--foreground)] lowercase">
                        {group.prefix}/
                      </code>
                    </span>
                    <span className="font-mono text-[9px]">{group.list.length}</span>
                  </div>
                  <div className="px-1.5 space-y-0.5">
                    {group.list.map((it) => (
                      <ModelOptionRow
                        key={it.id}
                        item={it}
                        selected={value === it.id}
                        highlighted={flatSelectable[highlightIdx] === it.id}
                        isPinned={pinned.includes(it.id)}
                        onSelect={() => selectModel(it.id)}
                        onTogglePin={(e) => togglePin(e, it.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Hint */}
          <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--background)]/70 flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
            <span className="flex items-center gap-2">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>★ Pin favorite</span>
            </span>
            <a href="#/ai-gateway" className="hover:text-[var(--foreground)] underline underline-offset-2">
              Manage Providers
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelOptionRow({
  item,
  selected,
  highlighted,
  isPinned,
  onSelect,
  onTogglePin
}: {
  item: ParsedModelItem;
  selected: boolean;
  highlighted: boolean;
  isPinned: boolean;
  onSelect: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
        selected
          ? 'bg-[var(--foreground)]/[0.08] text-[var(--foreground)] font-medium'
          : highlighted
          ? 'bg-[var(--muted)]/70 text-[var(--foreground)]'
          : 'hover:bg-[var(--muted)]/50 text-[var(--foreground)]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <BrandIcon
          name={item.subVendor || item.provider.brand}
          className="w-3.5 h-3.5 shrink-0"
          fallback={
            <span className={`text-[9px] font-mono font-bold px-1 rounded border ${item.provider.badgeColor}`}>
              {item.prefix}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono text-[11.5px] truncate">{item.cleanName}</span>
            {item.subVendor && (
              <span className="text-[9px] font-mono px-1 rounded bg-[var(--muted)] text-[var(--muted-foreground)] shrink-0">
                {item.subVendor}
              </span>
            )}
            {item.tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </div>
          {item.subtitle && (
            <div className="text-[10px] font-mono text-[var(--muted-foreground)] truncate">
              {item.subtitle}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] font-mono text-[var(--muted-foreground)] opacity-70 group-hover:opacity-100">
          {item.prefix}/
        </span>
        <button
          type="button"
          onClick={onTogglePin}
          title={isPinned ? 'Unpin model' : 'Pin model to top'}
          className={`p-1 rounded hover:bg-[var(--background)] transition-opacity ${
            isPinned ? 'text-amber-400 opacity-100' : 'text-[var(--muted-foreground)] opacity-0 group-hover:opacity-70 hover:!opacity-100'
          }`}
        >
          <Star className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
        </button>
        {selected && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
      </div>
    </div>
  );
}

function TagPill({ tag }: { tag: ModelTag }) {
  if (tag === 'FREE') {
    return (
      <span className="text-[8.5px] font-mono font-semibold px-1 py-px rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
        FREE
      </span>
    );
  }
  if (tag === 'REASONING') {
    return (
      <span className="text-[8.5px] font-mono px-1 py-px rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-0.5 shrink-0">
        <Brain className="w-2.5 h-2.5" /> THINK
      </span>
    );
  }
  if (tag === 'CODING') {
    return (
      <span className="text-[8.5px] font-mono px-1 py-px rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-0.5 shrink-0">
        <Code2 className="w-2.5 h-2.5" /> CODE
      </span>
    );
  }
  return (
    <span className="text-[8.5px] font-mono px-1 py-px rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
      <Zap className="w-2.5 h-2.5" /> FAST
    </span>
  );
}

