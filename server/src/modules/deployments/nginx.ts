import { sq } from '../../databases/shell.js';
import { DeploySpec } from './types.js';

export function nginxSite(s: DeploySpec, site: string, workDir: string): string {
  const proxied = !!s.startCmd || s.engine === 'docker';
  if (!s.domain && proxied) return 'echo "No domain set: skipping Nginx"';
  // Static site without a domain: Nginx serves the build output on the chosen port.
  // Static site with a domain/tunnel: Nginx serves on both port 80 and the chosen internal port,
  // so that the internal health check (curl 127.0.0.1:s.port) and Cloudflare tunnel routing (which targets s.port) both succeed!
  const listen = s.domain && proxied
    ? 'listen 80;'
    : s.domain
    ? `listen 80;\n  listen ${s.port};`
    : `listen ${s.port};`;
  const serverName = s.domain ? `${s.domain} _` : '_';
  const body = proxied
    ? `  location / {
    proxy_pass http://127.0.0.1:${s.port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\$scheme;
  }`
    : `  root $WEBROOT;
  index index.php index.html;
  location / { try_files \\$uri \\$uri/ $FALLBACK; }
$PHPBLOCK`;
  return `if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx is not installed: skipping reverse proxy"
else
  WEBROOT=${sq(workDir)}; FALLBACK=/index.html; PHPBLOCK=""
  for d in dist build out .output/public public; do if [ -d "${workDir}/$d" ]; then WEBROOT="${workDir}/$d"; break; fi; done
  if [ -f "$WEBROOT/index.php" ]; then
    SOCK=$(ls /run/php/php*-fpm.sock 2>/dev/null | head -n 1 || true)
    FALLBACK='/index.php?$query_string'
    [ -n "$SOCK" ] && PHPBLOCK="  location ~ \\\\.php\\$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:$SOCK; }"
  fi
  cat > /etc/nginx/sites-available/${site} <<NGINX_EOF
server {
  ${listen}
  server_name ${serverName};
${body}
}
NGINX_EOF
  ln -sf /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}
  nginx -t && { systemctl reload nginx 2>/dev/null || nginx -s reload; }
  echo "Nginx: ${s.domain || `static files on port ${s.port}`} configured"
${(s.exposure === 'tunnel' && s.domain) ? `  if command -v cloudflared >/dev/null 2>&1; then
    echo "Registering route in Cloudflare Tunnel for ${s.domain}..."
    CF_CFG=""
    for p in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /root/.cloudflared/config.yml ~/.cloudflared/config.yml; do
      if [ -f "$p" ]; then CF_CFG="$p"; break; fi
    done
    if [ -n "$CF_CFG" ]; then
      node -e '
const fs = require("fs");
const [cfg, host, svc] = [process.argv[1], process.argv[2], process.argv[3]];
if (fs.existsSync(cfg)) {
  let content = fs.readFileSync(cfg, "utf8");
  let lines = content.split(/\\r?\\n/);
  let hostIdx = -1, fallbackIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === "hostname: " + host || l === "- hostname: " + host) hostIdx = i;
    if (l.includes("http_status:404")) {
      let bIdx = i;
      for (let k = i; k >= Math.max(0, i - 2); k--) {
        if (/^\\s*-\\s+/.test(lines[k])) { bIdx = k; break; }
      }
      fallbackIdx = bIdx;
    }
  }
  if (hostIdx !== -1) {
    for (let j = hostIdx; j < Math.min(lines.length, hostIdx + 5); j++) {
      if (lines[j].trim().startsWith("service:")) {
        lines[j] = "    service: " + svc;
        break;
      }
    }
  } else {
    const newLines = ["  - hostname: " + host, "    service: " + svc];
    if (fallbackIdx !== -1) {
      lines.splice(fallbackIdx, 0, ...newLines);
    } else {
      lines.push(...newLines);
      lines.push("  - service: http_status:404");
    }
  }
  fs.writeFileSync(cfg, lines.join("\\n"), "utf8");
}
' "$CF_CFG" ${sq(s.domain)} ${sq(`http://localhost:${s.port}`)} 2>/dev/null || true
      CF_TUNNEL_NAME=${sq(s.tunnelName || '')}
      if [ -z "$CF_TUNNEL_NAME" ]; then
        CF_TUNNEL_NAME=$(grep -E '^[[:space:]]*tunnel:' "$CF_CFG" | head -n 1 | awk '{print $NF}')
      fi
      if [ -n "$CF_TUNNEL_NAME" ]; then
        cloudflared tunnel route dns "$CF_TUNNEL_NAME" ${sq(s.domain)} 2>&1 || true
      fi
      systemctl restart cloudflared 2>/dev/null || pkill -HUP cloudflared 2>/dev/null || true
      echo "Cloudflare Tunnel: https://${s.domain} successfully routed to http://localhost:${s.port}"
    else
      echo "Notice: Cloudflare config.yml not found. Add route in Tunnels tab."
    fi
  else
    echo "cloudflared is not installed on this server."
  fi` : (s.domain ? `  if command -v certbot >/dev/null 2>&1; then
    certbot --nginx -d ${s.domain} --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "Warning: SSL certificate request failed (is DNS pointing here?)"
  fi` : '')}
fi`;
}

export function buildPointDomainScript(opts: {
  appName: string;
  domain: string;
  port?: number;
  enableSsl?: boolean;
}): string {
  const { appName, domain, port, enableSsl = true } = opts;
  if (!appName || !/^[a-zA-Z0-9_-]+$/.test(appName)) {
    throw new Error('Invalid app name: only letters, numbers, hyphens, and underscores are allowed');
  }
  const cleanDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!cleanDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanDomain) || cleanDomain.includes('..')) {
    throw new Error('Invalid domain: must be a valid fully-qualified domain name');
  }
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error('Invalid port: must be between 1 and 65535');
  }

  const site = `7server-${appName}`;
  const workDir = `/var/www/${appName}`;

  const nginxBlock = port
    ? `cat > "/etc/nginx/sites-available/${site}" <<'NGINX_EOF'
server {
  listen 80;
  server_name ${cleanDomain};

  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\$scheme;
  }
}
NGINX_EOF`
    : `WEBROOT=${sq(workDir)}
FALLBACK="/index.html"
PHPBLOCK=""
for d in dist build out .output/public public; do
  if [ -d "${workDir}/$d" ]; then WEBROOT="${workDir}/$d"; break; fi
done
if [ -f "$WEBROOT/index.php" ]; then
  SOCK=$(ls /run/php/php*-fpm.sock 2>/dev/null | head -n 1 || true)
  FALLBACK='/index.php?$query_string'
  [ -n "$SOCK" ] && PHPBLOCK="  location ~ \\\\.php\\$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:$SOCK; }"
fi

cat > "/etc/nginx/sites-available/${site}" <<NGINX_EOF
server {
  listen 80;
  server_name ${cleanDomain};
  root $WEBROOT;
  index index.php index.html;
  location / {
    try_files \\$uri \\$uri/ $FALLBACK;
  }
$PHPBLOCK
}
NGINX_EOF`;

  const sslBlock = enableSsl
    ? `if command -v certbot >/dev/null 2>&1; then
  echo "Requesting Let's Encrypt SSL certificate for ${cleanDomain}..."
  certbot --nginx -d ${cleanDomain} --non-interactive --agree-tos --register-unsafely-without-email --redirect || {
    echo "Warning: SSL certificate request failed. Verify that your DNS A record points to this server IP."
  }
  nginx -t && { systemctl reload nginx 2>/dev/null || nginx -s reload; } || true
else
  echo "Notice: Certbot not installed. Skipping automatic SSL."
fi`
    : '';

  return `set -eo pipefail
echo "==> Configuring Nginx VirtualHost for ${appName} on ${cleanDomain}"
if ! command -v nginx >/dev/null 2>&1; then
  echo "Error: Nginx is not installed. Please install Nginx first from Software."
  exit 1
fi

mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

${nginxBlock}

ln -sf "/etc/nginx/sites-available/${site}" "/etc/nginx/sites-enabled/${site}"

echo "Testing Nginx configuration..."
nginx -t

echo "Reloading Nginx..."
{ systemctl reload nginx 2>/dev/null || nginx -s reload; }
echo "✓ Nginx reloaded successfully"

${sslBlock}

echo "App ${appName} successfully pointed to http${enableSsl ? 's' : ''}://${cleanDomain}"
`;
}

