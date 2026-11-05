import React from 'react';
import type { ServerItem } from '@/features/servers';
import TerminalView from './TerminalView';
import { Modal } from '@/shared/ui/modal';

interface TerminalModalProps {
  server: ServerItem;
  initialCommand?: string;
  onClose: () => void;
}

export default function TerminalModal({ server, onClose, initialCommand }: TerminalModalProps) {
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
