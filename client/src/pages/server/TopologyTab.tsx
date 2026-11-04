import React, { useState, useLayoutEffect } from 'react';
import TopologyVisualizer from '@/features/servers/components/views/TopologyVisualizer';
import { useServerPage } from './context';

export default function TopologyTab() {
  const ctx = useServerPage();
  const { server } = ctx;


  return (
    <>
      <TopologyVisualizer
        servers={[server]}
        focusedServer={server}
        onOpenTerminal={() => ctx.setActiveTab('terminal')}
      />
    </>
  );
}
