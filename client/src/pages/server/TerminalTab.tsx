import React from 'react';
import TerminalModal from '@/features/terminal/components/TerminalModal';
import { useServerPage } from './context';

export default function TerminalTab() {
  const ctx = useServerPage();
  return (
    <div className="h-[75vh]">
      <TerminalModal
        key={ctx.terminalCmd || 'default'}
        server={ctx.server}
        initialCommand={ctx.terminalCmd}
        onClose={() => {
          ctx.clearTerminalCmd();
          ctx.setActiveTab('overview');
        }}
      />
    </div>
  );
}
