import type { SoftwareItem } from '../api';

export interface ToolVersionOption {
  label: string;
  value: string;
}

export interface TemplateToolItem {
  id: string; // matches id in SoftwareItem from Tahap 1 scan
  name: string;
  description: string;
  versions?: ToolVersionOption[];
  defaultVersion?: string;
  installScript: string | ((version?: string) => string);
}

export interface TemplatePreset {
  id: string;
  name: string;
  category: 'runtime' | 'container' | 'security';
  badge: string;
  description: string;
  tools: TemplateToolItem[];
}

export interface MarketplaceTool {
  id: string;
  name: string;
  category: 'runtime' | 'web' | 'database' | 'container' | 'tooling' | 'security';
  description: string;
  versions?: ToolVersionOption[];
  defaultVersion?: string;
  getInstallScript: (version?: string) => string;
}

// ---------------------------------------------------------------------------
// Preset Stacks
// ---------------------------------------------------------------------------

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'node-app',
    name: 'Node App',
    category: 'runtime',
    badge: 'Node LTS · PM2 · Nginx · Certbot',
    description: 'Stack lengkap untuk menjalankan aplikasi Node.js, Express, NestJS, atau Next.js standalone dengan process manager dan reverse proxy SSL.',
    tools: [
      {
        id: 'node',
        name: 'Node.js',
        description: 'Runtime JavaScript server-side dengan npm package manager',
        versions: [
          { label: 'Node.js 22 (Current / Latest)', value: '22.x' },
          { label: 'Node.js 20 (Active LTS - Disarankan)', value: '20.x' },
          { label: 'Node.js 18 (Maintenance LTS)', value: '18.x' }
        ],
        defaultVersion: '20.x',
        installScript: (v = '20.x') => `# Pasang Node.js (${v})
echo "==> Memasang Node.js ${v}..."
curl -fsSL https://deb.nodesource.com/setup_${v} | bash -
apt-get install -y nodejs
echo -n "Node.js terpasang: " && node -v
echo -n "npm terpasang: " && npm -v`
      },
      {
        id: 'pm2',
        name: 'PM2 Process Manager',
        description: 'Production process manager dengan auto-restart, cluster mode, dan logging',
        installScript: `# Pasang PM2 global
echo "==> Memasang PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true
echo -n "PM2 terpasang: " && pm2 -v`
      },
      {
        id: 'nginx',
        name: 'Nginx Web Server',
        description: 'High-performance HTTP server & reverse proxy untuk domain web',
        installScript: `# Pasang Nginx Web Server
echo "==> Memasang Nginx..."
apt-get update && apt-get install -y nginx
systemctl enable --now nginx
echo -n "Nginx terpasang: " && nginx -v`
      },
      {
        id: 'certbot',
        name: "Certbot (Let's Encrypt SSL)",
        description: "Otomasi sertifikat HTTPS gratis dari Let's Encrypt untuk Nginx",
        installScript: `# Pasang Certbot & plugin Nginx
echo "==> Memasang Certbot SSL..."
apt-get update && apt-get install -y certbot python3-certbot-nginx
certbot --version`
      }
    ]
  },
  {
    id: 'laravel-php',
    name: 'Laravel / PHP',
    category: 'runtime',
    badge: 'PHP-FPM · Composer · Nginx · MySQL',
    description: 'Stack produksi lengkap untuk framework Laravel, Lumen, Symfony, atau aplikasi web PHP modern dengan database MySQL.',
    tools: [
      {
        id: 'php',
        name: 'PHP & PHP-FPM',
        description: 'PHP-FPM fastCGI processor dan modul umum (mbstring, mysql, xml, bcmath, curl, zip)',
        versions: [
          { label: 'PHP 8.3 (Latest Stable)', value: '8.3' },
          { label: 'PHP 8.2 (Standard LTS - Disarankan)', value: '8.2' },
          { label: 'PHP 8.1 (Extended Support)', value: '8.1' }
        ],
        defaultVersion: '8.2',
        installScript: (v = '8.2') => `# Pasang PHP-FPM ${v} dan ekstensi Laravel
echo "==> Memasang PPA Ondřej dan PHP ${v}..."
apt-get update
apt-get install -y software-properties-common
add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
apt-get update
apt-get install -y php${v}-fpm php${v}-cli php${v}-mysql php${v}-mbstring php${v}-xml php${v}-bcmath php${v}-curl php${v}-zip php${v}-intl php${v}-gd php${v}-sqlite3
systemctl enable --now php${v}-fpm || systemctl enable --now php*-fpm || true
php -v`
      },
      {
        id: 'composer',
        name: 'Composer',
        description: 'Dependency package manager resmi untuk ekosistem PHP',
        installScript: `# Pasang Composer
echo "==> Memasang Composer..."
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
composer --version`
      },
      {
        id: 'nginx',
        name: 'Nginx Web Server',
        description: 'Web server & reverse proxy untuk memproses request ke PHP-FPM',
        installScript: `# Pasang Nginx Web Server
echo "==> Memasang Nginx..."
apt-get update && apt-get install -y nginx
systemctl enable --now nginx
echo -n "Nginx terpasang: " && nginx -v`
      },
      {
        id: 'mysql',
        name: 'Database Server',
        description: 'Relational database management system (MySQL atau MariaDB)',
        versions: [
          { label: 'MySQL 8.0 (Oracle)', value: 'mysql' },
          { label: 'MariaDB 10.11 (Community)', value: 'mariadb' }
        ],
        defaultVersion: 'mysql',
        installScript: (v = 'mysql') => v === 'mariadb'
          ? `# Pasang MariaDB Server
echo "==> Memasang MariaDB Server..."
apt-get update && apt-get install -y mariadb-server mariadb-client
systemctl enable --now mariadb
mariadb --version`
          : `# Pasang MySQL Server
echo "==> Memasang MySQL Server..."
apt-get update && apt-get install -y mysql-server
systemctl enable --now mysql
mysql --version`
      }
    ]
  },
  {
    id: 'docker-host',
    name: 'Docker Host',
    category: 'container',
    badge: 'Docker Engine · Docker Compose',
    description: 'Jadikan VPS sebagai host container modern untuk menjalankan containerized apps, microservices, dan multi-container compose stacks.',
    tools: [
      {
        id: 'docker',
        name: 'Docker Engine',
        description: 'Docker Community Edition container runtime dan daemon resmi',
        installScript: `# Pasang Docker Engine resmi
echo "==> Memasang Docker Engine resmi..."
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null || curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker
docker --version`
      },
      {
        id: 'compose',
        name: 'Docker Compose',
        description: 'Plugin orkestrasi multi-container untuk mendefinisikan & menjalankan aplikasi compose',
        installScript: `# Pasang Docker Compose Plugin
echo "==> Memasang Docker Compose plugin..."
apt-get update && apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
docker compose version`
      }
    ]
  },
  {
    id: 'hardening',
    name: 'Hardening Dasar',
    category: 'security',
    badge: 'UFW · Fail2ban · Swap 2GB · Auto Updates',
    description: 'Penguatan keamanan awal (baseline hardening): konfigurasi firewall, proteksi brute-force SSH, alokasi memori virtual swap, dan update keamanan otomatis.',
    tools: [
      {
        id: 'ufw',
        name: 'UFW Firewall',
        description: 'Firewall paket Linux dengan proteksi port SSH, HTTP (80), dan HTTPS (443)',
        installScript: `# Konfigurasi UFW Firewall
echo "==> Mengonfigurasi UFW Firewall..."
apt-get update && apt-get install -y ufw
SSH_PORT=$(ss -tlnp 2>/dev/null | grep sshd | awk '{print $4}' | awk -F: '{print $NF}' | head -1)
[ -z "$SSH_PORT" ] && SSH_PORT=22
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp comment 'SSH Port'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
echo "y" | ufw enable
systemctl enable ufw
ufw status verbose`
      },
      {
        id: 'fail2ban',
        name: 'Fail2ban',
        description: 'Daemon mitigasi pencegah serangan brute-force SSH otomatis dengan ban IP',
        installScript: `# Pasang & Aktifkan Fail2ban
echo "==> Memasang Fail2ban..."
apt-get update && apt-get install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status`
      },
      {
        id: 'swap',
        name: 'Swap Memory (2 GB)',
        description: 'Memori virtual cadangan 2 GB untuk mencegah crash Out-Of-Memory (OOM)',
        installScript: `# Buat 2GB Swap Memory jika belum ada
echo "==> Memeriksa & Mengalokasikan 2GB Swap Memory..."
if [ $(free -m | awk '/^Swap:/{print $2}') -lt 1024 ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  sysctl vm.swappiness=10
  echo "vm.swappiness=10" >> /etc/sysctl.d/99-swappiness.conf
  echo "Swap 2GB berhasil diaktifkan."
else
  echo "Swap memori sudah tersedia (>1GB), melewati pembuatan swap."
fi`
      },
      {
        id: 'autoupdates',
        name: 'Pembaruan Keamanan Otomatis',
        description: 'Layanan unattended-upgrades untuk mengunduh & memasang patch keamanan Linux otomatis',
        installScript: `# Aktifkan Unattended Security Upgrades
echo "==> Mengaktifkan Pembaruan Keamanan Otomatis..."
apt-get update && apt-get install -y unattended-upgrades update-notifier-common
echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades || true
echo "Pembaruan otomatis aktif."`
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// Marketplace Individual Tools Catalog (~22 Tools Populer)
// ---------------------------------------------------------------------------

export const MARKETPLACE_CATALOG: MarketplaceTool[] = [
  // Runtime
  {
    id: 'node',
    name: 'Node.js & npm',
    category: 'runtime',
    description: 'JavaScript runtime lingkungan produksi berbasis V8 engine dari Google',
    versions: [
      { label: 'Node 22 (Current)', value: '22.x' },
      { label: 'Node 20 (LTS)', value: '20.x' },
      { label: 'Node 18 (Maintenance)', value: '18.x' }
    ],
    defaultVersion: '20.x',
    getInstallScript: (v = '20.x') => `echo "==> Memasang Node.js ${v}..."
curl -fsSL https://deb.nodesource.com/setup_${v} | bash -
apt-get install -y nodejs
node -v && npm -v`
  },
  {
    id: 'bun',
    name: 'Bun Runtime',
    category: 'runtime',
    description: 'All-in-one JavaScript & TypeScript toolkit dan runtime super cepat',
    getInstallScript: () => `echo "==> Memasang Bun..."
curl -fsSL https://bun.sh/install | bash
ln -sf /root/.bun/bin/bun /usr/local/bin/bun
bun --version`
  },
  {
    id: 'php',
    name: 'PHP & PHP-FPM',
    category: 'runtime',
    description: 'FastCGI process manager untuk aplikasi web PHP modern',
    versions: [
      { label: 'PHP 8.3 (Latest)', value: '8.3' },
      { label: 'PHP 8.2 (LTS)', value: '8.2' },
      { label: 'PHP 8.1', value: '8.1' }
    ],
    defaultVersion: '8.2',
    getInstallScript: (v = '8.2') => `echo "==> Memasang PHP ${v}..."
apt-get update && apt-get install -y software-properties-common
add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
apt-get update
apt-get install -y php${v}-fpm php${v}-cli php${v}-mysql php${v}-mbstring php${v}-xml php${v}-bcmath php${v}-curl php${v}-zip php${v}-gd php${v}-sqlite3
systemctl enable --now php${v}-fpm || true
php -v`
  },
  {
    id: 'composer',
    name: 'Composer',
    category: 'runtime',
    description: 'Package manager resmi untuk dependency ekosistem PHP',
    getInstallScript: () => `echo "==> Memasang Composer..."
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
composer --version`
  },
  {
    id: 'python',
    name: 'Python 3 & venv',
    category: 'runtime',
    description: 'Lingkungan Python 3 lengkap dengan pip package manager dan virtualenv',
    getInstallScript: () => `echo "==> Memasang Python 3 & Pip..."
apt-get update && apt-get install -y python3 python3-pip python3-venv build-essential
python3 --version && pip3 --version`
  },
  {
    id: 'go',
    name: 'Go (Golang)',
    category: 'runtime',
    description: 'Compiler bahasa pemrograman Go resmi Google untuk performa tinggi',
    getInstallScript: () => `echo "==> Memasang Go..."
apt-get update && apt-get install -y golang-go
go version`
  },

  // Web Servers
  {
    id: 'nginx',
    name: 'Nginx',
    category: 'web',
    description: 'HTTP web server, reverse proxy, dan load balancer berperforma tinggi',
    getInstallScript: () => `echo "==> Memasang Nginx..."
apt-get update && apt-get install -y nginx
systemctl enable --now nginx
nginx -v`
  },
  {
    id: 'caddy',
    name: 'Caddy Server',
    category: 'web',
    description: 'Web server modern dengan sertifikat HTTPS (SSL) otomatis bawaan',
    getInstallScript: () => `echo "==> Memasang Caddy Server..."
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy
systemctl enable --now caddy
caddy version`
  },
  {
    id: 'certbot',
    name: 'Certbot SSL',
    category: 'web',
    description: "Client otomatis untuk menerbitkan sertifikat Let's Encrypt SSL/TLS",
    getInstallScript: () => `echo "==> Memasang Certbot..."
apt-get update && apt-get install -y certbot python3-certbot-nginx
certbot --version`
  },

  // Database & Cache
  {
    id: 'mysql',
    name: 'MySQL Server 8.0',
    category: 'database',
    description: 'Sistem manajemen basis data relasional paling populer di dunia',
    getInstallScript: () => `echo "==> Memasang MySQL Server..."
apt-get update && apt-get install -y mysql-server
systemctl enable --now mysql
mysql --version`
  },
  {
    id: 'mariadb',
    name: 'MariaDB Server',
    category: 'database',
    description: 'Drop-in replacement open-source yang cepat dan andal untuk MySQL',
    getInstallScript: () => `echo "==> Memasang MariaDB Server..."
apt-get update && apt-get install -y mariadb-server mariadb-client
systemctl enable --now mariadb
mariadb --version`
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'database',
    description: 'Object-relational database enterprise-grade dengan fitur SQL tercanggih',
    getInstallScript: () => `echo "==> Memasang PostgreSQL..."
apt-get update && apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql
psql --version`
  },
  {
    id: 'redis',
    name: 'Redis Server',
    category: 'database',
    description: 'In-memory key-value data store untuk caching, sessions, dan message broker',
    getInstallScript: () => `echo "==> Memasang Redis..."
apt-get update && apt-get install -y redis-server
systemctl enable --now redis-server
redis-server --version`
  },

  // Tooling & Queue
  {
    id: 'pm2',
    name: 'PM2',
    category: 'tooling',
    description: 'Production process manager untuk Node.js dengan zero-downtime reload',
    getInstallScript: () => `echo "==> Memasang PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root || true
pm2 -v`
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    category: 'tooling',
    description: 'Client/server system untuk memonitor dan mengontrol proses background di Linux',
    getInstallScript: () => `echo "==> Memasang Supervisor..."
apt-get update && apt-get install -y supervisor
systemctl enable --now supervisor
supervisord -v`
  },

  // Container
  {
    id: 'docker',
    name: 'Docker Engine',
    category: 'container',
    description: 'Platform containerization lengkap untuk menjalankan aplikasi dalam kontainer',
    getInstallScript: () => `echo "==> Memasang Docker..."
apt-get update && apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null || curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker
docker --version`
  },
  {
    id: 'compose',
    name: 'Docker Compose',
    category: 'container',
    description: 'Orkestrasi multi-container apps dengan satu file docker-compose.yml',
    getInstallScript: () => `echo "==> Memasang Docker Compose..."
apt-get update && apt-get install -y docker-compose-plugin || apt-get install -y docker-compose
docker compose version`
  },

  // Security
  {
    id: 'ufw',
    name: 'UFW Firewall',
    category: 'security',
    description: 'Program pengatur iptables Linux untuk memfilter port jaringan masuk/keluar',
    getInstallScript: () => `echo "==> Mengonfigurasi UFW Firewall..."
apt-get update && apt-get install -y ufw
SSH_PORT=$(ss -tlnp 2>/dev/null | grep sshd | awk '{print $4}' | awk -F: '{print $NF}' | head -1)
[ -z "$SSH_PORT" ] && SSH_PORT=22
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp comment 'SSH Port'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
echo "y" | ufw enable
systemctl enable ufw
ufw status verbose`
  },
  {
    id: 'fail2ban',
    name: 'Fail2ban',
    category: 'security',
    description: 'Proteksi otomatis terhadap upaya brute force SSH dengan auto-ban IP address',
    getInstallScript: () => `echo "==> Memasang Fail2ban..."
apt-get update && apt-get install -y fail2ban
systemctl enable --now fail2ban
fail2ban-client status`
  },
  {
    id: 'swap',
    name: 'Swap Memory 2GB',
    category: 'security',
    description: 'Memori virtual tambahan 2 GB untuk menstabilkan beban RAM dan mencegah OOM kill',
    getInstallScript: () => `echo "==> Mengalokasikan 2GB Swap..."
fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
if ! grep -q "/swapfile" /etc/fstab; then
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi
sysctl vm.swappiness=10
echo "vm.swappiness=10" >> /etc/sysctl.d/99-swappiness.conf
echo "Swap 2GB berhasil diaktifkan."`
  },
  {
    id: 'autoupdates',
    name: 'Auto Security Updates',
    category: 'security',
    description: 'Pemasangan otomatis patch keamanan paket Linux penting secara berkala',
    getInstallScript: () => `echo "==> Mengaktifkan Auto Updates..."
apt-get update && apt-get install -y unattended-upgrades update-notifier-common
echo 'APT::Periodic::Update-Package-Lists "1";' > /etc/apt/apt.conf.d/20auto-upgrades
echo 'APT::Periodic::Unattended-Upgrade "1";' >> /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades || true
echo "Pembaruan keamanan otomatis aktif."`
  }
];

// ---------------------------------------------------------------------------
// Template Analysis & Script Generator
// ---------------------------------------------------------------------------

export interface TemplateAnalysis {
  preset: TemplatePreset;
  itemsToInstall: { tool: TemplateToolItem; reason: string; chosenVersion?: string }[];
  itemsSkipped: { tool: TemplateToolItem; installedVersion: string | null }[];
  allInstalled: boolean;
  generatedScript: string;
}

export function analyzeTemplate(
  preset: TemplatePreset,
  installedSoftware: SoftwareItem[],
  options?: {
    forceAll?: boolean;
    versionOverrides?: Record<string, string>;
  }
): TemplateAnalysis {
  const forceAll = !!options?.forceAll;
  const versionOverrides = options?.versionOverrides || {};
  const itemsToInstall: { tool: TemplateToolItem; reason: string; chosenVersion?: string }[] = [];
  const itemsSkipped: { tool: TemplateToolItem; installedVersion: string | null }[] = [];

  for (const tool of preset.tools) {
    const existing = installedSoftware.find((s) => s.id === tool.id);
    const isInstalled = existing ? existing.installed : false;
    const chosenVersion = versionOverrides[tool.id] || tool.defaultVersion;

    if (isInstalled && !forceAll) {
      itemsSkipped.push({
        tool,
        installedVersion: existing?.version || null
      });
    } else {
      itemsToInstall.push({
        tool,
        reason: isInstalled && forceAll ? 'Paksa pasang ulang' : 'Belum terpasang di server',
        chosenVersion
      });
    }
  }

  const allInstalled = itemsToInstall.length === 0;

  // Generate clean, readable bash script
  const scriptLines: string[] = [
    '#!/usr/bin/env bash',
    '# ============================================================',
    `#  7Server — Setup Template: ${preset.name}`,
    `#  Generated on: ${new Date().toLocaleString()}`,
    '# ============================================================',
    'set -e',
    'export DEBIAN_FRONTEND=noninteractive',
    ''
  ];

  if (itemsSkipped.length > 0) {
    scriptLines.push('# --- Komponen yang sudah terpasang (dilewati): ---');
    for (const skip of itemsSkipped) {
      scriptLines.push(`#  [x] ${skip.tool.name} (${skip.installedVersion || 'terdeteksi'})`);
    }
    scriptLines.push('');
  }

  if (allInstalled) {
    scriptLines.push(
      'echo "Semua komponen dalam template ini sudah terpasang di server."',
      'echo "Tidak ada instalasi baru yang diperlukan."',
      'exit 0'
    );
  } else {
    scriptLines.push(
      `echo "Mulai instalasi template: ${preset.name} (${itemsToInstall.length} komponen)..."`,
      'echo ""',
      ''
    );

    itemsToInstall.forEach(({ tool, chosenVersion }, idx) => {
      const scriptBody =
        typeof tool.installScript === 'function'
          ? tool.installScript(chosenVersion)
          : tool.installScript;

      scriptLines.push(
        `# --- Langkah [${idx + 1}/${itemsToInstall.length}]: ${tool.name}${chosenVersion ? ` (${chosenVersion})` : ''} ---`,
        scriptBody,
        'echo ""',
        ''
      );
    });

    scriptLines.push(
      'echo "============================================================"',
      `echo "  Setup Template ${preset.name} Selesai dengan Sukses!"`,
      'echo "============================================================"'
    );
  }

  return {
    preset,
    itemsToInstall,
    itemsSkipped,
    allInstalled,
    generatedScript: scriptLines.join('\n')
  };
}

/** Generate installation script for a single tool from the marketplace */
export function generateSingleToolScript(tool: MarketplaceTool, version?: string): string {
  const chosenVersion = version || tool.defaultVersion;
  const scriptBody = tool.getInstallScript(chosenVersion);

  return [
    '#!/usr/bin/env bash',
    '# ============================================================',
    `#  7Server 1-Click Install: ${tool.name}${chosenVersion ? ` (${chosenVersion})` : ''}`,
    `#  Generated on: ${new Date().toLocaleString()}`,
    '# ============================================================',
    'set -e',
    'export DEBIAN_FRONTEND=noninteractive',
    '',
    scriptBody,
    '',
    'echo "============================================================"',
    `echo "  Pemasangan ${tool.name} Berhasil!"`,
    'echo "============================================================"'
  ].join('\n');
}

/** Formats the script for interactive terminal execution via temp file */
export function formatTerminalCommand(script: string, scriptFilename = '/tmp/vpshub-setup.sh'): string {
  return `cat << 'EOF' > ${scriptFilename}\n${script}\nEOF\nbash ${scriptFilename}`;
}
