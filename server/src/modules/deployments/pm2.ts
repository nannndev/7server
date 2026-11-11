import { sq } from '../../databases/shell.js';
import { DeploySpec } from './types.js';

export function pm2Run(s: DeploySpec, appDir: string): string {
  // Replace hardcoded preset ports in startCmd (e.g. -l 3000, --port 8000) with the chosen port
  const normalizedStartCmd = s.startCmd
    .replace(/(\b(?:-l|--port|-p)\s+)(?:3000|3001|4321|8000|8080)\b/g, `$1${s.port}`);

  return `if ! command -v pm2 >/dev/null 2>&1; then
  command -v npm >/dev/null 2>&1 || { echo "pm2/npm not found: install Node.js from Software first"; exit 1; }
  npm install -g pm2
fi
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  sudo -u "$SUDO_USER" -H pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true
fi
pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true
if command -v docker >/dev/null 2>&1; then docker rm -f ${sq(`7server-${s.appName}`)} >/dev/null 2>&1 || true; fi
# Our own old process is gone now, so anything still on the port is another app; the health check would
# otherwise get that app's 200 and report this deploy as live.
sleep 1
holder=$(ss -ltnpH 2>/dev/null | awk -v p=":${s.port}" '$4 ~ p"$"' | head -n 1)
if [ -n "$holder" ]; then
  echo "Port ${s.port} is already used by another app:"
  echo "  $holder"
  echo "Pick a free Internal Port and deploy again."
  exit 1
fi
if port_probe ${s.port}; then
  echo "Port ${s.port} already answers on 127.0.0.1, but no process in this Linux owns it (ss shows nothing)."
  echo "It is held from outside this system, e.g. by the Windows host under WSL. The app could not bind it and would crash with EADDRINUSE."
  echo "Pick a different Internal Port and deploy again."
  exit 1
fi

# Generate dedicated runner script so PM2 never reuses stale daemon PORT/HOSTNAME env from previous deploys
cat > .7server-start.sh <<'EOF_7SERVER_RUNNER'
#!/usr/bin/env bash
set -e
set -a
[ -r .env ] && . ./.env || true
set +a
export PORT=${s.port} NITRO_PORT=${s.port} NUXT_PORT=${s.port} SERVER_PORT=${s.port}
export HOST=0.0.0.0 NITRO_HOST=0.0.0.0 NUXT_HOST=0.0.0.0 HOSTNAME=0.0.0.0 ADDRESS=0.0.0.0 BIND_ADDR=0.0.0.0
export PATH="$PWD/node_modules/.bin:${appDir}/node_modules/.bin:/usr/local/bin:/usr/local/go/bin:$HOME/.bun/bin:$HOME/.local/bin:$PATH"

# 1. Nuxt 3 built server (.output/server/index.mjs)
if [ -f .output/server/index.mjs ]; then
  exec node .output/server/index.mjs
fi
# 2. Nuxt 3 static generate (.output/public/index.html)
if [ -f .output/public/index.html ] && [ ! -f .output/server/index.mjs ]; then
  exec npx --yes serve -s .output/public -l tcp://0.0.0.0:${s.port}
fi
# 3. Next.js standalone build
if [ -f .next/standalone/server.js ]; then
  [ -d public ] && [ ! -d .next/standalone/public ] && cp -r public .next/standalone/public 2>/dev/null || true
  [ -d .next/static ] && [ ! -d .next/standalone/.next/static ] && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
  exec node .next/standalone/server.js
fi
EOF_7SERVER_RUNNER

# Append the configured start command (with Next.js / Vite / Astro host & port flags enforced when applicable)
if [ -d .next ] && echo ${sq(normalizedStartCmd)} | grep -qE '^(npm|pnpm|yarn|bun)?\\s*(run\\s+)?start$|^next\\s+start'; then
  echo "exec next start -p ${s.port} -H 0.0.0.0" >> .7server-start.sh
elif echo ${sq(normalizedStartCmd)} | grep -qE 'vite\\s+preview|astro\\s+preview'; then
  echo "exec ${normalizedStartCmd} --host 0.0.0.0 --port ${s.port}" >> .7server-start.sh
elif [ -f dist/index.html ] && [ -f package.json ] && ! node -e 'process.exit(require("./package.json").scripts?.start ? 0 : 1)' 2>/dev/null; then
  echo "exec npx --yes serve -s dist -l tcp://0.0.0.0:${s.port}" >> .7server-start.sh
else
  echo "exec ${normalizedStartCmd}" >> .7server-start.sh
fi
chmod +x .7server-start.sh
chown -R "$TARGET_USER:$TARGET_GROUP" ${sq(appDir)} 2>/dev/null || true
chmod -R u+rwX,go+rX ${sq(appDir)} 2>/dev/null || true
chmod 644 .env 2>/dev/null || true

if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  sudo -u "$SUDO_USER" -H pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true
  pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true
  sudo -u "$SUDO_USER" -H pm2 start ./.7server-start.sh --name ${sq(s.appName)} --cwd "$PWD" --interpreter bash --update-env >/dev/null || pm2 start ./.7server-start.sh --name ${sq(s.appName)} --cwd "$PWD" --interpreter bash --update-env >/dev/null
  sudo -u "$SUDO_USER" -H pm2 save >/dev/null 2>&1 || pm2 save >/dev/null 2>&1 || true
else
  pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true
  pm2 start ./.7server-start.sh --name ${sq(s.appName)} --cwd "$PWD" --interpreter bash --update-env >/dev/null
  pm2 save >/dev/null 2>&1 || true
fi
echo "PM2: ${s.appName} started on 0.0.0.0:${s.port} (pm2 logs ${s.appName} to follow output)"`;
}

