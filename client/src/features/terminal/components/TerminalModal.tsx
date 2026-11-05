import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { ServerItem } from '@/features/servers';
import TerminalView from './TerminalView';
import { Modal } from '@/shared/ui/modal';
import { Button } from '@/shared/ui/button';
import { useCan } from '@/features/auth/AuthContext';
import { useT } from '@/shared/i18n';

interface TerminalModalProps {
  server: ServerItem;
  initialCommand?: string;
  onClose: () => void;
}

export default function TerminalModal({ server, onClose, initialCommand }: TerminalModalProps) {
  const t = useT();
  const canOpen = useCan('terminal.open');

  if (!canOpen) {
    return (
      <Modal onClose={onClose} className="max-w-md">
        <div className="p-6 text-center space-y-3 bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-2xl">
          <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
          <h3 className="text-sm font-semibold">{t('terminal.deniedTitle')}</h3>
          <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
            {t('terminal.deniedDesc')}
          </p>
          <Button onClick={onClose} size="sm" className="mt-2">
            {t('common.close')}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} className="max-w-6xl h-[88vh]">
      <div className="w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 bg-zinc-950 flex flex-col">
        <TerminalView
          server={server}
          initialCommand={initialCommand}
          onClose={onClose}
          mode="modal"
        />
      </div>
    </Modal>
  );
}
