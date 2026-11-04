import React, { useMemo, useState } from 'react';
import { Table2, Eye, Link2, HardDrive, Rows3, Sparkles, KeyRound, ArrowDown, ArrowUp, AlertTriangle, Network, Database } from 'lucide-react';
import type { DbSchema, DbConnection, DbEngine } from '@/features/databases/api';
import { tableStats, fmtBytes, fmtNum } from '@/features/databases/lib/erGraph';

type SortKey = 'name' | 'rows' | 'totalBytes' | 'dataBytes' | 'indexBytes' | 'columns' | 'inbound' | 'outbound';

interface Props {
  schema: DbSchema;
  conn: DbConnection;
  engine: DbEngine;
  database?: string;
  onOpenTable: (name: string) => void;
  onShowDiagram: (focus?: string) => void;
}

export default function DbProperties({ schema, conn, engine, database, onOpenTable, onShowDiagram }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'totalBytes', dir: 'desc' });
  const [q, setQ] = useState('');
  const stats = useMemo(() => tableStats(schema), [schema]);

  const tables = stats.filter((t) => t.type === 'table');
  const views = stats.filter((t) => t.type === 'view');
  const totalRows = tables.reduce((a, t) => a + (t.rows || 0), 0);
  const dataBytes = tables.reduce((a, t) => a + (t.dataBytes || 0), 0);
  const indexBytes = tables.reduce((a, t) => a + (t.indexBytes || 0), 0);
  const columns = stats.reduce((a, t) => a + t.columns.length, 0);
  const declared = schema.relations.filter((r) => !r.inferred).length;
  const inferred = schema.relations.length - declared;
  const noPk = tables.filter((t) => !t.hasPk);
  const isolated = tables.filter((t) => t.inbound + t.outbound === 0);
  const hasSizes = tables.some((t) => t.dataBytes != null);
  const totalSize = schema.meta.sizeBytes ?? (hasSizes ? dataBytes + indexBytes : null);

  const top = [...tables].filter((t) => (t.totalBytes || 0) > 0).sort((a, b) => (b.totalBytes || 0) - (a.totalBytes || 0)).slice(0, 8);
  const topMax = top[0]?.totalBytes || 1;
  const engines = Object.entries(tables.reduce<Record<string, number>>((m, t) => { if (t.engine) m[t.engine] = (m[t.engine] || 0) + 1; return m; }, {}));

  const rows = useMemo(() => {
    const val = (t: (typeof stats)[number]) => (sort.key === 'columns' ? t.columns.length : sort.key === 'name' ? t.name : (t[sort.key] as number | null) ?? -1);
    return stats
      .filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
        return sort.dir === 'asc' ? c : -c;
      });
  }, [stats, sort, q]);

  const head = (key: SortKey, label: string, right = true) => (
    <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`} aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
        className={`inline-flex items-center gap-1 hover:text-[var(--foreground)] ${sort.key === key ? 'text-[var(--foreground)]' : ''}`}>
        {label}
        {sort.key === key && (sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const kpis: { label: string; value: string; sub?: string; icon: React.ElementType }[] = [
    { label: 'Ukuran total', value: fmtBytes(totalSize), sub: hasSizes ? `data ${fmtBytes(dataBytes)} · index ${fmtBytes(indexBytes)}` : undefined, icon: HardDrive },
    { label: 'Tabel', value: fmtNum(tables.length), sub: views.length ? `+ ${views.length} view` : undefined, icon: Table2 },
    { label: 'Baris (perkiraan)', value: totalRows ? fmtNum(totalRows) : '–', sub: tables.length ? `${fmtNum(columns)} kolom` : undefined, icon: Rows3 },
    { label: 'Relasi', value: fmtNum(declared + inferred), sub: `${declared} FK · ${inferred} tebakan`, icon: Link2 }
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-6xl mx-auto p-5 space-y-6 page-enter">
        {/* Header */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2"><Database className="w-5 h-5 text-amber-500" />{database || conn.name}</h2>
            <p className="text-xs text-[var(--muted-foreground)] font-mono mt-0.5">
              {[engine.label, schema.meta.version && `v${schema.meta.version}`, schema.meta.charset, schema.meta.collation].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={() => onShowDiagram()} className="h-8 px-3 rounded-md bg-[var(--accent-brand)] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-[0.98] transition">
            <Network className="w-3.5 h-3.5" /> Lihat diagram relasi
          </button>
        </div>

        {/* KPIs */}
        <div className="stagger grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]"><span>{k.label}</span><k.icon className="w-3.5 h-3.5" /></div>
              <div className="mt-1 text-2xl font-bold tracking-tight font-mono">{k.value}</div>
              {k.sub && <div className="mt-0.5 text-[11px] text-[var(--muted-foreground)] font-mono truncate">{k.sub}</div>}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.4fr,1fr] gap-4">
          {/* Largest tables */}
          <section className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <h3 className="text-xs font-semibold mb-3">Tabel terbesar</h3>
            {top.length === 0 ? <p className="text-xs text-[var(--muted-foreground)]">Ukuran per tabel tidak tersedia untuk engine ini.</p> : (
              <ul className="space-y-2">
                {top.map((t) => {
                  const dPct = ((t.dataBytes || 0) / topMax) * 100;
                  const iPct = ((t.indexBytes || 0) / topMax) * 100;
                  return (
                    <li key={t.name}>
                      <button onClick={() => onOpenTable(t.name)} className="w-full text-left group">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-mono truncate group-hover:text-[var(--accent-brand)] transition-colors">{t.name}</span>
                          <span className="font-mono text-[11px] text-[var(--muted-foreground)] tabular-nums shrink-0 ml-2">{fmtBytes(t.totalBytes)} · {fmtNum(t.rows)} baris</span>
                        </div>
                        <div className="mt-1 h-1.5 flex rounded-full overflow-hidden" aria-hidden>
                          <span className="bg-[var(--accent-brand)] transition-[width] duration-500" style={{ width: `${dPct}%` }} />
                          <span className="bg-[var(--accent-brand)]/40 transition-[width] duration-500" style={{ width: `${iPct}%` }} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {top.length > 0 && (
              <div className="mt-3 flex gap-3 text-[10px] text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-[var(--accent-brand)]" /> data</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm bg-[var(--accent-brand)]/40" /> index</span>
              </div>
            )}
          </section>

          {/* Details + health */}
          <section className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] space-y-4">
            <div>
              <h3 className="text-xs font-semibold mb-2">Detail</h3>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[12px]">
                {([
                  ['Koneksi', conn.name],
                  ['Lokasi', conn.location.kind === 'container' ? `docker: ${conn.location.container}` : 'host'],
                  ['Charset', schema.meta.charset],
                  ['Collation', schema.meta.collation],
                  ...(engines.length ? [['Storage engine', engines.map(([e, n]) => `${e} (${n})`).join(', ')] as [string, string]] : []),
                  ...schema.meta.extra.map((e) => [e.label, e.value == null ? null : e.unit === 'bytes' ? fmtBytes(Number(e.value)) : String(e.value)] as [string, string | null])
                ] as [string, string | null | undefined][]).filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="text-[var(--muted-foreground)]">{k}</dt>
                    <dd className="font-mono truncate" title={v!}>{v}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>

            {(noPk.length > 0 || isolated.length > 0 || inferred > 0) && (
              <div className="pt-3 border-t border-[var(--border)] space-y-2">
                <h3 className="text-xs font-semibold">Catatan schema</h3>
                {noPk.length > 0 && (
                  <Note icon={AlertTriangle} tone="amber" title={`${noPk.length} tabel tanpa primary key`}>
                    {noPk.slice(0, 6).map((t) => <Chip key={t.name} onClick={() => onOpenTable(t.name)}>{t.name}</Chip>)}{noPk.length > 6 && <span>+{noPk.length - 6}</span>}
                  </Note>
                )}
                {inferred > 0 && (
                  <Note icon={Sparkles} tone="sky" title={`${inferred} relasi tanpa foreign key`}>
                    Ditebak dari nama kolom (mis. <code className="font-mono">user_id → users.id</code>). Database tidak menjaga integritasnya.
                  </Note>
                )}
                {isolated.length > 0 && (
                  <Note icon={Table2} tone="muted" title={`${isolated.length} tabel tanpa relasi`}>
                    {isolated.slice(0, 6).map((t) => <Chip key={t.name} onClick={() => onOpenTable(t.name)}>{t.name}</Chip>)}{isolated.length > 6 && <span>+{isolated.length - 6}</span>}
                  </Note>
                )}
              </div>
            )}
          </section>
        </div>

        {/* All tables */}
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)]">
            <h3 className="text-xs font-semibold flex-1">Semua objek <span className="font-normal text-[var(--muted-foreground)]">({stats.length})</span></h3>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…" aria-label="Cari tabel"
              className="h-7 w-48 px-2 rounded-md border border-[var(--border)] bg-[var(--background)] text-[11px]" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[var(--muted)] text-[11px] text-[var(--muted-foreground)]">
                <tr>
                  {head('name', 'Nama', false)}
                  {head('rows', 'Baris')}
                  {hasSizes && head('dataBytes', 'Data')}
                  {hasSizes && head('indexBytes', 'Index')}
                  {hasSizes && head('totalBytes', 'Total')}
                  {head('columns', 'Kolom')}
                  {head('outbound', 'FK keluar')}
                  {head('inbound', 'Dirujuk')}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono">
                {rows.map((t) => (
                  <tr key={t.name} className="group hover:bg-[var(--sidebar-hover)]">
                    <td className="px-3 py-1.5">
                      <button onClick={() => onOpenTable(t.name)} className="flex items-center gap-1.5 hover:text-[var(--accent-brand)] transition-colors">
                        {t.type === 'view' ? <Eye className="w-3.5 h-3.5 text-violet-500" /> : <Table2 className="w-3.5 h-3.5 text-sky-500" />}
                        <span className="truncate max-w-[18rem]">{t.name}</span>
                        {!t.hasPk && t.type === 'table' && <KeyRound className="w-3 h-3 text-amber-500/70" aria-label="tanpa primary key" />}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(t.rows)}</td>
                    {hasSizes && <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted-foreground)]">{fmtBytes(t.dataBytes)}</td>}
                    {hasSizes && <td className="px-3 py-1.5 text-right tabular-nums text-[var(--muted-foreground)]">{fmtBytes(t.indexBytes)}</td>}
                    {hasSizes && <td className="px-3 py-1.5 text-right tabular-nums">{fmtBytes(t.totalBytes)}</td>}
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.columns.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.outbound || ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.inbound || ''}</td>
                    <td className="px-3 py-1.5 text-right">
                      {(t.inbound + t.outbound > 0) && (
                        <button onClick={() => onShowDiagram(t.name)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-[var(--sidebar-active)]" aria-label={`Lihat relasi ${t.name}`} title="Lihat relasinya di diagram">
                          <Network className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-[var(--muted-foreground)] border-t border-[var(--border)] font-sans">
            Jumlah baris dan ukuran adalah statistik dari engine (bisa beda sedikit dari COUNT(*) sebenarnya).
            {schema.ms != null && <> Dibaca dalam {schema.ms} ms.</>}
          </p>
        </section>
      </div>
    </div>
  );
}

function Note({ icon: Icon, tone, title, children }: { icon: React.ElementType; tone: 'amber' | 'sky' | 'muted'; title: string; children: React.ReactNode }) {
  const color = tone === 'amber' ? 'text-amber-500' : tone === 'sky' ? 'text-sky-500' : 'text-[var(--muted-foreground)]';
  return (
    <div className="flex gap-2 text-[11px]">
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${color}`} />
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <div className="mt-0.5 text-[var(--muted-foreground)] flex flex-wrap gap-1 items-center">{children}</div>
      </div>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-1.5 rounded bg-[var(--muted)] border border-[var(--border)] font-mono text-[10px] hover:text-[var(--foreground)] hover:border-[var(--muted-foreground)] transition-colors">
      {children}
    </button>
  );
}
