import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Database, RefreshCw, Plus, Search, Download, Trash2, Settings, X, Table2, Eye, KeyRound, FileJson, FileCode2,
  ShieldCheck, ShieldAlert, Container, Server as ServerIcon, ChevronRight, Sparkles, SquareTerminal, PanelLeftClose, PanelLeftOpen, Layers,
  Network, Info
} from 'lucide-react';
import { BrandIcon } from '@/shared/ui/brand-icon';
import { fetchDbEngines, discoverDbs, fetchDbConnections, createDbConnection, updateDbConnection, deleteDbConnection, pingDb, fetchDbDatabases, fetchDbObjects, dumpDb, fetchDbSchema, DbEngine, DbConnection, DiscoveredDb, DbObject, QueryResult, DbSchema } from '@/features/databases/api';
import { cacheGet, cacheSet } from '@/shared/lib/cache';
import ConnectionForm, { FormState, emptyForm } from '@/features/databases/components/ConnectionForm';
import TableView, { GridSkeleton } from '@/features/databases/components/TableView';
import QueryView from '@/features/databases/components/QueryView';
import DbProperties from '@/features/databases/components/DbProperties';
import { useT } from '@/shared/i18n';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { toast } from '@/shared/ui/toast';
// React Flow + dagre only load when a diagram tab is opened.
const ErDiagram = lazy(() => import('@/features/databases/components/ErDiagram'));

// ---------- tabs ----------
type Tab =
  | { id: string; kind: 'object'; connId: string; database?: string; object: string; objectType: string }
  | { id: string; kind: 'query'; connId: string; database?: string; title: string; text: string; result: QueryResult | null }
  | { id: string; kind: 'diagram' | 'props'; connId: string; database?: string; focus?: string };

const objIcon = (t: string) =>
  t === 'view' ? Eye : t === 'collection' ? FileJson : ['string', 'hash', 'list', 'set', 'zset', 'stream'].includes(t) ? KeyRound : Table2;

const TABS_KEY = (serverId: string) => `vps_hub_dbtabs:${serverId}`;

// Tree node state per connection: databases + objects per database, loaded lazily on expand.
interface ConnState {
  version?: string;
  error?: string;
  loading?: boolean;
  databases?: string[];
  objects: Record<string, DbObject[] | 'loading' | { error: string }>;
}

export default function DatabasePanel({ serverId }: { serverId: string }) {
  const t = useT();
  const [engines, setEngines] = useState<DbEngine[]>(() => cacheGet('db:engines') || []);
  const [conns, setConns] = useState<DbConnection[]>(() => cacheGet(`db:conns:${serverId}`) || []);
  const [discovered, setDiscovered] = useState<DiscoveredDb[] | null>(() => cacheGet(`db:disc:${serverId}`) ?? null);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const [tree, setTree] = useState<Record<string, ConnState>>(() => cacheGet(`db:tree:${serverId}`) || {});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(cacheGet<string[]>(`db:exp:${serverId}`) || []));
  const [filter, setFilter] = useState('');
  const [navOpen, setNavOpen] = useState(true);
  const [navW, setNavW] = useState(280);

  // Open tabs survive page navigation (sessionStorage) but query results don't, to keep storage small.
  const [tabs, setTabs] = useState<Tab[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(TABS_KEY(serverId)) || '[]').map((t: Tab) => (t.kind === 'query' ? { ...t, result: null } : t)); } catch { return []; }
  });
  const [activeId, setActiveId] = useState<string | null>(() => sessionStorage.getItem(`${TABS_KEY(serverId)}:active`));
  const [ctx, setCtx] = useState<{ x: number; y: number; connId: string; database?: string; object?: DbObject } | null>(null);

  const engineOf = (id: string) => engines.find((e) => e.id === id);
  const connOf = (id: string) => conns.find((c) => c.id === id);

  useEffect(() => { cacheSet(`db:tree:${serverId}`, tree); }, [tree]);
  useEffect(() => { cacheSet(`db:exp:${serverId}`, [...expanded]); }, [expanded]);
  useEffect(() => {
    try {
      sessionStorage.setItem(TABS_KEY(serverId), JSON.stringify(tabs.map((t) => (t.kind === 'query' ? { ...t, result: null } : t))));
      if (activeId) sessionStorage.setItem(`${TABS_KEY(serverId)}:active`, activeId);
    } catch { /* quota / private mode */ }
  }, [tabs, activeId]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); }
  };

  const loadConns = () => guard(async () => {
    const list = await fetchDbConnections(serverId);
    cacheSet(`db:conns:${serverId}`, list);
    setConns(list);
  });

  useEffect(() => {
    guard(async () => { const e = await fetchDbEngines(); cacheSet('db:engines', e); setEngines(e); });
    loadConns();
  }, [serverId]);

  const discover = async () => {
    setDiscovering(true);
    await guard(async () => { const d = await discoverDbs(serverId); cacheSet(`db:disc:${serverId}`, d); setDiscovered(d); });
    setDiscovering(false);
  };
  useEffect(() => {
    if (engines.length && conns.length === 0 && discovered === null) discover();
  }, [engines.length, conns.length]);

  const patch = (connId: string, f: (s: ConnState) => ConnState) =>
    setTree((t) => ({ ...t, [connId]: f(t[connId] || { objects: {} }) }));

  // ---------- tree loading ----------
  const loadConn = async (c: DbConnection, force = false) => {
    if (!force && tree[c.id]?.version) return;
    patch(c.id, (s) => ({ ...s, loading: true, error: undefined }));
    try {
      const version = await pingDb(c.id);
      const eng = engineOf(c.engine);
      let databases: string[] | undefined;
      if (eng?.canListDatabases) databases = await fetchDbDatabases(c.id);
      patch(c.id, (s) => ({ ...s, version, databases, loading: false, objects: force ? {} : s.objects }));
      // No database level (sqlite) or a default DB set: load objects straight away.
      if (!databases) loadObjects(c, '');
      else if (c.database && databases.includes(c.database)) {
        setExpanded((e) => new Set(e).add(`${c.id}/${c.database}`));
        loadObjects(c, c.database);
      }
    } catch (e: any) {
      patch(c.id, (s) => ({ ...s, loading: false, error: e.message }));
    }
  };

  const loadObjects = async (c: DbConnection, db: string, force = false) => {
    const cur = tree[c.id]?.objects?.[db];
    if (!force && Array.isArray(cur)) return;
    patch(c.id, (s) => ({ ...s, objects: { ...s.objects, [db]: 'loading' } }));
    try {
      const list = await fetchDbObjects(c.id, db || undefined);
      patch(c.id, (s) => ({ ...s, objects: { ...s.objects, [db]: list } }));
    } catch (e: any) {
      patch(c.id, (s) => ({ ...s, objects: { ...s.objects, [db]: { error: e.message } } }));
    }
  };

  const toggle = (key: string, onOpen?: () => void) =>
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(key)) n.delete(key);
      else { n.add(key); onOpen?.(); }
      return n;
    });

  // ---------- tabs ----------
  const openObject = (c: DbConnection, db: string, o: DbObject) => {
    const id = `obj:${c.id}:${db}:${o.name}`;
    setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, kind: 'object', connId: c.id, database: db || undefined, object: o.name, objectType: o.type }]));
    setActiveId(id);
  };

  const openQuery = (c: DbConnection, db?: string, text = '') => {
    const n = tabs.filter((t) => t.kind === 'query').length + 1;
    const id = `q:${c.id}:${Date.now()}`;
    setTabs((t) => [...t, { id, kind: 'query', connId: c.id, database: db, title: `Query ${n}`, text, result: null }]);
    setActiveId(id);
  };

  // One diagram / properties tab per database; reopening switches to it (and can retarget the focus).
  const openDbView = (c: DbConnection, db: string | undefined, kind: 'diagram' | 'props', focus?: string) => {
    const id = `${kind}:${c.id}:${db || ''}`;
    setTabs((t) => (t.some((x) => x.id === id)
      ? t.map((x) => (x.id === id && kind === 'diagram' && focus ? { ...x, focus } as Tab : x))
      : [...t, { id, kind, connId: c.id, database: db, focus }]));
    setActiveId(id);
  };

  const closeTab = (id: string) =>
    setTabs((t) => {
      const i = t.findIndex((x) => x.id === id);
      const next = t.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)]?.id ?? null);
      return next;
    });

  const updateQuery = (id: string, p: Partial<Extract<Tab, { kind: 'query' }>>) =>
    setTabs((t) => t.map((x) => (x.id === id && x.kind === 'query' ? { ...x, ...p } : x)));

  // Cmd/Ctrl+T new query on the active connection, Cmd/Ctrl+W close tab.
  const active = tabs.find((t) => t.id === activeId) || null;
  const keyRef = useRef({ active, conns });
  keyRef.current = { active, conns };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const k = e.key.toLowerCase();
      const { active: a, conns: cs } = keyRef.current;
      if (k === 'w' && a) { e.preventDefault(); closeTab(a.id); }
      if (k === 'e') {
        const c = (a && cs.find((x) => x.id === a.connId)) || cs[0];
        if (c) { e.preventDefault(); openQuery(c, a?.database); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- connection form ----------
  const editConn = (c: DbConnection) =>
    setForm({
      id: c.id, name: c.name, engine: c.engine, locationKind: c.location.kind, container: c.location.kind === 'container' ? c.location.container : '',
      host: c.host || '', port: c.port ? String(c.port) : '', user: c.user || '', password: '', database: c.database || '', auth: c.auth,
      allowWrite: c.allowWrite, hasPassword: c.hasPassword
    });

  const saveForm = () =>
    guard(async () => {
      if (!form) return;
      const payload = {
        name: form.name, engine: form.engine,
        location: form.locationKind === 'container' ? { kind: 'container' as const, container: form.container } : { kind: 'host' as const },
        host: form.host, port: form.port ? Number(form.port) : undefined, user: form.user, database: form.database, auth: form.auth,
        allowWrite: form.allowWrite, password: form.password || undefined
      };
      const saved = form.id ? await updateDbConnection(form.id, payload) : await createDbConnection(serverId, payload);
      setForm(null);
      await loadConns();
      setTree((t) => { const n = { ...t }; delete n[saved.id]; return n; });
      setExpanded((e) => new Set(e).add(saved.id));
      loadConn(saved, true);
    });

  const removeConn = async (c: DbConnection) => {
    const ok = await confirmModal({
      title: t('db.removeConn'),
      message: t('db.removeConnConfirm', { name: c.name }),
      variant: 'danger',
      confirmText: t('db.removeConn')
    });
    if (!ok) return;
    guard(async () => {
      await deleteDbConnection(c.id);
      setTabs((t) => t.filter((x) => x.connId !== c.id));
      toast.success(`Connection ${c.name} removed successfully`);
      await loadConns();
    });
  };

  const addDiscovered = (d: DiscoveredDb) =>
    guard(async () => {
      const c = await createDbConnection(serverId, { name: d.name, engine: d.engine, location: d.location, auth: d.auth, port: d.location.kind === 'host' ? d.port : undefined, discovered: true, allowWrite: false });
      await loadConns();
      setExpanded((e) => new Set(e).add(c.id));
      loadConn(c);
    });

  const alreadySaved = (d: DiscoveredDb) => conns.some((c) => c.engine === d.engine && JSON.stringify(c.location) === JSON.stringify(d.location));
  const pending = (discovered || []).filter((d) => !alreadySaved(d));

  // Navigator resize
  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX, w0 = navW;
    const move = (ev: PointerEvent) => setNavW(Math.min(460, Math.max(200, w0 + ev.clientX - x0)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const q = filter.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const renderObjects = (c: DbConnection, db: string, depth: number) => {
    const objs = tree[c.id]?.objects?.[db];
    if (objs === 'loading' || objs === undefined) {
      return <div style={{ paddingLeft: 6 + depth * 14 }} className="h-7 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><RefreshCw className="w-3 h-3 animate-spin" /> memuat…</div>;
    }
    if (!Array.isArray(objs)) {
      return <div style={{ paddingLeft: 6 + depth * 14 }} className="py-1 pr-2 text-[11px] text-red-500 break-words">{objs.error.split('\n')[0]}</div>;
    }
    const list = objs.filter((o) => matches(o.name));
    if (!list.length) return <div style={{ paddingLeft: 26 + depth * 14 }} className="h-7 flex items-center text-[11px] text-[var(--muted-foreground)]">{objs.length ? 'tidak cocok' : 'kosong'}</div>;
    return list.map((o) => {
      const Icon = objIcon(o.type);
      const id = `obj:${c.id}:${db}:${o.name}`;
      return (
        <Row key={o.name} depth={depth} chevron={false} icon={Icon} label={o.name} active={activeId === id}
          tone={o.type === 'view' ? 'text-violet-500' : 'text-sky-500'}
          onClick={() => openObject(c, db, o)}
          onContext={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, connId: c.id, database: db, object: o }); }}
          meta={o.rows != null ? <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums shrink-0">{fmtCount(o.rows)}</span> : undefined}
        />
      );
    });
  };

  return (
    <div className="h-[calc(100dvh-13rem)] min-h-[520px] flex rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      {/* ================= NAVIGATOR ================= */}
      {navOpen && (
        <aside style={{ width: navW }} className="relative shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)]" aria-label="Database navigator">
          <div className="shrink-0 h-10 px-2 flex items-center gap-1 border-b border-[var(--border)]">
            <span className="flex-1 pl-1 text-[11px] font-semibold text-[var(--muted-foreground)]">Navigator</span>
            <NavBtn title={t('db.scan')} onClick={discover} disabled={discovering}><Sparkles className={`w-3.5 h-3.5 ${discovering ? 'animate-pulse text-[var(--accent-brand)]' : ''}`} /></NavBtn>
            <NavBtn title={t('db.newConn')} onClick={() => engines[0] && setForm(emptyForm(engines[0]))} disabled={!engines.length}><Plus className="w-3.5 h-3.5" /></NavBtn>
            <NavBtn title={t('db.hideNav')} onClick={() => setNavOpen(false)}><PanelLeftClose className="w-3.5 h-3.5" /></NavBtn>
          </div>
          <div className="shrink-0 p-2 border-b border-[var(--border)]">
            <div className="h-7 px-2 flex items-center gap-1.5 rounded-md bg-[var(--background)] border border-[var(--border)] focus-within:border-[var(--muted-foreground)]">
              <Search className="w-3 h-3 text-[var(--muted-foreground)]" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('db.searchTables')} aria-label={t('db.searchTables')} className="flex-1 min-w-0 bg-transparent text-[11px]" />
              {filter && <button onClick={() => setFilter('')} aria-label="Clear"><X className="w-3 h-3" /></button>}
            </div>
          </div>
          {error && <p role="alert" className="shrink-0 px-3 py-2 text-[11px] text-red-500 break-words border-b border-[var(--border)]">{error}</p>}

          <div className="flex-1 min-h-0 overflow-auto p-1.5 sidebar-scroll" role="tree" aria-label="Koneksi database">
            {conns.map((c) => {
              const st = tree[c.id];
              const eng = engineOf(c.engine);
              const open = expanded.has(c.id);
              const Loc = c.location.kind === 'container' ? Container : ServerIcon;
              return (
                <div key={c.id}>
                  <Row depth={0} open={open} icon={Loc} brand={c.engine} label={c.name}
                    tone={st?.error ? 'text-red-500' : st?.version ? 'text-emerald-500' : undefined}
                    onToggle={() => toggle(c.id, () => loadConn(c))}
                    onContext={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, connId: c.id }); }}
                    meta={
                      <span className="shrink-0 flex items-center gap-1">
                        {st?.loading && <RefreshCw className="w-3 h-3 animate-spin text-[var(--muted-foreground)]" />}
                        {c.allowWrite ? <ShieldAlert className="w-3 h-3 text-amber-500" aria-label="mode tulis" /> : <ShieldCheck className="w-3 h-3 text-emerald-500/70" aria-label="read-only" />}
                        <span className="hidden group-hover:flex items-center gap-0.5">
                          <IconBtn title={t('db.newQuery')} onClick={() => openQuery(c, c.database)}><SquareTerminal className="w-3 h-3" /></IconBtn>
                          {eng?.canSchema && !eng.canListDatabases && <IconBtn title={t('db.diagram')} onClick={() => openDbView(c, undefined, 'diagram')}><Network className="w-3 h-3" /></IconBtn>}
                          <IconBtn title={t('db.settings')} onClick={() => editConn(c)}><Settings className="w-3 h-3" /></IconBtn>
                        </span>
                      </span>
                    }
                  />
                  {open && (
                    <div className="nav-expand">
                      {st?.error ? (
                        <div className="ml-6 my-1 mr-1 p-2 rounded-md bg-red-500/10 border border-red-500/20 text-[11px]">
                          <p className="text-red-500 font-mono whitespace-pre-wrap break-words line-clamp-4">{st.error}</p>
                          <div className="mt-1.5 flex gap-1.5">
                            <button onClick={() => loadConn(c, true)} className="text-[11px] underline">{t('common.retry')}</button>
                            <button onClick={() => editConn(c)} className="text-[11px] underline">{t('db.editConn')}</button>
                          </div>
                        </div>
                      ) : !st?.version ? (
                        <div className="pl-7 h-7 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><RefreshCw className="w-3 h-3 animate-spin" /> connecting…</div>
                      ) : (
                        <>
                          <div className="pl-[26px] pb-0.5 text-[10px] text-[var(--muted-foreground)] font-mono truncate">{eng?.label} · v{st.version}</div>
                          {st.databases
                            ? st.databases.map((db) => {
                                const k = `${c.id}/${db}`;
                                const dbOpen = expanded.has(k) || !!q;
                                const objs = st.objects[db];
                                return (
                                  <div key={db}>
                                    <Row depth={1} open={dbOpen} icon={Layers} label={db} tone="text-amber-500"
                                      onToggle={() => toggle(k, () => loadObjects(c, db))}
                                      onContext={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, connId: c.id, database: db }); }}
                                      meta={
                                        <span className="shrink-0 flex items-center gap-0.5">
                                          {eng?.canSchema && (
                                            <span className="hidden group-hover:flex items-center gap-0.5">
                                              <IconBtn title={t('db.diagram')} onClick={() => openDbView(c, db, 'diagram')}><Network className="w-3 h-3" /></IconBtn>
                                              <IconBtn title={t('db.properties')} onClick={() => openDbView(c, db, 'props')}><Info className="w-3 h-3" /></IconBtn>
                                            </span>
                                          )}
                                          {Array.isArray(objs) && <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums group-hover:hidden">{objs.length}</span>}
                                        </span>
                                      }
                                    />
                                    {dbOpen && (objs !== undefined || expanded.has(k)) && <div className="nav-expand">{renderObjects(c, db, 2)}</div>}
                                  </div>
                                );
                              })
                            : renderObjects(c, '', 1)}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {conns.length === 0 && !discovering && pending.length === 0 && (
              <div className="p-4 text-center text-[11px] text-[var(--muted-foreground)] space-y-2">
                <Database className="w-6 h-6 mx-auto opacity-30" />
                <p>{t('db.emptyConn')}</p>
                <button onClick={discover} className="underline">{t('db.scanServer')}</button>
              </div>
            )}

            {(discovering || pending.length > 0) && (
              <div className="mt-2 pt-2 border-t border-[var(--border)]">
                <div className="px-2 pb-1 text-[10px] font-semibold text-[var(--muted-foreground)]">
                  {discovering ? t('db.scanning') : t('db.discovered', { n: pending.length })}
                </div>
                {pending.map((d) => (
                  <button key={`${d.engine}:${JSON.stringify(d.location)}`} onClick={() => addDiscovered(d)}
                    className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] text-[12px] group">
                    <BrandIcon name={d.engine} className="w-3.5 h-3.5 mt-0.5" fallback={<Plus className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--accent-brand)]" />} />
                    <span className="min-w-0">
                      <span className="block truncate font-mono">{d.name}</span>
                      <span className="block truncate text-[10px] text-[var(--muted-foreground)]">{engineOf(d.engine)?.label} · {d.location.kind === 'container' ? 'docker' : 'host'}</span>
                      {d.note && <span className={`block truncate text-[10px] ${d.note.includes('⚠') ? 'text-amber-600' : 'text-[var(--muted-foreground)]'}`} title={d.note}>{d.note}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div onPointerDown={startResize} role="separator" aria-orientation="vertical" aria-label="Resize navigator"
            className="absolute top-0 -right-1 w-2 h-full cursor-col-resize group">
            <span className="absolute right-[3px] top-0 h-full w-[2px] group-hover:bg-[var(--accent-brand)]/60 transition-colors" />
          </div>
        </aside>
      )}

      {/* ================= EDITOR AREA ================= */}
      <section className="flex-1 min-w-0 flex flex-col">
        {/* Tab strip */}
        <div className="shrink-0 h-10 flex items-stretch border-b border-[var(--border)] bg-[var(--sidebar-bg)]">
          {!navOpen && (
            <button onClick={() => setNavOpen(true)} className="px-2.5 border-r border-[var(--border)] hover:bg-[var(--sidebar-hover)]" aria-label="Tampilkan navigator" title="Tampilkan navigator">
              <PanelLeftOpen className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-stretch overflow-x-auto" role="tablist" aria-label="Tab terbuka">
            {tabs.map((t) => {
              const c = connOf(t.connId);
              const isActive = t.id === activeId;
              const Icon = t.kind === 'object' ? objIcon(t.objectType) : t.kind === 'query' ? FileCode2 : t.kind === 'diagram' ? Network : Info;
              const title = t.kind === 'query' ? t.title : t.kind === 'object' ? t.object : `${t.kind === 'diagram' ? 'ERD' : 'Info'} · ${t.database || c?.name || ''}`;
              return (
                <div key={t.id} role="tab" aria-selected={isActive} tabIndex={0}
                  onClick={() => setActiveId(t.id)}
                  onAuxClick={(e) => { if (e.button === 1) closeTab(t.id); }}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveId(t.id)}
                  title={`${c?.name || ''}${t.database ? ` / ${t.database}` : ''}`}
                  className={`group relative shrink-0 max-w-[14rem] flex items-center gap-1.5 pl-3 pr-1.5 border-r border-[var(--border)] text-[12px] cursor-pointer transition-colors
                    ${isActive ? 'bg-[var(--card)] text-[var(--foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]'}`}>
                  {isActive && <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-[var(--accent-brand)]" />}
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${t.kind === 'query' ? 'text-[var(--accent-brand)]' : t.kind === 'object' ? 'text-sky-500' : 'text-amber-500'}`} />
                  <span className="truncate font-mono">{title}</span>
                  <button onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label={`Tutup ${title}`}
                    className={`shrink-0 p-0.5 rounded hover:bg-[var(--sidebar-active)] ${isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'} hover:!opacity-100`}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          {conns.length > 0 && (
            <button onClick={() => { const c = (active && connOf(active.connId)) || conns[0]; openQuery(c, active?.database); }}
              className="shrink-0 px-3 flex items-center gap-1.5 text-[11px] border-l border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]" title="Query baru (⌘E)">
              <Plus className="w-3.5 h-3.5" /> Query
            </button>
          )}
        </div>

        {/* Context strip: which connection/database the active tab talks to */}
        {active && connOf(active.connId) && (
          <div className="shrink-0 h-7 px-3 flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)] border-b border-[var(--border)] font-mono">
            <span>{connOf(active.connId)!.name}</span>
            {active.database && <><ChevronRight className="w-3 h-3" /><span>{active.database}</span></>}
            {active.kind === 'object' && <><ChevronRight className="w-3 h-3" /><span className="text-[var(--foreground)]">{active.object}</span></>}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {!active ? (
            <Welcome hasConns={conns.length > 0} onNewQuery={() => conns[0] && openQuery(conns[0], conns[0].database)} onScan={discover} />
          ) : (() => {
            const c = connOf(active.connId);
            const eng = c && engineOf(c.engine);
            if (!c || !eng) return <GridSkeleton />;
            if (active.kind === 'diagram' || active.kind === 'props') {
              return (
                <SchemaTab key={active.id} conn={c} engine={eng} database={active.database} kind={active.kind} focus={active.focus}
                  storageKey={`vps_hub_erd:${c.id}:${active.database || ''}`}
                  onOpenTable={(name) => openObject(c, active.database || '', { name, type: 'table' })}
                  onShowDiagram={(focus) => openDbView(c, active.database, 'diagram', focus)} />
              );
            }
            if (active.kind === 'object') {
              return (
                <div key={active.id} className="h-full fade-in">
                  <TableView conn={c} engine={eng} database={active.database} object={active.object} objectType={active.objectType}
                    onOpenQuery={(sql) => openQuery(c, active.database, sql)} />
                </div>
              );
            }
            if (active.kind !== 'query') return null;
            return (
              <div key={active.id} className="h-full fade-in">
                <QueryView conn={c} engine={eng} database={active.database} text={active.text}
                  onTextChange={(text) => updateQuery(active.id, { text })}
                  result={active.result} onResult={(result) => updateQuery(active.id, { result })} />
              </div>
            );
          })()}
        </div>
      </section>

      {/* ================= CONTEXT MENU ================= */}
      {ctx && (() => {
        const c = connOf(ctx.connId);
        if (!c) return null;
        const eng = engineOf(c.engine);
        const items: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }[] = [];
        if (ctx.object) {
          items.push({ label: 'Buka data', icon: Table2, onClick: () => openObject(c, ctx.database || '', ctx.object!) });
          if (eng?.canSchema) items.push({ label: 'Lihat relasi di diagram', icon: Network, onClick: () => openDbView(c, ctx.database || undefined, 'diagram', ctx.object!.name) });
          if (eng?.kind === 'sql') {
            items.push({ label: 'SELECT di query baru', icon: FileCode2, onClick: () => openQuery(c, ctx.database, `SELECT * FROM ${ctx.object!.name}\nLIMIT 100;`) });
            items.push({ label: 'COUNT(*)', icon: FileCode2, onClick: () => openQuery(c, ctx.database, `SELECT COUNT(*) FROM ${ctx.object!.name};`) });
          }
          items.push({ label: 'Salin nama', icon: FileJson, onClick: () => navigator.clipboard.writeText(ctx.object!.name) });
        } else if (ctx.database !== undefined) {
          if (eng?.canSchema) {
            items.push({ label: 'Diagram relasi', icon: Network, onClick: () => openDbView(c, ctx.database, 'diagram') });
            items.push({ label: 'Properties database', icon: Info, onClick: () => openDbView(c, ctx.database, 'props') });
          }
          items.push({ label: 'Query baru di sini', icon: SquareTerminal, onClick: () => openQuery(c, ctx.database) });
          items.push({ label: 'Refresh tabel', icon: RefreshCw, onClick: () => loadObjects(c, ctx.database!, true) });
          if (eng?.canDump) items.push({ label: 'Dump database (.sql)', icon: Download, onClick: () => guard(() => dumpDb(c.id, c.name, ctx.database!)) });
        } else {
          items.push({ label: t('db.newQuery'), icon: SquareTerminal, onClick: () => openQuery(c, c.database) });
          if (eng?.canSchema && !eng.canListDatabases) {
            items.push({ label: t('db.diagram'), icon: Network, onClick: () => openDbView(c, undefined, 'diagram') });
            items.push({ label: t('db.properties'), icon: Info, onClick: () => openDbView(c, undefined, 'props') });
          }
          items.push({ label: t('common.refresh'), icon: RefreshCw, onClick: () => loadConn(c, true) });
          items.push({ label: t('db.settings'), icon: Settings, onClick: () => editConn(c) });
          items.push({ label: t('db.removeConn'), icon: Trash2, onClick: () => removeConn(c), danger: true });
        }
        return (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }} />
            <div role="menu" className="pop-in fixed z-[61] min-w-48 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-2xl text-[12px]"
              style={{ top: Math.min(ctx.y, window.innerHeight - items.length * 32 - 16), left: Math.min(ctx.x, window.innerWidth - 210) }}>
              {items.map((it) => (
                <button key={it.label} role="menuitem" onClick={() => { setCtx(null); it.onClick(); }}
                  className={`w-full text-left px-3 h-8 flex items-center gap-2 hover:bg-[var(--sidebar-hover)] ${it.danger ? 'text-red-500' : ''}`}>
                  <it.icon className="w-3.5 h-3.5" /> {it.label}
                </button>
              ))}
            </div>
          </>
        );
      })()}

      {form && <ConnectionForm form={form} setForm={setForm} engines={engines} error={error} onSave={saveForm} />}
    </div>
  );
}

// Tree row. Module-level on purpose: defined inside the panel it would remount on every state change.
function Row({ depth, open, onToggle, onClick, icon: Icon, brand, label, meta, active: isActive, chevron = true, tone, onContext, children }: {
  depth: number; open?: boolean; onToggle?: () => void; onClick?: () => void; icon: React.ElementType; brand?: string; label: string; meta?: React.ReactNode;
  active?: boolean; chevron?: boolean; tone?: string; onContext?: (e: React.MouseEvent) => void; children?: React.ReactNode;
}) {
return (
  <div
    role="treeitem"
    aria-expanded={chevron ? !!open : undefined}
    aria-selected={isActive}
    tabIndex={0}
    onClick={onClick || onToggle}
    onDoubleClick={onToggle && onClick ? onToggle : undefined}
    onKeyDown={(e) => {
      if (e.key === 'Enter') (onClick || onToggle)?.();
      if (e.key === 'ArrowRight' && chevron && !open) onToggle?.();
      if (e.key === 'ArrowLeft' && chevron && open) onToggle?.();
    }}
    onContextMenu={onContext}
    style={{ paddingLeft: 6 + depth * 14 }}
    className={`group h-7 pr-2 flex items-center gap-1.5 rounded-md text-[12px] cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
      ${isActive ? 'bg-[var(--sidebar-active)] text-[var(--foreground)] font-medium' : 'text-[var(--foreground)]/85 hover:bg-[var(--sidebar-hover)]'}`}
  >
    <span
      onClick={(e) => { if (onToggle) { e.stopPropagation(); onToggle(); } }}
      className={`w-3.5 h-3.5 shrink-0 flex items-center justify-center text-[var(--muted-foreground)] ${chevron ? '' : 'invisible'}`}
    >
      <ChevronRight className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
    </span>
    <BrandIcon name={brand} className="w-3.5 h-3.5" fallback={<Icon className={`w-3.5 h-3.5 shrink-0 ${tone || 'text-[var(--muted-foreground)]'}`} />} />
    <span className="truncate flex-1 font-mono">{label}</span>
    {meta}
    {children}
  </div>
);
}

// Loads the schema snapshot once per database (cached across tabs and page switches) and renders
// either the ER diagram or the properties view.
function SchemaTab({ conn, engine, database, kind, focus, storageKey, onOpenTable, onShowDiagram }: {
  conn: DbConnection; engine: DbEngine; database?: string; kind: 'diagram' | 'props'; focus?: string; storageKey: string;
  onOpenTable: (name: string) => void; onShowDiagram: (focus?: string) => void;
}) {
  const key = `db:schema:${conn.id}:${database || ''}`;
  const [schema, setSchema] = useState<DbSchema | null>(() => cacheGet<DbSchema>(key) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (!force && cacheGet(key)) return;
    setLoading(true);
    try {
      const s = await fetchDbSchema(conn.id, database);
      cacheSet(key, s);
      setSchema(s);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [key]);

  // A "show relations of X" request seeds the diagram's focus.
  useEffect(() => {
    if (kind !== 'diagram' || !focus) return;
    try {
      const s = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
      sessionStorage.setItem(storageKey, JSON.stringify({ ...s, focus, search: '' }));
    } catch { /* ignore */ }
  }, [focus]);

  if (error && !schema) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-2">
          <p role="alert" className="text-xs font-mono text-red-500 whitespace-pre-wrap">{error}</p>
          <button onClick={() => load(true)} className="text-xs underline">Coba lagi</button>
        </div>
      </div>
    );
  }
  if (!schema) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
        <RefreshCw className="w-4 h-4 animate-spin" /> Membaca schema {database || ''}…
      </div>
    );
  }
  return (
    <div className="h-full fade-in">
      {kind === 'diagram' ? (
        <Suspense fallback={<div className="h-full flex items-center justify-center text-xs text-[var(--muted-foreground)]"><RefreshCw className="w-4 h-4 animate-spin" /></div>}>
          <ErDiagram key={`${storageKey}:${focus || ''}`} schema={schema} storageKey={storageKey} loading={loading} onRefresh={() => load(true)} onOpenTable={onOpenTable} />
        </Suspense>
      ) : (
        <DbProperties schema={schema} conn={conn} engine={engine} database={database} onOpenTable={onOpenTable} onShowDiagram={onShowDiagram} />
      )}
    </div>
  );
}

const fmtCount = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString());

function NavBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} aria-label={title}
      className="h-7 w-7 rounded-md flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)] disabled:opacity-40 transition-colors">
      {children}
    </button>
  );
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} aria-label={title}
      className="p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-active)]">
      {children}
    </button>
  );
}

function Welcome({ hasConns, onNewQuery, onScan }: { hasConns: boolean; onNewQuery: () => void; onScan: () => void }) {
  const tips: [string, string][] = [
    ['Klik tabel', 'buka data di tab baru'],
    ['Klik kanan', 'menu: query, count, dump'],
    ['⌘E', 'query baru'],
    ['⌘↵', 'jalankan query'],
    ['⌘W', 'tutup tab']
  ];
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-sm w-full space-y-5 page-enter">
        <div>
          <Database className="w-7 h-7 text-[var(--accent-brand)]" />
          <h3 className="mt-3 text-base font-semibold tracking-tight">Database workbench</h3>
          <p className="mt-1 text-xs text-[var(--muted-foreground)] leading-relaxed">
            {hasConns ? 'Buka koneksi di navigator, lalu pilih tabel untuk melihat datanya.' : 'Database di server dan di container Docker bisa dideteksi otomatis.'}
          </p>
        </div>
        <div className="flex gap-2">
          {hasConns
            ? <button onClick={onNewQuery} className="h-8 px-3 rounded-md bg-[var(--accent-brand)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition"><SquareTerminal className="w-3.5 h-3.5" /> Query baru</button>
            : <button onClick={onScan} className="h-8 px-3 rounded-md bg-[var(--accent-brand)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition"><Sparkles className="w-3.5 h-3.5" /> Scan server</button>}
        </div>
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[11px]">
          {tips.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt><kbd className="px-1.5 py-0.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono text-[10px]">{k}</kbd></dt>
              <dd className="text-[var(--muted-foreground)]">{v}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
