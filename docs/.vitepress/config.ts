import { defineConfig } from 'vitepress';

export default defineConfig({
  base: '/7server/',
  title: '7Server',
  description: 'Self-hosted, agentless multi-server control plane & AI SRE copilot documentation',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/7server/favicon.svg' }],
    ['link', { rel: 'alternate icon', type: 'image/png', href: '/7server/favicon.png' }],
    ['meta', { name: 'theme-color', content: '#09090b' }],
    ['meta', { name: 'og:site_name', content: '7Server Documentation' }],
  ],

  locales: {
    root: {
      label: 'English',
      lang: 'en',
      title: '7Server Docs',
      description: 'Run every server from one dashboard. Install nothing on them.',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/getting-started/introduction' },
          { text: 'Fleet', link: '/servers/overview' },
          { text: 'Workloads', link: '/workloads/docker' },
          { text: 'AI Gateway', link: '/ai/gateway' },
          { text: 'Security & RBAC', link: '/security/rbac' },
          { text: 'Changelog', link: '/changelog' },
          {
            text: 'Links',
            items: [
              { text: 'Dashboard App', link: 'http://localhost:3000' },
              { text: 'GitHub Repository', link: 'https://github.com/nannndev/7server' },
              { text: 'Discord Community', link: 'https://discord.gg/AF2Hc56t3N' }
            ]
          }
        ],
        sidebar: [
          {
            text: 'Getting Started',
            collapsed: false,
            items: [
              { text: 'Introduction', link: '/getting-started/introduction' },
              { text: 'Quick Start', link: '/getting-started/quick-start' },
              { text: 'Architecture & Security', link: '/getting-started/architecture' },
              { text: 'Changelog', link: '/changelog' },
            ]
          },
          {
            text: 'Server Management',
            collapsed: false,
            items: [
              { text: 'Connecting Servers', link: '/servers/overview' },
              { text: 'Real-Time Telemetry', link: '/servers/telemetry' },
              { text: 'Web Terminal', link: '/servers/terminal' },
              { text: 'Centralized Firewall (UFW)', link: '/servers/firewall' },
            ]
          },
          {
            text: 'Workloads & Services',
            collapsed: false,
            items: [
              { text: 'Docker & Compose Stacks', link: '/workloads/docker' },
              { text: 'Web Apps, Nginx & SSL', link: '/workloads/webapps' },
              { text: 'Cloudflare Tunnels', link: '/workloads/cloudflare-tunnel' },
              { text: 'Database Workbench', link: '/workloads/databases' },
              { text: 'Backups & Scheduled Retention', link: '/workloads/backups' },
              { text: 'Systemd & Cron Jobs', link: '/workloads/processes-cron' },
            ]
          },
          {
            text: 'AI SRE Copilot & Gateway',
            collapsed: false,
            items: [
              { text: 'AI SRE Copilot', link: '/ai/copilot' },
              { text: 'Universal AI Gateway', link: '/ai/gateway' },
              { text: 'CLI & IDE Integration', link: '/ai/ide-cli-integration' },
            ]
          },
          {
            text: 'Security & Access Control (RBAC)',
            collapsed: false,
            items: [
              { text: 'Roles & Scopes', link: '/security/rbac' },
              { text: 'Sessions & Audit Logging', link: '/security/sessions-audit' },
            ]
          },
          {
            text: 'Reference & Internals',
            collapsed: true,
            items: [
              { text: 'Environment Variables', link: '/reference/environment' },
              { text: 'Backend Architecture', link: '/internals/backend-architecture' },
              { text: 'Frontend Architecture', link: '/internals/frontend-architecture' },
              { text: 'RBAC Specs', link: '/internals/rbac-and-access' },
            ]
          }
        ]
      }
    },
    id: {
      label: 'Bahasa Indonesia',
      lang: 'id',
      link: '/id/',
      title: 'Dokumentasi 7Server',
      description: 'Kelola seluruh server VPS dari satu dashboard tanpa install agen apapun.',
      themeConfig: {
        nav: [
          { text: 'Panduan', link: '/id/getting-started/introduction' },
          { text: 'Manajemen Server', link: '/id/servers/overview' },
          { text: 'AI Gateway', link: '/id/ai/gateway' },
          { text: 'Keamanan & RBAC', link: '/id/security/rbac' },
          { text: 'Changelog', link: '/id/changelog' }
        ],
        sidebar: [
          {
            text: 'Memulai',
            collapsed: false,
            items: [
              { text: 'Pengenalan', link: '/id/getting-started/introduction' },
              { text: 'Mulai Cepat', link: '/id/getting-started/quick-start' },
              { text: 'Arsitektur & Keamanan', link: '/id/getting-started/architecture' },
              { text: 'Catatan Rilis (Changelog)', link: '/id/changelog' },
            ]
          },
          {
            text: 'Manajemen Server',
            collapsed: false,
            items: [
              { text: 'Menghubungkan Server', link: '/id/servers/overview' },
              { text: 'Telemetri Real-time', link: '/id/servers/telemetry' },
              { text: 'Web Terminal', link: '/id/servers/terminal' },
              { text: 'Firewall Terpusat (UFW)', link: '/id/servers/firewall' },
            ]
          },
          {
            text: 'AI Copilot & Gateway',
            collapsed: false,
            items: [
              { text: 'AI SRE Copilot', link: '/id/ai/copilot' },
              { text: 'Universal AI Gateway', link: '/id/ai/gateway' },
              { text: 'Integrasi IDE & CLI', link: '/id/ai/ide-cli-integration' },
            ]
          },
          {
            text: 'Akses & RBAC',
            collapsed: false,
            items: [
              { text: 'Peran & Hak Akses', link: '/id/security/rbac' },
              { text: 'Sesi Aktif & Audit Log', link: '/id/security/sessions-audit' },
            ]
          }
        ]
      }
    }
  },

  themeConfig: {
    logo: '/favicon.png',
    siteTitle: '7Server',
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/nannndev/7server' },
      { icon: 'discord', link: 'https://discord.gg/AF2Hc56t3N' }
    ],
    footer: {
      message: 'Self-hosted, Agentless Multi-Server Management & AI Control Plane.',
      copyright: 'Copyright © 2026 Nandang Eka Prasetya (nannndev). All rights reserved.'
    }
  }
});
