// Single source for the per-server sections: the sidebar renders them, the server page uses the labels.
import type { ElementType } from 'react';
import { Activity, Network, Globe, Zap, Box, Database, Layers, Server, Radio, Terminal, Sparkles } from 'lucide-react';
import { ServerTab } from '@/app/router';
import type { MessageKey } from '@/shared/i18n';

export interface ServerSection { id: ServerTab; label: MessageKey; icon: ElementType }

export const SERVER_SECTION_GROUPS: { title: MessageKey; items: ServerSection[] }[] = [
  {
    title: 'section.group.monitor',
    items: [
      { id: 'overview', label: 'section.overview', icon: Activity },
      { id: 'topology', label: 'section.topology', icon: Network }
    ]
  },
  {
    title: 'section.group.apps',
    items: [
      { id: 'templates', label: 'section.templates', icon: Sparkles },
      { id: 'webapps', label: 'section.webapps', icon: Globe },
      { id: 'pm2', label: 'section.pm2', icon: Zap },
      { id: 'docker', label: 'section.docker', icon: Box },
      { id: 'databases', label: 'section.databases', icon: Database }
    ]
  },
  {
    title: 'section.group.system',
    items: [
      { id: 'services', label: 'section.services', icon: Layers },
      { id: 'nginx', label: 'section.nginx', icon: Server },
      { id: 'ports', label: 'section.ports', icon: Radio },
      { id: 'terminal', label: 'section.terminal', icon: Terminal }
    ]
  }
];

export const SERVER_SECTIONS = SERVER_SECTION_GROUPS.flatMap((g) => g.items);
/** Message key for a section's label; pass to t(). */
export const sectionLabel = (id: ServerTab): MessageKey => SERVER_SECTIONS.find((s) => s.id === id)?.label ?? 'section.overview';
