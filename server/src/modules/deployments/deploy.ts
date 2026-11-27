// Real git deployment: validates the wizard's spec and builds one bash script run via executeSoftwareScript.
import { sq } from '../../databases/shell.js';
import { DeploySpec } from './types.js';
import { buildInstallBlock, buildCompileBlock } from './buildBlocks.js';
import { dockerRun } from './docker.js';
import { pm2Run } from './pm2.js';
import { nginxSite } from './nginx.js';

// Re-export all sub-modules for clean backward compatibility
export * from './types.js';
export * from './buildBlocks.js';
export * from './docker.js';
export * from './pm2.js';
export * from './nginx.js';
export * from './remove.js';

export function formatDotenvValue(val: string): string {
  if (val === '') return '';
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return val;
  }
  if (/[\s#"'\\]/.test(val) || val.includes('\n')) {
    const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return val;
}

/** Lines starting with "@@STAGE <id>" let the UI move its pipeline stages; the rest is plain build output. */
export function buildDeployScript(s: DeploySpec, token?: string): string {
  const appDir = `/var/www/${s.appName}`;
  const workDir = s.rootDir === '/' ? appDir : `${appDir}/${s.rootDir.replace(/^\/+|\/+$/g, '')}`;
  const url = `https://github.com/${s.repo}.git`;
  // Header instead of a token-in-URL: nothing ends up in .git/config. shortcut: the header is briefly visible in ps on the VPS; use a git credential helper if that matters.
  const auth = token ? `-c http.extraHeader=${sq(`Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`)} ` : '';
  const site = `7server-${s.appName}`;
  const isDocker = s.engine === 'docker' || s.engine === 'nixpacks';
  const envKeys = new Set(s.env.map((e) => e.key.toUpperCase()));
  const defaultRuntimeEnv: Array<{ key: string; value: string }> = [];
  if (!isDocker) {
    if (!envKeys.has('PORT')) defaultRuntimeEnv.push({ key: 'PORT', value: String(s.port) });
    if (!envKeys.has('NITRO_PORT')) defaultRuntimeEnv.push({ key: 'NITRO_PORT', value: String(s.port) });
    if (!envKeys.has('NUXT_PORT')) defaultRuntimeEnv.push({ key: 'NUXT_PORT', value: String(s.port) });
  }
  if (!envKeys.has('HOST')) defaultRuntimeEnv.push({ key: 'HOST', value: '0.0.0.0' });
  if (!envKeys.has('NITRO_HOST')) defaultRuntimeEnv.push({ key: 'NITRO_HOST', value: '0.0.0.0' });
  if (!envKeys.has('NUXT_HOST')) defaultRuntimeEnv.push({ key: 'NUXT_HOST', value: '0.0.0.0' });
  if (!envKeys.has('HOSTNAME')) defaultRuntimeEnv.push({ key: 'HOSTNAME', value: '0.0.0.0' });
  const allEnv = [...s.env, ...defaultRuntimeEnv];
  const envLines = allEnv.map((e) => `printf '%s=%s\\n' ${sq(e.key)} ${sq(formatDotenvValue(e.value))}`).join('\n');

  return `set -eo pipefail
export PATH="$PATH:/usr/local/bin:/usr/local/go/bin:$HOME/.bun/bin:$HOME/.local/bin"
${isDocker ? `export SERVER_PORT=${s.port}` : `export PORT=${s.port} NITRO_PORT=${s.port} NUXT_PORT=${s.port} SERVER_PORT=${s.port}`}
export HOST=0.0.0.0 NITRO_HOST=0.0.0.0 NUXT_HOST=0.0.0.0 HOSTNAME=0.0.0.0 ADDRESS=0.0.0.0 BIND_ADDR=0.0.0.0
# Non-interactive build: CI makes nuxt/next/vite/husky skip prompts (Nuxt asks about telemetry otherwise and waits forever).
export NO_COLOR=1 FORCE_COLOR=0 CI=1 NUXT_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm_config_yes=true
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=2048}"
TARGET_USER="\${SUDO_USER:-$(logname 2>/dev/null || id -un)}"
TARGET_GROUP=$(id -gn "$TARGET_USER" 2>/dev/null || echo "$TARGET_USER")
step() { echo "@@STAGE $1"; }
# True when something accepts connections on 127.0.0.1:<port>, including holders ss can't see (Windows host under WSL).
port_probe() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }
# Any unexpected failure under set -e names the command instead of exiting silently.
trap 'echo "Deploy script stopped at line $LINENO: $BASH_COMMAND" >&2' ERR

IS_NEW_DEPLOY=0
[ ! -d ${sq(appDir)} ] && IS_NEW_DEPLOY=1
DEPLOY_SUCCESS=0

cleanup_on_failure() {
  local rc=$?
  if [ "$DEPLOY_SUCCESS" != "1" ] && [ $rc -ne 0 ]; then
    echo "=== DEPLOYMENT FAILED (exit code $rc) ===" >&2
    echo "Tearing down broken process / containers for ${s.appName}..." >&2
    ${isDocker
      ? `if [ -d ${sq(appDir)} ]; then
      for cf in $(find ${sq(appDir)} -maxdepth 3 \\( -name 'docker-compose*.yml' -o -name 'docker-compose*.yaml' -o -name 'compose*.yml' -o -name 'compose*.yaml' \\) 2>/dev/null); do
        for cn in $( (grep -E '^[[:space:]]*container_name:' "$cf" 2>/dev/null || true) | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}'); do
          docker rm -f "$cn" >/dev/null 2>&1 || true
        done
        cp_proj=$( (grep -E '^name:' "$cf" 2>/dev/null || true) | head -n 1 | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}')
        [ -n "$cp_proj" ] && docker compose -p "$cp_proj" -f "$cf" down --remove-orphans >/dev/null 2>&1 || true
        docker compose -p ${sq(`7server-${s.appName}`)} -f "$cf" down --remove-orphans >/dev/null 2>&1 || true
        docker compose -f "$cf" down --remove-orphans >/dev/null 2>&1 || true
      done
    fi
    docker ps -a --filter "label=com.docker.compose.project=7server-${s.appName}" -q | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker ps -a --filter "name=^/7server-${s.appName}" -q | xargs -r docker rm -f >/dev/null 2>&1 || true
    docker rm -f ${sq(`7server-${s.appName}`)} >/dev/null 2>&1 || true`
      : `if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then sudo -u "$SUDO_USER" -H pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true; fi
    pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true`}
    rm -f /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site} 2>/dev/null || true
    rm -f ${sq(appDir)}/.7server-deploying 2>/dev/null || true
    echo "Files preserved in ${appDir} for log inspection and fast retry." >&2
  fi
}
trap cleanup_on_failure EXIT
# Runs a long step with a heartbeat so a silent npm ci / build doesn't look hung, and shows free RAM while it waits.
run_step() {
  ( while sleep 30; do echo "  ... still running ($(free -m | awk '/^Mem:/{print $7}') MB RAM free, $(free -m | awk '/^Swap:/{print $3"/"$2}') MB swap used)"; done ) 2>/dev/null &
  hb=$!
  set +e; bash -c "$1" </dev/null; rc=$?; set -e
  pkill -P $hb 2>/dev/null || true; kill $hb 2>/dev/null || true; wait $hb 2>/dev/null || true
  if [ $rc -ne 0 ]; then
    dmesg 2>/dev/null | tail -n 20 | grep -qiE 'out of memory|oom-kill|killed process' && echo "The kernel killed the process: out of memory. Add swap (Software > Swap) or use a bigger server, then redeploy."
    exit $rc
  fi
}
# npm/Nuxt/Next builds need ~1.5-2GB; without swap a small VPS thrashes instead of failing, which looks like a hang.
mem=$(free -m | awk '/^Mem:/{print $2}'); swp=$(free -m | awk '/^Swap:/{print $2}')
if [ "$swp" -eq 0 ] && [ "$mem" -lt 3000 ]; then
  echo "Low memory: \${mem}MB RAM and no swap. Creating a 2GB swap file so the build doesn't run out of memory."
  if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048; chmod 600 /swapfile; mkswap /swapfile >/dev/null; fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
command -v git >/dev/null 2>&1 || { echo "git is not installed on this server (install it from Software)"; exit 1; }

step clone
mkdir -p /var/www
if [ -d ${sq(appDir)}/.git ]; then
  echo "Updating existing checkout in ${appDir}"
  ${s.commitSha
    ? `git ${auth}-C ${sq(appDir)} fetch origin
  git -C ${sq(appDir)} checkout -f ${sq(s.commitSha)}`
    : `git ${auth}-C ${sq(appDir)} fetch --depth=1 origin ${sq(s.branch)}
  git -C ${sq(appDir)} reset --hard FETCH_HEAD`}
else
  if [ -e ${sq(appDir)} ]; then echo "${appDir} exists and is not a git checkout; refusing to overwrite it"; exit 1; fi
  ${s.commitSha
    ? `git ${auth}clone --branch ${sq(s.branch)} ${sq(url)} ${sq(appDir)}
  git -C ${sq(appDir)} checkout -f ${sq(s.commitSha)}`
    : `git ${auth}clone --depth=1 --branch ${sq(s.branch)} ${sq(url)} ${sq(appDir)}`}
fi
echo "Commit: $(git -C ${sq(appDir)} rev-parse --short HEAD)"
touch ${sq(appDir)}/.7server-deploying 2>/dev/null || true

step env
[ -d ${sq(workDir)} ] || { echo "Root directory ${s.rootDir} not found in repository"; exit 1; }
cd ${sq(workDir)}
export PATH="$PWD/node_modules/.bin:${sq(appDir)}/node_modules/.bin:$PATH"
( umask 022
{
  if [ -f .env.example ]; then
    grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example 2>/dev/null || true
  fi
${envLines || ':'}
} | tr -d '\\r' | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{k=$1; lines[k]=$0; if(!(k in seen)){order[++n]=k; seen[k]=1}} END{for(i=1;i<=n;i++) print lines[order[i]]}' > .env )
chmod 644 .env 2>/dev/null || true
chown -R "$TARGET_USER:$TARGET_GROUP" ${sq(appDir)} 2>/dev/null || true
chmod -R u+rwX,go+rX ${sq(appDir)} 2>/dev/null || true
echo "${s.env.length} user variable(s) + runtime config written to .env"

step install
${s.composeSidecar && !isDocker ? `if command -v docker >/dev/null 2>&1; then
  echo "Starting compose services the app depends on"
  docker compose up -d
else
  echo "Warning: this repo has a compose file (database/cache) but Docker is not installed"
fi
` : ''}${s.nodeMajor && !isDocker ? `if command -v node >/dev/null 2>&1; then
  have=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$have" -lt ${s.nodeMajor} ]; then echo "This app needs Node ${s.nodeMajor}+, server has $(node -v). Upgrade Node in Software, then retry."; exit 1; fi
fi
` : ''}${s.installCmd && !isDocker ? buildInstallBlock(s, appDir) : 'echo "No install step"'}

step build
${s.buildCmd && !isDocker ? buildCompileBlock(s, appDir) : 'echo "No build step"'}

step process
${isDocker ? dockerRun(s, appDir) : s.startCmd ? pm2Run(s, appDir) : s.domain ? 'echo "No start command: serving static files with Nginx"' : `command -v nginx >/dev/null 2>&1 || { echo "No start command and no domain: this static site needs Nginx (install it from Software) to be served on port ${s.port}"; exit 1; }
if ss -ltnH 2>/dev/null | awk '{print $4}' | grep -qE ':${s.port}$' && [ ! -f /etc/nginx/sites-available/${site} ]; then echo "Port ${s.port} is already used by another app. Pick a free Internal Port."; exit 1; fi
echo "No start command: serving static files with Nginx on port ${s.port}"`}
${s.postDeployCmd ? `
echo "Running post-deploy command: ${s.postDeployCmd.replace(/"/g, '\\"')}"
run_step ${sq(`cd ${sq(workDir)} && ${s.postDeployCmd}`)}
` : ''}
step health
${nginxSite(s, site, workDir)}
${isDocker ? `docker_project_containers() {
  {
    docker ps -a --filter "label=com.docker.compose.project=7server-${s.appName}" --format "{{.Names}}" 2>/dev/null || true
    [ -n "\${CP_PROJECT:-}" ] && docker ps -a --filter "label=com.docker.compose.project=\${CP_PROJECT}" --format "{{.Names}}" 2>/dev/null || true
    docker ps -a --filter "name=^/7server-${s.appName}" --format "{{.Names}}" 2>/dev/null || true
    if [ -n "\${COMPOSE_FILE:-}" ] && [ -f "$COMPOSE_FILE" ]; then
      for _cn_cfg in $( (grep -E '^[[:space:]]*container_name:' "$COMPOSE_FILE" 2>/dev/null || true) | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}'); do
        docker ps -a --filter "name=^/$_cn_cfg$" --format "{{.Names}}" 2>/dev/null || true
      done
    fi
  } | awk 'NF && !seen[$0]++'
}
` : ''}if true; then
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' ${sq(`http://127.0.0.1:${s.port}${s.healthCheckPath || '/'}`)} || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo "Health check: http://127.0.0.1:${s.port}${s.healthCheckPath || '/'} -> HTTP $code"
      ${s.domain ? '' : `# "|| true": under set -e + pipefail a grep with no match would kill the script silently right here.
      bind=$(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':${s.port}$' | head -n 1 || true)
      [ -n "$bind" ] || bind=$(netstat -ltn 2>/dev/null | awk '{print $4}' | grep -E ':${s.port}$' | head -n 1 || true)
      if [ -z "$bind" ]; then
        echo "Deployment is NOT live: HTTP $code came from 127.0.0.1:${s.port}, but no process on this server listens on that port."
        echo "Something outside this Linux holds the port (e.g. the Windows host under WSL), so the app cannot bind it."
        echo "Listening sockets on this server:"
        ss -ltnp 2>/dev/null | awk 'NR>1{print "  " $4 "  " $6}' | sort -u || true
        ${isDocker
        ? `for _cn in $(docker_project_containers); do
          docker ps -a --filter "name=^/$_cn$" --format '  {{.Names}}  {{.Status}}  {{.Ports}}' 2>/dev/null || true
          docker logs --tail 25 "$_cn" 2>&1 || true
        done`
        : `pm2 describe ${sq(s.appName)} 2>/dev/null | grep -E 'status|restarts|pid' || true
        echo "App log:"; pm2 logs ${sq(s.appName)} --lines 30 --nostream 2>/dev/null || true
        pm2 logs ${sq(s.appName)} --lines 50 --nostream 2>/dev/null | grep -q EADDRINUSE && echo "The app crashed with EADDRINUSE: port ${s.port} is taken. Pick a different Internal Port and deploy again." || true`}
        exit 1
      fi
      echo "Listening on: $bind"
      pub=$(hostname -I 2>/dev/null | awk '{print $1}')
      case "$bind" in
        127.*|\\[::1\\]*)
          if [ -n "$pub" ] && command -v nginx >/dev/null 2>&1; then
            echo "App bound to localhost ($bind); configuring Nginx bridge on $pub:${s.port} -> 127.0.0.1:${s.port}"
            cat > /etc/nginx/sites-available/${site} <<NGINX_BRIDGE_EOF
server {
  listen $pub:${s.port};
  server_name _;
  location / {
    proxy_pass http://127.0.0.1:${s.port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\$scheme;
  }
}
NGINX_BRIDGE_EOF
            ln -sf /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}
            nginx -t 2>/dev/null && { systemctl reload nginx 2>/dev/null || nginx -s reload; } || true
          else
            echo "Warning: the app only listens on localhost, so http://<server-ip>:${s.port} will be refused. Set HOST=0.0.0.0 in the app config or add a domain."
          fi
          ;;
      esac
      if [ -n "$pub" ]; then
        if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
          ufw allow ${s.port}/tcp >/dev/null 2>&1 || true
        fi
        ext=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://$pub:${s.port}/" || true)
        echo "Check via http://$pub:${s.port}/ -> HTTP \${ext:-000}"
        if [ -z "$ext" ] || [ "$ext" = "000" ]; then
          echo "Warning: http://$pub:${s.port}/ is unreachable from the host public IP — check your cloud Security Group / firewall for TCP port ${s.port}."
        fi
      fi`}
      break
    fi
    # If the port is open but HTTP returned 000, print periodic progress so user knows it's booting
    if [ $((i % 5)) -eq 0 ]; then
      echo "Waiting for app to respond on :${s.port} (attempt $i/30)..."
    fi
    # Self-healing: if after 3 tries nothing answers on ${s.port}, check if the app process started on a hardcoded port (e.g. 3000/8080) and bridge it.
    if [ "$i" = 3 ] && [ "${isDocker ? '1' : '0'}" = "0" ] && command -v pm2 >/dev/null 2>&1; then
      APP_PID=$(pm2 pid ${sq(s.appName)} 2>/dev/null | head -n 1 || true)
      if [ -n "$APP_PID" ] && [ "$APP_PID" != "0" ]; then
        ACTUAL_PORT=$(ss -ltnpH 2>/dev/null | grep -E "pid=($APP_PID|$(pgrep -P "$APP_PID" 2>/dev/null | tr '\\n' '|' | sed 's/|$//'))," | awk '{print $4}' | sed 's/.*://' | grep -E '^[0-9]+$' | head -n 1 || true)
        if [ -n "$ACTUAL_PORT" ] && [ "$ACTUAL_PORT" != "${s.port}" ] && command -v nginx >/dev/null 2>&1; then
          echo "App hardcoded internal port $ACTUAL_PORT instead of ${s.port}; bridging ${s.domain ? `80 (${s.domain})` : s.port} -> 127.0.0.1:$ACTUAL_PORT via Nginx..."
          cat > /etc/nginx/sites-available/${site} <<NGINX_REMAP_EOF
server {
  listen ${s.domain ? '80' : s.port};
  server_name ${s.domain || '_'};
  location / {
    proxy_pass http://127.0.0.1:$ACTUAL_PORT;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \\$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \\$host;
    proxy_set_header X-Real-IP \\$remote_addr;
    proxy_set_header X-Forwarded-For \\$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \\$scheme;
  }
}
NGINX_REMAP_EOF
          ln -sf /etc/nginx/sites-available/${site} /etc/nginx/sites-enabled/${site}
          nginx -t 2>/dev/null && { systemctl reload nginx 2>/dev/null || nginx -s reload; } || true
        fi
      fi
    fi
    ${isDocker ? `DOCKER_CRASHED=0
    DOCKER_FAIL_CONTAINERS=""
    if [ "$i" -ge 5 ]; then
      for _cn in $(docker_project_containers); do
        _meta=$(docker inspect -f '{{.State.Status}}|{{.State.ExitCode}}|{{.RestartCount}}|{{.State.OOMKilled}}' "$_cn" 2>/dev/null || true)
        [ -n "$_meta" ] || continue
        _st=\${_meta%%|*}; _rest=\${_meta#*|}
        _ec=\${_rest%%|*}; _rest=\${_rest#*|}
        _rc=\${_rest%%|*}; _oom=\${_rest#*|}
        if [ "$_st" = "restarting" ] || [ "$_st" = "dead" ] || [ "$_oom" = "true" ] || { [ "$_st" = "exited" ] && [ "\${_ec:-0}" != "0" ]; } || { [ "\${_rc:-0}" -ge 2 ] 2>/dev/null; } || { [ -z "\${COMPOSE_FILE:-}" ] && [ "$_st" = "exited" ]; }; then
          DOCKER_CRASHED=1
          DOCKER_FAIL_CONTAINERS="$DOCKER_FAIL_CONTAINERS $_cn"
        fi
      done
    fi
    if [ "$DOCKER_CRASHED" = "1" ] || [ "$i" = 30 ]; then
      if [ "$DOCKER_CRASHED" = "1" ]; then
        echo "Container crash detected — stopping wait early (attempt $i/30)."
      else
        echo "Nothing is answering on port ${s.port}. Ports listening on this server:"
        ss -ltnH 2>/dev/null | awk '{print "  " $4}' | sort -u
      fi
      echo "=== Container status for ${s.appName} ==="
      _P_CONTAINERS=$(docker_project_containers)
      if [ -n "$_P_CONTAINERS" ]; then
        for _cn in $_P_CONTAINERS; do
          docker ps -a --filter "name=^/$_cn$" --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null || true
        done
      else
        docker ps -a --format "  {{.Names}}  {{.Status}}  {{.Ports}}" 2>/dev/null || true
      fi
      echo "Recent container logs:"
      _LOG_TARGETS="$DOCKER_FAIL_CONTAINERS"
      [ -n "$_LOG_TARGETS" ] || _LOG_TARGETS="$_P_CONTAINERS"
      if [ -n "$_LOG_TARGETS" ]; then
        for _cn in $_LOG_TARGETS; do
          _cst=$(docker inspect -f '{{.State.Status}} (exit={{.State.ExitCode}}, restarts={{.RestartCount}})' "$_cn" 2>/dev/null || echo "unknown")
          echo "--- Logs: $_cn [$_cst] ---"
          docker logs --tail 35 "$_cn" 2>&1 || true
        done
      else
        docker logs --tail 35 ${sq('7server-' + s.appName)} 2>&1 || docker compose -p ${sq('7server-' + s.appName)} logs --tail 30 2>&1 || docker compose logs --tail 30 2>&1 || true
      fi
      if [ "$DOCKER_CRASHED" = "1" ]; then
        echo "Deployment failed: container(s) crashed on startup. Fix the error or .env configuration shown above, then redeploy."
      else
        if command -v nsenter >/dev/null 2>&1; then
          for _cn in $_P_CONTAINERS; do
            _cpid=$(docker inspect -f '{{.State.Pid}}' "$_cn" 2>/dev/null || true)
            if [ -n "$_cpid" ] && [ "$_cpid" != "0" ]; then
              _cports=$(nsenter -t "$_cpid" -n ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | grep -E '^[0-9]+$' | sort -u | tr '\\n' ',' | sed 's/,$//' || true)
              [ -n "$_cports" ] && echo "Detected container '$_cn' listening internally on port(s): $_cports"
            fi
          done
        fi
        echo "Set Internal Port to the port the app actually listens on (or check the container logs above), then redeploy."
      fi
      exit 1
    fi` : `if [ "$i" = 30 ]; then
      echo "Nothing is answering on port ${s.port}. Ports listening on this server:"
      ss -ltnH 2>/dev/null | awk '{print "  " $4}' | sort -u
      if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then sudo -u "$SUDO_USER" -H pm2 logs ${sq(s.appName)} --lines 30 --nostream 2>/dev/null || true; fi
      pm2 logs ${sq(s.appName)} --lines 30 --nostream 2>/dev/null || true
      echo "Set Internal Port to the port the app actually listens on, then redeploy."
      exit 1
    fi`}
    sleep 2
  done
fi
${s.domain ? '' : `echo "No domain set: the app is served directly on port ${s.port} (not through Nginx). Add a domain to get Nginx + SSL."`}
${s.autoSsl && s.domain && s.exposure !== 'none' ? `if command -v certbot >/dev/null 2>&1; then
  echo "Issuing Let's Encrypt SSL certificate for ${s.domain}..."
  certbot --nginx -d ${sq(s.domain)} --non-interactive --agree-tos --register-unsafely-without-email --redirect || echo "Warning: Auto-SSL failed (ensure DNS A/AAAA record points to this server)"
else
  echo "Warning: certbot is not installed; skipping Auto-SSL (install certbot from Software)"
fi
` : ''}DEPLOY_SUCCESS=1
rm -f ${sq(appDir)}/.7server-deploying 2>/dev/null || true
echo "Deployment finished"
`;
}
