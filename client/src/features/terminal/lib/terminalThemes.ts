import type { ITheme } from '@xterm/xterm';

export type TerminalThemeId =
  | 'dark-doff'
  | 'tokyo-night'
  | 'dracula'
  | 'cyberpunk'
  | 'monokai'
  | 'nord'
  | 'github-dark';

export interface TerminalThemeConfig {
  id: TerminalThemeId;
  name: string;
  dotColor: string;
  theme: ITheme;
}

export const TERMINAL_THEMES: Record<TerminalThemeId, TerminalThemeConfig> = {
  'dark-doff': {
    id: 'dark-doff',
    name: 'Dark Doff (Obsidian)',
    dotColor: '#38bdf8',
    theme: {
      background: '#09090b',
      foreground: '#e4e4e7',
      cursor: '#38bdf8',
      cursorAccent: '#09090b',
      selectionBackground: 'rgba(56, 189, 248, 0.25)',
      black: '#18181b',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#facc15',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#38bdf8',
      white: '#f4f4f5',
      brightBlack: '#52525b',
      brightRed: '#ef4444',
      brightGreen: '#22c55e',
      brightYellow: '#eab308',
      brightBlue: '#3b82f6',
      brightMagenta: '#a855f7',
      brightCyan: '#06b6d4',
      brightWhite: '#ffffff'
    }
  },
  'tokyo-night': {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dotColor: '#7aa2f7',
    theme: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#7aa2f7',
      cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5'
    }
  },
  'dracula': {
    id: 'dracula',
    name: 'Dracula',
    dotColor: '#bd93f9',
    theme: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#bd93f9',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff'
    }
  },
  'cyberpunk': {
    id: 'cyberpunk',
    name: 'Cyberpunk Matrix',
    dotColor: '#00ff9f',
    theme: {
      background: '#0d1117',
      foreground: '#00ff9f',
      cursor: '#00ff9f',
      cursorAccent: '#0d1117',
      selectionBackground: 'rgba(0, 255, 159, 0.3)',
      black: '#161b22',
      red: '#ff0055',
      green: '#00ff9f',
      yellow: '#ffe600',
      blue: '#00b8ff',
      magenta: '#d600ff',
      cyan: '#00f0ff',
      white: '#f0f6fc',
      brightBlack: '#484f58',
      brightRed: '#ff3377',
      brightGreen: '#33ffb2',
      brightYellow: '#ffeb33',
      brightBlue: '#33c6ff',
      brightMagenta: '#de33ff',
      brightCyan: '#33f3ff',
      brightWhite: '#ffffff'
    }
  },
  'monokai': {
    id: 'monokai',
    name: 'Monokai Pro',
    dotColor: '#ffd866',
    theme: {
      background: '#2d2a2e',
      foreground: '#fcfcfa',
      cursor: '#ffd866',
      cursorAccent: '#2d2a2e',
      selectionBackground: '#403e41',
      black: '#221f22',
      red: '#ff6188',
      green: '#a9dc76',
      yellow: '#ffd866',
      blue: '#fc9867',
      magenta: '#ab9df2',
      cyan: '#78dce8',
      white: '#fcfcfa',
      brightBlack: '#727072',
      brightRed: '#ff6188',
      brightGreen: '#a9dc76',
      brightYellow: '#ffd866',
      brightBlue: '#fc9867',
      brightMagenta: '#ab9df2',
      brightCyan: '#78dce8',
      brightWhite: '#ffffff'
    }
  },
  'nord': {
    id: 'nord',
    name: 'Nord Frost',
    dotColor: '#88c0d0',
    theme: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#88c0d0',
      cursorAccent: '#2e3440',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4'
    }
  },
  'github-dark': {
    id: 'github-dark',
    name: 'GitHub Dark',
    dotColor: '#58a6ff',
    theme: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0d1117',
      selectionBackground: '#1f6feb40',
      black: '#010409',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    }
  }
};

export interface TerminalShortcutItem {
  id: string;
  label: string;
  cmd: string;
  desc?: string;
  category: 'monitoring' | 'services' | 'docker' | 'network' | 'maintenance' | 'custom';
  danger?: boolean;
}

export const BUILTIN_SHORTCUTS: TerminalShortcutItem[] = [
  // Monitoring
  {
    id: 'htop',
    label: 'htop',
    cmd: 'htop',
    desc: 'Interactive process & resource monitor',
    category: 'monitoring'
  },
  {
    id: 'free',
    label: 'free -m',
    cmd: 'free -m -w',
    desc: 'Check RAM, buffer, cache, and swap memory',
    category: 'monitoring'
  },
  {
    id: 'df',
    label: 'df -h',
    cmd: 'df -h',
    desc: 'Disk space usage on mounted filesystems',
    category: 'monitoring'
  },
  {
    id: 'uptime',
    label: 'uptime',
    cmd: 'uptime -p',
    desc: 'Server uptime and average system load',
    category: 'monitoring'
  },
  {
    id: 'top-mem',
    label: 'Top 10 RAM',
    cmd: 'ps aux --sort=-%mem | head -11',
    desc: 'Top 10 processes consuming highest memory',
    category: 'monitoring'
  },
  {
    id: 'top-cpu',
    label: 'Top 10 CPU',
    cmd: 'ps aux --sort=-%cpu | head -11',
    desc: 'Top 10 processes consuming highest CPU',
    category: 'monitoring'
  },
  {
    id: 'vmstat',
    label: 'vmstat',
    cmd: 'vmstat 1 5',
    desc: 'Virtual memory statistics sample 5x',
    category: 'monitoring'
  },

  // Services & Logs
  {
    id: 'journalctl',
    label: 'journalctl -50',
    cmd: 'journalctl -xe -n 50 --no-pager',
    desc: 'Latest 50 systemd journal log entries',
    category: 'services'
  },
  {
    id: 'failed-services',
    label: 'Failed Units',
    cmd: 'systemctl --failed',
    desc: 'List all systemd services in failed state',
    category: 'services'
  },
  {
    id: 'nginx-test',
    label: 'nginx -t',
    cmd: 'nginx -t',
    desc: 'Test Nginx syntax configuration integrity',
    category: 'services'
  },
  {
    id: 'nginx-reload',
    label: 'Reload Nginx',
    cmd: 'nginx -s reload || systemctl reload nginx',
    desc: 'Zero-downtime Nginx reload configuration',
    category: 'services'
  },
  {
    id: 'pm2-status',
    label: 'pm2 list',
    cmd: 'pm2 list',
    desc: 'List running PM2 Node.js process table',
    category: 'services'
  },
  {
    id: 'pm2-logs',
    label: 'pm2 logs',
    cmd: 'pm2 logs --lines 50',
    desc: 'Tail last 50 lines of PM2 application logs',
    category: 'services'
  },

  // Docker
  {
    id: 'docker-ps',
    label: 'docker ps',
    cmd: 'docker ps',
    desc: 'List currently running Docker containers',
    category: 'docker'
  },
  {
    id: 'docker-ps-all',
    label: 'docker ps -a',
    cmd: 'docker ps -a',
    desc: 'List all containers including stopped ones',
    category: 'docker'
  },
  {
    id: 'docker-stats',
    label: 'docker stats',
    cmd: 'docker stats --no-stream',
    desc: 'Live CPU, memory, and I/O usage per container',
    category: 'docker'
  },
  {
    id: 'docker-compose-ps',
    label: 'compose ps',
    cmd: 'docker compose ps',
    desc: 'List compose services in current directory',
    category: 'docker'
  },
  {
    id: 'docker-df',
    label: 'docker df',
    cmd: 'docker system df',
    desc: 'Disk space occupied by images, containers, volumes',
    category: 'docker'
  },
  {
    id: 'docker-prune',
    label: 'docker prune',
    cmd: 'docker system prune -f',
    desc: 'Clean up unused dangling containers, networks, and images',
    category: 'docker',
    danger: true
  },

  // Network & Ports
  {
    id: 'ss-ports',
    label: 'ss -tulpn',
    cmd: 'ss -tulpn',
    desc: 'List all open listening TCP/UDP ports and sockets',
    category: 'network'
  },
  {
    id: 'ufw-status',
    label: 'ufw status',
    cmd: 'ufw status verbose',
    desc: 'Firewall rules status and active allowed ports',
    category: 'network'
  },
  {
    id: 'fail2ban-status',
    label: 'fail2ban status',
    cmd: 'fail2ban-client status',
    desc: 'Check active security jails and banned IPs',
    category: 'network'
  },
  {
    id: 'ping-dns',
    label: 'ping Cloudflare',
    cmd: 'ping -c 4 1.1.1.1',
    desc: 'Test network outbound connectivity & latency',
    category: 'network'
  },
  {
    id: 'curl-local',
    label: 'curl localhost',
    cmd: 'curl -I http://127.0.0.1 2>/dev/null || curl -I http://localhost',
    desc: 'Test local HTTP web server response header',
    category: 'network'
  },

  // Maintenance
  {
    id: 'apt-update',
    label: 'apt update',
    cmd: 'apt-get update',
    desc: 'Fetch latest package index lists from repositories',
    category: 'maintenance'
  },
  {
    id: 'apt-upgradable',
    label: 'apt upgradable',
    cmd: 'apt list --upgradable',
    desc: 'List all packages with pending upgrades available',
    category: 'maintenance'
  },
  {
    id: 'drop-caches',
    label: 'Clear RAM Cache',
    cmd: 'sync; echo 3 > /proc/sys/vm/drop_caches && free -m',
    desc: 'Safely flush Linux buffer and page cache to free RAM',
    category: 'maintenance'
  },
  {
    id: 'vacuum-logs',
    label: 'Trim Logs (3d)',
    cmd: 'journalctl --vacuum-time=3d',
    desc: 'Trim systemd logs older than 3 days to free disk',
    category: 'maintenance'
  },
  {
    id: 'clear-screen',
    label: 'clear',
    cmd: 'clear',
    desc: 'Clear the terminal terminal viewport',
    category: 'maintenance'
  }
];

