import React, { useEffect, useRef, useState } from 'react';
import { Play, RefreshCw, Download, History, Trash2, ShieldCheck, ShieldAlert, WrapText } from 'lucide-react';
import { runDbQuery, QueryResult, DbConnection, DbEngine } from '@/features/databases/api';
import DataGrid, { downloadResult } from '@/features/databases/components/DataGrid';
import { confirmModal } from '@/shared/ui/confirm-dialog';
import { useT } from '@/shared/i18n';

const PLACEHOLDER: Record<string, string> = {
  sql: 'SELECT * FROM users\nWHERE created_at > NOW() - INTERVAL 7 DAY\nLIMIT 100;',
  redis: 'GET mykey\nHGETALL user:1\nSCAN 0 MATCH session:* COUNT 100',
  js: 'db.users.find({"active": true}, {"name": 1})'
};

const histKey = (cid: string) => `vps_hub_qhist:${cid}`;
const loadHist = (cid: string): string[] => {
  try { return JSON.parse(localStorage.getItem(histKey(cid)) || '[]'); } catch { return []; }
};

interface QueryViewProps {
  conn: DbConnection;
  engine: DbEngine;
  database?: string;
  text: string;
  onTextChange: (t: string) => void;
  /** Result survives tab switches (kept by the parent). */
  result: QueryResult | null;
  onResult: (r: QueryResult | null) => void;
}

export default function QueryView({ conn, engine, database, text, onTextChange, result, onResult }: QueryViewProps) {
  const t = useT();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [hist, setHist] = useState<string[]>(() => loadHist(conn.id));
  const [showHist, setShowHist] = useState(false);
  const [editorH, setEditorH] = useState(180);
  const [wrap, setWrap] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  // Run the selection if there is one, otherwise the whole editor (like DBeaver / DataGrip).
  const run = async () => {
    const ta = taRef.current;
    const sel = ta && ta.selectionStart !== ta.selectionEnd ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : text;
    if (!sel.trim()) return;
    if (conn.allowWrite && engine.kind !== 'keyvalue' && !/^\s*(select|show|explain|describe|desc|with|values|table|pragma)\b/i.test(sel)) {
      const ok = await confirmModal({
        title: t('db.writeQueryTitle'),
        message: t('db.writeQueryMsg'),
        variant: 'warning',
        confirmText: t('db.runQuery')
      });
      if (!ok) return;
    }
    setRunning(true); setError(null);
    try {
      const r = await runDbQuery(conn.id, sel, database);
      onResult(r);
      setActive(0);
      const next = [sel.trim(), ...hist.filter((h) => h !== sel.trim())].slice(0, 30);
      setHist(next);
      try { localStorage.setItem(histKey(conn.id), JSON.stringify(next)); } catch { /* quota */ }
    } catch (e: any) {
      setError(e.message);
      onResult(null);
    } finally {
      setRunning(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart;
      onTextChange(text.slice(0, s) + '  ' + text.slice(ta.selectionEnd));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 2; });
    }
  };

  // Drag the divider to resize editor vs results.
  const startDrag = (e: React.PointerEvent) => {
    const y0 = e.clientY, h0 = editorH;
    const move = (ev: PointerEvent) => setEditorH(Math.min(520, Math.max(80, h0 + ev.clientY - y0)));
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rs = result?.results[active];
  const lines = Math.max(1, text.split('\n').length);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]">
        <button onClick={run} disabled={running || !text.trim()}
          className="h-7 px-3 rounded-md bg-[var(--accent-brand)] text-white text-[11px] font-semibold flex items-center gap-1.5 shadow-sm hover:brightness-110 active:scale-[0.98] disabled:opacity-40 transition">
          {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />} {t('db.run')}
        </button>
        <kbd className="hidden sm:inline text-[10px] font-mono text-[var(--muted-foreground)]">{t('db.runHint')}</kbd>
        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${conn.allowWrite ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
          {conn.allowWrite ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />} {conn.allowWrite ? t('db.writeMode') : t('db.readOnly')}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setWrap((w) => !w)} aria-pressed={wrap} title={t('db.wrapLines')}
            className={`h-7 w-7 rounded-md flex items-center justify-center hover:bg-[var(--sidebar-hover)] ${wrap ? 'text-[var(--accent-brand)]' : 'text-[var(--muted-foreground)]'}`}>
            <WrapText className="w-3.5 h-3.5" />
          </button>
          <div className="relative">
            <button onClick={() => setShowHist((v) => !v)} aria-expanded={showHist} title={t('db.queryHistory')}
              className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--sidebar-hover)]">
              <History className="w-3.5 h-3.5" /> {t('db.history')}
            </button>
            {showHist && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowHist(false)} />
                <div className="pop-in absolute right-0 mt-1 z-40 w-96 max-h-80 overflow-auto rounded-lg bg-[var(--card)] border border-[var(--border)] shadow-xl">
                  {hist.length === 0 ? <p className="p-3 text-xs text-[var(--muted-foreground)]">{t('db.noHistory')}</p> : (
                    <>
                      {hist.map((h, i) => (
                        <button key={i} onClick={() => { onTextChange(h); setShowHist(false); }}
                          className="w-full text-left px-3 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--sidebar-hover)] font-mono text-[11px] whitespace-pre-wrap line-clamp-3">
                          {h}
                        </button>
                      ))}
                      <button onClick={() => { setHist([]); try { localStorage.removeItem(histKey(conn.id)); } catch {} }}
                        className="w-full px-3 py-1.5 text-[11px] text-red-500 flex items-center gap-1 hover:bg-red-500/10"><Trash2 className="w-3 h-3" /> {t('db.clearHistory')}</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Editor with line gutter */}
      <div className="shrink-0 flex font-mono text-[12.5px] leading-[1.6] bg-[var(--background)]" style={{ height: editorH }}>
        <div aria-hidden className="select-none py-2.5 pl-3 pr-2 text-right text-[var(--muted-foreground)]/60 overflow-hidden">
          {Array.from({ length: lines }).map((_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
          aria-label={t('db.queryEditor')}
          placeholder={PLACEHOLDER[engine.queryLanguage] || ''}
          className={`flex-1 resize-none bg-transparent py-2.5 pr-3 outline-none placeholder:text-[var(--muted-foreground)]/50 ${wrap ? '' : 'whitespace-pre overflow-x-auto'}`}
        />
      </div>
      <div onPointerDown={startDrag} role="separator" aria-orientation="horizontal" aria-label={t('db.resizeEditor')}
        className="shrink-0 h-1.5 cursor-row-resize border-y border-[var(--border)] bg-[var(--muted)] hover:bg-[var(--accent-brand)]/30 transition-colors" />

      {/* Results */}
      <div className="flex-1 min-h-0 flex flex-col">
        {error && <pre role="alert" className="m-3 p-3 text-[11px] font-mono text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg whitespace-pre-wrap">{error}</pre>}
        {!result && !error && (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--muted-foreground)]">
            {running ? <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t('db.running')}</span> : t('db.resultsHere')}
          </div>
        )}
        {result && (
          <>
            <div className="shrink-0 flex items-center gap-1 px-2 h-8 border-b border-[var(--border)] overflow-x-auto">
              {result.results.map((r, i) => (
                <button key={i} onClick={() => setActive(i)}
                  className={`h-6 px-2.5 rounded text-[11px] whitespace-nowrap ${active === i ? 'bg-[var(--sidebar-active)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)]'}`}>
                  {t('db.resultN', { n: i + 1 })} <span className="text-[var(--muted-foreground)]">· {r.rows.length}</span>
                </button>
              ))}
              <span className="ml-auto text-[11px] font-mono text-[var(--muted-foreground)] whitespace-nowrap">{result.ms} ms</span>
              {rs && (
                <button onClick={() => downloadResult(rs, `query-${active + 1}`, 'csv')} title={t('db.exportCsv')}
                  className="h-6 px-2 rounded text-[11px] flex items-center gap-1 text-[var(--muted-foreground)] hover:bg-[var(--sidebar-hover)]"><Download className="w-3 h-3" /> CSV</button>
              )}
            </div>
            {result.message && (
              <pre className={`shrink-0 mx-3 mt-2 px-3 py-2 text-[11px] font-mono rounded-lg whitespace-pre-wrap border ${/ERROR|error/.test(result.message) ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'bg-[var(--muted)] border-[var(--border)]'}`}>{result.message}</pre>
            )}
            {rs ? <DataGrid rs={rs} /> : !result.message && <div className="p-4 text-xs text-[var(--muted-foreground)]">{t('db.noResults')}</div>}
            {result.truncated && <p className="shrink-0 px-3 py-1 text-[11px] text-amber-600 border-t border-[var(--border)]">{t('db.truncated')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
