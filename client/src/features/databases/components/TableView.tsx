import React, { useEffect, useState } from 'react';
import { RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, Download, Table2, Columns3, FileCode2, Copy, Check, KeyRound } from 'lucide-react';
import { browseDb, fetchDbStructure, BrowseResult, ObjectStructure, DbConnection, DbEngine } from '@/features/databases/api';
import { cacheGet, cacheSet } from '@/shared/lib/cache';
import DataGrid, { downloadResult } from '@/features/databases/components/DataGrid';

const PAGE_SIZES = [50, 100, 250, 500, 1000];
type Sub = 'data' | 'structure' | 'ddl';

interface TableViewProps {
  conn: DbConnection;
  engine: DbEngine;
  database?: string;
  object: string;
  objectType: string;
  onOpenQuery: (sql: string) => void;
}

export default function TableView({ conn, engine, database, object, objectType, onOpenQuery }: TableViewProps) {
  const base = `${conn.id}:${database || ''}:${object}`;
  const [sub, setSub] = useState<Sub>('data');
  const [limit, setLimit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<{ column: string; dir: 'asc' | 'desc' } | null>(null);
  const [whereInput, setWhereInput] = useState('');
  const [where, setWhere] = useState('');
  const [data, setData] = useState<BrowseResult | null>(() => cacheGet<BrowseResult>(`browse:${base}:0:100::`) ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [structure, setStructure] = useState<ObjectStructure | null>(() => cacheGet<ObjectStructure>(`struct:${base}`) ?? null);
  const [structError, setStructError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const isSql = engine.kind === 'sql';

  const load = async () => {
    const key = `browse:${base}:${offset}:${limit}:${sort ? `${sort.column}:${sort.dir}` : ''}:${where}`;
    const hit = cacheGet<BrowseResult>(key);
    if (hit) setData(hit);
    setLoading(true);
    try {
      const d = await browseDb(conn.id, { object, database, limit, offset, orderBy: sort?.column, dir: sort?.dir, where: where || undefined });
      cacheSet(key, d);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [object, database, offset, limit, sort?.column, sort?.dir, where]);

  // Structure is needed for PK markers in the grid header too, so fetch it once per object.
  useEffect(() => {
    if (!isSql || cacheGet(`struct:${base}`)) return;
    fetchDbStructure(conn.id, object, database)
      .then((s) => { cacheSet(`struct:${base}`, s); setStructure(s); setStructError(null); })
      .catch((e) => setStructError(e.message));
  }, [object, database]);

  const toggleSort = (column: string) => {
    setOffset(0);
    setSort((s) => (s?.column !== column ? { column, dir: 'asc' } : s.dir === 'asc' ? { column, dir: 'desc' } : null));
  };

  const applyFilter = (e?: React.FormEvent) => {
    e?.preventDefault();
    setOffset(0);
    setWhere(whereInput.trim());
  };

  const total = data?.total ?? null;
  const rowsShown = data?.rows.length ?? 0;
  const lastOffset = total != null ? Math.max(0, Math.floor((total - 1) / limit) * limit) : null;
  const canNext = total != null ? offset + limit < total : rowsShown === limit;
  const keyOf = (col: string) => structure?.columns.find((c) => c.name === col)?.key;

  const subTabs: [Sub, string, React.ElementType][] = [
    ['data', 'Data', Table2],
    ...(isSql ? ([['structure', 'Struktur', Columns3], ['ddl', 'DDL', FileCode2]] as [Sub, string, React.ElementType][]) : [])
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <div className="flex rounded-md bg-[var(--muted)] p-0.5" role="tablist">
          {subTabs.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
              className={`h-6 px-2.5 rounded text-[11px] flex items-center gap-1.5 transition-all ${sub === k ? 'bg-[var(--card)] shadow-sm font-medium' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>
              <Icon className="w-3 h-3" /> {label}
            </button>
          ))}
        </div>

        {sub === 'data' && isSql && (
          <form onSubmit={applyFilter} className="flex-1 min-w-[14rem] flex items-center gap-1.5 h-7 px-2 rounded-md border border-[var(--border)] bg-[var(--background)] focus-within:border-[var(--muted-foreground)] transition-colors">
            <Filter className="w-3 h-3 text-[var(--muted-foreground)] shrink-0" />
            <span className="text-[11px] font-mono text-[var(--muted-foreground)] shrink-0">WHERE</span>
            <input value={whereInput} onChange={(e) => setWhereInput(e.target.value)} placeholder="status = 'active' AND id > 100"
              className="flex-1 min-w-0 bg-transparent text-[11px] font-mono" aria-label="Filter WHERE" />
            {where && (
              <button type="button" onClick={() => { setWhereInput(''); setWhere(''); setOffset(0); }} className="text-[10px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">reset</button>
            )}
          </form>
        )}
        {sub !== 'data' && <div className="flex-1" />}

        <div className="flex items-center gap-1 ml-auto">
          {sub === 'data' && data && (
            <>
              <button onClick={() => onOpenQuery(data.sql || `SELECT * FROM ${object} LIMIT 100`)} title="Buka sebagai query"
                className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]">
                <FileCode2 className="w-3.5 h-3.5" /> SQL
              </button>
              <ExportMenu onPick={(f) => downloadResult(data, `${object}-${offset}`, f)} />
            </>
          )}
          <button onClick={() => (sub === 'data' ? load() : (cacheSet(`struct:${base}`, undefined), fetchDbStructure(conn.id, object, database).then(setStructure).catch((e) => setStructError(e.message))))}
            className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--sidebar-hover)]" aria-label="Refresh" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      {sub === 'data' && (
        <>
          {error && <div role="alert" className="shrink-0 px-3 py-2 text-[11px] font-mono text-red-500 bg-red-500/10 border-b border-red-500/20 whitespace-pre-wrap">{error}</div>}
          {data ? (
            <DataGrid rs={data} offset={offset} sort={isSql ? sort : null} onSort={isSql ? toggleSort : undefined} columnHint={keyOf} loading={loading} />
          ) : (
            <GridSkeleton />
          )}
          {/* Status / pagination bar */}
          <div className="shrink-0 h-9 border-t border-[var(--border)] px-3 flex items-center gap-3 text-[11px] text-[var(--muted-foreground)]">
            <span className="font-mono">
              {rowsShown ? `${offset + 1}–${offset + rowsShown}` : '0'}
              {total != null && <> dari <b className="text-[var(--foreground)]">{total.toLocaleString()}</b></>} baris
            </span>
            {data?.ms != null && <span className="font-mono">· {data.ms} ms</span>}
            {where && <span className="text-[var(--accent-brand)]">· difilter</span>}
            <div className="ml-auto flex items-center gap-1">
              <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }} aria-label="Baris per halaman"
                className="h-6 bg-transparent border border-[var(--border)] rounded px-1 text-[11px]">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / hal</option>)}
              </select>
              {[
                { label: 'Halaman pertama', icon: ChevronsLeft, on: () => setOffset(0), dis: offset === 0 },
                { label: 'Sebelumnya', icon: ChevronLeft, on: () => setOffset(Math.max(0, offset - limit)), dis: offset === 0 },
                { label: 'Berikutnya', icon: ChevronRight, on: () => setOffset(offset + limit), dis: !canNext },
                { label: 'Halaman terakhir', icon: ChevronsRight, on: () => lastOffset != null && setOffset(lastOffset), dis: lastOffset == null || offset >= lastOffset }
              ].map(({ label, icon: Icon, on, dis }) => (
                <button key={label} onClick={on} disabled={dis || loading} aria-label={label} title={label}
                  className="h-6 w-6 rounded flex items-center justify-center hover:bg-[var(--sidebar-hover)] disabled:opacity-30 disabled:hover:bg-transparent">
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {sub === 'structure' && (
        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-5 fade-in">
          {structError && <p role="alert" className="text-[11px] font-mono text-red-500">{structError}</p>}
          {!structure && !structError && <GridSkeleton />}
          {structure && (
            <>
              <section>
                <h4 className="text-xs font-semibold mb-2">Kolom <span className="font-normal text-[var(--muted-foreground)]">({structure.columns.length})</span></h4>
                <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead className="bg-[var(--muted)] text-[var(--muted-foreground)] text-left text-[11px]">
                      <tr>{['Kolom', 'Tipe', 'Null', 'Default', 'Extra'].map((h) => <th key={h} className="px-3 py-1.5 font-medium">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] font-mono">
                      {structure.columns.map((c) => (
                        <tr key={c.name} className="hover:bg-[var(--sidebar-hover)]">
                          <td className="px-3 py-1.5 font-semibold flex items-center gap-1.5">
                            {c.key === 'PRI' && <KeyRound className="w-3 h-3 text-amber-500" aria-label="primary key" />}
                            {c.name}
                            {c.key && c.key !== 'PRI' && <span className="text-[9px] px-1 rounded bg-[var(--muted)] text-[var(--muted-foreground)] font-sans">{c.key}</span>}
                          </td>
                          <td className="px-3 py-1.5 text-sky-600 dark:text-sky-400">{c.type}</td>
                          <td className="px-3 py-1.5 text-[var(--muted-foreground)]">{c.nullable ? 'YES' : 'NO'}</td>
                          <td className="px-3 py-1.5 text-[var(--muted-foreground)] max-w-[14rem] truncate">{c.default ?? <i className="opacity-60">NULL</i>}</td>
                          <td className="px-3 py-1.5 text-[var(--muted-foreground)]">{c.extra || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h4 className="text-xs font-semibold mb-2">Index <span className="font-normal text-[var(--muted-foreground)]">({structure.indexes.length})</span></h4>
                {structure.indexes.length === 0 ? <p className="text-xs text-[var(--muted-foreground)]">Tidak ada index.</p> : (
                  <div className="grid sm:grid-cols-2 gap-2">
                    {structure.indexes.map((i) => (
                      <div key={i.name} className="px-3 py-2 rounded-lg border border-[var(--border)] text-[12px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-semibold truncate">{i.name}</span>
                          {i.unique && <span className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-600">UNIQUE</span>}
                        </div>
                        <div className="font-mono text-[11px] text-[var(--muted-foreground)] truncate" title={i.columns}>{i.columns}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}

      {sub === 'ddl' && (
        <div className="flex-1 min-h-0 overflow-auto p-4 fade-in">
          {structure?.ddl ? (
            <div className="relative">
              <button onClick={() => { navigator.clipboard.writeText(structure.ddl!); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                className="absolute right-2 top-2 h-7 px-2 rounded-md text-[11px] flex items-center gap-1 bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--sidebar-hover)]">
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} Salin
              </button>
              <pre className="p-4 rounded-lg bg-[var(--muted)] border border-[var(--border)] text-[12px] font-mono whitespace-pre-wrap leading-relaxed">{structure.ddl}</pre>
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">{structError || (structure ? 'DDL tidak tersedia untuk engine ini.' : 'Memuat…')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function ExportMenu({ onPick }: { onPick: (f: 'csv' | 'json') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Export halaman ini"
        className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]">
        <Download className="w-3.5 h-3.5" /> Export
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="pop-in absolute right-0 mt-1 z-40 w-36 py-1 rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-xl text-xs">
            {(['csv', 'json'] as const).map((f) => (
              <button key={f} onClick={() => { onPick(f); setOpen(false); }} className="w-full text-left px-3 py-1.5 hover:bg-[var(--sidebar-hover)]">
                {f.toUpperCase()} <span className="text-[var(--muted-foreground)]">(halaman ini)</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="flex-1 p-3 space-y-1.5" aria-hidden>
      <div className="h-7 rounded bg-[var(--muted)] animate-pulse" />
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="h-6 rounded bg-[var(--muted)]/60 animate-pulse" style={{ animationDelay: `${i * 60}ms`, width: `${100 - (i % 3) * 4}%` }} />
      ))}
    </div>
  );
}
