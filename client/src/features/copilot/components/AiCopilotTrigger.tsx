import React, { useEffect, useState } from 'react';
import { Terminal, ShieldAlert, CheckCircle2, Sparkles } from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import type { CopilotLiveStatus } from '../types';

interface AiCopilotTriggerProps {
  open: boolean;
  onClick: () => void;
  status?: CopilotLiveStatus;
}

/** Expressive Cyber-SRE character avatar with state-driven visor eyes, antenna LED, and orbital rings. */
function CopilotMascot({ state, hovered }: { state: CopilotLiveStatus['state']; hovered: boolean }) {
  const [blink, setBlink] = useState(false);
  const [lookOffset, setLookOffset] = useState(0);

  // Natural idle blinking & subtle eye glance
  useEffect(() => {
    if (state !== 'idle') return;
    const blinkInterval = window.setInterval(() => {
      setBlink(true);
      window.setTimeout(() => setBlink(false), 160);
    }, 3600);
    const lookInterval = window.setInterval(() => {
      const dirs = [-1.5, 0, 1.5, 0];
      setLookOffset(dirs[Math.floor(Math.random() * dirs.length)]);
    }, 2800);
    return () => {
      window.clearInterval(blinkInterval);
      window.clearInterval(lookInterval);
    };
  }, [state]);

  const ledColor =
    state === 'executing'
      ? '#10b981'
      : state === 'thinking'
      ? '#38bdf8'
      : state === 'approval'
      ? '#f59e0b'
      : state === 'done'
      ? '#34d399'
      : '#a1a1aa';

  return (
    <div className="relative w-9 h-9 flex items-center justify-center shrink-0 select-none">
      {/* Outer animated orbital ring when active */}
      {(state === 'thinking' || state === 'executing') && (
        <span
          className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin ${
            state === 'executing' ? 'border-emerald-400/70' : 'border-sky-400/70'
          }`}
          style={{ animationDuration: state === 'executing' ? '3s' : '4s' }}
        />
      )}
      {state === 'approval' && (
        <span className="absolute inset-0 rounded-full border-2 border-amber-400/80 animate-ping opacity-40" />
      )}
      {state === 'done' && (
        <span className="absolute inset-0 rounded-full border-2 border-emerald-400/70 animate-pulse" />
      )}

      <svg viewBox="0 0 36 36" className="w-8 h-8 overflow-visible drop-shadow-sm">
        {/* Antenna stem & glowing tip */}
        <line x1="18" y1="3" x2="18" y2="7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="opacity-70" />
        <circle
          cx="18"
          cy="3"
          r="2.3"
          fill={ledColor}
          className={state !== 'idle' ? 'animate-ping' : ''}
          style={{ animationDuration: '1.8s', transformOrigin: '18px 3px' }}
        />
        <circle cx="18" cy="3" r="2.1" fill={ledColor} />

        {/* Side ear pods */}
        <rect x="3.5" y="14" width="2.5" height="7" rx="1.2" fill="currentColor" className="opacity-50" />
        <rect x="30" y="14" width="2.5" height="7" rx="1.2" fill="currentColor" className="opacity-50" />

        {/* Bot head shell */}
        <rect
          x="6"
          y="7.5"
          width="24"
          height="20"
          rx="6.5"
          fill="#18181b"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-95"
        />

        {/* Inner dark visor screen */}
        <rect x="8.5" y="10.5" width="19" height="12.5" rx="4" fill="#09090b" stroke={ledColor} strokeWidth="0.9" strokeOpacity="0.55" />

        {/* Visor Expressions based on state */}
        {state === 'executing' ? (
          /* Terminal `>_` eyes when executing SSH commands */
          <g fill="#34d399">
            <path d="M11.2 14.2 L14.5 16.5 L11.2 18.8" fill="none" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="17.5" y="17.5" width="5.2" height="1.8" rx="0.8" className="animate-pulse" />
          </g>
        ) : state === 'thinking' ? (
          /* Animated synapse/wave bars when streaming/thinking */
          <g fill="#38bdf8">
            <rect x="11.5" y="14" width="2.2" height="5.5" rx="1" className="animate-pulse" />
            <rect x="15.2" y="12.5" width="2.2" height="8.5" rx="1" className="animate-bounce" style={{ animationDuration: '0.7s' }} />
            <rect x="18.9" y="13.5" width="2.2" height="6.5" rx="1" className="animate-pulse" style={{ animationDelay: '150ms' }} />
            <rect x="22.6" y="14.5" width="2.2" height="4.5" rx="1" className="animate-bounce" style={{ animationDuration: '0.9s' }} />
          </g>
        ) : state === 'approval' ? (
          /* Alert `! !` eyes when waiting for user approval */
          <g fill="#fbbf24">
            <rect x="13" y="12.8" width="2.2" height="4.5" rx="1" />
            <circle cx="14.1" cy="19.3" r="1.1" />
            <rect x="20.8" y="12.8" width="2.2" height="4.5" rx="1" />
            <circle cx="21.9" cy="19.3" r="1.1" />
          </g>
        ) : state === 'done' || hovered ? (
          /* Happy `^ ^` eyes when task finishes or user hovers */
          <g fill="none" stroke={state === 'done' ? '#34d399' : '#38bdf8'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11.5 17.5 Q13.8 13.8 16 17.5" />
            <path d="M20 17.5 Q22.2 13.8 24.5 17.5" />
          </g>
        ) : (
          /* Idle blinking & glancing cyber eyes */
          <g transform={`translate(${lookOffset}, 0)`} fill="#e4e4e7">
            <ellipse cx="13.8" cy="16.5" rx="2.1" ry={blink ? 0.35 : 2.5} style={{ transition: 'ry 90ms ease' }} />
            <ellipse cx="22.2" cy="16.5" rx="2.1" ry={blink ? 0.35 : 2.5} style={{ transition: 'ry 90ms ease' }} />
            {!blink && (
              <>
                <circle cx="14.5" cy="15.6" r="0.7" fill="#38bdf8" />
                <circle cx="22.9" cy="15.6" r="0.7" fill="#38bdf8" />
              </>
            )}
          </g>
        )}

        {/* Subtle mouth / status line */}
        <path
          d={state === 'done' || hovered ? 'M15 25 Q18 26.8 21 25' : 'M15.5 25.2 H20.5'}
          stroke={ledColor}
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
          opacity="0.75"
        />
      </svg>
    </div>
  );
}

export default function AiCopilotTrigger({ open, onClick, status }: AiCopilotTriggerProps) {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState(false);

  if (open) return null;

  const state = status?.state || 'idle';
  const isBusy = state === 'thinking' || state === 'executing';
  const isId = locale === 'id';

  const statusHeadline =
    state === 'executing'
      ? isId
        ? `Menjalankan command${status?.serverName ? ` · ${status.serverName}` : ''}`
        : `Running command${status?.serverName ? ` · ${status.serverName}` : ''}`
      : state === 'thinking'
      ? isId
        ? `AI sedang menganalisa...${status?.step && status.step > 1 ? ` (Langkah ${status.step})` : ''}`
        : `Copilot is thinking...${status?.step && status.step > 1 ? ` (Step ${status.step})` : ''}`
      : state === 'approval'
      ? isId
        ? 'Menunggu persetujuanmu!'
        : 'Waiting for your approval!'
      : state === 'done'
      ? isId
        ? 'Selesai! Klik untuk lihat hasil'
        : 'Done! Click to view reply'
      : 'AI Copilot';

  const borderTone =
    state === 'executing'
      ? 'border-emerald-500/60 shadow-emerald-500/20'
      : state === 'thinking'
      ? 'border-sky-500/60 shadow-sky-500/20'
      : state === 'approval'
      ? 'border-amber-500/70 shadow-amber-500/25 animate-bounce'
      : state === 'done'
      ? 'border-emerald-500/60 shadow-emerald-500/20'
      : '';

  return (
    <div className="fixed bottom-5 right-6 z-40 flex flex-col items-end gap-2">
      {/* Speech Bubble Callout above the button when working, waiting for approval, or just finished */}
      {state !== 'idle' && (
        <button
          type="button"
          onClick={onClick}
          className={`max-w-[300px] text-left rounded-2xl border px-3.5 py-2.5 shadow-2xl backdrop-blur-md bg-[var(--card)]/95 transition-all hover:scale-[1.02] cursor-pointer animate-[pop-in_200ms_ease-out] ${
            state === 'approval'
              ? 'border-amber-500/50'
              : state === 'executing' || state === 'done'
              ? 'border-emerald-500/45'
              : 'border-sky-500/45'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--foreground)]">
            {state === 'executing' && <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />}
            {state === 'thinking' && <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />}
            {state === 'approval' && <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />}
            {state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            <span className="truncate">{statusHeadline}</span>
          </div>

          {status?.command && (state === 'executing' || state === 'approval') ? (
            <div className="mt-1.5 rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1 font-mono text-[10.5px] text-emerald-300 truncate">
              <span className="text-zinc-500 mr-1">$</span>
              {status.command}
            </div>
          ) : status?.preview ? (
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-snug">
              {status.preview}
            </p>
          ) : null}
        </button>
      )}

      {/* Main Character Floating Pill */}
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ animationDuration: state === 'approval' ? '1.4s' : undefined }}
        className={`relative flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 rounded-full btn-metal border shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 group cursor-pointer ${borderTone}`}
        title={t('copilot.openTitle')}
        aria-label={t('copilot.openAria')}
      >
        <CopilotMascot state={state} hovered={hovered} />

        <div className="flex flex-col items-start text-left">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tracking-wide leading-none">
              {isBusy
                ? state === 'executing'
                  ? isId
                    ? 'Menjalankan SSH...'
                    : 'Running SSH...'
                  : isId
                  ? 'Sedang mikir...'
                  : 'Thinking...'
                : state === 'approval'
                ? isId
                  ? 'Butuh Izin!'
                  : 'Needs Approval!'
                : state === 'done'
                ? isId
                  ? 'Selesai!'
                  : 'Reply Ready!'
                : 'AI Copilot'}
            </span>
            {isBusy && (
              <span className="inline-flex items-center gap-0.5">
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            )}
          </div>
          <span className="text-[10px] opacity-75 leading-tight mt-0.5">
            {isBusy && status?.step
              ? `Step ${status.step}/8 · ${status.serverName || 'VPS'}`
              : state === 'approval'
              ? isId
                ? 'Klik untuk review command'
                : 'Click to review command'
              : state === 'done'
              ? isId
                ? 'Klik untuk buka chat'
                : 'Click to open chat'
              : isId
              ? 'Asisten SRE Siap'
              : 'SRE Agent Ready'}
          </span>
        </div>

        <kbd className="hidden sm:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/15 border border-white/10 ml-0.5">
          ⌘J
        </kbd>

        {/* Unread / Attention Badge Dot */}
        {(state === 'approval' || state === 'done') && (
          <span
            className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[var(--background)] ${
              state === 'approval' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
            }`}
          />
        )}
      </button>
    </div>
  );
}
