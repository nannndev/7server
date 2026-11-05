import React, { useState, useEffect } from 'react';
import { Modal } from './modal';
import { Button } from './button';
import { Card } from './card';
import { AlertTriangle, HelpCircle, ShieldAlert } from 'lucide-react';
import { useT } from '@/shared/i18n';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

type ConfirmHandler = (options: ConfirmOptions) => Promise<boolean>;

let currentConfirmHandler: ConfirmHandler | null = null;

/**
 * Universal async confirmation dialog replacing native window.confirm().
 * Usage:
 * if (!await confirmModal('Yakin ingin menghapus?')) return;
 * or with options:
 * if (!await confirmModal({
 *   title: 'Hapus Server',
 *   message: 'Data server dan koneksi akan dihapus permanen.',
 *   variant: 'danger',
 *   confirmText: 'Hapus Sekarang'
 * })) return;
 */
export function confirmModal(options: ConfirmOptions | string): Promise<boolean> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
  if (!currentConfirmHandler) {
    return Promise.resolve(window.confirm(opts.message));
  }
  return currentConfirmHandler(opts);
}

export function ConfirmDialogContainer() {
  const t = useT();
  const [active, setActive] = useState<ConfirmState | null>(null);

  useEffect(() => {
    currentConfirmHandler = (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        setActive({ ...options, resolve });
      });
    };

    return () => {
      currentConfirmHandler = null;
    };
  }, []);

  if (!active) return null;

  const handleConfirm = () => {
    const res = active.resolve;
    setActive(null);
    res(true);
  };

  const handleCancel = () => {
    const res = active.resolve;
    setActive(null);
    res(false);
  };

  const variant = active.variant || 'default';

  return (
    <Modal isOpen={!!active} onClose={handleCancel} className="max-w-md">
      <Card className="w-full p-5 bg-[var(--card)] border-[var(--border)] shadow-2xl space-y-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2.5 rounded-xl shrink-0 ${
              variant === 'danger'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                : variant === 'warning'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--border)]'
            }`}
          >
            {variant === 'danger' ? (
              <ShieldAlert className="w-5 h-5" />
            ) : variant === 'warning' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <HelpCircle className="w-5 h-5" />
            )}
          </div>

          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-[var(--foreground)]">
              {active.title || (variant === 'danger' ? t('confirm.dangerTitle') : t('confirm.title'))}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed whitespace-pre-line">
              {active.message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="text-xs h-8"
          >
            {active.cancelText || t('confirm.cancel')}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            autoFocus
            className={`text-xs h-8 font-semibold ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            }`}
          >
            {active.confirmText || (variant === 'danger' ? t('confirm.delete') : t('confirm.proceed'))}
          </Button>
        </div>
      </Card>
    </Modal>
  );
}

