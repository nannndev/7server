// ER diagram for one database. Lazy-loaded (React Flow + dagre only ship when this view opens).
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, MarkerType, useReactFlow,
  useNodesState, useEdgesState, useNodesInitialized, type Node, type Edge, type NodeProps, BackgroundVariant, Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  Search, X, KeyRound, Link2, Eye, EyeOff, Focus, LayoutGrid, Rows3, Columns3, Download, RefreshCw, Table2, Sparkles, Minus, Plus
} from 'lucide-react';
import type { DbSchema, SchemaTable } from '@/features/databases/api';
import { ErFilter, defaultFilter, visibleGraph, fmtNum } from '@/features/databases/lib/erGraph';
import { useT } from '@/shared/i18n';

type Density = 'full' | 'keys' | 'name';
type Dir = 'LR' | 'TB';

const NODE_W = 240;
const ROW_H = 22;
const HEAD_H = 34;
const MAX_COLS = 14; // longer tables collapse the rest into "+N kolom"

type TableNodeData = {
  table: SchemaTable;
  density: Density;
  fkCols: Set<string>;
  refCols: Set<string>;
  highlight: 'none' | 'focus' | 'near' | 'dim';
  hiddenRels: number;
  onFocus: (name: string) => void;
  onOpen: (name: string) => void;
};

const visibleColumns = (t: SchemaTable, density: Density, fk: Set<string>) =>
  density === 'name' ? [] : density === 'keys' ? t.columns.filter((c) => c.pk || fk.has(c.name)) : t.columns;

const nodeHeight = (t: SchemaTable, density: Density, fk: Set<string>) => {
  const cols = visibleColumns(t, density, fk);
  const shown = Math.min(cols.length, MAX_COLS);
  return HEAD_H + shown * ROW_H + (cols.length > MAX_COLS ? ROW_H : 0) + (shown ? 6 : 0);
};

const TableNode = memo(function TableNode({ data, selected }: NodeProps<Node<TableNodeData>>) {
  const t = useT();
  const { table: tb, density, fkCols, refCols, highlight, hiddenRels } = data;
  const cols = visibleColumns(tb, density, fkCols);
  const shown = cols.slice(0, MAX_COLS);
  const isView = tb.type === 'view';
  return (
    <div
      onDoubleClick={() => data.onOpen(tb.name)}
      className={`er-node rounded-lg border bg-[var(--card)] text-[var(--foreground)] shadow-sm transition-[opacity,box-shadow,border-color] duration-200
        ${selected || highlight === 'focus' ? 'border-[var(--accent-brand)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-brand)_25%,transparent)]' : 'border-[var(--border)]'}
        ${highlight === 'dim' ? 'opacity-25' : 'opacity-100'}`}
      style={{ width: NODE_W }}
    >
      {/* Handles are invisible: edges attach to the node sides, the column rows carry the meaning. */}
      <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5 !min-w-0 !border-0 !bg-[var(--accent-brand)] opacity-0" />
      <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5 !min-w-0 !border-0 !bg-[var(--accent-brand)] opacity-0" />
      <Handle id="t" type="target" position={Position.Top} className="!w-1.5 !h-1.5 !min-w-0 !border-0 opacity-0" />
      <Handle id="b" type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !min-w-0 !border-0 opacity-0" />

      <div className={`flex items-center gap-1.5 px-2.5 rounded-t-lg ${shown.length ? 'border-b border-[var(--border)]' : 'rounded-b-lg'} ${isView ? 'bg-violet-500/10' : 'bg-[var(--muted)]'}`} style={{ height: HEAD_H }}>
        {isView ? <Eye className="w-3.5 h-3.5 text-violet-500 shrink-0" /> : <Table2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
        <span className="font-mono text-[12px] font-semibold truncate flex-1" title={tb.name}>{tb.name}</span>
        {tb.rows != null && <span className="text-[10px] font-mono text-[var(--muted-foreground)] tabular-nums shrink-0">{fmtNum(tb.rows)}</span>}
        <button
          onClick={(e) => { e.stopPropagation(); data.onOpen(tb.name); }}
          className="nodrag shrink-0 p-0.5 rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]"
          title={t('db.openData')} aria-label={t('erd.openDataOf', { name: tb.name })}
        >
          <Table2 className="w-3 h-3" />
        </button>
      </div>
      {shown.length > 0 && (
        <div className="py-[3px]">
          {shown.map((c) => (
            <div key={c.name} className="flex items-center gap-1.5 px-2.5 text-[11px] font-mono" style={{ height: ROW_H }}>
              <span className="w-3 shrink-0 flex justify-center">
                {c.pk ? <KeyRound className="w-3 h-3 text-amber-500" aria-label="primary key" /> : fkCols.has(c.name) ? <Link2 className="w-3 h-3 text-[var(--accent-brand)]" aria-label="foreign key" /> : null}
              </span>
              <span className={`truncate flex-1 ${c.pk ? 'font-semibold' : refCols.has(c.name) ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]/80'}`} title={c.name}>{c.name}</span>
              <span className="truncate max-w-[45%] text-[10px] text-[var(--muted-foreground)]" title={c.type}>{c.type}{c.nullable ? '' : ' !'}</span>
            </div>
          ))}
          {cols.length > MAX_COLS && (
            <div className="px-2.5 text-[10px] text-[var(--muted-foreground)] flex items-center" style={{ height: ROW_H }}>{t('erd.moreCols', { n: cols.length - MAX_COLS })}</div>
          )}
        </div>
      )}
      {hiddenRels > 0 && (
        <div className="absolute -top-2 -right-2 px-1.5 h-4 rounded-full bg-[var(--muted)] border border-[var(--border)] text-[9px] font-semibold text-[var(--muted-foreground)] flex items-center" title={t('erd.hiddenRels', { n: hiddenRels })}>
          +{hiddenRels}
        </div>
      )}
    </div>
  );
});

const nodeTypes = { table: TableNode };

function runDagre(nodes: Node<TableNodeData>[], edges: Edge[], dir: Dir) {
  // Simple graph, one edge per table pair: parallel FKs between the same two tables (and pairs in both
  // directions) make dagre's edge routing throw "Not possible to find intersection inside of the rectangle".
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: dir === 'LR' ? 36 : 56, ranksep: dir === 'LR' ? 110 : 80, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: n.height || 80 });
  const seen = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target) continue;
    const pair = [e.source, e.target].sort().join('\u0000');
    if (seen.has(pair)) continue;
    seen.add(pair);
    g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  return g;
}

/** Plain grid; used when dagre fails so the diagram still renders. */
function gridLayout(nodes: Node<TableNodeData>[]) {
  const perRow = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  let y = 24, rowH = 0;
  return nodes.map((n, i) => {
    if (i > 0 && i % perRow === 0) { y += rowH + 48; rowH = 0; }
    rowH = Math.max(rowH, n.height || 0);
    return { ...n, position: { x: 24 + (i % perRow) * (NODE_W + 48), y } };
  });
}

function layout(nodes: Node<TableNodeData>[], edges: Edge[], dir: Dir) {
  let g: ReturnType<typeof runDagre>;
  try {
    g = runDagre(nodes, edges, dir);
  } catch (err) {
    console.warn('[erd] dagre layout failed, falling back to grid', err);
    return gridLayout(nodes);
  }
  // Tables without relations: dagre stacks them at x=0; lay them out in a tidy grid below the graph instead.
  const linked = new Set(edges.flatMap((e) => [e.source, e.target]));
  let maxY = 0;
  for (const n of nodes) if (linked.has(n.id)) { const p = g.node(n.id); maxY = Math.max(maxY, p.y + (n.height || 0) / 2); }
  const loose = nodes.filter((n) => !linked.has(n.id));
  const perRow = Math.max(1, Math.ceil(Math.sqrt(loose.length * 1.6)));
  let rowH = 0, rowY = linked.size ? maxY + 120 : 24;
  return nodes.map((n) => {
    if (linked.has(n.id)) {
      const p = g.node(n.id);
      return { ...n, position: { x: p.x - NODE_W / 2, y: p.y - (n.height || 0) / 2 } };
    }
    const i = loose.indexOf(n);
    if (i > 0 && i % perRow === 0) { rowY += rowH + 40; rowH = 0; }
    rowH = Math.max(rowH, n.height || 0);
    return { ...n, position: { x: 24 + (i % perRow) * (NODE_W + 40), y: rowY } };
  });
}

interface ErDiagramProps {
  schema: DbSchema;
  storageKey: string;
  loading?: boolean;
  onRefresh: () => void;
  onOpenTable: (name: string) => void;
}

function ErCanvas({ schema, storageKey, loading, onRefresh, onOpenTable }: ErDiagramProps) {
  const t = useT();
  const rf = useReactFlow();
  const [filter, setFilter] = useState<ErFilter>(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (s) return { ...defaultFilter(), ...s, hidden: new Set(s.hidden || []) };
    } catch { /* ignore */ }
    return defaultFilter();
  });
  const [density, setDensity] = useState<Density>(() => (schema.tables.length > 40 ? 'keys' : 'full'));
  const [dir, setDir] = useState<Dir>('LR');
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ ...filter, hidden: [...filter.hidden] })); } catch { /* quota */ }
  }, [filter]);

  const graph = useMemo(() => visibleGraph(schema, filter), [schema, filter]);

  const focusOn = useCallback((name: string) => setFilter((f) => ({ ...f, focus: f.focus === name ? null : name })), []);

  // Build nodes/edges and lay them out whenever the visible set or presentation changes.
  const { layoutNodes, layoutEdges } = useMemo(() => {
    const fkByTable = new Map<string, Set<string>>();
    const refByTable = new Map<string, Set<string>>();
    for (const r of graph.relations) {
      fkByTable.set(r.from, (fkByTable.get(r.from) || new Set()).add(r.fromColumn));
      refByTable.set(r.to, (refByTable.get(r.to) || new Set()).add(r.toColumn));
    }
    const visibleDeg = new Map<string, number>();
    for (const r of graph.relations) {
      visibleDeg.set(r.from, (visibleDeg.get(r.from) || 0) + 1);
      if (r.to !== r.from) visibleDeg.set(r.to, (visibleDeg.get(r.to) || 0) + 1);
    }
    const nodes: Node<TableNodeData>[] = graph.tables.map((t) => {
      const fk = fkByTable.get(t.name) || new Set<string>();
      return {
        id: t.name,
        type: 'table',
        position: { x: 0, y: 0 },
        width: NODE_W,
        height: nodeHeight(t, density, fk),
        data: {
          table: t, density, fkCols: fk, refCols: refByTable.get(t.name) || new Set(), highlight: 'none',
          hiddenRels: Math.max(0, (graph.degree.get(t.name) || 0) - (visibleDeg.get(t.name) || 0)),
          onFocus: focusOn, onOpen: onOpenTable
        }
      };
    });
    const edges: Edge[] = graph.relations.map((r, i) => ({
      id: `${r.from}.${r.fromColumn}->${r.to}.${r.toColumn}#${i}`,
      source: r.from,
      target: r.to,
      sourceHandle: dir === 'TB' ? 'b' : undefined,
      targetHandle: dir === 'TB' ? 't' : undefined,
      type: 'smoothstep',
      label: `${r.fromColumn} → ${r.toColumn}`,
      data: { inferred: !!r.inferred },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: r.inferred ? '#f59e0b' : 'var(--accent-brand)' },
      className: r.inferred ? 'er-edge er-edge-inferred' : 'er-edge'
    }));
    // dagre wants the referenced (parent) table first, so arrows read child -> parent left to right.
    const laid = layout(nodes, edges.map((e) => ({ ...e, source: e.target, target: e.source })), dir);
    return { layoutNodes: laid, layoutEdges: edges };
  }, [graph, density, dir, focusOn, onOpenTable]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>(layoutNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(layoutEdges);

  useEffect(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
    needsFit.current = true;
  }, [layoutNodes, layoutEdges]);

  // Fit only once React Flow has measured the new nodes; otherwise fitView works on zero-size boxes.
  const initialized = useNodesInitialized();
  const needsFit = React.useRef(true);
  useEffect(() => {
    if (!initialized || !needsFit.current || !layoutNodes.length) return;
    needsFit.current = false;
    const all = { padding: 0.15, maxZoom: 1.1 };
    // Small graph or focused view: show everything. Big graph: start on the most connected table and its
    // neighbours at a readable zoom; "lihat semua" and the minimap give the overview.
    if (layoutNodes.length <= 14 || filter.focus) {
      rf.fitView({ ...all, duration: 350, minZoom: filter.focus ? 0.55 : undefined });
      return;
    }
    const hub = [...layoutNodes].sort((a, b) => (graph.degree.get(b.id) || 0) - (graph.degree.get(a.id) || 0))[0];
    const around = new Set([hub.id, ...layoutEdges.filter((e) => e.source === hub.id || e.target === hub.id).flatMap((e) => [e.source, e.target])]);
    rf.fitView({ nodes: [...around].map((id) => ({ id })), padding: 0.25, duration: 450, minZoom: 0.5, maxZoom: 1 });
  }, [initialized, layoutNodes]);

  // Hover/focus highlight: neighbours stay bright, the rest dims. Done on the live nodes so dragged
  // positions are kept.
  const activeId = hoverId || filter.focus;
  useEffect(() => {
    const near = new Set<string>();
    if (activeId) {
      near.add(activeId);
      for (const e of layoutEdges) {
        if (e.source === activeId) near.add(e.target);
        if (e.target === activeId) near.add(e.source);
      }
    }
    setNodes((ns) => ns.map((n) => {
      const h: TableNodeData['highlight'] = !activeId ? 'none' : n.id === activeId ? 'focus' : near.has(n.id) ? 'near' : 'dim';
      return n.data.highlight === h ? n : { ...n, data: { ...n.data, highlight: h } };
    }));
    setEdges((es) => es.map((e) => {
      const on = !activeId || e.source === activeId || e.target === activeId;
      const cls = `er-edge${(e.data as any)?.inferred ? ' er-edge-inferred' : ''}${activeId ? (on ? ' er-edge-active' : ' er-edge-dim') : ''}`;
      return e.className === cls ? e : { ...e, className: cls, animated: !!activeId && on, labelStyle: undefined };
    }));
  }, [activeId, layoutEdges]);

  const exportSvg = () => {
    const el = document.querySelector('.er-flow .react-flow__viewport') as HTMLElement | null;
    if (!el) return;
    // Serialise the current viewport as an SVG with a foreignObject; good enough for docs/screenshots.
    const b = el.getBoundingClientRect();
    const html = new XMLSerializer().serializeToString(el);
    const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="background:${getComputedStyle(document.body).backgroundColor}"><style>${css}</style>${html}</div></foreignObject></svg>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    a.download = `${storageKey.split(':').pop() || 'schema'}-erd.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const declared = graph.relations.filter((r) => !r.inferred).length;
  const inferred = graph.relations.length - declared;
  const allTables = schema.tables.filter((t) => filter.showViews || t.type === 'table');

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <div className="flex-1 min-w-[12rem] max-w-sm h-7 px-2 flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--muted-foreground)]">
          <Search className="w-3 h-3 text-[var(--muted-foreground)]" />
          <input value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
            placeholder={t('erd.filterPlaceholder')} aria-label={t('erd.filterTables')} className="flex-1 min-w-0 bg-transparent text-[11px] font-mono" />
          {filter.search && <button onClick={() => setFilter((f) => ({ ...f, search: '' }))} aria-label={t('erd.clearFilter')}><X className="w-3 h-3" /></button>}
        </div>

        {filter.focus && (
          <div className="h-7 pl-2 pr-1 flex items-center gap-1.5 rounded-md bg-[var(--accent-brand)]/12 text-[11px] border border-[var(--accent-brand)]/30 fade-in">
            <Focus className="w-3 h-3 text-[var(--accent-brand)]" />
            <span className="font-mono font-semibold">{filter.focus}</span>
            <span className="text-[var(--muted-foreground)]">{t('erd.depth')}</span>
            <button onClick={() => setFilter((f) => ({ ...f, depth: Math.max(0, f.depth - 1) }))} className="p-0.5 rounded hover:bg-[var(--sidebar-hover)]" aria-label={t('erd.depthDec')}><Minus className="w-3 h-3" /></button>
            <span className="font-mono w-3 text-center">{filter.depth}</span>
            <button onClick={() => setFilter((f) => ({ ...f, depth: Math.min(6, f.depth + 1) }))} className="p-0.5 rounded hover:bg-[var(--sidebar-hover)]" aria-label={t('erd.depthInc')}><Plus className="w-3 h-3" /></button>
            <button onClick={() => setFilter((f) => ({ ...f, focus: null }))} className="p-0.5 rounded hover:bg-[var(--sidebar-hover)]" aria-label={t('erd.clearFocus')}><X className="w-3 h-3" /></button>
          </div>
        )}

        <Seg value={density} onChange={setDensity} label={t('erd.columnDetails')}
          options={[['full', t('common.all'), Rows3], ['keys', t('erd.densityKeys'), KeyRound], ['name', t('erd.densityName'), Table2]]} />
        <Seg value={dir} onChange={setDir} label={t('erd.layoutDir')}
          options={[['LR', t('erd.dirLR'), Columns3], ['TB', t('erd.dirTB'), Rows3]]} />

        <Toggle on={filter.showInferred} onClick={() => setFilter((f) => ({ ...f, showInferred: !f.showInferred }))} icon={Sparkles} label={t('erd.inferred')} title={t('erd.inferredHint')} />
        <Toggle on={filter.showViews} onClick={() => setFilter((f) => ({ ...f, showViews: !f.showViews }))} icon={Eye} label={t('erd.views')} />
        <Toggle on={filter.hideIsolated} onClick={() => setFilter((f) => ({ ...f, hideIsolated: !f.hideIsolated }))} icon={EyeOff} label={t('erd.hideIsolated')} />

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setShowList((v) => !v)} aria-expanded={showList}
            className={`h-7 px-2 rounded-md text-[11px] flex items-center gap-1 hover:bg-[var(--sidebar-hover)] ${showList ? 'text-[var(--foreground)] bg-[var(--sidebar-active)]' : 'text-[var(--muted-foreground)]'}`}>
            <LayoutGrid className="w-3.5 h-3.5" /> {t('erd.tablesCount', { shown: graph.tables.length, total: allTables.length })}
          </button>
          <button onClick={exportSvg} className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]" title={t('erd.exportSvg')}>
            <Download className="w-3.5 h-3.5" /> SVG
          </button>
          <button onClick={onRefresh} className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--sidebar-hover)]" aria-label={t('erd.reloadSchema')} title={t('erd.reloadSchema')}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="relative flex-1 min-w-0 er-flow">
          {graph.tables.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
              {t('erd.noMatch')}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeMouseEnter={(_, n) => setHoverId(n.id)}
              onNodeMouseLeave={() => setHoverId(null)}
              onNodeClick={(_, n) => focusOn(n.id)}
              onPaneClick={() => setFilter((f) => (f.focus ? { ...f, focus: null } : f))}
              nodesConnectable={false}
              edgesFocusable={false}
              elementsSelectable
              minZoom={0.08}
              maxZoom={2}
              fitView
              proOptions={{ hideAttribution: true }}
              colorMode={document.documentElement.classList.contains('light') ? 'light' : 'dark'}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={2}
                nodeColor={(n) => ((n.data as TableNodeData).table.type === 'view' ? '#a78bfa' : (n.data as TableNodeData).highlight === 'focus' ? '#38bdf8' : '#71717a')} />
              <Panel position="top-left">
                <div className="px-2.5 py-1.5 rounded-md bg-[var(--card)]/90 backdrop-blur border border-[var(--border)] text-[11px] text-[var(--muted-foreground)] shadow-sm flex items-center gap-3">
                  <span><b className="text-[var(--foreground)]">{graph.tables.length}</b> {t('erd.tablesLabel')}</span>
                  <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-[var(--accent-brand)]" /> <b className="text-[var(--foreground)]">{declared}</b> FK</span>
                  {filter.showInferred && <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-amber-500" /> <b className="text-[var(--foreground)]">{inferred}</b> {t('erd.inferredLabel')}</span>}
                  <button onClick={() => rf.fitView({ padding: 0.12, duration: 400 })} className="underline hover:text-[var(--foreground)]">{t('erd.fitAll')}</button>
                  <span className="hidden lg:inline">{t('erd.hint')}</span>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {/* Table picker: check/uncheck tables, focus one */}
        {showList && (
          <aside className="w-64 shrink-0 border-l border-[var(--border)] bg-[var(--sidebar-bg)] flex flex-col fade-in" aria-label={t('erd.pickTables')}>
            <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-[var(--border)] text-[11px]">
              <span className="font-semibold flex-1">{t('erd.showTables')}</span>
              <button onClick={() => setFilter((f) => ({ ...f, hidden: new Set() }))} className="underline text-[var(--muted-foreground)]">{t('common.all')}</button>
              <button onClick={() => setFilter((f) => ({ ...f, hidden: new Set(allTables.map((x) => x.name)) }))} className="underline text-[var(--muted-foreground)]">{t('erd.clearAll')}</button>
            </div>
            <ul className="flex-1 overflow-auto py-1 text-[12px] sidebar-scroll">
              {allTables.map((tb) => {
                const hidden = filter.hidden.has(tb.name);
                const deg = graph.degree.get(tb.name) || 0;
                return (
                  <li key={tb.name} className={`group flex items-center gap-2 px-3 h-7 hover:bg-[var(--sidebar-hover)] ${filter.focus === tb.name ? 'bg-[var(--sidebar-active)]' : ''}`}>
                    <input type="checkbox" checked={!hidden} aria-label={t('erd.showTable', { name: tb.name })}
                      onChange={() => setFilter((f) => { const h = new Set(f.hidden); hidden ? h.delete(tb.name) : h.add(tb.name); return { ...f, hidden: h }; })} />
                    <span className={`flex-1 truncate font-mono ${hidden ? 'text-[var(--muted-foreground)] line-through' : ''}`} title={tb.name}>{tb.name}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums" title={t('erd.relCount')}>{deg || ''}</span>
                    <button onClick={() => focusOn(tb.name)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded hover:bg-[var(--sidebar-active)]" aria-label={t('erd.focusOn', { name: tb.name })} title={t('erd.focusThis')}>
                      <Focus className="w-3 h-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string, React.ElementType][]; label: string }) {
  return (
    <div className="flex rounded-md bg-[var(--muted)] p-0.5" role="group" aria-label={label}>
      {options.map(([v, text, Icon]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} title={text}
          className={`h-6 px-2 rounded text-[11px] flex items-center gap-1 transition-all ${value === v ? 'bg-[var(--card)] shadow-sm font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
          <Icon className="w-3 h-3" /><span className="hidden xl:inline">{text}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick, icon: Icon, label, title }: { on: boolean; onClick: () => void; icon: React.ElementType; label: string; title?: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} title={title || label}
      className={`h-7 px-2 rounded-md text-[11px] flex items-center gap-1 border transition-colors ${on ? 'border-[var(--accent-brand)]/40 bg-[var(--accent-brand)]/10 text-[var(--foreground)]' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
      <Icon className="w-3 h-3" /><span className="hidden 2xl:inline">{label}</span>
    </button>
  );
}

export default function ErDiagram(props: ErDiagramProps) {
  return (
    <ReactFlowProvider>
      <ErCanvas {...props} />
    </ReactFlowProvider>
  );
}
