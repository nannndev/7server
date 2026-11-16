import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, Check, CheckCircle2, Settings2 } from 'lucide-react';
import type { ActiveAlert, AlertHistoryEntry } from '../api';
import { useT } from '@/shared/i18n';

const stripTags = (s: string) => s.replace(/\*\*/g, '').replace(/\\(.)/g, '$1');

export function NotificationBell({
  activeAlerts,
  alertHistory,
  unreadCount,
  onAck,
  onOpenAlertsPage
}: {
  activeAlerts: ActiveAlert[];
  alertHistory: AlertHistoryEntry[];
  unreadCount: number;
  onAck: (key: string) => void;
  onOpenAlertsPage: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t('alerts.bellTitle')}
        aria-label={t('alerts.bellTitle')}
        className={`relative h-8 w-8 rounded-lg border inline-flex items-center justify-center transition-colors cursor-pointer ${
          unreadCount > 0
            ? 'border-red-500/45 bg-red-500/10 text-red-500 hover:bg-red-500/15'
            : 'border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/50'
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9.5px] font-bold flex items-center justify-center shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-2xl overflow-hidden z-50 animate-[pop-in_140ms_ease-out]">
          <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--background)]/50">
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5 text-[var(--foreground)]" />
              <span className="text-xs font-semibold text-[var(--foreground)]">{t('alerts.bellTitle')}</span>
              {activeAlerts.length > 0 && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500">
                  {activeAlerts.length}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAlertsPage();
              }}
              className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] inline-flex items-center gap-1 cursor-pointer"
            >
              <Settings2 className="w-3 h-3" />
              <span>{t('alerts.openSettings')}</span>
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]/60">
            <div className="p-3 space-y-2">
              {activeAlerts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] py-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{t('alerts.noActive')}</span>
                </div>
              ) : (
                activeAlerts.map((a) => (
                  <div
                    key={a.key}
                    className={`rounded-lg border p-2 text-xs flex items-start justify-between gap-2 ${
                      a.acknowledged
                        ? 'border-[var(--border)] bg-[var(--muted)]/30 opacity-75'
                        : 'border-red-500/30 bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0">
                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.acknowledged ? 'text-[var(--muted-foreground)]' : 'text-red-500'}`} />
                      <div className="min-w-0">
                        <div className="text-[var(--foreground)] leading-snug break-words">{stripTags(a.message)}</div>
                        <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5 font-mono">
                          {new Date(a.since).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    {!a.acknowledged && (
                      <button
                        type="button"
                        onClick={() => onAck(a.key)}
                        title={t('alerts.ack')}
                        className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-emerald-500 shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {alertHistory.length > 0 && (
              <div className="p-3 space-y-1.5 bg-[var(--background)]/30">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t('alerts.recentHistory')}
                </div>
                {alertHistory.slice(0, 6).map((h) => (
                  <div key={h.id} className="flex items-start gap-2 text-[11px] py-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${h.type === 'triggered' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                    <span className="flex-1 min-w-0 text-[var(--foreground)]/90 truncate">{h.message}</span>
                    <span className="text-[10px] font-mono text-[var(--muted-foreground)] shrink-0">
                      {new Date(h.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
