import type { SoftwareItem } from '../api';

export interface ToolVersionOption {
  label: string;
  value: string;
}

export interface TemplateToolItem {
  id: string; // matches id in SoftwareItem from software scan
  name: string;
  description: string;
  versions?: ToolVersionOption[];
  defaultVersion?: string;
  steps?: string[];
  configPath?: string;
  defaultPort?: string;
  installScript: string | ((version?: string) => string);
}

export interface TemplatePreset {
  id: string;
  name: string;
  category: 'runtime' | 'container' | 'database' | 'web' | 'security' | 'tooling';
  badge: string;
  description: string;
  recommendedRam?: string;
  estimatedTime?: string;
  tools: TemplateToolItem[];
}

export interface MarketplaceTool {
  id: string;
  name: string;
  category: 'runtime' | 'web' | 'database' | 'container' | 'tooling' | 'security';
  description: string;
  versions?: ToolVersionOption[];
  defaultVersion?: string;
  steps?: string[];
  configPath?: string;
  defaultPort?: string;
  verifyCmd?: string;
  getInstallScript: (version?: string) => string;
}

export const PREFLIGHT_HEADER = `# --- Pre-flight: Environment & APT Lock Guard ---
export DEBIAN_FRONTEND=noninteractive
export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/local/go/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$HOME/.deno/bin:$HOME/.local/bin"
APT_FLAGS="-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -o DPkg::Lock::Timeout=300"

# Wait gracefully if another concurrent task holds apt/dpkg lock
for i in $(seq 1 60); do
  if fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
    echo "[$i/60] Concurrent task holds apt/dpkg lock, waiting for release..."
    sleep 2
  else
    break
  fi
done`;

// ---------------------------------------------------------------------------
// Shared Tool Script Builders (Debian & Ubuntu safe, idempotent)
// ---------------------------------------------------------------------------

const SCRIPTS = {
  node: (v = '20.x') => `# Install Node.js (${v}) & Corepack
echo "==> [1/3] Configuring prerequisites & NodeSource repository (${v})..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS ca-certificates curl gnupg
curl -fsSL https://deb.nodesource.com/setup_${v} | bash -
echo "==> [2/3] Installing nodejs & npm packages..."
apt-get install $APT_FLAGS nodejs
corepack enable 2>/dev/null || true
echo "==> [3/3] Verifying Node.js installation:"
echo -n "  Node.js : " && node -v
echo -n "  npm     : " && npm -v`,

  pnpm: () => `# Install pnpm Package Manager
echo "==> [1/2] Installing pnpm globally..."
if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@latest --activate || npm install -g pnpm
elif command -v npm >/dev/null 2>&1; then
  npm install -g pnpm
else
  curl -fsSL https://get.pnpm.io/install.sh | ENV="$HOME/.bashrc" SHELL="$(which bash)" bash -
  ln -sf "$HOME/.local/share/pnpm/pnpm" /usr/local/bin/pnpm 2>/dev/null || true
fi
echo "==> [2/2] Verifying pnpm: $(pnpm -v)"`,

  yarn: () => `# Install Yarn Package Manager
echo "==> [1/2] Installing Yarn globally..."
if command -v corepack >/dev/null 2>&1; then
  corepack enable
  corepack prepare yarn@stable --activate || npm install -g yarn
else
  npm install -g yarn
fi
echo "==> [2/2] Verifying Yarn: $(yarn -v)"`,

  bun: () => `# Install Bun Runtime & Toolkit
echo "==> [1/3] Ensuring curl and unzip packages are installed..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl unzip
echo "==> [2/3] Downloading and installing Bun..."
curl -fsSL https://bun.sh/install | bash
ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
ln -sf "$HOME/.bun/bin/bunx" /usr/local/bin/bunx
echo "==> [3/3] Verifying Bun: v$(/usr/local/bin/bun --version)"`,

  deno: () => `# Install Deno Runtime
echo "==> [1/2] Downloading and installing Deno..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl unzip
curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh
echo "==> [2/2] Verifying Deno: $(deno --version | head -1)"`,

  php: (v = '8.3') => `# Install PHP ${v}, PHP-FPM & Production Extensions (Ubuntu & Debian)
echo "==> [1/3] Adding official PHP (${v}) repository..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS ca-certificates apt-transport-https software-properties-common curl gnupg lsb-release
. /etc/os-release
if [ "$ID" = "debian" ]; then
  curl -sSLo /usr/share/keyrings/deb.sury.org-php.gpg https://packages.sury.org/php/apt.gpg
  echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" > /etc/apt/sources.list.d/php.list
else
  LC_ALL=C.UTF-8 add-apt-repository -y ppa:ondrej/php 2>/dev/null || true
fi
echo "==> [2/3] Installing PHP ${v}-FPM and production extensions..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS php${v}-fpm php${v}-cli php${v}-common php${v}-mysql php${v}-pgsql php${v}-sqlite3 php${v}-redis php${v}-mbstring php${v}-xml php${v}-bcmath php${v}-curl php${v}-zip php${v}-intl php${v}-gd
echo "==> [3/3] Enabling php${v}-fpm systemd service..."
systemctl enable --now php${v}-fpm || true
php -v | head -1`,

  composer: () => `# Install Composer 2 Dependency Manager
echo "==> [1/2] Downloading official Composer installer..."
export COMPOSER_ALLOW_SUPERUSER=1
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl unzip php-cli
curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
chmod +x /usr/local/bin/composer
echo "==> [2/2] Verifying Composer: $(COMPOSER_ALLOW_SUPERUSER=1 composer --version --no-ansi)"`,

  python: () => `# Install Python 3, Pip, Venv & Build Toolchain
echo "==> [1/2] Installing Python 3, pip, venv, and C/C++ build tools..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS python3 python3-pip python3-venv python3-dev build-essential libpq-dev libssl-dev libffi-dev
echo "==> [2/2] Verifying Python: $(python3 --version) | $(pip3 --version | awk '{print $1, $2}')"`,

  go: (v = '1.23.3') => v === 'apt'
    ? `# Install Go from Distribution Repository
echo "==> Installing golang-go via APT..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS golang-go
go version`
    : `# Install Official Go (Golang) v${v}
echo "==> [1/3] Downloading official Go v${v} tarball..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl tar
ARCH=$(dpkg --print-architecture)
curl -fsSL "https://go.dev/dl/go${v}.linux-\${ARCH}.tar.gz" -o /tmp/go.tar.gz
echo "==> [2/3] Extracting to /usr/local/go and symlinking binary..."
rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz
rm -f /tmp/go.tar.gz
ln -sf /usr/local/go/bin/go /usr/local/bin/go
ln -sf /usr/local/go/bin/gofmt /usr/local/bin/gofmt
echo "==> [3/3] Verifying Go: $(/usr/local/bin/go version)"`,

  rust: () => `# Install Rust & Cargo Toolchain (rustup)
echo "==> [1/2] Installing build prerequisites and running rustup..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl build-essential pkg-config libssl-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ln -sf "$HOME/.cargo/bin/rustc" /usr/local/bin/rustc
ln -sf "$HOME/.cargo/bin/cargo" /usr/local/bin/cargo
echo "==> [2/2] Verifying Rust: $(/usr/local/bin/rustc --version)"`,

  java: (v = '21') => `# Install OpenJDK ${v}
echo "==> [1/2] Installing OpenJDK ${v} JRE & JDK..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS openjdk-${v}-jdk-headless || apt-get install $APT_FLAGS default-jdk-headless
echo "==> [2/2] Verifying Java:"
java -version 2>&1 | head -2`,

  nginx: () => `# Install Nginx Web Server & Reverse Proxy
echo "==> [1/3] Installing Nginx via APT..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS nginx
echo "==> [2/3] Preparing /var/www/apps directory & enabling systemd..."
mkdir -p /var/www/apps /etc/nginx/sites-available /etc/nginx/sites-enabled
systemctl enable --now nginx
echo "==> [3/3] Verifying Nginx:"
nginx -v 2>&1 && nginx -t 2>&1`,

  apache: () => `# Install Apache HTTP Server (apache2)
echo "==> [1/2] Installing Apache2 and proxy/rewrite modules..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS apache2
a2enmod rewrite proxy proxy_http ssl headers 2>/dev/null || true
systemctl enable --now apache2
echo "==> [2/2] Verifying Apache: $(apache2 -v | head -1)"`,

  caddy: () => `# Install Caddy Web Server (Auto HTTPS)
echo "==> [1/3] Adding official Caddy GPG key & repository..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS debian-keyring debian-archive-keyring apt-transport-https curl gnupg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
echo "==> [2/3] Installing Caddy package..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS caddy
systemctl enable --now caddy
echo "==> [3/3] Verifying Caddy: $(caddy version)"`,

  certbot: () => `# Install Certbot & Nginx Automation Plugin
echo "==> [1/2] Installing Certbot and python3-certbot-nginx..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS certbot python3-certbot-nginx
echo "==> [2/2] Verifying Certbot: $(certbot --version 2>&1)"`,

  cloudflared: () => `# Install Cloudflare Tunnel Daemon (cloudflared)
echo "==> [1/2] Downloading official cloudflared binary..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl
ARCH=$(dpkg --print-architecture)
curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-\${ARCH}.deb" -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb || apt-get install -f $APT_FLAGS
rm -f /tmp/cloudflared.deb
echo "==> [2/2] Verifying Cloudflared: $(cloudflared --version)"`,

  haproxy: () => `# Install HAProxy Load Balancer
echo "==> [1/2] Installing HAProxy via APT..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS haproxy
systemctl enable --now haproxy
echo "==> [2/2] Verifying HAProxy: $(haproxy -v | head -1)"`,

  mysql: () => `# Install MySQL Server 8.0
echo "==> [1/2] Installing MySQL Server & Client..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS mysql-server mysql-client
systemctl enable --now mysql
echo "==> [2/2] Verifying MySQL: $(mysql --version)"`,

  mariadb: () => `# Install MariaDB Database Server
echo "==> [1/2] Installing MariaDB Server & Client..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS mariadb-server mariadb-client
systemctl enable --now mariadb
echo "==> [2/2] Verifying MariaDB: $(mariadb --version)"`,

  postgres: () => `# Install PostgreSQL Server & Contrib
echo "==> [1/2] Installing PostgreSQL and contrib extensions..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS postgresql postgresql-contrib libpq-dev
systemctl enable --now postgresql
echo "==> [2/2] Verifying PostgreSQL: $(psql --version)"`,

  redis: () => `# Install Redis In-Memory Store
echo "==> [1/2] Installing Redis Server & enabling systemd..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS redis-server
sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf 2>/dev/null || true
systemctl enable --now redis-server
echo "==> [2/2] Verifying Redis: $(redis-server --version) | Ping: $(redis-cli ping 2>/dev/null || echo OK)"`,

  mongodb: (v = '7.0') => `# Install MongoDB Community Server (${v})
echo "==> [1/3] Adding MongoDB ${v} GPG key & repository..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl gnupg lsb-release
curl -fsSL "https://www.mongodb.org/static/pgp/server-${v}.asc" | gpg --dearmor --yes -o /usr/share/keyrings/mongodb-server-${v}.gpg
CODENAME=$(lsb_release -sc)
[ "$CODENAME" = "noble" ] && CODENAME="jammy"
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-${v}.gpg ] https://repo.mongodb.org/apt/ubuntu \${CODENAME}/mongodb-org/${v} multiverse" > /etc/apt/sources.list.d/mongodb-org-${v}.list
echo "==> [2/3] Installing mongodb-org package..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS mongodb-org
systemctl enable --now mongod
echo "==> [3/3] Verifying MongoDB: $(mongod --version | head -1)"`,

  sqlite: () => `# Install SQLite 3 CLI & Dev Headers
echo "==> Installing SQLite3..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS sqlite3 libsqlite3-dev
echo "Verifying SQLite: $(sqlite3 --version)"`,

  meilisearch: () => `# Install Meilisearch Search Engine
echo "==> [1/2] Downloading official Meilisearch binary..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl
curl -L https://install.meilisearch.com | sh
mv ./meilisearch /usr/local/bin/meilisearch
chmod +x /usr/local/bin/meilisearch
echo "==> [2/2] Verifying Meilisearch: $(/usr/local/bin/meilisearch --version)"`,

  docker: () => `# Install Docker Engine & Containerd
echo "==> [1/3] Setting up official Docker GPG key and repository..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
. /etc/os-release
DISTRO_ID="\${ID:-ubuntu}"
curl -fsSL "https://download.docker.com/linux/\${DISTRO_ID}/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/\${DISTRO_ID} \${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
echo "==> [2/3] Installing Docker CE, CLI, Buildx, and Compose plugin..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || apt-get install $APT_FLAGS docker.io docker-compose-v2
systemctl enable --now docker
groupadd -f docker 2>/dev/null || true
if [ -n "$SUDO_USER" ]; then
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
fi
usermod -aG docker $(whoami) 2>/dev/null || true
chmod 666 /var/run/docker.sock 2>/dev/null || true
echo "==> [3/3] Verifying Docker: $(docker --version)"`,

  compose: () => `# Install Docker Compose v2 Plugin
echo "==> [1/2] Installing Docker Compose plugin..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS docker-compose-plugin || apt-get install $APT_FLAGS docker-compose-v2 || apt-get install $APT_FLAGS docker-compose
echo "==> [2/2] Verifying Compose: $(docker compose version)"`,

  podman: () => `# Install Podman Rootless Container Engine
echo "==> [1/2] Installing Podman via APT..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS podman
echo "==> [2/2] Verifying Podman: $(podman --version)"`,

  lazydocker: () => `# Install Lazydocker Terminal UI
echo "==> [1/2] Downloading latest Lazydocker release..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl tar
DIR=/usr/local/bin bash -c "$(curl -fsSL https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh)"
echo "==> [2/2] Verifying Lazydocker: $(/usr/local/bin/lazydocker --version | head -1)"`,

  pm2: () => `# Install PM2 Production Process Manager
echo "==> [1/2] Installing PM2 globally via npm and configuring systemd..."
npm install -g pm2
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
echo "==> [2/2] Verifying PM2: v$(pm2 -v)"`,

  supervisor: () => `# Install Supervisor Process Manager
echo "==> [1/2] Installing Supervisor process manager..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS supervisor
systemctl enable --now supervisor
echo "==> [2/2] Verifying Supervisor: v$(supervisord -v)"`,

  git: () => `# Install Git Version Control
echo "==> Installing Git..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS git
git --version`,

  gh: () => `# Install Official GitHub CLI (gh)
echo "==> [1/2] Adding official GitHub CLI keyring and repository..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl gnupg
mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS gh
echo "==> [2/2] Verifying GitHub CLI: $(gh --version | head -1)"`,

  ffmpeg: () => `# Install FFmpeg Media Processing Engine
echo "==> [1/2] Installing FFmpeg media tools..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS ffmpeg
echo "==> [2/2] Verifying FFmpeg: $(ffmpeg -version | head -1)"`,

  rclone: () => `# Install Rclone Cloud Storage Sync
echo "==> [1/2] Installing Rclone..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl unzip
curl -fsSL https://rclone.org/install.sh | bash || apt-get install $APT_FLAGS rclone
echo "==> [2/2] Verifying Rclone: $(rclone --version | head -1)"`,

  ufw: () => `# Configure UFW Firewall (Anti-Lockout SSH + HTTP/HTTPS)
echo "==> [1/3] Installing UFW and detecting active SSH port..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS ufw
SSH_PORT=$(ss -tlnp 2>/dev/null | grep sshd | awk '{print $4}' | awk -F: '{print $NF}' | head -1)
[ -z "$SSH_PORT" ] && SSH_PORT=22
echo "==> [2/3] Applying firewall rules (SSH :$SSH_PORT, HTTP :80, HTTPS :443)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "$SSH_PORT"/tcp comment 'SSH Management Port'
ufw allow 80/tcp comment 'HTTP Web'
ufw allow 443/tcp comment 'HTTPS SSL'
echo "y" | ufw enable
systemctl enable ufw
echo "==> [3/3] UFW Status:"
ufw status verbose`,

  fail2ban: () => `# Install & Enable Fail2ban SSH Intrusion Prevention
echo "==> [1/2] Installing Fail2ban and enabling sshd jail protection..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS fail2ban
cat << 'EOF_F2B' > /etc/fail2ban/jail.d/sshd-7server.local
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF_F2B
systemctl enable --now fail2ban
systemctl restart fail2ban
echo "==> [2/2] Verifying Fail2ban: $(fail2ban-client --version | head -1)"`,

  swap: (sizeGb = '2') => `# Virtual Swap Memory Allocation (${sizeGb} GB)
echo "==> [1/3] Checking current Swap allocation..."
SIZE_MB=$(( ${sizeGb} * 1024 ))
if [ $(free -m | awk '/^Swap:/{print $2}') -ge "$SIZE_MB" ]; then
  echo "Swap memory already available (>= ${sizeGb}GB), skipping reallocation."
else
  echo "==> [2/3] Allocating /swapfile of ${sizeGb} GB (\${SIZE_MB} MB)..."
  swapoff /swapfile 2>/dev/null || true
  rm -f /swapfile
  dd if=/dev/zero of=/swapfile bs=1M count="$SIZE_MB" status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q "/swapfile" /etc/fstab; then
    echo "/swapfile none swap sw 0 0" >> /etc/fstab
  fi
  sysctl vm.swappiness=10 >/dev/null 2>&1 || true
  echo "vm.swappiness=10" > /etc/sysctl.d/99-swappiness.conf
fi
echo "==> [3/3] Memory & Swap Status:"
free -h`,

  tailscale: () => `# Install Tailscale Mesh VPN (Zero-Config Private Network)
echo "==> [1/2] Downloading and installing official Tailscale..."
apt-get update -o DPkg::Lock::Timeout=60 && apt-get install $APT_FLAGS curl
curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled
echo "==> [2/2] Verifying Tailscale: $(tailscale version | head -1) (Run 'tailscale up' to authenticate)"`,

  autoupdates: () => `# Enable Unattended Security Updates
echo "==> [1/2] Installing unattended-upgrades..."
apt-get update -o DPkg::Lock::Timeout=60
apt-get install $APT_FLAGS unattended-upgrades update-notifier-common
cat << 'EOF_AUTO' > /etc/apt/apt.conf.d/20auto-upgrades
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF_AUTO
systemctl enable --now unattended-upgrades || true
echo "==> [2/2] Automatic security updates enabled."`
};

// ---------------------------------------------------------------------------
// 10 Comprehensive Preset Stacks
// ---------------------------------------------------------------------------

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: 'node-app',
    name: 'Node.js & Next.js Stack',
    category: 'runtime',
    badge: 'Node LTS · pnpm · PM2 · Nginx · SSL',
    recommendedRam: '1 GB+',
    estimatedTime: '~2 mins',
    description: 'Production-ready stack for Node.js, Next.js SSR, NestJS, or Express apps with PM2 cluster daemon, pnpm, and Nginx reverse proxy SSL.',
    tools: [
      {
        id: 'node',
        name: 'Node.js Runtime',
        description: 'JavaScript V8 server runtime with npm and corepack included',
        versions: [
          { label: 'Node.js 22 (Current LTS)', value: '22.x' },
          { label: 'Node.js 20 (Active LTS - Recommended)', value: '20.x' },
          { label: 'Node.js 18 (Maintenance LTS)', value: '18.x' }
        ],
        defaultVersion: '20.x',
        steps: ['Configure NodeSource repository', 'Install nodejs & npm packages', 'Enable Corepack'],
        installScript: SCRIPTS.node
      },
      {
        id: 'pnpm',
        name: 'pnpm Package Manager',
        description: 'Fast, disk space efficient package manager for modern monorepos',
        steps: ['Enable pnpm via Corepack or npm global'],
        installScript: SCRIPTS.pnpm
      },
      {
        id: 'pm2',
        name: 'PM2 Process Manager',
        description: 'Production process manager with auto-restart, RAM monitoring, and systemd startup',
        steps: ['Install PM2 globally via npm', 'Register systemd startup service'],
        installScript: SCRIPTS.pm2
      },
      {
        id: 'nginx',
        name: 'Nginx Web Server',
        description: 'High-performance HTTP/2 reverse proxy routing domain traffic to internal Node.js port',
        configPath: '/etc/nginx/sites-available',
        defaultPort: '80 / 443',
        steps: ['Install Nginx', 'Prepare /var/www/apps directory', 'Enable systemd service'],
        installScript: SCRIPTS.nginx
      },
      {
        id: 'certbot',
        name: "Certbot (Let's Encrypt SSL)",
        description: 'Automatic HTTPS certificate issuance and renewal for Nginx',
        steps: ['Install Certbot & python3-certbot-nginx plugin'],
        installScript: SCRIPTS.certbot
      },
      {
        id: 'git',
        name: 'Git CLI',
        description: 'Version control system to clone and pull source code directly on the server',
        steps: ['Install git package'],
        installScript: SCRIPTS.git
      }
    ]
  },
  {
    id: 'laravel-php',
    name: 'Laravel / PHP LEMP Stack',
    category: 'runtime',
    badge: 'PHP-FPM · Composer · Nginx · MySQL · Redis',
    recommendedRam: '2 GB+',
    estimatedTime: '~3 mins',
    description: 'Enterprise PHP stack for Laravel, Filament, Livewire, or WordPress with PHP-FPM, MySQL/MariaDB, Redis cache, and Supervisor queue worker.',
    tools: [
      {
        id: 'php',
        name: 'PHP & PHP-FPM',
        description: 'PHP-FPM FastCGI processor with production extensions (mbstring, mysql, redis, xml, curl, zip, gd, intl)',
        versions: [
          { label: 'PHP 8.3 (Latest Stable - Recommended)', value: '8.3' },
          { label: 'PHP 8.2 (Standard LTS)', value: '8.2' },
          { label: 'PHP 8.1 (Legacy Support)', value: '8.1' }
        ],
        defaultVersion: '8.3',
        configPath: '/etc/php/8.3/fpm',
        steps: ['Configure Ondrej PPA / Sury Debian repo', 'Install PHP-FPM & 12 extensions', 'Enable php-fpm systemd'],
        installScript: SCRIPTS.php
      },
      {
        id: 'composer',
        name: 'Composer 2',
        description: 'Standard package dependency manager for the PHP ecosystem',
        steps: ['Download official Composer binary to /usr/local/bin/composer'],
        installScript: SCRIPTS.composer
      },
      {
        id: 'nginx',
        name: 'Nginx Web Server',
        description: 'High-speed web server forwarding PHP requests to FastCGI socket',
        configPath: '/etc/nginx/sites-available',
        defaultPort: '80 / 443',
        steps: ['Install Nginx & enable systemd service'],
        installScript: SCRIPTS.nginx
      },
      {
        id: 'mysql',
        name: 'Relational Database (MySQL / MariaDB)',
        description: 'Primary relational database server for application tables',
        versions: [
          { label: 'MySQL 8.0 Server', value: 'mysql' },
          { label: 'MariaDB 10.11 Server', value: 'mariadb' }
        ],
        defaultVersion: 'mysql',
        defaultPort: '3306',
        steps: ['Install database server & client', 'Enable systemd daemon'],
        installScript: (v = 'mysql') => (v === 'mariadb' ? SCRIPTS.mariadb() : SCRIPTS.mysql())
      },
      {
        id: 'redis',
        name: 'Redis Server',
        description: 'In-memory store for Laravel Cache, Session, and Horizon Queue',
        defaultPort: '6379',
        steps: ['Install redis-server', 'Configure supervised systemd & start service'],
        installScript: SCRIPTS.redis
      },
      {
        id: 'supervisor',
        name: 'Supervisor Process Control',
        description: 'Keeps background workers (`php artisan queue:work`) running 24/7',
        configPath: '/etc/supervisor/conf.d',
        steps: ['Install supervisor & enable systemd'],
        installScript: SCRIPTS.supervisor
      },
      {
        id: 'certbot',
        name: 'Certbot SSL',
        description: "Let's Encrypt automated SSL for Laravel application domains",
        steps: ['Install certbot & nginx plugin'],
        installScript: SCRIPTS.certbot
      }
    ]
  },
  {
    id: 'python-ai',
    name: 'Python, FastAPI & AI Stack',
    category: 'runtime',
    badge: 'Python 3 · Pip/Venv · Postgres · Redis · Nginx',
    recommendedRam: '2 GB+',
    estimatedTime: '~2.5 mins',
    description: 'Ready-to-use stack for Python backends (FastAPI, Django, Flask), AI/LLM microservices, and Celery workers with PostgreSQL & Redis.',
    tools: [
      {
        id: 'python',
        name: 'Python 3, Pip & Venv',
        description: 'Python 3 runtime with virtualenv and C/C++ compilation headers for AI/data packages',
        steps: ['Install python3, pip, venv, and build-essential'],
        installScript: SCRIPTS.python
      },
      {
        id: 'postgres',
        name: 'PostgreSQL Database',
        description: 'Enterprise relational database ideal for Django/FastAPI applications',
        defaultPort: '5432',
        steps: ['Install postgresql & postgresql-contrib', 'Enable systemd service'],
        installScript: SCRIPTS.postgres
      },
      {
        id: 'redis',
        name: 'Redis Broker & Cache',
        description: 'Message broker for Celery / RQ background jobs and API caching',
        defaultPort: '6379',
        steps: ['Install & enable redis-server'],
        installScript: SCRIPTS.redis
      },
      {
        id: 'supervisor',
        name: 'Supervisor Daemon',
        description: 'Process supervisor for running Gunicorn / Uvicorn and Celery workers',
        steps: ['Install supervisor daemon'],
        installScript: SCRIPTS.supervisor
      },
      {
        id: 'nginx',
        name: 'Nginx Reverse Proxy',
        description: 'Reverse proxy in front of Uvicorn/Gunicorn with request buffering & SSL',
        steps: ['Install Nginx web server'],
        installScript: SCRIPTS.nginx
      },
      {
        id: 'certbot',
        name: 'Certbot SSL',
        description: 'Automated SSL/TLS certificates for Python API endpoints',
        steps: ['Install Certbot Nginx'],
        installScript: SCRIPTS.certbot
      }
    ]
  },
  {
    id: 'go-microservice',
    name: 'Go (Golang) High-Perf Stack',
    category: 'runtime',
    badge: 'Go Compiler · Postgres · Redis · Nginx · SSL',
    recommendedRam: '1 GB+',
    estimatedTime: '~2 mins',
    description: 'High-performance Go microservice build & runtime environment with PostgreSQL, Redis, and Nginx reverse proxy.',
    tools: [
      {
        id: 'go',
        name: 'Go (Golang) Toolchain',
        description: 'Official Go compiler for compiling native binaries directly on the server',
        versions: [
          { label: 'Go 1.23.3 (Latest Official)', value: '1.23.3' },
          { label: 'Go 1.22.9 (Stable Release)', value: '1.22.9' },
          { label: 'Go Distro Default (APT)', value: 'apt' }
        ],
        defaultVersion: '1.23.3',
        steps: ['Download official go.dev tarball', 'Extract to /usr/local/go & symlink binary'],
        installScript: SCRIPTS.go
      },
      {
        id: 'postgres',
        name: 'PostgreSQL',
        description: 'Primary relational database for Go services',
        defaultPort: '5432',
        installScript: SCRIPTS.postgres
      },
      {
        id: 'redis',
        name: 'Redis Server',
        description: 'In-memory rate limiter and pub/sub cache',
        defaultPort: '6379',
        installScript: SCRIPTS.redis
      },
      {
        id: 'nginx',
        name: 'Nginx Reverse Proxy',
        description: 'Ingress proxy routing web traffic to the Go binary port',
        installScript: SCRIPTS.nginx
      },
      {
        id: 'certbot',
        name: 'Certbot SSL',
        description: 'Automated HTTPS from Let’s Encrypt',
        installScript: SCRIPTS.certbot
      },
      {
        id: 'git',
        name: 'Git CLI',
        description: 'Clone repositories and fetch Go modules',
        installScript: SCRIPTS.git
      }
    ]
  },
  {
    id: 'bun-modern',
    name: 'Bun & Caddy Modern Stack',
    category: 'runtime',
    badge: 'Bun · Node · Caddy Auto-SSL · Postgres · Redis',
    recommendedRam: '1 GB+',
    estimatedTime: '~2 mins',
    description: 'Modern, ultra-fast stack: Bun runtime for Hono/Elysia/Next, Caddy with automatic HTTPS, and PostgreSQL.',
    tools: [
      {
        id: 'bun',
        name: 'Bun Runtime',
        description: 'Ultra-fast JavaScript/TypeScript runtime with built-in bundler & package manager',
        steps: ['Download official installer from bun.sh', 'Symlink binary to /usr/local/bin/bun'],
        installScript: SCRIPTS.bun
      },
      {
        id: 'node',
        name: 'Node.js LTS',
        description: 'Full compatibility for Node tooling and ecosystem packages',
        defaultVersion: '20.x',
        installScript: SCRIPTS.node
      },
      {
        id: 'pm2',
        name: 'PM2 Process Manager',
        description: 'Runs Bun/Node background processes with auto-restart',
        installScript: SCRIPTS.pm2
      },
      {
        id: 'caddy',
        name: 'Caddy Web Server',
        description: 'Modern reverse proxy with automatic SSL and HTTP/3 support',
        configPath: '/etc/caddy/Caddyfile',
        installScript: SCRIPTS.caddy
      },
      {
        id: 'postgres',
        name: 'PostgreSQL',
        description: 'Modern relational database for Drizzle / Prisma ORM',
        installScript: SCRIPTS.postgres
      },
      {
        id: 'redis',
        name: 'Redis Server',
        description: 'High-speed cache & session store',
        installScript: SCRIPTS.redis
      }
    ]
  },
  {
    id: 'docker-host',
    name: 'Docker & Container Cloud Host',
    category: 'container',
    badge: 'Docker CE · Compose v2 · Lazydocker · UFW · Fail2ban',
    recommendedRam: '2 GB+',
    estimatedTime: '~2.5 mins',
    description: 'Sets up the VPS as a production container host with official Docker Engine, Compose v2, Lazydocker TUI, and security hardening.',
    tools: [
      {
        id: 'docker',
        name: 'Docker Engine (CE)',
        description: 'Container runtime and daemon from download.docker.com repository',
        steps: ['Install official Docker GPG key', 'Install docker-ce, containerd & buildx', 'Enable systemd service'],
        installScript: SCRIPTS.docker
      },
      {
        id: 'compose',
        name: 'Docker Compose v2',
        description: 'Multi-container orchestration via `docker compose up -d`',
        steps: ['Install docker-compose-plugin'],
        installScript: SCRIPTS.compose
      },
      {
        id: 'lazydocker',
        name: 'Lazydocker TUI',
        description: 'Terminal UI for monitoring containers, images, volumes, and logs',
        steps: ['Download lazydocker binary to /usr/local/bin'],
        installScript: SCRIPTS.lazydocker
      },
      {
        id: 'ufw',
        name: 'UFW Firewall',
        description: 'Protects inbound ports (SSH, 80, and 443 opened)',
        installScript: SCRIPTS.ufw
      },
      {
        id: 'fail2ban',
        name: 'Fail2ban SSH Guard',
        description: 'Prevents brute-force SSH attacks on the container host',
        installScript: SCRIPTS.fail2ban
      }
    ]
  },
  {
    id: 'database-cluster',
    name: 'Database, Cache & Search Node',
    category: 'database',
    badge: 'PostgreSQL · MySQL · Redis · Meilisearch · Rclone',
    recommendedRam: '2 GB+',
    estimatedTime: '~3 mins',
    description: 'Dedicated database & caching server with Meilisearch full-text search engine and Rclone cloud backup sync.',
    tools: [
      {
        id: 'postgres',
        name: 'PostgreSQL Server',
        description: 'Primary relational and JSONB database engine',
        defaultPort: '5432',
        installScript: SCRIPTS.postgres
      },
      {
        id: 'mysql',
        name: 'MySQL / MariaDB Server',
        description: 'Relational database compatible with MySQL standard protocol',
        versions: [
          { label: 'MySQL 8.0 Server', value: 'mysql' },
          { label: 'MariaDB 10.11 Server', value: 'mariadb' }
        ],
        defaultVersion: 'mysql',
        defaultPort: '3306',
        installScript: (v = 'mysql') => (v === 'mariadb' ? SCRIPTS.mariadb() : SCRIPTS.mysql())
      },
      {
        id: 'redis',
        name: 'Redis Server',
        description: 'In-memory key-value database & cache',
        defaultPort: '6379',
        installScript: SCRIPTS.redis
      },
      {
        id: 'meilisearch',
        name: 'Meilisearch Engine',
        description: 'Lightning-fast full-text search engine with typo-tolerance',
        defaultPort: '7700',
        installScript: SCRIPTS.meilisearch
      },
      {
        id: 'rclone',
        name: 'Rclone Cloud Backup',
        description: 'Syncs database dumps to AWS S3, Cloudflare R2, or Google Drive',
        installScript: SCRIPTS.rclone
      }
    ]
  },
  {
    id: 'edge-proxy',
    name: 'Edge Proxy, SSL & Cloudflare Tunnel',
    category: 'web',
    badge: 'Nginx · Caddy · Certbot · Cloudflared · UFW',
    recommendedRam: '512 MB+',
    estimatedTime: '~1.5 mins',
    description: 'Ingress reverse proxy gateway or exposes internal services securely to Cloudflare Zero Trust without public open ports.',
    tools: [
      {
        id: 'nginx',
        name: 'Nginx Reverse Proxy',
        description: 'Primary reverse proxy for multi-domain virtual hosts',
        installScript: SCRIPTS.nginx
      },
      {
        id: 'certbot',
        name: 'Certbot Let’s Encrypt',
        description: 'Free automated SSL certificates for all Nginx domains',
        installScript: SCRIPTS.certbot
      },
      {
        id: 'cloudflared',
        name: 'Cloudflare Tunnel (cloudflared)',
        description: 'Connects internal servers to Cloudflare without opening public ports',
        installScript: SCRIPTS.cloudflared
      },
      {
        id: 'ufw',
        name: 'UFW Firewall',
        description: 'Restricts inbound network traffic to authorized ports',
        installScript: SCRIPTS.ufw
      }
    ]
  },
  {
    id: 'hardening',
    name: 'Security Hardening & Stability',
    category: 'security',
    badge: 'UFW · Fail2ban · Swap Memory · Tailscale · Auto-Patch',
    recommendedRam: 'All Servers',
    estimatedTime: '~1.5 mins',
    description: 'Baseline security for every VPS: firewall rules, SSH anti-brute force, Swap memory against OOM crashes, Tailscale VPN, and automatic patches.',
    tools: [
      {
        id: 'ufw',
        name: 'UFW Firewall',
        description: 'Linux packet firewall with automatic SSH port detection to prevent lockouts',
        steps: ['Detect active sshd port', 'Allow SSH, HTTP (80), HTTPS (443)', 'Enable UFW firewall'],
        installScript: SCRIPTS.ufw
      },
      {
        id: 'fail2ban',
        name: 'Fail2ban SSH Protection',
        description: 'Automatically bans IP addresses after 5 failed SSH attempts within 10 minutes',
        steps: ['Install fail2ban', 'Configure sshd-7server.local jail rule', 'Restart fail2ban service'],
        installScript: SCRIPTS.fail2ban
      },
      {
        id: 'swap',
        name: 'Virtual Swap Memory',
        description: 'Virtual memory file on disk preventing database and build crashes from out-of-memory (OOM)',
        versions: [
          { label: '1 GB Swap (Small VPS)', value: '1' },
          { label: '2 GB Swap (Recommended)', value: '2' },
          { label: '4 GB Swap (Heavy Builds / Docker)', value: '4' },
          { label: '8 GB Swap (Large Workloads)', value: '8' }
        ],
        defaultVersion: '2',
        steps: ['Allocate /swapfile', 'Set 0600 permissions & mkswap', 'Persist to /etc/fstab with swappiness=10'],
        installScript: SCRIPTS.swap
      },
      {
        id: 'tailscale',
        name: 'Tailscale Private VPN',
        description: 'Encrypted WireGuard mesh network for server-to-server communication without public IPs',
        installScript: SCRIPTS.tailscale
      },
      {
        id: 'autoupdates',
        name: 'Auto Security Updates',
        description: 'Downloads and applies distro security patches automatically in the background',
        installScript: SCRIPTS.autoupdates
      }
    ]
  },
  {
    id: 'devops-media',
    name: 'DevOps, CLI & Media Toolkit',
    category: 'tooling',
    badge: 'Git · GitHub CLI · FFmpeg · Rclone · SQLite',
    recommendedRam: '1 GB+',
    estimatedTime: '~1.5 mins',
    description: 'Essential developer tools for CI/CD automation, video/audio transcoding (FFmpeg), and cloud storage syncing.',
    tools: [
      {
        id: 'git',
        name: 'Git Version Control',
        description: 'Standard version control system for source code repositories',
        installScript: SCRIPTS.git
      },
      {
        id: 'gh',
        name: 'GitHub CLI (gh)',
        description: 'Official GitHub CLI for token auth, cloning private repos, and PR management',
        installScript: SCRIPTS.gh
      },
      {
        id: 'ffmpeg',
        name: 'FFmpeg Media Engine',
        description: 'Transcoding, compression, and media processing engine for audio/video apps',
        installScript: SCRIPTS.ffmpeg
      },
      {
        id: 'rclone',
        name: 'Rclone Cloud Sync',
        description: 'File sync and backup tool supporting 40+ cloud storage providers',
        installScript: SCRIPTS.rclone
      },
      {
        id: 'sqlite',
        name: 'SQLite 3 Engine',
        description: 'Lightweight, self-contained SQL database engine requiring zero daemon setup',
        installScript: SCRIPTS.sqlite
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// Marketplace Individual Tools Catalog (39 Curated Tools)
// ---------------------------------------------------------------------------

export const MARKETPLACE_CATALOG: MarketplaceTool[] = [
  // --- RUNTIMES & PACKAGE MANAGERS (11) ---
  {
    id: 'node',
    name: 'Node.js & npm',
    category: 'runtime',
    description: 'Production JavaScript runtime based on Google V8 engine with npm & Corepack.',
    defaultPort: '3000',
    verifyCmd: 'node -v && npm -v',
    steps: ['Configure NodeSource repo', 'Install nodejs & npm packages', 'Enable Corepack'],
    versions: [
      { label: 'Node 22 (Current LTS)', value: '22.x' },
      { label: 'Node 20 (Active LTS)', value: '20.x' },
      { label: 'Node 18 (Maintenance)', value: '18.x' }
    ],
    defaultVersion: '20.x',
    getInstallScript: SCRIPTS.node
  },
  {
    id: 'pnpm',
    name: 'pnpm',
    category: 'runtime',
    description: 'Ultra-fast, disk space efficient package manager with hardlink content-addressable storage.',
    verifyCmd: 'pnpm -v',
    steps: ['Enable pnpm via Corepack or npm global'],
    getInstallScript: SCRIPTS.pnpm
  },
  {
    id: 'yarn',
    name: 'Yarn Package Manager',
    category: 'runtime',
    description: 'Stable JavaScript package manager optimized for workspaces and monorepos.',
    verifyCmd: 'yarn -v',
    steps: ['Enable Yarn via Corepack or npm global'],
    getInstallScript: SCRIPTS.yarn
  },
  {
    id: 'bun',
    name: 'Bun Runtime',
    category: 'runtime',
    description: 'All-in-one JavaScript & TypeScript runtime, bundler, test runner, and package manager.',
    verifyCmd: 'bun --version',
    steps: ['Download official installer from bun.sh', 'Symlink binary to /usr/local/bin/bun'],
    getInstallScript: SCRIPTS.bun
  },
  {
    id: 'deno',
    name: 'Deno Runtime',
    category: 'runtime',
    description: 'Secure-by-default runtime for JavaScript, TypeScript, and WebAssembly by the creator of Node.js.',
    verifyCmd: 'deno --version',
    steps: ['Download official installer from deno.land to /usr/local/bin'],
    getInstallScript: SCRIPTS.deno
  },
  {
    id: 'php',
    name: 'PHP & PHP-FPM',
    category: 'runtime',
    description: 'FastCGI process manager with 12 production extensions (mysql, pgsql, redis, mbstring, gd, zip, intl).',
    configPath: '/etc/php',
    verifyCmd: 'php -v',
    steps: ['Configure PPA / Sury repository', 'Install PHP-FPM & extensions', 'Enable systemd service'],
    versions: [
      { label: 'PHP 8.3 (Latest Stable)', value: '8.3' },
      { label: 'PHP 8.2 (LTS)', value: '8.2' },
      { label: 'PHP 8.1', value: '8.1' }
    ],
    defaultVersion: '8.3',
    getInstallScript: SCRIPTS.php
  },
  {
    id: 'composer',
    name: 'Composer 2',
    category: 'runtime',
    description: 'Official dependency manager for PHP and Laravel ecosystem libraries.',
    verifyCmd: 'composer --version',
    steps: ['Download installer from getcomposer.org', 'Install to /usr/local/bin/composer'],
    getInstallScript: SCRIPTS.composer
  },
  {
    id: 'python',
    name: 'Python 3, Pip & Venv',
    category: 'runtime',
    description: 'Python 3 runtime environment with pip, virtualenv, and C/C++ compilation headers.',
    verifyCmd: 'python3 --version && pip3 --version',
    steps: ['Install python3, python3-pip, python3-venv, and build-essential'],
    getInstallScript: SCRIPTS.python
  },
  {
    id: 'go',
    name: 'Go (Golang)',
    category: 'runtime',
    description: 'Official Go compiler from go.dev for building high-performance concurrent applications.',
    verifyCmd: 'go version',
    steps: ['Download official go.dev tarball', 'Extract to /usr/local/go and symlink to /usr/local/bin/go'],
    versions: [
      { label: 'Go 1.23.3 (Latest Official)', value: '1.23.3' },
      { label: 'Go 1.22.9 (Stable)', value: '1.22.9' },
      { label: 'Go APT Distro', value: 'apt' }
    ],
    defaultVersion: '1.23.3',
    getInstallScript: SCRIPTS.go
  },
  {
    id: 'rust',
    name: 'Rust & Cargo (rustup)',
    category: 'runtime',
    description: 'Rust compiler (`rustc`) and `cargo` package manager via official rustup installer.',
    verifyCmd: 'rustc --version && cargo --version',
    steps: ['Install build-essential & libssl-dev', 'Run automatic rustup-init', 'Symlink rustc & cargo'],
    getInstallScript: SCRIPTS.rust
  },
  {
    id: 'java',
    name: 'Java (OpenJDK)',
    category: 'runtime',
    description: 'OpenJDK Java Runtime & Development Kit for Spring Boot, Kafka, or JVM workloads.',
    verifyCmd: 'java -version',
    versions: [
      { label: 'OpenJDK 21 (LTS)', value: '21' },
      { label: 'OpenJDK 17 (LTS)', value: '17' }
    ],
    defaultVersion: '21',
    steps: ['Install openjdk-jdk-headless package via APT'],
    getInstallScript: SCRIPTS.java
  },

  // --- WEB SERVERS, PROXIES & TUNNELS (6) ---
  {
    id: 'nginx',
    name: 'Nginx Web Server',
    category: 'web',
    description: 'Industry-standard HTTP web server, reverse proxy, and load balancer with low memory usage.',
    configPath: '/etc/nginx/sites-available',
    defaultPort: '80 / 443',
    verifyCmd: 'nginx -v',
    steps: ['Install nginx package', 'Prepare /var/www/apps directory', 'Enable Nginx systemd service'],
    getInstallScript: SCRIPTS.nginx
  },
  {
    id: 'caddy',
    name: 'Caddy Web Server',
    category: 'web',
    description: 'Modern web server and reverse proxy featuring built-in automatic HTTPS (SSL).',
    configPath: '/etc/caddy/Caddyfile',
    defaultPort: '80 / 443',
    verifyCmd: 'caddy version',
    steps: ['Add official Cloudsmith Caddy repository', 'Install caddy package & enable systemd'],
    getInstallScript: SCRIPTS.caddy
  },
  {
    id: 'apache',
    name: 'Apache HTTP Server',
    category: 'web',
    description: 'Modular web server with full `.htaccess` and mod_rewrite support.',
    configPath: '/etc/apache2/sites-available',
    defaultPort: '80 / 443',
    verifyCmd: 'apache2 -v',
    steps: ['Install apache2', 'Enable rewrite, proxy, and ssl modules'],
    getInstallScript: SCRIPTS.apache
  },
  {
    id: 'certbot',
    name: 'Certbot (Let’s Encrypt)',
    category: 'web',
    description: 'Automated client for issuing and renewing free SSL/TLS certificates from Let’s Encrypt.',
    verifyCmd: 'certbot --version',
    steps: ['Install certbot and python3-certbot-nginx'],
    getInstallScript: SCRIPTS.certbot
  },
  {
    id: 'cloudflared',
    name: 'Cloudflare Tunnel',
    category: 'web',
    description: 'Zero-Trust daemon connecting local services to Cloudflare without opening public firewall ports.',
    verifyCmd: 'cloudflared --version',
    steps: ['Download official .deb package according to architecture', 'Install cloudflared binary'],
    getInstallScript: SCRIPTS.cloudflared
  },
  {
    id: 'haproxy',
    name: 'HAProxy Load Balancer',
    category: 'web',
    description: 'High-performance TCP/HTTP load balancer for distributing high-concurrency traffic.',
    configPath: '/etc/haproxy/haproxy.cfg',
    verifyCmd: 'haproxy -v',
    steps: ['Install haproxy & enable systemd service'],
    getInstallScript: SCRIPTS.haproxy
  },

  // --- DATABASES, CACHE & SEARCH (7) ---
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'database',
    description: 'Enterprise object-relational database with JSONB, advanced indexing, and contrib extensions.',
    configPath: '/etc/postgresql',
    defaultPort: '5432',
    verifyCmd: 'psql --version',
    steps: ['Install postgresql, postgresql-contrib & libpq-dev', 'Enable postgresql service'],
    getInstallScript: SCRIPTS.postgres
  },
  {
    id: 'mysql',
    name: 'MySQL Server 8.0',
    category: 'database',
    description: 'Widely deployed relational database system for web applications of any scale.',
    configPath: '/etc/mysql',
    defaultPort: '3306',
    verifyCmd: 'mysql --version',
    steps: ['Install mysql-server & mysql-client', 'Enable mysql systemd service'],
    getInstallScript: SCRIPTS.mysql
  },
  {
    id: 'mariadb',
    name: 'MariaDB Server',
    category: 'database',
    description: 'Fast, reliable, and drop-in open-source replacement for MySQL Server.',
    configPath: '/etc/mysql/mariadb.conf.d',
    defaultPort: '3306',
    verifyCmd: 'mariadb --version',
    steps: ['Install mariadb-server & mariadb-client', 'Enable mariadb systemd service'],
    getInstallScript: SCRIPTS.mariadb
  },
  {
    id: 'redis',
    name: 'Redis Server',
    category: 'database',
    description: 'In-memory key-value data structure store for caching, sessions, and BullMQ/Horizon queues.',
    configPath: '/etc/redis/redis.conf',
    defaultPort: '6379',
    verifyCmd: 'redis-server --version',
    steps: ['Install redis-server', 'Configure supervised systemd & start service'],
    getInstallScript: SCRIPTS.redis
  },
  {
    id: 'mongodb',
    name: 'MongoDB Community',
    category: 'database',
    description: 'Modern document-oriented NoSQL database for flexible schemas and horizontal scalability.',
    configPath: '/etc/mongod.conf',
    defaultPort: '27017',
    verifyCmd: 'mongod --version',
    versions: [
      { label: 'MongoDB 7.0 (Stable)', value: '7.0' },
      { label: 'MongoDB 6.0', value: '6.0' }
    ],
    defaultVersion: '7.0',
    steps: ['Add official MongoDB GPG key & repo', 'Install mongodb-org & start mongod service'],
    getInstallScript: SCRIPTS.mongodb
  },
  {
    id: 'sqlite',
    name: 'SQLite 3',
    category: 'database',
    description: 'Lightweight, single-file embedded SQL engine requiring no standalone daemon.',
    verifyCmd: 'sqlite3 --version',
    steps: ['Install sqlite3 & libsqlite3-dev'],
    getInstallScript: SCRIPTS.sqlite
  },
  {
    id: 'meilisearch',
    name: 'Meilisearch',
    category: 'database',
    description: 'Rust-based lightning-fast full-text search engine with out-of-the-box typo-tolerance.',
    defaultPort: '7700',
    verifyCmd: 'meilisearch --version',
    steps: ['Download official Meilisearch binary to /usr/local/bin/meilisearch'],
    getInstallScript: SCRIPTS.meilisearch
  },

  // --- CONTAINERS & ORCHESTRATION (4) ---
  {
    id: 'docker',
    name: 'Docker Engine (CE)',
    category: 'container',
    description: 'Official containerization platform including Docker CLI, Containerd, Buildx, and Compose plugin.',
    configPath: '/etc/docker/daemon.json',
    verifyCmd: 'docker --version',
    steps: ['Setup download.docker.com GPG key & repo', 'Install docker-ce & containerd', 'Enable Docker systemd'],
    getInstallScript: SCRIPTS.docker
  },
  {
    id: 'compose',
    name: 'Docker Compose v2',
    category: 'container',
    description: 'Multi-container orchestration tool defining application stacks in `docker-compose.yml`.',
    verifyCmd: 'docker compose version',
    steps: ['Install docker-compose-plugin package'],
    getInstallScript: SCRIPTS.compose
  },
  {
    id: 'podman',
    name: 'Podman Engine',
    category: 'container',
    description: 'Daemonless, rootless container engine fully CLI-compatible with Docker.',
    verifyCmd: 'podman --version',
    steps: ['Install podman package via APT'],
    getInstallScript: SCRIPTS.podman
  },
  {
    id: 'lazydocker',
    name: 'Lazydocker TUI',
    category: 'container',
    description: 'Visual terminal UI for managing Docker containers, images, volumes, and logs with ease.',
    verifyCmd: 'lazydocker --version',
    steps: ['Download Lazydocker binary to /usr/local/bin/lazydocker'],
    getInstallScript: SCRIPTS.lazydocker
  },

  // --- TOOLING, PROCESS & MEDIA (6) ---
  {
    id: 'pm2',
    name: 'PM2 Process Manager',
    category: 'tooling',
    description: 'Production process manager for Node.js, Bun, or Python with clustering & zero-downtime reloads.',
    verifyCmd: 'pm2 -v',
    steps: ['Install PM2 globally via npm', 'Configure systemd startup hook'],
    getInstallScript: SCRIPTS.pm2
  },
  {
    id: 'supervisor',
    name: 'Supervisor',
    category: 'tooling',
    description: 'Client/server process monitor for keeping Laravel & Python background workers alive.',
    configPath: '/etc/supervisor/conf.d',
    verifyCmd: 'supervisord -v',
    steps: ['Install supervisor & enable systemd service'],
    getInstallScript: SCRIPTS.supervisor
  },
  {
    id: 'git',
    name: 'Git Version Control',
    category: 'tooling',
    description: 'Essential tool for cloning, fetching, and managing code branches on servers.',
    verifyCmd: 'git --version',
    steps: ['Install git via APT'],
    getInstallScript: SCRIPTS.git
  },
  {
    id: 'gh',
    name: 'GitHub CLI (gh)',
    category: 'tooling',
    description: 'Official CLI tool for GitHub token authentication, private repo cloning, and workflow automation.',
    verifyCmd: 'gh --version',
    steps: ['Add official cli.github.com repository', 'Install gh package'],
    getInstallScript: SCRIPTS.gh
  },
  {
    id: 'ffmpeg',
    name: 'FFmpeg Media Suite',
    category: 'tooling',
    description: 'Standard multimedia framework for video/audio transcoding, thumbnailing, and compression.',
    verifyCmd: 'ffmpeg -version',
    steps: ['Install ffmpeg and popular codecs'],
    getInstallScript: SCRIPTS.ffmpeg
  },
  {
    id: 'rclone',
    name: 'Rclone Cloud Sync',
    category: 'tooling',
    description: 'Cloud file sync utility supporting AWS S3, Cloudflare R2, Google Drive, and Backblaze B2.',
    verifyCmd: 'rclone --version',
    steps: ['Install official rclone binary'],
    getInstallScript: SCRIPTS.rclone
  },

  // --- SECURITY, NETWORK & SYSTEM (5) ---
  {
    id: 'ufw',
    name: 'UFW Firewall',
    category: 'security',
    description: 'Linux firewall helper opening active SSH, HTTP (80), and HTTPS (443) while blocking the rest.',
    verifyCmd: 'ufw status',
    steps: ['Detect active SSH port to prevent lockouts', 'Allow SSH, 80, and 443', 'Enable UFW firewall'],
    getInstallScript: SCRIPTS.ufw
  },
  {
    id: 'fail2ban',
    name: 'Fail2ban',
    category: 'security',
    description: 'Protects the server from SSH brute-force attacks by automatically banning abusive IP addresses.',
    configPath: '/etc/fail2ban/jail.d',
    verifyCmd: 'fail2ban-client --version',
    steps: ['Install fail2ban', 'Configure sshd jail protection rule', 'Start fail2ban daemon'],
    getInstallScript: SCRIPTS.fail2ban
  },
  {
    id: 'swap',
    name: 'Virtual Swap Memory',
    category: 'security',
    description: 'Additional virtual memory on disk preventing build jobs and database crashes from out-of-memory.',
    configPath: '/swapfile',
    verifyCmd: 'free -h',
    versions: [
      { label: '1 GB Swap', value: '1' },
      { label: '2 GB Swap (Recommended)', value: '2' },
      { label: '4 GB Swap', value: '4' },
      { label: '8 GB Swap', value: '8' }
    ],
    defaultVersion: '2',
    steps: ['Allocate /swapfile with requested size', 'Format mkswap & activate swapon', 'Persist permanently to /etc/fstab'],
    getInstallScript: SCRIPTS.swap
  },
  {
    id: 'tailscale',
    name: 'Tailscale Mesh VPN',
    category: 'security',
    description: 'Zero-config WireGuard mesh VPN connecting servers and dev machines without exposing public ports.',
    verifyCmd: 'tailscale version',
    steps: ['Run official installer script from tailscale.com', 'Enable tailscaled systemd daemon'],
    getInstallScript: SCRIPTS.tailscale
  },
  {
    id: 'autoupdates',
    name: 'Auto Security Updates',
    category: 'security',
    description: 'Configures `unattended-upgrades` to automatically install critical OS security patches daily.',
    configPath: '/etc/apt/apt.conf.d/20auto-upgrades',
    steps: ['Install unattended-upgrades', 'Configure automatic daily security update schedule'],
    getInstallScript: SCRIPTS.autoupdates
  }
];

// ---------------------------------------------------------------------------
// Template Analysis & Step-by-Step Script Generator
// ---------------------------------------------------------------------------

export interface TemplateStepItem {
  index: number;
  tool: TemplateToolItem;
  reason: string;
  chosenVersion?: string;
  script: string;
}

export interface TemplateAnalysis {
  preset: TemplatePreset;
  itemsToInstall: { tool: TemplateToolItem; reason: string; chosenVersion?: string; script: string }[];
  itemsSkipped: { tool: TemplateToolItem; installedVersion: string | null; reason: 'installed' | 'unchecked' }[];
  allInstalled: boolean;
  generatedScript: string;
}

export function analyzeTemplate(
  preset: TemplatePreset,
  installedSoftware: SoftwareItem[],
  options?: {
    forceAll?: boolean;
    versionOverrides?: Record<string, string>;
    excludedToolIds?: string[];
  }
): TemplateAnalysis {
  const forceAll = !!options?.forceAll;
  const versionOverrides = options?.versionOverrides || {};
  const excludedSet = new Set(options?.excludedToolIds || []);
  const itemsToInstall: { tool: TemplateToolItem; reason: string; chosenVersion?: string; script: string }[] = [];
  const itemsSkipped: { tool: TemplateToolItem; installedVersion: string | null; reason: 'installed' | 'unchecked' }[] = [];

  for (const tool of preset.tools) {
    const existing = installedSoftware.find(
      (s) => s.id === tool.id || (tool.id === 'mysql' && versionOverrides.mysql === 'mariadb' && s.id === 'mariadb')
    );
    const isInstalled = existing ? existing.installed : false;
    const chosenVersion = versionOverrides[tool.id] || tool.defaultVersion;

    if (excludedSet.has(tool.id)) {
      itemsSkipped.push({
        tool,
        installedVersion: existing?.version || null,
        reason: 'unchecked'
      });
      continue;
    }

    if (isInstalled && !forceAll) {
      itemsSkipped.push({
        tool,
        installedVersion: existing?.version || null,
        reason: 'installed'
      });
    } else {
      const rawBody =
        typeof tool.installScript === 'function'
          ? tool.installScript(chosenVersion)
          : tool.installScript;

      itemsToInstall.push({
        tool,
        reason: isInstalled && forceAll ? 'Forced reinstall' : 'Missing from server',
        chosenVersion,
        script: `${PREFLIGHT_HEADER}\nset -e\n\n${rawBody}`
      });
    }
  }

  const allInstalled = itemsToInstall.length === 0;

  // Generate clean, readable full bash script
  const scriptLines: string[] = [
    '#!/usr/bin/env bash',
    '# ============================================================',
    `#  7Server — Setup Template: ${preset.name}`,
    `#  Generated on: ${new Date().toISOString()}`,
    '# ============================================================',
    'set -e',
    PREFLIGHT_HEADER,
    ''
  ];

  if (itemsSkipped.length > 0) {
    scriptLines.push('# --- Skipped Components: ---');
    for (const skip of itemsSkipped) {
      const note = skip.reason === 'unchecked' ? 'manually excluded' : `already installed (${skip.installedVersion || 'detected'})`;
      scriptLines.push(`#  [x] ${skip.tool.name} — ${note}`);
    }
    scriptLines.push('');
  }

  if (allInstalled) {
    scriptLines.push(
      'echo "All selected components are already installed on this server."',
      'echo "No installation actions required."',
      'exit 0'
    );
  } else {
    scriptLines.push(
      `echo "============================================================"`,
      `echo "  Starting Setup Pipeline: ${preset.name} (${itemsToInstall.length} step(s))"`,
      `echo "============================================================"`,
      'echo ""',
      ''
    );

    itemsToInstall.forEach(({ tool, chosenVersion }, idx) => {
      const scriptBody =
        typeof tool.installScript === 'function'
          ? tool.installScript(chosenVersion)
          : tool.installScript;

      scriptLines.push(
        `# ------------------------------------------------------------`,
        `# Step [${idx + 1}/${itemsToInstall.length}]: ${tool.name}${chosenVersion ? ` (${chosenVersion})` : ''}`,
        `# ------------------------------------------------------------`,
        scriptBody,
        'echo ""',
        ''
      );
    });

    scriptLines.push(
      'echo "============================================================"',
      `echo "  ✔ Setup Template ${preset.name} Completed Successfully!"`,
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
    `#  Generated on: ${new Date().toISOString()}`,
    '# ============================================================',
    'set -e',
    PREFLIGHT_HEADER,
    '',
    scriptBody,
    '',
    'echo "============================================================"',
    `echo "  ✔ Installation of ${tool.name} Completed Successfully!"`,
    'echo "============================================================"'
  ].join('\n');
}

/** Generate a unified batch installation pipeline script for multiple selected tools */
export function generateBatchToolsScript(tools: MarketplaceTool[], versions?: Record<string, string>): string {
  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# ============================================================',
    `#  7Server — Multi-Task Batch Install (${tools.length} Tools)`,
    `#  Generated on: ${new Date().toISOString()}`,
    '# ============================================================',
    'set -e',
    PREFLIGHT_HEADER,
    '',
    'echo "============================================================"',
    `echo "  Starting Multi-Task Pipeline (${tools.length} components)"`,
    'echo "============================================================"',
    'echo ""'
  ];

  tools.forEach((tool, idx) => {
    const chosenVersion = versions?.[tool.id] || tool.defaultVersion;
    const scriptBody = tool.getInstallScript(chosenVersion);

    lines.push(
      'echo "------------------------------------------------------------"',
      `echo "  [Step ${idx + 1}/${tools.length}] Installing ${tool.name}${chosenVersion ? ` (${chosenVersion})` : ''}..."`,
      'echo "------------------------------------------------------------"',
      scriptBody,
      `echo "  ✔ Step ${idx + 1}/${tools.length} (${tool.name}) Completed!"`,
      'echo ""'
    );
  });

  lines.push(
    'echo "============================================================"',
    `echo "  ✔ All ${tools.length} Tools Installed Successfully!"`,
    'echo "============================================================"'
  );

  return lines.join('\n');
}

/** Formats the script for interactive terminal execution via temp file */
export function formatTerminalCommand(script: string, scriptFilename = '/tmp/vpshub-setup.sh'): string {
  return `cat << 'EOF' > ${scriptFilename}\n${script}\nEOF\nbash ${scriptFilename}`;
}
