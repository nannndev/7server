import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, Check, X } from 'lucide-react';
import { ResultSet } from '@/features/databases/api';
import { useT } from '@/shared/i18n';

interface DataGridProps {
  rs: ResultSet;
  /** Row number offset (for paged data) */
  offset?: number;
  sort?: { column: string; dir: 'asc' | 'desc' } | null;
  onSort?: (column: string) => void;
  /** Column header metadata, e.g. PK marker */
  columnHint?: (name: string) => string | undefined;
  loading?: boolean;
}

const isNumeric = (v: string | null) => v !== null && v !== '' && /^-?\d+(\.\d+)?$/.test(v);

/**
 * Spreadsheet-style read-only grid: sticky header + row numbers, click a cell to select it,
 * selected cell's full value shows in the inspector bar; Cmd/Ctrl+C copies it.
 */
export default function DataGrid({ rs, offset = 0, sort, onSort, columnHint, loading }: DataGridProps) {
  const t = useT();
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSel(null), [rs]);

  // Numeric-looking columns are right-aligned, like a spreadsheet.
  const numericCol = useMemo(
    () => rs.columns.map((_, c) => rs.rows.length > 0 && rs.rows.slice(0, 50).every((r) => r[c] === null || isNumeric(r[c]))),
    [rs]
  );

  const selValue = sel ? rs.rows[sel.r]?.[sel.c] : undefined;

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!sel) return;
    const mv = (r: number, c: number) => {
      e.preventDefault();
      const nr = Math.max(0, Math.min(rs.rows.length - 1, r));
      const nc = Math.max(0, Math.min(rs.columns.length - 1, c));
      setSel({ r: nr, c: nc });
      wrapRef.current?.querySelector<HTMLElement>(`[data-cell="${nr}:${nc}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    if (e.key === 'ArrowDown') mv(sel.r + 1, sel.c);
    else if (e.key === 'ArrowUp') mv(sel.r - 1, sel.c);
    else if (e.key === 'ArrowRight' || e.key === 'Tab') mv(sel.r, sel.c + 1);
    else if (e.key === 'ArrowLeft') mv(sel.r, sel.c - 1);
    else if (e.key === 'Escape') setSel(null);
    else if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selValue !== undefined) { e.preventDefault(); copy(selValue ?? 'NULL'); }
  };

  if (!rs.columns.length) {
    return <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted-foreground)]">{t('db.noColumns')}</div>;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKey}
        className={`relative flex-1 min-h-0 overflow-auto outline-none transition-opacity ${loading ? 'opacity-50' : ''}`}
        aria-label={t('db.dataGrid')}
        role="grid"
        aria-rowcount={rs.rows.length}
      >
        <table className="text-[12px] font-mono border-separate border-spacing-0 min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 w-12 min-w-12 px-2 h-8 bg-[var(--muted)] border-b border-r border-[var(--border)] text-[10px] text-[var(--muted-foreground)] font-normal text-right">#</th>
              {rs.columns.map((col, c) => {
                const active = sort?.column === col;
                const hint = columnHint?.(col);
                return (
                  <th key={c} className="h-8 bg-[var(--muted)] border-b border-r border-[var(--border)] text-left font-semibold whitespace-nowrap p-0" aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button
                      disabled={!onSort}
                      onClick={() => onSort?.(col)}
                      className="w-full h-8 px-3 flex items-center gap-1.5 hover:bg-[var(--sidebar-hover)] disabled:hover:bg-transparent disabled:cursor-default transition-colors group"
                    >
                      {hint && <span className="text-[9px] font-bold text-amber-500" title={hint}>{hint === 'PRI' ? 'PK' : hint === 'UNI' ? 'UQ' : hint === 'MUL' ? 'IX' : hint}</span>}
                      <span className={numericCol[c] ? 'ml-auto' : ''}>{col}</span>
                      {onSort && (
                        <span className={`shrink-0 ${active ? 'text-[var(--accent-brand)]' : 'opacity-0 group-hover:opacity-40'} transition-opacity`}>
                          {active ? (sort!.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3" />}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rs.rows.map((row, r) => (
              <tr key={r} className="group/row">
                <td className="sticky left-0 z-[1] px-2 h-7 bg-[var(--card)] border-b border-r border-[var(--border)] text-[10px] text-[var(--muted-foreground)] text-right group-hover/row:bg-[var(--sidebar-hover)]">
                  {offset + r + 1}
                </td>
                {row.map((v, c) => {
                  const isSel = sel?.r === r && sel?.c === c;
                  return (
                    <td
                      key={c}
                      data-cell={`${r}:${c}`}
                      onClick={() => setSel({ r, c })}
                      onDoubleClick={() => copy(v ?? 'NULL')}
                      className={`h-7 px-3 border-b border-r border-[var(--border)] max-w-[22rem] truncate cursor-default
                        ${numericCol[c] ? 'text-right tabular-nums' : ''}
                        ${isSel ? 'bg-[var(--accent-brand)]/15 outline outline-1 -outline-offset-1 outline-[var(--accent-brand)]' : 'group-hover/row:bg-[var(--sidebar-hover)]'}`}
                      title={v && v.length > 40 ? v : undefined}
                    >
                      {v === null ? <span className="text-[var(--muted-foreground)] italic text-[11px]">NULL</span> : v === '' ? <span className="text-[var(--muted-foreground)]/60">''</span> : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rs.rows.length === 0 && !loading && (
          <div className="py-12 text-center text-xs text-[var(--muted-foreground)] font-sans">0 {t('db.rowsLabel')}</div>
        )}
      </div>

      {/* Cell inspector */}
      {sel && (
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--muted)]/50 px-3 py-1.5 flex items-start gap-2 text-[11px] fade-in">
          <span className="shrink-0 font-semibold font-mono text-[var(--muted-foreground)] pt-0.5">{rs.columns[sel.c]}</span>
          <pre className="flex-1 min-w-0 max-h-28 overflow-auto whitespace-pre-wrap break-all font-mono">{selValue === null ? 'NULL' : selValue}</pre>
          <button onClick={() => copy(selValue ?? 'NULL')} className="shrink-0 p-1 rounded hover:bg-[var(--sidebar-hover)]" aria-label={t('db.copyValue')} title={t('db.copyShortcut')}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setSel(null)} className="shrink-0 p-1 rounded hover:bg-[var(--sidebar-hover)]" aria-label={t('db.closeInspector')}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}

/** CSV / JSON export of what the grid currently holds. */
export function downloadResult(rs: ResultSet, name: string, format: 'csv' | 'json') {
  let body: string;
  if (format === 'json') {
    body = JSON.stringify(rs.rows.map((r) => Object.fromEntries(rs.columns.map((c, i) => [c, r[i]]))), null, 2);
  } else {
    const esc = (v: string | null) => (v === null ? '' : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    body = [rs.columns.map(esc).join(','), ...rs.rows.map((r) => r.map(esc).join(','))].join('\n');
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/csv' }));
  a.download = `${name.replace(/[^A-Za-z0-9_.-]+/g, '_')}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}
