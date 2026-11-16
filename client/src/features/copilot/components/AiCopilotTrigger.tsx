import React, { useEffect, useRef, useState } from 'react';
import {
  Terminal,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Play,
  SkipForward,
  Square,
  RotateCcw,
  PauseCircle,
  MessageSquare,
  X
} from 'lucide-react';
import { useI18n } from '@/shared/i18n';
import type { CopilotBubbleAction, CopilotLiveStatus } from '../types';
import { CopilotCharacter, type CharacterMood } from './CopilotCharacter';

interface AiCopilotTriggerProps {
  open: boolean;
  onClick: () => void;
  status?: CopilotLiveStatus;
  onAnchorChange?: (origin: { x: number; y: number }) => void;
  onAction?: (action: CopilotBubbleAction) => void;
}

const POS_STORAGE_KEY = '7server_copilot_char_pos';
const CHAR_W = 74;
const CHAR_H = 82;
const MARGIN = 14;

const IDLE_QUIPS: Record<'en' | 'id', string[]> = {
  en: ['Need a hand? (⌘J)', 'Watching your servers...', 'All systems quiet ✨', 'Ask me anything!'],
  id: ['Butuh bantuan? (⌘J)', 'Mengawasi server kamu...', 'Semua aman terkendali ✨', 'Tanya apa aja!']
};

function clampPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(MARGIN, window.innerWidth - CHAR_W - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - CHAR_H - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, x)),
    y: Math.min(maxY, Math.max(MARGIN, y))
  };
}

function getInitialPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        return clampPosition(parsed.x, parsed.y);
      }
    }
  } catch {
    // ignore invalid storage
  }
  return clampPosition(window.innerWidth - CHAR_W - 24, window.innerHeight - CHAR_H - 22);
}

export default function AiCopilotTrigger({
  open,
  onClick,
  status,
  onAnchorChange,
  onAction
}: AiCopilotTriggerProps) {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState(false);
  const [quipIdx, setQuipIdx] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number }>(getInitialPosition);
  const [dragging, setDragging] = useState(false);
  const [dragTilt, setDragTilt] = useState(0);
  const [look, setLook] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [idleAction, setIdleAction] = useState<'none' | 'jump' | 'run'>('none');
  const [runDir, setRunDir] = useState<1 | -1>(-1);
  const [hiddenForDrawer, setHiddenForDrawer] = useState(open);

  const posRef = useRef(pos);
  posRef.current = pos;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    lastX: number;
    moved: boolean;
  } | null>(null);
  const tiltDecayRef = useRef<number>(0);
  const hoverTimerRef = useRef<number>(0);

  const enterHover = () => {
    window.clearTimeout(hoverTimerRef.current);
    setHovered(true);
  };

  const leaveHover = () => {
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => setHovered(false), 140);
  };

  useEffect(() => () => window.clearTimeout(hoverTimerRef.current), []);

  const state = status?.state || 'idle';
  const mode = status?.mode || 'agent';

  const triggerOpen = () => {
    setIdleAction('none');
    onAnchorChange?.({
      x: posRef.current.x + CHAR_W / 2,
      y: posRef.current.y + CHAR_H / 2
    });
    onClick();
  };

  // Report character center coordinates for macOS Dock-style drawer origin animation
  useEffect(() => {
    onAnchorChange?.({ x: pos.x + CHAR_W / 2, y: pos.y + CHAR_H / 2 });
  }, [pos.x, pos.y, onAnchorChange]);

  // Delay reveal slightly when drawer closes so minimize-into-character finishes cleanly
  useEffect(() => {
    if (open) {
      setHiddenForDrawer(true);
      setIdleAction('none');
      return;
    }
    const tm = window.setTimeout(() => setHiddenForDrawer(false), 210);
    return () => window.clearTimeout(tm);
  }, [open]);

  // Smooth global cursor eye tracking while character is visible
  useEffect(() => {
    if (open) return;
    let rafId = 0;
    const onPointerMove = (e: PointerEvent) => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const headX = posRef.current.x + CHAR_W / 2;
        const headY = posRef.current.y + 30;
        const nx = Math.max(-1, Math.min(1, (e.clientX - headX) / 220));
        const ny = Math.max(-1, Math.min(1, (e.clientY - headY) / 180));
        setLook((prev) =>
          Math.abs(prev.x - nx) < 0.03 && Math.abs(prev.y - ny) < 0.03
            ? prev
            : { x: nx, y: ny }
        );
      });
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [open]);

  // Autonomous playful jump & run behavior while idle
  useEffect(() => {
    if (state !== 'idle' || hovered || dragging || open) {
      setIdleAction('none');
      return;
    }

    let timeoutId = 0;
    let actionTimeoutId = 0;
    let rafId = 0;
    let cancelled = false;

    const scheduleNext = () => {
      const waitMs = 6500 + Math.random() * 5500;
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const doJump = Math.random() < 0.45;
        if (doJump) {
          setIdleAction('jump');
          actionTimeoutId = window.setTimeout(() => {
            if (cancelled) return;
            setIdleAction('none');
            scheduleNext();
          }, 1150);
          return;
        }

        // Run horizontally within safe viewport bounds
        const cur = posRef.current;
        const maxX = Math.max(MARGIN, window.innerWidth - CHAR_W - MARGIN);
        const dir: 1 | -1 =
          cur.x < maxX * 0.25 ? 1 : cur.x > maxX * 0.75 ? -1 : Math.random() < 0.5 ? 1 : -1;
        const distance = 90 + Math.random() * 110;
        const clampedTarget = clampPosition(cur.x + dir * distance, cur.y);
        const actualDist = clampedTarget.x - cur.x;
        if (Math.abs(actualDist) < 28) {
          // Fallback to jump if cornered on a tiny viewport
          setIdleAction('jump');
          actionTimeoutId = window.setTimeout(() => {
            if (cancelled) return;
            setIdleAction('none');
            scheduleNext();
          }, 1100);
          return;
        }

        setRunDir(actualDist >= 0 ? 1 : -1);
        setIdleAction('run');
        const startX = cur.x;
        const startY = cur.y;
        const duration = 1450;
        const t0 = performance.now();

        const step = (now: number) => {
          if (cancelled) return;
          const elapsed = now - t0;
          const p = Math.min(1, elapsed / duration);
          // Smooth ease-in-out
          const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const next = clampPosition(startX + actualDist * eased, startY);
          setPos(next);
          if (p < 1) {
            rafId = window.requestAnimationFrame(step);
          } else {
            try {
              localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(next));
            } catch {
              // ignore storage quota errors
            }
            setIdleAction('none');
            scheduleNext();
          }
        };
        rafId = window.requestAnimationFrame(step);
      }, waitMs);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearTimeout(actionTimeoutId);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [state, hovered, dragging, open]);

  // Rotate idle greeting quips occasionally
  useEffect(() => {
    if (state !== 'idle' || open) return;
    const id = window.setInterval(() => setQuipIdx((i) => i + 1), 9000);
    return () => window.clearInterval(id);
  }, [state, open]);

  // Keep character inside viewport when browser window resizes
  useEffect(() => {
    const onResize = () => {
      setPos((prev) => clampPosition(prev.x, prev.y));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Global drag listeners while dragging
  useEffect(() => {
    if (!dragging) return;

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;

      const dxTotal = e.clientX - d.startX;
      const dyTotal = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dxTotal, dyTotal) > 5) {
        d.moved = true;
      }

      const nextPos = clampPosition(d.originX + dxTotal, d.originY + dyTotal);
      setPos(nextPos);

      // Subtle tilt proportional to horizontal velocity
      const vx = e.clientX - d.lastX;
      d.lastX = e.clientX;
      setDragTilt(Math.max(-16, Math.min(16, vx * 1.15)));
      window.clearTimeout(tiltDecayRef.current);
      tiltDecayRef.current = window.setTimeout(() => setDragTilt(0), 90);
    };

    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      setDragTilt(0);

      if (d.moved) {
        const finalPos = clampPosition(d.originX + (e.clientX - d.startX), d.originY + (e.clientY - d.startY));
        setPos(finalPos);
        try {
          localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(finalPos));
        } catch {
          // ignore storage quota errors
        }
      } else {
        triggerOpen();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [dragging, onClick]);

  if (open || hiddenForDrawer) return null;

  const isId = locale === 'id';
  const mood: CharacterMood = dragging
    ? 'dragging'
    : state !== 'idle'
    ? state
    : hovered
    ? 'hovered'
    : idleAction === 'jump'
    ? 'jumping'
    : idleAction === 'run'
    ? 'running'
    : 'idle';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      lastX: e.clientX,
      moved: false
    };
    setDragging(true);
  };

  // Determine bubble visibility, compact vs expanded state, and smart placement
  const hasActionBubble = state !== 'idle';
  const showIdleHoverBubble = state === 'idle' && hovered && !dragging;
  const showBubble = (hasActionBubble || showIdleHoverBubble) && !dragging;
  const isExpanded = hovered;

  const placeBubbleBelow = pos.y < 185;
  const alignBubbleRight = typeof window !== 'undefined' ? pos.x > window.innerWidth / 2 : true;

  const statusHeadline =
    state === 'executing'
      ? isId
        ? `SSH${status?.serverName ? ` · ${status.serverName}` : '...'}`
        : `SSH${status?.serverName ? ` · ${status.serverName}` : '...'}`
      : state === 'thinking'
      ? isId
        ? `Thinking...${status?.step && status.step > 1 ? ` · #${status.step}` : ''}`
        : `Thinking...${status?.step && status.step > 1 ? ` · #${status.step}` : ''}`
      : state === 'approval'
      ? isId
        ? `Butuh izin!${(status?.pendingCount || 1) > 1 ? ` (${status?.pendingCount})` : ''}`
        : `Needs approval!${(status?.pendingCount || 1) > 1 ? ` (${status?.pendingCount})` : ''}`
      : state === 'limit'
      ? isId
        ? `Limit ${status?.maxSteps || 8} step`
        : `Limit ${status?.maxSteps || 8} steps`
      : state === 'error'
      ? isId
        ? 'Ada kendala!'
        : 'Error!'
      : state === 'done'
      ? isId
        ? 'Selesai!'
        : 'Done!'
      : IDLE_QUIPS[isId ? 'id' : 'en'][quipIdx % IDLE_QUIPS[isId ? 'id' : 'en'].length];

  const bubbleBorderColor =
    state === 'approval' || state === 'limit'
      ? 'border-amber-500/60'
      : state === 'error'
      ? 'border-red-500/60'
      : state === 'executing' || state === 'done'
      ? 'border-emerald-500/55'
      : state === 'thinking'
      ? 'border-sky-500/55'
      : 'border-[var(--border)]';

  const bubbleShadow =
    state === 'approval' || state === 'limit'
      ? 'shadow-amber-500/15'
      : state === 'error'
      ? 'shadow-red-500/15'
      : state === 'executing' || state === 'done'
      ? 'shadow-emerald-500/15'
      : state === 'thinking'
      ? 'shadow-sky-500/15'
      : '';

  return (
    <div
      style={{
        left: pos.x,
        top: pos.y,
        width: CHAR_W,
        height: CHAR_H,
        touchAction: 'none'
      }}
      onMouseEnter={enterHover}
      onMouseLeave={leaveHover}
      className="fixed z-40 select-none"
    >
      {/* Speech Bubble Callout: compact pill by default, expands smoothly on hover */}
      {showBubble && (
        <div
          onMouseEnter={enterHover}
          onMouseLeave={leaveHover}
          className={`absolute ${
            placeBubbleBelow ? 'top-full pt-2' : 'bottom-full pb-2'
          } ${alignBubbleRight ? 'right-0' : 'left-0'} z-20`}
        >
          <div
            className={`relative text-left border shadow-xl backdrop-blur-md bg-[var(--card)]/95 transition-all duration-200 ease-out animate-[pop-in_150ms_ease-out] ${bubbleBorderColor} ${bubbleShadow} ${
              isExpanded
                ? 'w-max min-w-[230px] max-w-[290px] rounded-2xl px-3.5 py-2.5 shadow-2xl'
                : 'w-max max-w-[225px] rounded-full px-2.5 py-1.5'
            }`}
          >
            {/* Speech Bubble Tail Pointer */}
            <span
              aria-hidden
              className={`absolute w-2.5 h-2.5 rotate-45 bg-[var(--card)] ${bubbleBorderColor} ${
                placeBubbleBelow
                  ? '-top-[6px] border-l border-t'
                  : '-bottom-[6px] border-r border-b'
              } ${alignBubbleRight ? 'right-7' : 'left-7'}`}
            />

            {/* Clickable Compact Header / Title opens full drawer */}
            <div
              role="button"
              tabIndex={0}
              onClick={triggerOpen}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  triggerOpen();
                }
              }}
              className="cursor-pointer group/hdr relative z-10"
            >
              <div className="flex items-center justify-between gap-2 text-[11.5px] font-semibold text-[var(--foreground)]">
                <div className="flex items-center gap-1.5 min-w-0">
                  {state === 'executing' && <Terminal className="w-3.5 h-3.5 text-emerald-500 shrink-0 animate-pulse" />}
                  {state === 'thinking' && (
                    <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0 animate-spin" style={{ animationDuration: '3s' }} />
                  )}
                  {state === 'approval' && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-bounce" />}
                  {state === 'limit' && <PauseCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />}
                  {state === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {state === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  <span className="truncate group-hover/hdr:underline decoration-[var(--muted-foreground)]/50">
                    {statusHeadline}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full font-mono uppercase border ${
                    isExpanded ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-1.5 py-0 text-[9px]'
                  } ${
                    mode === 'auto'
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/35'
                      : mode === 'manual'
                      ? 'bg-sky-500/15 text-sky-500 border-sky-500/35'
                      : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/35'
                  }`}
                >
                  {mode === 'auto' ? '⚡ Auto' : mode}
                </span>
              </div>

              {/* Expanded Preview / Command Snippet (only visible on hover) */}
              {isExpanded && (
                <>
                  {status?.command && (state === 'executing' || state === 'approval') ? (
                    <div
                      className={`mt-1.5 rounded-lg bg-[var(--muted)] border px-2 py-1 font-mono text-[10.5px] truncate max-w-[255px] text-[var(--foreground)] ${
                        status?.isRisky && state === 'approval'
                          ? 'border-red-500/50'
                          : 'border-[var(--border)]'
                      }`}
                    >
                      <span className="text-emerald-500 font-bold mr-1">$</span>
                      {status.command}
                    </div>
                  ) : state === 'limit' ? (
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)] leading-snug">
                      {isId ? 'Eksekusi dijeda sementara. Lanjutkan langkah berikutnya?' : 'Loop paused safely. Continue for more steps?'}
                    </p>
                  ) : status?.preview && hasActionBubble ? (
                    <p className="mt-1 text-[11px] text-[var(--muted-foreground)] line-clamp-2 leading-snug">
                      {status.preview}
                    </p>
                  ) : state === 'idle' ? (
                    <p className="mt-0.5 text-[10.5px] text-[var(--muted-foreground)]">
                      {isId ? 'Klik untuk buka chat · Geser untuk pindah' : 'Click to open chat · Drag to move'}
                    </p>
                  ) : null}
                </>
              )}
            </div>

            {/* Inline Action Controls (only expanded on hover) */}
            {isExpanded && hasActionBubble && (
              <div className="mt-2 pt-2 border-t border-[var(--border)]/70 flex items-center justify-between gap-1.5 relative z-10">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {state === 'approval' && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction?.('approve');
                        }}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                          status?.isRisky
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        <Play className="w-2.5 h-2.5 fill-current" />
                        <span>{status?.isRisky ? (isId ? 'Jalankan (!)' : 'Run (!)') : isId ? 'Izinkan' : 'Approve'}</span>
                      </button>
                      {(status?.pendingCount || 0) > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAction?.('approveAll');
                          }}
                          className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/40 inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Play className="w-2.5 h-2.5" />
                          <span>{isId ? 'Semua' : 'All'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction?.('skip');
                        }}
                        className="px-2 py-1 rounded-lg text-[10.5px] font-medium bg-[var(--muted)] hover:bg-[var(--muted)]/80 text-[var(--foreground)] border border-[var(--border)] inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <SkipForward className="w-2.5 h-2.5" />
                        <span>{isId ? 'Lewati' : 'Skip'}</span>
                      </button>
                    </>
                  )}

                  {state === 'limit' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('continue');
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-sm inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Play className="w-2.5 h-2.5 fill-current" />
                      <span>Continue</span>
                    </button>
                  )}

                  {(state === 'thinking' || state === 'executing') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('stop');
                      }}
                      className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-red-600 hover:bg-red-500 text-white shadow-sm inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      <span>{isId ? 'Hentikan' : 'Stop'}</span>
                    </button>
                  )}

                  {state === 'error' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('retry');
                      }}
                      className="px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-red-600 hover:bg-red-500 text-white shadow-sm inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>{isId ? 'Coba lagi' : 'Retry'}</span>
                    </button>
                  )}

                  {state === 'done' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerOpen();
                      }}
                      className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-2.5 h-2.5" />
                      <span>{isId ? 'Lihat hasil' : 'View'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {state !== 'done' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerOpen();
                      }}
                      title={isId ? 'Buka chat lengkap' : 'Open full chat'}
                      className="px-1.5 py-1 rounded-lg text-[10.5px] font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] hover:bg-[var(--muted)] inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Chat</span>
                    </button>
                  )}
                  {(state === 'done' || state === 'error') && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction?.('dismiss');
                      }}
                      title={isId ? 'Tutup notif' : 'Dismiss'}
                      className="p-1 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draggable Interactive Character Body */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerOpen();
          }
        }}
        title={`${t('copilot.openTitle')} (Drag to move)`}
        aria-label={t('copilot.openAria')}
        className={`relative w-full h-full flex items-center justify-center outline-none transition-transform duration-150 ${
          dragging
            ? 'cursor-grabbing scale-110'
            : 'cursor-grab hover:scale-105 active:scale-95'
        }`}
      >
        <CopilotCharacter mood={mood} mode={mode} dragTilt={dragTilt} look={look} runDir={runDir} />

        {/* Unread / Attention Badge Dot on shoulder */}
        {(state === 'approval' || state === 'limit' || state === 'done' || state === 'error') && !dragging && (
          <span
            className={`absolute top-2 right-2 w-3 h-3 rounded-full border-2 border-[var(--background)] ${
              state === 'approval' || state === 'limit'
                ? 'bg-amber-400 animate-ping'
                : state === 'error'
                ? 'bg-red-500 animate-pulse'
                : 'bg-emerald-400'
            }`}
          />
        )}
      </div>
    </div>
  );
}
