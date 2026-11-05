import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  add(type: ToastType, message: string, title?: string, duration = 4000) {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { id, type, message, title, duration };
    this.toasts = [...this.toasts, item];
    this.notify();

    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
    return id;
  }

  remove(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clear() {
    this.toasts = [];
    this.notify();
  }
}

const manager = new ToastManager();

export const toast = {
  success: (message: string, title?: string, duration = 4000) => manager.add('success', message, title, duration),
  error: (message: string, title?: string, duration = 5000) => manager.add('error', message, title, duration),
  warning: (message: string, title?: string, duration = 4500) => manager.add('warning', message, title, duration),
  info: (message: string, title?: string, duration = 4000) => manager.add('info', message, title, duration),
  dismiss: (id: string) => manager.remove(id),
  clear: () => manager.clear()
};

const ICONS: Record<ToastType, React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
};

const STYLES: Record<ToastType, { iconColor: string; borderColor: string; bgBadge: string }> = {
  success: {
    iconColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgBadge: 'bg-emerald-500/10'
  },
  error: {
    iconColor: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    bgBadge: 'bg-rose-500/10'
  },
  warning: {
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgBadge: 'bg-amber-500/10'
  },
  info: {
    iconColor: 'text-sky-400',
    borderColor: 'border-sky-500/30',
    bgBadge: 'bg-sky-500/10'
  }
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return manager.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      className="fixed top-5 right-5 z-[200] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none select-text"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        const style = STYLES[t.type];

        return (
          <div
            key={t.id}
            className={`pointer-events-auto p-3.5 rounded-xl border ${style.borderColor} bg-[var(--card)] text-[var(--foreground)] shadow-2xl shadow-black/40 backdrop-blur-md flex items-start gap-3 transition-all animate-in slide-in-from-top-2 duration-200`}
            role="alert"
          >
            <div className={`p-1.5 rounded-lg ${style.bgBadge} ${style.iconColor} shrink-0 mt-0.5`}>
              <Icon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              {t.title && (
                <h5 className="font-semibold text-xs text-[var(--foreground)] leading-tight mb-0.5">
                  {t.title}
                </h5>
              )}
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed break-words">
                {t.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] p-1 rounded transition shrink-0 -mr-1 -mt-1"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

