// Cmd/Ctrl+K quick jump. Owns its own open/query state and the global shortcut.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Server, Terminal, Globe, Zap, FolderOpen, X, Command, ShieldCheck, Activity, Sun, Moon, Languages, Bot, Users } from 'lucide-react';
import { useI18n, LANGS } from '@/shared/i18n';
import type { ServerItem } from '@/features/servers/types';
import type { Route, ServerTab } from '@/app/router';

interface CommandPaletteProps {
  servers: ServerItem[];
  navigate: (r: Route) => void;
  openManageServer: (s: ServerItem, tab?: ServerTab) => void;
  setTerminalServer: (s: ServerItem) => void;
  setFilesServer: (s: ServerItem) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  openBatch: () => void;
  /** Lets the sidebar's search button open the palette. */
  openSignal: number;
  onEscape?: () => void;
}

export default function CommandPalette({ servers, navigate, openManageServer, setTerminalServer, setFilesServer, theme, toggleTheme, openBatch, openSignal, onEscape }: CommandPaletteProps) {
  const [showPalette, setShowPalette] = useState(false);
  const { t, lang, setLang } = useI18n();
  const [paletteQuery, setPaletteQuery] = useState('');

  useEffect(() => {
    if (openSignal) { setPaletteQuery(''); setShowPalette(true); }
  }, [openSignal]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        setPaletteQuery('');
      } else if (e.key === 'Escape') {
        setShowPalette(false);
        onEscape?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);

  if (!showPalette) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-in fade-in"
      onClick={() => setShowPalette(false)}
    >
      <div
        className="pop-in bg-[var(--card)] border border-[var(--border)] rounded-xl w-full max-w-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('palette.label')}
      >
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2.5 bg-[var(--background)]">
          <Command className="w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            type="text"
            autoFocus
            value={paletteQuery}
            onChange={(e) => setPaletteQuery(e.target.value)}
            placeholder={t('palette.placeholder')}
            className="flex-1 bg-transparent text-xs text-[var(--foreground)] focus:outline-none"
          />
          <button
            onClick={() => setShowPalette(false)}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-2 text-xs">
          {servers.map((srv) => {
            const items = [
              {
                label: t('palette.overview', { name: srv.name }),
                sub: srv.host,
                icon: Server,
                action: () => openManageServer(srv, 'overview')
              },
              {
                label: t('palette.webapps', { name: srv.name }),
                sub: t('palette.webappsSub'),
                icon: Globe,
                action: () => openManageServer(srv, 'webapps')
              },
              {
                label: t('palette.pm2', { name: srv.name }),
                sub: t('palette.pm2Sub'),
                icon: Zap,
                action: () => openManageServer(srv, 'pm2')
              },
              {
                label: t('palette.terminal', { name: srv.name }),
                sub: `${srv.username}@${srv.host}`,
                icon: Terminal,
                action: () => openManageServer(srv, 'terminal')
              },
              {
                label: t('palette.files', { name: srv.name }),
                sub: t('palette.filesSub'),
                icon: FolderOpen,
                action: () => setFilesServer(srv)
              }
            ].filter(
              (it) =>
                !paletteQuery ||
                it.label.toLowerCase().includes(paletteQuery.toLowerCase()) ||
                it.sub.toLowerCase().includes(paletteQuery.toLowerCase())
            );

            if (items.length === 0) return null;

            return (
              <div key={srv.id} className="space-y-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {srv.name} <span className="sensitive">({srv.host})</span>
                </div>
                {items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.label}
                      onClick={() => {
                        setShowPalette(false);
                        it.action();
                      }}
                      className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] flex items-center justify-between transition"
                    >
                      <span className="flex items-center gap-2.5 text-[var(--foreground)] font-medium">
                        <Icon className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                        {it.label}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--muted-foreground)] sensitive">{it.sub}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Global actions */}
          <div className="space-y-1 pt-1 border-t border-[var(--border)]">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('palette.global')}
            </div>
            {([
              [t('palette.monAlerts'), ShieldCheck, () => navigate({ page: 'monitoring', tab: 'alerts' })],
              [t('palette.monUptime'), Globe, () => navigate({ page: 'monitoring', tab: 'uptime' })],
              [t('palette.monAudit'), Activity, () => navigate({ page: 'monitoring', tab: 'audit' })],
              ['AI Gateway', Bot, () => navigate({ page: 'ai-gateway', tab: 'quickstart' })],
              ['Pengguna & RBAC', Users, () => navigate({ page: 'users', tab: 'users' })]
            ] as const)
              .filter(([label]) => !paletteQuery || label.toLowerCase().includes(paletteQuery.toLowerCase()))
              .map(([label, Icon, action]) => (
                <button
                  key={label}
                  onClick={() => { setShowPalette(false); action(); }}
                  className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2.5 text-[var(--foreground)] font-medium">
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </span>
                </button>
              ))}
            <button
              onClick={() => {
                setShowPalette(false);
                toggleTheme();
              }}
              className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] flex items-center justify-between transition"
            >
              <span className="flex items-center gap-2.5 text-[var(--foreground)] font-medium">
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {theme === 'dark' ? t('palette.toLight') : t('palette.toDark')}
              </span>
            </button>
            {(() => {
              const next = LANGS.find((l) => l.code !== lang)!;
              const label = t('palette.language', { lang: next.label });
              if (paletteQuery && !`${label} language bahasa`.toLowerCase().includes(paletteQuery.toLowerCase())) return null;
              return (
                <button
                  onClick={() => { setShowPalette(false); setLang(next.code); }}
                  className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2.5 text-[var(--foreground)] font-medium">
                    <Languages className="w-3.5 h-3.5" /> {label}
                  </span>
                </button>
              );
            })()}
            <button
              onClick={() => {
                setShowPalette(false);
                    openBatch();
              }}
              className="w-full px-3 py-2 rounded-lg text-left hover:bg-[var(--muted)] flex items-center justify-between transition"
            >
              <span className="flex items-center gap-2.5 text-[var(--foreground)] font-medium">
                <Terminal className="w-3.5 h-3.5" />
                {t('palette.batch')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
