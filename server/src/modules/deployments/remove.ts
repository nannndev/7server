import { badRequest } from '../../http/errors.js';
import { sq } from '../../databases/shell.js';
import { str } from './types.js';

/**
 * Removes an app and everything a deploy set up for it: PM2 processes running from its folder, its Docker
 * container/compose stack, Nginx sites that serve only this folder (backed up first), its certificate, then the folder.
 */
export function buildRemoveScript(rawName: unknown): string {
  const appName = str(rawName);
  if (!/^[a-z0-9][a-z0-9_.-]{0,62}$/i.test(appName) || appName.includes('..') || appName === 'html') {
    throw badRequest('Invalid app name');
  }
  const dir = `/var/www/${appName}`;
  const site = `7server-${appName}`;
  const backup = `/root/7server-removed/${appName}-$(date +%Y%m%d%H%M%S)`;
  return `set -o pipefail
export PATH="$PATH:/usr/local/bin"
DIR=${sq(dir)}
[ -d "$DIR" ] || { echo "$DIR does not exist"; exit 1; }
BACKUP="${backup}"
mkdir -p "$BACKUP"

echo "==> PM2 processes running from $DIR"
if command -v pm2 >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then
  for p in $(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{for(const p of JSON.parse(s)){const c=p.pm2_env&&p.pm2_env.pm_cwd||"";if(c===process.argv[1]||c.startsWith(process.argv[1]+"/"))console.log(p.pm_id)}}catch{}})' "$DIR"); do
    pm2 delete "$p" && echo "removed pm2 process $p"
  done
  pm2 save >/dev/null 2>&1 || true
fi

echo "==> Docker"
if command -v docker >/dev/null 2>&1; then
  find "$DIR" -maxdepth 2 \\( -name docker-compose.yml -o -name docker-compose.yaml -o -name compose.yml -o -name compose.yaml -o -name docker-compose.prod.yml -o -name docker-compose.production.yml \\) 2>/dev/null | while read -r f; do
    for cn in $(grep -E '^[[:space:]]*container_name:' "$f" 2>/dev/null | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}'); do
      docker rm -f "$cn" >/dev/null 2>&1 || true
    done
    (cd "$(dirname "$f")" && docker compose down -v --remove-orphans) && echo "stopped compose stack $f"
  done
  docker ps -a --filter "name=${appName}" -q | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker rm -f ${sq(site)} >/dev/null 2>&1 && echo "removed container ${site}"
  docker rmi ${sq(site)} >/dev/null 2>&1 || true
fi

echo "==> Nginx"
CHANGED=""
for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  grep -qE "/var/www/${appName.replace(/\./g, '\\\\.')}(/|;|[[:space:]]|$)" "$f" 2>/dev/null || [ "$(basename "$f")" = ${sq(site)} ] || continue
  # Shared config (also serves another /var/www app): leave it, a person has to split it.
  if grep -oE "/var/www/[A-Za-z0-9_.-]+" "$f" | grep -vxF "$DIR" | grep -q .; then echo "kept $f (also used by other apps)"; continue; fi
  for d in $(grep -E '^[[:space:]]*server_name' "$f" | sed -e 's/^[[:space:]]*server_name//' -e 's/;.*//'); do
    [ "$d" = "_" ] || DOMAINS="$DOMAINS $d"
  done
  real=$(readlink -f "$f")
  cp "$real" "$BACKUP/" 2>/dev/null
  rm -f "$f"
  [ "$real" != "$f" ] && rm -f "$real"
  echo "removed $f (backup in $BACKUP)"
  CHANGED=1
done
if [ -n "$CHANGED" ] && command -v nginx >/dev/null 2>&1; then
  nginx -t && { systemctl reload nginx 2>/dev/null || nginx -s reload; } && echo "nginx reloaded"
fi

if command -v certbot >/dev/null 2>&1; then
  for d in $DOMAINS; do
    certbot delete --cert-name "$d" --non-interactive >/dev/null 2>&1 && echo "deleted certificate $d"
  done
fi

APP_PORTS=""
if [ -f "$DIR/.env" ]; then
  p=$(grep -E '^(PORT|NITRO_PORT|SERVER_PORT)=' "$DIR/.env" 2>/dev/null | grep -oE '[0-9]+' | head -n 1)
  [ -n "$p" ] && APP_PORTS="$APP_PORTS $p"
fi
for conf in /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}; do
  if [ -f "$conf" ]; then
    p=$(grep -oE 'proxy_pass https?://(127\.0\.0\.1|localhost):[0-9]+' "$conf" 2>/dev/null | sed 's/.*://')
    [ -n "$p" ] && APP_PORTS="$APP_PORTS $p"
  fi
done

if command -v cloudflared >/dev/null 2>&1; then
  echo "==> Cloudflare Tunnel"
  for cfg in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /root/.cloudflared/config.yml ~/.cloudflared/config.yml; do
    if [ -f "$cfg" ]; then
      node -e '
const fs = require("fs");
const cfg = process.argv[1];
const appName = process.argv[2];
const domains = (process.argv[3] || "").split(/\\s+/).filter(Boolean);
const ports = (process.argv[4] || "").split(/\\s+/).filter(Boolean);

if (fs.existsSync(cfg)) {
  const content = fs.readFileSync(cfg, "utf8");
  const lines = content.split(/\\r?\\n/);
  const out = [];
  let inIngress = false;
  let currentBlock = [];
  let currentHost = "";
  let currentSvc = "";
  let removedCount = 0;

  function shouldRemove(host, svc) {
    if (!host && !svc) return false;
    if (svc === "http_status:404") return false;
    if (host) {
      const h = host.toLowerCase();
      if (domains.some(d => d.toLowerCase() === h)) return true;
      if (h.startsWith(appName.toLowerCase() + ".")) return true;
      if (h === appName.toLowerCase()) return true;
    }
    if (svc && ports.length > 0) {
      for (const p of ports) {
        if (svc === "http://localhost:" + p || svc === "http://127.0.0.1:" + p || svc === "https://localhost:" + p || svc === "https://127.0.0.1:" + p) {
          return true;
        }
      }
    }
    return false;
  }

  function flushBlock() {
    if (currentBlock.length > 0) {
      if (shouldRemove(currentHost, currentSvc)) {
        console.log("removed tunnel ingress route: " + (currentHost || currentSvc));
        removedCount++;
      } else {
        out.push(...currentBlock);
      }
      currentBlock = [];
      currentHost = "";
      currentSvc = "";
    }
  }

  for (const line of lines) {
    if (line.trim().startsWith("ingress:")) {
      inIngress = true;
      out.push(line);
      continue;
    }
    if (!inIngress) {
      out.push(line);
      continue;
    }

    if (/^\\s*-\\s+/.test(line)) {
      flushBlock();
      currentBlock.push(line);
      const rest = line.replace(/^\\s*-\\s+/, "").trim();
      if (rest.startsWith("hostname:")) currentHost = rest.replace(/^hostname:\\s*/, "").trim();
      if (rest.startsWith("service:")) currentSvc = rest.replace(/^service:\\s*/, "").trim();
    } else if (currentBlock.length > 0) {
      currentBlock.push(line);
      const trimmed = line.trim();
      if (trimmed.startsWith("hostname:")) currentHost = trimmed.replace(/^hostname:\\s*/, "").trim();
      if (trimmed.startsWith("service:")) currentSvc = trimmed.replace(/^service:\\s*/, "").trim();
    } else {
      out.push(line);
    }
  }
  flushBlock();

  if (removedCount > 0) {
    fs.writeFileSync(cfg, out.join("\\n"), "utf8");
    process.exit(0);
  } else {
    process.exit(1);
  }
}
' "$cfg" ${sq(appName)} "$DOMAINS" "$APP_PORTS" 2>/dev/null && (systemctl restart cloudflared 2>/dev/null || pkill -HUP cloudflared 2>/dev/null || true)
      break
    fi
  done
fi

echo "==> Files"
[ -f "$DIR/.env" ] && cp "$DIR/.env" "$BACKUP/.env" && echo ".env backed up to $BACKUP"
rm -rf -- "$DIR" && echo "deleted $DIR"
rmdir "$BACKUP" 2>/dev/null || true
echo "App ${appName} removed"
`;
}

