import React, { useState, useLayoutEffect } from 'react';
import TopologyVisualizer from '@/features/servers/components/views/TopologyVisualizer';
import { useServerPage } from './context';

export default function TopologyTab() {
  const ctx = useServerPage();
  const { server } = ctx;

  return (
    <TopologyVisualizer
      servers={[server]}
      focusedServer={server}
      onOpenTerminal={(cmd) => ctx.openTerminal(typeof cmd === 'string' ? cmd : undefined)}
      onOpenFiles={(path) => ctx.openFiles(path)}
      onOpenLogs={(target) => ctx.openLogs(target)}
      onNavigateTab={(tab) => ctx.setActiveTab(tab)}
    />
  );
}
