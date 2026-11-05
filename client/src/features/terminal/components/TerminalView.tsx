import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Download,
  Plus,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Sliders,
  Terminal as TermIcon,
  Sparkles,
  CornerDownLeft,
  Play,
  Edit2
} from 'lucide-react';
import type { ServerItem } from '@/features/servers';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Modal } from '@/shared/ui/modal';
import { useT, type MessageKey } from '@/shared/i18n';
import {
  TERMINAL_THEMES,
  BUILTIN_SHORTCUTS,
  type TerminalThemeId,
  type TerminalShortcutItem
} from '../lib/terminalThemes';
import {
  TerminalSessionCanvas,
  type TerminalSessionHandle
} from './TerminalSessionCanvas';

const FONT_SIZES = [12, 13, 14, 15, 16];

const SHORTCUT_CATEGORIES: { id: 'all' | TerminalShortcutItem['category']; label: MessageKey }[] = [
  { id: 'all', label: 'terminal.catAll' },
  { id: 'monitoring', label: 'terminal.catMonitoring' },
  { id: 'services', label: 'terminal.catServices' },
  { id: 'docker', label: 'terminal.catDocker' },
  { id: 'network', label: 'terminal.catNetwork' },
  { id: 'maintenance', label: 'terminal.catMaintenance' }
];

export interface TerminalTabSession {
  id: string;
  title: string;
  initialCommand?: string;
}

interface TerminalViewProps {
  server: ServerItem;
  initialCommand?: string;
  onClearCommand?: () => void;
  onClose?: () => void;
  mode?: 'page' | 'modal';
}

export default function TerminalView({
  server,
  initialCommand,
  onClearCommand,
  onClose,
  mode = 'page'
}: TerminalViewProps) {
  const t = useT();

  // Multi-Tab Sessions State
  const [sessions, setSessions] = useState<TerminalTabSession[]>(() => [
    {
      id: `session-1`,
      title: initialCommand ? t('term.setupScript') : t('terminal.tabDefault', { n: 1 }),
      initialCommand
    }
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>('session-1');
  const [tabCounter, setTabCounter] = useState(1);

  // Editing Tab Title Inline
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Per-session status and dimensions maps
  const [sessionStatuses, setSessionStatuses] = useState<
    Record<string, 'connecting' | 'connected' | 'disconnected' | 'error'>
  >({});
  const [sessionDimensions, setSessionDimensions] = useState<
    Record<string, { cols: number; rows: number }>
  >({});
  const [sessionTimers, setSessionTimers] = useState<Record<string, number>>({});

  // Active session references
  const sessionHandlesRef = useRef<Record<string, TerminalSessionHandle | null>>({});

  // UI & Customization State
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showShortcutsDrawer, setShowShortcutsDrawer] = useState(true);
  const [shortcutSearch, setShortcutSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | TerminalShortcutItem['category']>('all');
  const [quickInput, setQuickInput] = useState('');
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  // Preference Settings (persisted in localStorage)
  const [themeId, setThemeId] = useState<TerminalThemeId>(() => {
    const saved = localStorage.getItem('vpshub_terminal_theme') as TerminalThemeId;
    return saved && TERMINAL_THEMES[saved] ? saved : 'dark-doff';
  });

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = Number(localStorage.getItem('vpshub_terminal_fontsize'));
    return FONT_SIZES.includes(saved) ? saved : 13;
  });

  // Custom Shortcuts
  const [customShortcuts, setCustomShortcuts] = useState<TerminalShortcutItem[]>(() => {
    try {
      const saved = localStorage.getItem('vpshub_custom_shortcuts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newCmd, setNewCmd] = useState('');

  // Active session status & stats
  const activeStatus = sessionStatuses[activeSessionId] || 'connecting';
  const activeDimensions = sessionDimensions[activeSessionId] || { cols: 80, rows: 24 };
  const activeTimer = sessionTimers[activeSessionId] || 0;

  // Active Session Live Timer
  useEffect(() => {
    if (activeStatus !== 'connected') return;
    const interval = setInterval(() => {
      setSessionTimers((prev) => ({
        ...prev,
        [activeSessionId]: (prev[activeSessionId] || 0) + 1
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeStatus, activeSessionId]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Keyboard shortcut listener for Alt+1, Alt+2... to switch tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= sessions.length) {
          e.preventDefault();
          setActiveSessionId(sessions[num - 1].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions]);

  // Handle incoming new initialCommand by spawning a dedicated task tab if needed
  useEffect(() => {
    if (initialCommand) {
      // Check if existing session has it
      const alreadyHas = sessions.some((s) => s.initialCommand === initialCommand);
      if (!alreadyHas) {
        const newId = `session-${Date.now()}`;
        const newSession: TerminalTabSession = {
          id: newId,
          title: t('term.setupScript'),
          initialCommand
        };
        setSessions((prev) => [...prev, newSession]);
        setActiveSessionId(newId);
      }
    }
  }, [initialCommand]);

  // Tab Management Functions
  const handleAddNewTab = () => {
    const nextCount = tabCounter + 1;
    setTabCounter(nextCount);
    const newId = `session-${Date.now()}`;
    const newTab: TerminalTabSession = {
      id: newId,
      title: t('terminal.tabDefault', { n: nextCount })
    };
    setSessions((prev) => [...prev, newTab]);
    setActiveSessionId(newId);
  };

  const handleCloseTab = (idToClose: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (sessions.length <= 1) {
      // Don't close if last tab, instead clear or restart
      handleClear();
      return;
    }

    // Clean up ref
    delete sessionHandlesRef.current[idToClose];

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === idToClose);
      const remaining = prev.filter((s) => s.id !== idToClose);

      // If active session was closed, switch to adjacent
      if (activeSessionId === idToClose) {
        const nextActive = remaining[Math.max(0, idx - 1)] || remaining[0];
        setActiveSessionId(nextActive.id);
      }
      return remaining;
    });
  };

  const handleStartRenameTab = (session: TerminalTabSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTabId(session.id);
    setEditingTitleText(session.title);
  };

  const handleSaveRenameTab = (id: string) => {
    if (editingTitleText.trim()) {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title: editingTitleText.trim() } : s))
      );
    }
    setEditingTabId(null);
  };

  // Active Session Operations
  const handleReconnect = () => {
    sessionHandlesRef.current[activeSessionId]?.reconnect();
  };

  const handleClear = () => {
    sessionHandlesRef.current[activeSessionId]?.clear();
  };

  const handleCopyBuffer = () => {
    const text = sessionHandlesRef.current[activeSessionId]?.getBufferText();
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadLog = () => {
    const text = sessionHandlesRef.current[activeSessionId]?.getBufferText() || '';
    const activeTab = sessions.find((s) => s.id === activeSessionId);
    const tabName = activeTab ? activeTab.title.replace(/\s+/g, '-').toLowerCase() : 'terminal';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server.name}-${tabName}-${new Date().toISOString().slice(0, 19)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendShortcut = (cmd: string, execute = true) => {
    const payload = execute ? `${cmd}\n` : cmd;
    sessionHandlesRef.current[activeSessionId]?.sendData(payload);
  };

  const handleRunQuickInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    sendShortcut(quickInput.trim(), true);
    setQuickInput('');
  };

  const handleThemeChange = (id: TerminalThemeId) => {
    setThemeId(id);
    localStorage.setItem('vpshub_terminal_theme', id);
    setShowThemeMenu(false);
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    localStorage.setItem('vpshub_terminal_fontsize', String(size));
  };

  // Custom Shortcuts Manager
  const handleSaveCustomShortcut = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim() || !newCmd.trim()) return;
    const item: TerminalShortcutItem = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim(),
      cmd: newCmd.trim(),
      category: 'custom'
    };
    const updated = [item, ...customShortcuts];
    setCustomShortcuts(updated);
    localStorage.setItem('vpshub_custom_shortcuts', JSON.stringify(updated));
    setNewLabel('');
    setNewCmd('');
    setShowAddModal(false);
  };

  const handleDeleteCustomShortcut = (id: string) => {
    const updated = customShortcuts.filter((s) => s.id !== id);
    setCustomShortcuts(updated);
    localStorage.setItem('vpshub_custom_shortcuts', JSON.stringify(updated));
  };

  // Filtered Shortcuts
  const allShortcuts = useMemo(() => {
    return [...customShortcuts, ...BUILTIN_SHORTCUTS];
  }, [customShortcuts]);

  const filteredShortcuts = useMemo(() => {
    return allShortcuts.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
      const q = shortcutSearch.toLowerCase().trim();
      const matchQuery =
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.cmd.toLowerCase().includes(q) ||
        (item.desc && item.desc.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [allShortcuts, selectedCategory, shortcutSearch]);

  const activeTheme = TERMINAL_THEMES[themeId];

  return (
    <div
      className={`flex flex-col transition-all duration-200 ${
        isFullScreen
          ? 'fixed inset-0 z-50 bg-[#09090b]'
          : mode === 'page'
          ? 'w-full h-[calc(100vh-140px)] min-h-[620px] rounded-2xl border border-[var(--border)] overflow-hidden shadow-xl bg-zinc-950'
          : 'w-full h-full'
      }`}
    >
      {/* 1. Sleek macOS Window Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-zinc-800/80 shrink-0 select-none">
        {/* Left: Traffic Light Window Dots & Target Host Info */}
        <div className="flex items-center gap-3">
          {/* Traffic Light Dots */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReconnect}
              title={t('term.dotReconnect')}
              className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-400 transition cursor-pointer"
            />
            <button
              onClick={handleClear}
              title={t('term.dotClear')}
              className="w-3 h-3 rounded-full bg-amber-500/80 hover:bg-amber-400 transition cursor-pointer"
            />
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              title={t('term.dotFullscreen')}
              className="w-3 h-3 rounded-full bg-emerald-500/80 hover:bg-emerald-400 transition cursor-pointer"
            />
          </div>

          <div className="h-4 w-px bg-zinc-800 hidden sm:block" />

          {/* Target Host Details */}
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-300">
              <TermIcon className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-semibold text-xs text-zinc-100">{server.name}</span>
              <span className="text-[11px] text-zinc-500 font-mono sensitive hidden sm:inline">
                ({server.username}@{server.host}:{server.port || 22})
              </span>
            </div>
          </div>

          {/* Connection Status Pill with Timer */}
          <Badge
            variant={
              activeStatus === 'connected'
                ? 'success'
                : activeStatus === 'connecting'
                ? 'warning'
                : 'destructive'
            }
            className="text-[10px] py-0 px-2 h-5 font-mono gap-1.5 shrink-0"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                activeStatus === 'connected'
                  ? 'bg-emerald-400'
                  : activeStatus === 'connecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-red-400'
              }`}
            />
            <span>
              {activeStatus === 'connected'
                ? t('terminal.connected')
                : activeStatus === 'connecting'
                ? t('terminal.connecting')
                : t('terminal.disconnected')}
            </span>
            {activeStatus === 'connected' && (
              <span className="opacity-75 text-[9px] border-l border-emerald-500/30 pl-1 font-mono">
                {formatElapsed(activeTimer)}
              </span>
            )}
          </Badge>
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex items-center gap-1.5">
          {/* Shortcuts Drawer Toggle Pill */}
          <button
            type="button"
            onClick={() => setShowShortcutsDrawer(!showShortcutsDrawer)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition border ${
              showShortcutsDrawer
                ? 'bg-[var(--primary)]/15 text-[var(--primary)] border-[var(--primary)]/30'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('terminal.quickCommands')}</span>
            {showShortcutsDrawer ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>

          {/* Theme Selector Popover Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="px-2 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs flex items-center gap-1.5 transition"
              title={t('terminal.theme')}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: activeTheme.dotColor }}
              />
              <span className="hidden lg:inline text-[11px] font-mono">{activeTheme.name.split(' ')[0]}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-zinc-500 border-b border-zinc-800 mb-1">
                  {t('terminal.theme')}
                </div>
                {Object.values(TERMINAL_THEMES).map((thm) => (
                  <button
                    key={thm.id}
                    onClick={() => handleThemeChange(thm.id)}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-zinc-800 transition ${
                      themeId === thm.id ? 'text-[var(--primary)] font-semibold' : 'text-zinc-300'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: thm.dotColor }}
                      />
                      <span>{thm.name}</span>
                    </span>
                    {themeId === thm.id && <Check className="w-3.5 h-3.5 text-[var(--primary)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Font Size Selector */}
          <select
            value={fontSize}
            onChange={(e) => handleFontSizeChange(Number(e.target.value))}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-mono rounded-lg px-2 py-1 focus:outline-none"
            title={t('terminal.fontSize')}
          >
            {FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>

          {/* Copy Buffer */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCopyBuffer}
            title={t('terminal.copyAll')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>

          {/* Download Session Log */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownloadLog}
            title={t('terminal.downloadLog')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>

          {/* Reconnect */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleReconnect}
            title={t('terminal.reconnect')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          {/* Clear Buffer */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            title={t('terminal.clear')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>

          {/* Fullscreen Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? t('terminal.exitFullscreen') : t('terminal.fullscreen')}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-100"
          >
            {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>

          {/* Modal Close Button (only if opened in modal mode) */}
          {mode === 'modal' && onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              title={t('common.close')}
              className="h-7 w-7 text-zinc-400 hover:text-red-400 ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* 2. Modern Terminal Multi-Tab Strip Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-zinc-950 border-b border-zinc-800/80 overflow-x-auto select-none gap-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {sessions.map((session, index) => {
            const isTabActive = session.id === activeSessionId;
            const tabStatus = sessionStatuses[session.id] || 'connecting';
            const isEditing = editingTabId === session.id;

            return (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer border ${
                  isTabActive
                    ? 'bg-zinc-900 text-zinc-100 border-zinc-700/80 shadow-sm ring-1 ring-[var(--primary)]/20'
                    : 'bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border-transparent'
                }`}
                title={`Tab ${index + 1}: ${session.title} (Alt+${index + 1})`}
              >
                {/* Status Dot */}
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    tabStatus === 'connected'
                      ? 'bg-emerald-400'
                      : tabStatus === 'connecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-red-400'
                  }`}
                />

                {/* Tab Title (or inline rename input) */}
                {isEditing ? (
                  <input
                    type="text"
                    value={editingTitleText}
                    autoFocus
                    onChange={(e) => setEditingTitleText(e.target.value)}
                    onBlur={() => handleSaveRenameTab(session.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveRenameTab(session.id);
                      if (e.key === 'Escape') setEditingTabId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-zinc-800 text-zinc-100 px-1 py-0.2 rounded text-xs outline-none w-24 font-mono border border-[var(--primary)]"
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => handleStartRenameTab(session, e)}
                    className="truncate max-w-[120px] font-medium select-none"
                  >
                    {session.title}
                  </span>
                )}

                {/* Rename Edit Button (on hover) */}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={(e) => handleStartRenameTab(session, e)}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition p-0.5"
                    title={t('terminal.renameTab')}
                  >
                    <Edit2 className="w-2.5 h-2.5" />
                  </button>
                )}

                {/* Close Tab Button */}
                {sessions.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => handleCloseTab(session.id, e)}
                    className="opacity-40 group-hover:opacity-100 hover:text-red-400 transition p-0.5 rounded"
                    title={t('terminal.closeTab')}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* + Add New Terminal Tab Button */}
          <button
            type="button"
            onClick={handleAddNewTab}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-dashed border-zinc-800 hover:border-zinc-700 transition"
            title={t('terminal.newTab')}
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('terminal.newTab')}</span>
          </button>
        </div>

        {/* Tab Count & Shortcuts hint */}
        <div className="hidden lg:flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
          <span>{t('term.activeSessions', { n: sessions.length })}</span>
          <span className="text-zinc-700">·</span>
          <span>{t('term.switchTabHint')}</span>
        </div>
      </div>

      {/* 3. Interactive Quick Command Execution Bar */}
      <div className="px-4 py-2 bg-zinc-950/90 border-b border-zinc-800/60 flex items-center gap-2">
        <form onSubmit={handleRunQuickInput} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-xs select-none">
              $
            </span>
            <input
              type="text"
              placeholder={t('terminal.quickRunPlaceholder')}
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              className="w-full h-8 pl-7 pr-3 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!quickInput.trim()}
            className="h-8 px-3 text-xs gap-1.5 font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
          >
            <CornerDownLeft className="w-3 h-3" />
            <span>{t('terminal.send')}</span>
          </Button>
        </form>
      </div>

      {/* 4. Expandable Shortcuts Drawer */}
      {showShortcutsDrawer && (
        <div className="bg-zinc-950/95 border-b border-zinc-800/80 p-3 space-y-2.5 animate-in slide-in-from-top-2 duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {SHORTCUT_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(c.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border ${
                    selectedCategory === c.id
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                      : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                  }`}
                >
                  {t(c.label)}
                </button>
              ))}

              <button
                onClick={() => setSelectedCategory('custom')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition border ${
                  selectedCategory === 'custom'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-transparent'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border-zinc-800'
                }`}
              >
                {t('terminal.customShortcuts')} ({customShortcuts.length})
              </button>
            </div>

            {/* Search and Add Shortcut Button */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-44 sm:w-56">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder={t('terminal.searchShortcuts')}
                  value={shortcutSearch}
                  onChange={(e) => setShortcutSearch(e.target.value)}
                  className="w-full h-7 pl-7 pr-2 bg-zinc-900 border border-zinc-800 rounded-md text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="h-7 px-2.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-[11px] font-medium flex items-center gap-1 transition"
                title={t('terminal.addShortcut')}
              >
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">{t('terminal.addShortcut')}</span>
              </button>
            </div>
          </div>

          {/* Shortcuts Grid */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {filteredShortcuts.map((item) => (
              <div
                key={item.id}
                className="group shrink-0 inline-flex items-center rounded-lg bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 p-1 gap-1.5 transition shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => sendShortcut(item.cmd, true)}
                  className="px-2 py-0.5 text-left text-xs font-mono font-medium text-zinc-200 hover:text-[var(--primary)] flex items-center gap-1"
                  title={t('term.runShortcutHint', { desc: item.desc || item.cmd })}
                >
                  <Play className="w-2.5 h-2.5 text-emerald-400 shrink-0 opacity-70 group-hover:opacity-100" />
                  <span>{item.label}</span>
                </button>

                <button
                  type="button"
                  onClick={() => sendShortcut(item.cmd, false)}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1 py-0.5 rounded hover:bg-zinc-800 border border-transparent hover:border-zinc-700 transition"
                  title={t('term.pasteHint')}
                >
                  {t('terminal.pasteToPrompt')}
                </button>

                {item.category === 'custom' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomShortcut(item.id)}
                    className="text-zinc-500 hover:text-red-400 p-0.5 rounded transition"
                    title={t('terminal.deleteShortcut')}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Terminal Canvas Multi-Session Area */}
      <div className="flex-1 relative overflow-hidden">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          return (
            <div
              key={session.id}
              className={`w-full h-full ${isActive ? 'block' : 'hidden'}`}
            >
              <TerminalSessionCanvas
                ref={(handle) => {
                  sessionHandlesRef.current[session.id] = handle;
                }}
                server={server}
                sessionId={session.id}
                initialCommand={session.initialCommand}
                onClearInitialCommand={() => {
                  onClearCommand?.();
                  setSessions((prev) =>
                    prev.map((s) => (s.id === session.id ? { ...s, initialCommand: undefined } : s))
                  );
                }}
                isActive={isActive}
                theme={activeTheme.theme}
                fontSize={fontSize}
                onStatusChange={(status) => {
                  setSessionStatuses((prev) => ({ ...prev, [session.id]: status }));
                }}
                onDimensionsChange={(dims) => {
                  setSessionDimensions((prev) => ({ ...prev, [session.id]: dims }));
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 6. Sleek Terminal Status Footer & Keyboard Shortcut Reminder */}
      <div className="px-4 py-1.5 bg-zinc-950 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono select-none shrink-0">
        {/* Left: Keyboard shortcuts hint */}
        <div className="flex items-center gap-3 overflow-x-auto">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">Ctrl+C</kbd>
            <span className="text-[10px]">{t('term.keyCancel')}</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">Ctrl+L</kbd>
            <span className="text-[10px]">{t('term.keyClear')}</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">Ctrl+Z</kbd>
            <span className="text-[10px]">{t('term.keySuspend')}</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px]">Ctrl+D</kbd>
            <span className="text-[10px]">{t('term.keyExit')}</span>
          </span>
        </div>

        {/* Right: Dimension & encoding indicator */}
        <div className="flex items-center gap-3 text-[10px] shrink-0 text-zinc-400">
          <span>{activeDimensions.cols}x{activeDimensions.rows}</span>
          <span className="text-zinc-600">·</span>
          <span>UTF-8</span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeTheme.dotColor }} />
            {activeTheme.name.split(' ')[0]}
          </span>
        </div>
      </div>

      {/* Add Custom Shortcut Dialog Modal */}
      {showAddModal && (
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} className="max-w-md">
          <Card className="w-full p-5 bg-zinc-950 border-zinc-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-[var(--primary)]" />
                {t('terminal.newShortcutTitle')}
              </h4>
              <button
                onClick={() => setShowAddModal(false)}
                aria-label={t('common.close')}
                className="text-zinc-500 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomShortcut} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">
                  {t('terminal.shortcutLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('term.labelPlaceholder')}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="w-full h-8 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 outline-none focus:border-[var(--primary)]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-zinc-400 font-medium">
                  {t('terminal.shortcutCommand')}
                </label>
                <input
                  type="text"
                  placeholder={t('term.commandPlaceholder', { cmd: 'systemctl restart nginx && nginx -t' })}
                  value={newCmd}
                  onChange={(e) => setNewCmd(e.target.value)}
                  className="w-full h-8 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 outline-none focus:border-[var(--primary)]"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs font-semibold bg-[var(--primary)] text-[var(--primary-foreground)]"
                >
                  {t('terminal.saveShortcut')}
                </Button>
              </div>
            </form>
          </Card>
        </Modal>
      )}
    </div>
  );
}
