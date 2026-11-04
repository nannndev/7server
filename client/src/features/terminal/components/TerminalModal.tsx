import React from 'react';
import type { ServerItem } from '@/features/servers';
import TerminalView from './TerminalView';

interface TerminalModalProps {
  server: ServerItem;
  initialCommand?: string;
  onClose: () => void;
}

export default function TerminalModal({ server, onClose, initialCommand }: TerminalModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="w-full max-w-6xl h-[88vh] rounded-2xl overflow-hidden shadow-2xl border border-zinc-800 bg-zinc-950 flex flex-col">
        <TerminalView
          server={server}
          initialCommand={initialCommand}
          onClose={onClose}
          mode="modal"
        />
      </div>
    </div>
  );
}
