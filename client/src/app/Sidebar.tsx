import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, LayoutGrid, Box, Network, Activity, Server, Plus, Bell, Globe, ScrollText,
  PanelLeftClose, PanelLeftOpen, Sun, Moon, Search, X, Bot
} from 'lucide-react';
import { ServerItem } from '@/features/servers/types';
import { Route, FleetView } from '@/app/router';
import { SERVER_SECTION_GROUPS, SERVER_SECTIONS } from '@/app/serverNav';
import { useT, type MessageKey } from '@/shared/i18n';

const MIN_W = 208;
const MAX_W = 360;
const RAIL_W = 64;
const STORE_KEY = 'vps_hub_sidebar';

type Saved = { collapsed: boolean; width: number };
const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return { collapsed: !!s.collapsed, width: Math.min(MAX_W, Math.max(MIN_W, Number(s.width) || 248)) };
  } catch {
    return { collapsed: false, width: 248 };
  }
};

interface SidebarProps {
  servers: ServerItem[];
  route: Route;
  navigate: (r: Route) => void;
  fleetView: FleetView;
  alertsFor: (s: ServerItem) => string[];
  activeAlertCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onAddServer: () => void;
  onOpenPalette: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const FLEET_ITEMS: [FleetView, MessageKey, React.ElementType][] = [
  ['grid', 'view.grid', LayoutGrid],
  ['rack', 'view.rack', Box],
  ['topology', 'view.topology', Network],
  ['matrix', 'view.matrix', Activity]
];

type TipFactory = (text: string) => TipHandlers;
type TipHandlers = {
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLElement>) => void;
  onMouseLeave?: () => void;
  onBlur?: () => void;
};

interface ItemProps {
  rail: boolean;
  tip: TipFactory;
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: number;
  dot?: string;
  sub?: string;
  indent?: boolean;
  compact?: boolean;
}

function Item({ rail, tip, active, onClick, icon: Icon, label, badge, dot, sub, indent, compact }: ItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? label : undefined}
      {...tip(badge ? `${label} (${badge})` : label)}
      className={`group relative w-full flex items-center gap-3 rounded-lg text-[13px] transition-colors duration-150 outline-none
        focus-visible:ring-2 focus-visible:ring-[var(--ring)]
        ${rail ? `justify-center ${compact ? 'h-8' : 'h-10'}` : `h-9 px-2.5 ${indent ? 'pl-9 h-8 text-[12px]' : ''}`}
        ${active ? 'bg-[var(--sidebar-active)] text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]'}`}
    >
      {/* Active indicator bar */}
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--ok)] transition-all duration-200 ${active ? 'h-5 opacity-100' : 'h-0 opacity-0'}`}
      />
      <span className="relative shrink-0">
        <Icon className={`w-4 h-4 transition-transform duration-150 group-hover:scale-110 ${indent ? 'w-3.5 h-3.5' : ''}`} />
        {dot && <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--sidebar-bg)] ${dot}`} />}
      </span>
      {!rail && (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{label}</span>
          {sub && <span className="block truncate text-[10px] font-mono text-[var(--muted-foreground)] -mt-0.5 sensitive">{sub}</span>}
        </span>
      )}
      {!!badge && (
        <span className={`shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center
          ${rail ? 'absolute top-0.5 right-1.5 min-w-[16px] h-4' : ''}`}>
          {badge}
        </span>
      )}
    </button>
  );
}

function SubItem({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group relative w-full h-7 flex items-center gap-2.5 px-2 rounded-md text-[12px] transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
        ${active ? 'bg-[var(--sidebar-active)] text-[var(--foreground)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]'}`}
    >
      {/* Marker sits on the guide line, so the active section reads as a branch of the server. */}
      <span aria-hidden className={`absolute -left-[9.5px] top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-[var(--ok)] transition-all duration-200 ${active ? 'h-4 opacity-100' : 'h-0 opacity-0'}`} />
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Section({ rail, title, action }: { rail: boolean; title: string; action?: React.ReactNode }) {
  if (rail) return <div className="my-1.5 mx-3 border-t border-[var(--border)]" />;
  return (
    <div className="flex items-center justify-between px-2.5 pt-4 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--muted-foreground)]">{title}</span>
      {action}
    </div>
  );
}

export default function Sidebar(p: SidebarProps) {
  const t = useT();
  const [{ collapsed, width }, setLayout] = useState<Saved>(load);
  const [dragging, setDragging] = useState(false);
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);
  const [filter, setFilter] = useState('');
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ collapsed, width })); } catch { /* private mode */ }
  }, [collapsed, width]);

  const toggle = () => setLayout((l) => ({ ...l, collapsed: !l.collapsed }));

  // Cmd/Ctrl+B toggles the sidebar, like most editors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); toggle(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // On phones the sidebar is a drawer: always full width, never a rail.
  const rail = collapsed && !p.mobileOpen;

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const left = asideRef.current?.getBoundingClientRect().left ?? 0;
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const w = ev.clientX - left;
      // Dragging well past the minimum snaps to the icon rail; dragging back out re-expands.
      if (w < MIN_W - 60) setLayout((l) => ({ ...l, collapsed: true }));
      else setLayout({ collapsed: false, width: Math.min(MAX_W, Math.max(MIN_W, w)) });
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onHandleKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === 'ArrowLeft') setLayout((l) => (l.width - step < MIN_W ? { ...l, collapsed: true } : { ...l, width: l.width - step }));
    else if (e.key === 'ArrowRight') setLayout((l) => ({ collapsed: false, width: l.collapsed ? l.width : Math.min(MAX_W, l.width + step) }));
    else if (e.key === 'Enter' || e.key === ' ') toggle();
    else return;
    e.preventDefault();
  };

  // Tooltips are rendered fixed so the scrollable list can't clip them.
  const tipProps = (text: string) =>
    rail
      ? {
        onMouseEnter: (e: React.MouseEvent<HTMLElement>) => showTip(e.currentTarget, text),
        onFocus: (e: React.FocusEvent<HTMLElement>) => showTip(e.currentTarget, text),
        onMouseLeave: () => setTip(null),
        onBlur: () => setTip(null)
      }
      : {};
  const showTip = (el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 10 });
  };
  useEffect(() => { if (!rail) setTip(null); }, [rail]);

  const go = (r: Route) => { p.navigate(r); p.onMobileClose(); setTip(null); };

  const isFleet = p.route.page === 'fleet';
  const monTab = p.route.page === 'monitoring' ? p.route.tab : null;
  const activeServerId = p.route.page === 'server' ? p.route.id : null;
  const activeTab = p.route.page === 'server' ? p.route.tab : null;
  const servers = p.servers.filter((s) => !filter || `${s.name} ${s.host} ${(s.tags || []).join(' ')}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={p.onMobileClose}
        className={`md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-200 ${p.mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-hidden
      />

      <aside
        ref={asideRef}
        aria-label={t('nav.main')}
        style={{ width: p.mobileOpen ? 280 : rail ? RAIL_W : width }}
        className={`carbon-bg fixed md:sticky top-0 left-0 z-50 h-screen shrink-0 flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--border)]
          ${dragging ? '' : 'transition-[width,transform] duration-200 ease-[cubic-bezier(.2,.7,.2,1)]'}
          ${p.mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}`}
      >
        {/* Brand */}
        <div className={`h-14 flex items-center gap-2.5 border-b border-[var(--border)] shrink-0 ${rail ? 'justify-center' : 'px-3.5'}`}>
          <button
            onClick={() => go({ page: 'fleet' })}
            className="metal w-8 h-8 rounded-[9px] overflow-hidden border p-px shrink-0 transition-transform hover:scale-105 active:scale-95"
            aria-label={t('nav.toFleet')}
          >
            <img src="/icons/icon-opt2-server-blade.jpg" alt="7Server" className="w-full h-full object-cover rounded-[8px]" />
          </button>
          {!rail && (
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm tracking-tight leading-tight">{t('auth.title')}</div>
              <div className="text-[10px] text-[var(--muted-foreground)] truncate">{t('nav.fleetManagement')}</div>
            </div>
          )}
          {p.mobileOpen && (
            <button onClick={p.onMobileClose} className="md:hidden p-1.5 rounded-md hover:bg-[var(--sidebar-hover)]" aria-label={t('nav.closeMenu')}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search trigger */}
        <div className={`pt-3 ${rail ? 'px-3' : 'px-3'}`}>
          <button
            onClick={p.onOpenPalette}
            {...tipProps(t('nav.searchTip'))}
            aria-label={t('common.search')}
            className={`w-full h-8 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)] text-xs transition hover:border-[var(--muted-foreground)] hover:text-[var(--foreground)] ${rail ? 'justify-center' : 'px-2.5'}`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            {!rail && <><span className="flex-1 text-left">{t('nav.search')}</span><kbd className="text-[10px] font-mono px-1 rounded bg-[var(--muted)] border border-[var(--border)]">⌘K</kbd></>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3 sidebar-scroll">
          <Section rail={rail} title={t('nav.overview')} />
          <Item rail={rail} tip={tipProps} active={isFleet && rail} onClick={() => go({ page: 'fleet', view: p.fleetView })} icon={LayoutDashboard} label={t('nav.fleet')} />
          {!rail && isFleet && (
            <div className="mt-0.5 space-y-0.5 nav-expand">
              {FLEET_ITEMS.map(([v, label, Icon]) => (
                <Item rail={rail} tip={tipProps} key={v} indent active={p.fleetView === v} onClick={() => go({ page: 'fleet', view: v })} icon={Icon} label={t(label)} />
              ))}
            </div>
          )}

          <Section rail={rail}
            title={t('nav.servers', { n: p.servers.length })}
            action={
              <button onClick={p.onAddServer} className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] transition" aria-label="Add Server">
                <Plus className="w-3.5 h-3.5" />
              </button>
            }
          />
          {!rail && p.servers.length > 6 && (
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('nav.filterServers')}
              aria-label={t('nav.filterServers')}
              className="w-full h-7 mb-1 px-2.5 text-xs rounded-md bg-[var(--background)] border border-[var(--border)] focus:border-[var(--muted-foreground)]"
            />
          )}
          <div className="space-y-0.5">
            {servers.map((s) => {
              const alerts = p.alertsFor(s);
              const dot = s.status === 'online' ? (alerts.length ? 'bg-amber-400' : 'bg-emerald-500') : s.status === 'offline' ? 'bg-red-500' : 'bg-zinc-400';
              const open = activeServerId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <Item
                    rail={rail}
                    tip={tipProps}
                    active={open && (rail || activeTab === 'overview')}
                    onClick={() => go({ page: 'server', id: s.id, tab: 'overview' })}
                    icon={Server}
                    label={s.name}
                    sub={s.host}
                    dot={dot}
                    badge={alerts.length || undefined}
                  />
                  {/* Sections of the open server, nested under it. A guide line ties them to the parent. */}
                  {open && rail && (
                    <div className="mx-1.5 my-1 py-1 rounded-lg bg-[var(--sidebar-hover)]/60 space-y-px nav-expand" role="group" aria-label={t('nav.serverMenu', { name: s.name })}>
                      {SERVER_SECTIONS.map((it) => (
                        <Item rail={rail} tip={tipProps} key={it.id} compact active={activeTab === it.id} onClick={() => go({ page: 'server', id: s.id, tab: it.id })} icon={it.icon} label={`${s.name}: ${t(it.label)}`} />
                      ))}
                    </div>
                  )}
                  {open && !rail && (
                    <div className="relative ml-[18px] pl-2 border-l border-[var(--border)] mt-0.5 mb-1.5 nav-expand" role="group" aria-label={t('nav.serverMenu', { name: s.name })}>
                      {SERVER_SECTION_GROUPS.map((g, gi) => (
                        <div key={g.title} className={gi ? 'mt-2' : ''}>
                          <div className="px-2 pb-0.5 text-[10px] font-medium text-[var(--muted-foreground)]/80">{t(g.title)}</div>
                          {g.items.map((it) => (
                            <SubItem key={it.id} active={activeTab === it.id} onClick={() => go({ page: 'server', id: s.id, tab: it.id })} icon={it.icon} label={t(it.label)} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
            {rail && !activeServerId && (
              <Item rail={rail} tip={tipProps} active={false} onClick={p.onAddServer} icon={Plus} label={t('nav.addServer')} />
            )}
            {!rail && servers.length === 0 && (
              <p className="px-2.5 py-2 text-[11px] text-[var(--muted-foreground)]">{p.servers.length ? t('nav.noMatch') : t('nav.noServers')}</p>
            )}
          </div>

          <Section rail={rail} title={t('nav.monitoring')} />
          <Item rail={rail} tip={tipProps} active={monTab === 'alerts' || (rail && !!activeServerId && !!monTab)} onClick={() => go({ page: 'monitoring', tab: 'alerts' })} icon={Bell} label={rail && activeServerId ? t('nav.monitoring') : t('nav.alerts')} badge={p.activeAlertCount || undefined} />
          {!(rail && activeServerId) && (
            <>
              <Item rail={rail} tip={tipProps} active={monTab === 'uptime'} onClick={() => go({ page: 'monitoring', tab: 'uptime' })} icon={Globe} label={t('nav.uptime')} />
              <Item rail={rail} tip={tipProps} active={monTab === 'audit'} onClick={() => go({ page: 'monitoring', tab: 'audit' })} icon={ScrollText} label={t('nav.audit')} />
            </>
          )}

          <Section rail={rail} title={t('nav.aiGateway')} />
          <Item
            rail={rail}
            tip={tipProps}
            active={p.route.page === 'ai-gateway'}
            onClick={() => go({ page: 'ai-gateway', tab: 'quickstart' })}
            icon={Bot}
            label={t('nav.aiGateway')}
          />
        </nav>

        {/* Footer */}
        <div className={`shrink-0 border-t border-[var(--border)] p-2 flex gap-1 ${rail ? 'flex-col items-center' : 'items-center'}`}>
          <button
            onClick={p.onToggleTheme}
            {...tipProps(p.theme === 'dark' ? t('nav.toLight') : t('nav.toDark'))}
            aria-label={p.theme === 'dark' ? t('nav.toLight') : t('nav.toDark')}
            className={`h-8 flex items-center gap-2 rounded-lg text-xs text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)] transition ${rail ? 'w-10 justify-center' : 'flex-1 px-2.5'}`}
          >
            <span key={p.theme} className="icon-swap">{p.theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-500" />}</span>
            {!rail && <span>{p.theme === 'dark' ? t('nav.themeDark') : t('nav.themeLight')}</span>}
          </button>
          <button
            onClick={toggle}
            {...tipProps(collapsed ? t('nav.expandTip') : t('nav.collapseTip'))}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-expanded={!collapsed}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)] transition"
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Resize handle (desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('nav.resize')}
          aria-valuemin={RAIL_W}
          aria-valuemax={MAX_W}
          aria-valuenow={rail ? RAIL_W : width}
          tabIndex={0}
          onPointerDown={startResize}
          onDoubleClick={toggle}
          onKeyDown={onHandleKey}
          title={t('nav.resizeTip')}
          className="hidden md:block absolute top-0 -right-1 w-2 h-full cursor-col-resize group outline-none"
        >
          <span className={`absolute right-[3px] top-0 h-full w-[2px] transition-colors duration-150
            ${dragging ? 'bg-[var(--accent-brand)]' : 'bg-transparent group-hover:bg-[var(--accent-brand)]/60 group-focus-visible:bg-[var(--accent-brand)]'}`} />
        </div>
      </aside>

      {tip && (
        <div
          role="tooltip"
          className="tooltip-in fixed z-[70] -translate-y-1/2 px-2 py-1 rounded-md text-[11px] font-medium bg-[var(--foreground)] text-[var(--background)] shadow-lg pointer-events-none whitespace-nowrap"
          style={{ top: tip.top, left: tip.left }}
        >
          {tip.text}
        </div>
      )}
    </>
  );
}
