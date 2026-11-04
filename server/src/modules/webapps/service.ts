// /var/www apps, nginx sites and listening ports.
import { executeCommand } from '../../infra/ssh.js';
import { ServerCredentials } from '../servers/types.js';
import { WebAppInfo, NginxSiteInfo, ListeningPortInfo } from './types.js';

export async function fetchWebApps(serverConfig: ServerCredentials): Promise<WebAppInfo[]> {
  const script = `
    cat << 'EOF' > /tmp/__vps_webapps.sh
#!/bin/sh
echo "===START_WEBAPPS==="
for d in /var/www/*; do
  [ -d "$d" ] || continue
  name=$(basename "$d")
  [ "$name" = "html" ] && [ ! -f "$d/index.php" ] && [ ! -f "$d/index.html" ] && continue

  app_type="Web App"
  if [ -f "$d/artisan" ]; then
    app_type="Laravel (PHP)"
  elif [ -f "$d/package.json" ]; then
    app_type="Node.js"
  elif [ -d "$d/dist" ]; then
    app_type="Frontend (SPA / Vite)"
  elif ls "$d"/*.php >/dev/null 2>&1; then
    app_type="PHP Application"
  elif [ -f "$d/requirements.txt" ] || [ -f "$d/app.py" ]; then
    app_type="Python"
  fi

  # Nginx configs that reference this exact folder (not a prefix like X-STAGING)
  domain=""
  ports=""
  confs=$(grep -RlE "/var/www/\${name}(/|;|[[:space:]]|$)" /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null)
  if [ -n "$confs" ]; then
    domain=$(cat $confs | grep -E '^[[:space:]]*server_name' | sed -e 's/^[[:space:]]*server_name//' -e 's/;.*//' | tr ' ' '\n' | grep -vE '^(_|)$' | sort -u | tr '\n' ',' | sed 's/,$//')
    ports=$(cat $confs | grep -E '^[[:space:]]*listen' | grep -v '::' | sed -e 's/^[[:space:]]*listen//' -e 's/;.*//' | awk '{print $1}' | sort -u | tr '\n' ',' | sed 's/,$//')
  fi

  # Mod date
  mod=$(date -r "$d" "+%Y-%m-%d %H:%M" 2>/dev/null || stat -c "%y" "$d" 2>/dev/null | cut -d. -f1)

  # Git branch
  git_branch=""
  if [ -d "$d/.git" ]; then
    git_branch=$(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null)
  fi

  echo "APP::$name::$app_type::$domain::$mod::$git_branch::$d::$ports"
done
echo "===END_WEBAPPS==="
EOF
chmod +x /tmp/__vps_webapps.sh
/bin/sh /tmp/__vps_webapps.sh
rm -f /tmp/__vps_webapps.sh
`;

  const { stdout } = await executeCommand(serverConfig, script, 12000);
  const apps: WebAppInfo[] = [];

  const lines = stdout.split('\n');
  let capturing = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '===START_WEBAPPS===') {
      capturing = true;
      continue;
    }
    if (trimmed === '===END_WEBAPPS===') {
      break;
    }
    if (!capturing) continue;

    if (trimmed.startsWith('APP::')) {
      const parts = trimmed.split('::');
      if (parts.length >= 7) {
        apps.push({
          name: parts[1],
          type: parts[2],
          domain: parts[3] || '',
          modified: parts[4] || '',
          gitBranch: parts[5] || '',
          path: parts[6],
          ports: parts[7] || ''
        });
      }
    }
  }

  return apps;
}

export async function fetchNginxSites(serverConfig: ServerCredentials): Promise<{
  sites: NginxSiteInfo[];
  configTest: string;
}> {
  const script = `
    cat << 'EOF' > /tmp/__vps_nginx.sh
#!/bin/sh
echo "===NGINX_SITES==="
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  domains=$(grep -E '^[[:space:]]*server_name' "$f" 2>/dev/null | sed -e 's/^[[:space:]]*server_name//' -e 's/;.*//' | tr ' ' '\n' | grep -vE '^(_|)$' | sort -u | tr '\n' ',' | sed 's/,$//')
  root_path=$(grep -E '^[[:space:]]*root[[:space:]]+' "$f" 2>/dev/null | head -n 1 | awk '{print $2}' | tr -d ';')
  proxy_port=$(grep -E 'proxy_pass' "$f" 2>/dev/null | head -n 1 | sed -e 's/.*proxy_pass[[:space:]]*//' -e 's/;.*//')
  ssl="0"
  if grep -qE 'ssl_certificate|443' "$f" 2>/dev/null; then
    ssl="1"
  fi
  real_path=$(readlink -f "$f" 2>/dev/null || echo "$f")
  echo "SITE::$name::1::$domains::$root_path::$proxy_port::$ssl::$real_path"
done
echo "===NGINX_TEST==="
nginx -t 2>&1 || true
echo "===NGINX_END==="
EOF
chmod +x /tmp/__vps_nginx.sh
/bin/sh /tmp/__vps_nginx.sh
rm -f /tmp/__vps_nginx.sh
`;
  const { stdout } = await executeCommand(serverConfig, script, 10000);
  const sites: NginxSiteInfo[] = [];

  const sitesPart = stdout.match(/===NGINX_SITES===([\s\S]*?)===NGINX_TEST===/);
  if (sitesPart && sitesPart[1]) {
    for (const line of sitesPart[1].trim().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('SITE::')) continue;
      const p = trimmed.split('::');
      if (p.length >= 8) {
        sites.push({
          name: p[1],
          enabled: p[2] === '1',
          domains: p[3] ? p[3].split(',').filter(Boolean) : [],
          rootPath: p[4] || '',
          proxyPort: p[5] || '',
          ssl: p[6] === '1',
          configPath: p[7] || `/etc/nginx/sites-enabled/${p[1]}`
        });
      }
    }
  }

  const testPart = stdout.match(/===NGINX_TEST===([\s\S]*?)===NGINX_END===/);
  const configTest = testPart?.[1]?.trim() || '';

  return { sites, configTest };
}

export async function fetchListeningPorts(serverConfig: ServerCredentials): Promise<{
  ports: ListeningPortInfo[];
  ufwStatus: string;
  raw: string;
}> {
  const cmd = `
    echo "===SS_START==="
    ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null
    echo "===UFW_START==="
    if command -v ufw >/dev/null 2>&1; then
      ufw status 2>/dev/null || echo "ufw inactive"
    else
      echo "ufw not installed"
    fi
    echo "===END==="
  `;
  const { stdout } = await executeCommand(serverConfig, cmd, 8000);
  const ssMatch = stdout.match(/===SS_START===([\s\S]*?)===UFW_START===/);
  const ufwMatch = stdout.match(/===UFW_START===([\s\S]*?)===END===/);

  const raw = ssMatch?.[1]?.trim() || '';
  const ufwStatus = ufwMatch?.[1]?.trim() || '';
  const ports: ListeningPortInfo[] = [];

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('Netid') || t.startsWith('Proto') || t.startsWith('Active')) continue;
    const cols = t.split(/\s+/);
    if (cols.length >= 5) {
      const proto = cols[0];
      const localAddrFull = cols[4];
      const lastColon = localAddrFull.lastIndexOf(':');
      const localAddress = lastColon !== -1 ? localAddrFull.slice(0, lastColon) : localAddrFull;
      const port = lastColon !== -1 ? localAddrFull.slice(lastColon + 1) : '';
      const procPart = cols.slice(6).join(' ');
      const nameMatch = procPart.match(/"([^"]+)"/);
      const pidMatch = procPart.match(/pid=(\d+)/);
      ports.push({
        proto,
        localAddress,
        port,
        process: nameMatch ? nameMatch[1] : procPart || '-',
        pid: pidMatch ? pidMatch[1] : '-'
      });
    }
  }

  return { ports, ufwStatus, raw };
}
