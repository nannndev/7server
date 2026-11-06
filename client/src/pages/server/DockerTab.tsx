import React, { useState, useLayoutEffect } from 'react';
import { Card } from '@/shared/ui/card';
import DockerPanel from '@/features/docker/components/DockerPanel';
import { useServerPage } from './context';

export default function DockerTab() {
  const ctx = useServerPage();
  const { server } = ctx;


  return (
    <>
      <Card className="p-5">
        <DockerPanel
          serverId={server.id}
          serverHost={server.host}
          serverName={server.name}
          serverUsername={server.username}
          onLogs={(name) => ctx.openLogs({ type: 'docker', name })}
          onShell={(cmd) => { ctx.openTerminal(cmd); }}
          onOpenFolder={(path) => ctx.openFiles(path)}
          onOpenTerminal={(cmd) => ctx.openTerminal(cmd)}
          onOpenTemplates={() => ctx.setActiveTab('templates')}
        />
      </Card>
    </>
  );
}
