import React from 'react';
import TerminalView from '@/features/terminal/components/TerminalView';
import { useServerPage } from './context';

export default function TerminalTab() {
  const ctx = useServerPage();

  return (
    <div className="w-full">
      <TerminalView
        key={ctx.terminalCmd || 'default'}
        server={ctx.server}
        initialCommand={ctx.terminalCmd}
        onClearCommand={ctx.clearTerminalCmd}
        mode="page"
      />
    </div>
  );
}
