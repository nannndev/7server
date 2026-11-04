import React, { useState, useLayoutEffect } from 'react';
import { Card } from '@/shared/ui/card';
import DatabasePanel from '@/features/databases/components/DatabasePanel';
import { useServerPage } from './context';

export default function DatabasesTab() {
  const ctx = useServerPage();
  const { server } = ctx;


  return (
    <>
      <Card className="p-5">
        <DatabasePanel serverId={server.id} />
      </Card>
    </>
  );
}
