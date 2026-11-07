// Real git deployment: validates the wizard's spec and builds one bash script run via executeSoftwareScript.
import { badRequest } from '../../http/errors.js';
import { sq } from '../../databases/shell.js';

export type DeployEngine = 'docker' | 'native_node' | 'native_php' | 'native_python' | 'native_go' | 'static';
export type ExposureType = 'public' | 'tunnel' | 'none';

export interface DeploySpec {
  appName: string;
  repo: string; // owner/name on GitHub
  branch: string;
  rootDir: string;
  installCmd: string;
  buildCmd: string;
  startCmd: string;
  port: number;
  domain: string;
  exposure?: ExposureType;
  tunnelName?: string;
  engine: DeployEngine;
  env: Array<{ key: string; value: string }>;
  nodeMajor?: number;
  composeSidecar?: boolean;
}

const ENGINES: DeployEngine[] = ['docker', 'native_node', 'native_php', 'native_python', 'native_go', 'static'];
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// Every field ends up in a root shell script, so anything not quoted with sq() must match a strict pattern.
export function parseDeploySpec(body: any): DeploySpec {
  const appName = str(body?.appName);
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(appName)) throw badRequest('Invalid app name (a-z, 0-9, - and _ only)');
  const repo = str(body?.repo);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || repo.includes('..')) throw badRequest('Invalid repository (expected owner/name)');
  const branch = str(body?.branch);
  if (!/^[\w./-]{1,200}$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw badRequest('Invalid branch name');
  const rootDir = str(body?.rootDir) || '/';
  if (!/^[\w./-]{1,200}$/.test(rootDir) || rootDir.split('/').includes('..')) throw badRequest('Invalid root directory');
  const port = Number(body?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw badRequest('Invalid port');
  const domain = str(body?.domain).toLowerCase();
  if (domain && !/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw badRequest('Invalid domain');
  const engine = ENGINES.includes(body?.engine) ? body.engine : 'native_node';
  const env = (Array.isArray(body?.env) ? body.env : [])
    .map((e: any) => ({ key: str(e?.key), value: typeof e?.value === 'string' ? e.value : '' }))
    .filter((e: { key: string }) => e.key);
  for (const e of env) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key)) throw badRequest(`Invalid env key: ${e.key}`);
  // Commands are free text on purpose: callers already hold service.control, which runs arbitrary scripts.
  const exposure: ExposureType = body?.exposure === 'tunnel' ? 'tunnel' : body?.exposure === 'none' ? 'none' : 'public';
  const tunnelName = str(body?.tunnelName);
  const nodeMajor = Number.isInteger(body?.nodeMajor) && body.nodeMajor >= 4 && body.nodeMajor < 100 ? body.nodeMajor : undefined;
  return { composeSidecar: body?.composeSidecar === true, nodeMajor, appName, repo, branch, rootDir, installCmd: str(body?.installCmd), buildCmd: str(body?.buildCmd), startCmd: str(body?.startCmd), port, domain, exposure, tunnelName, engine, env };
}

/** Lines starting with "@@STAGE <id>" let the UI move its pipeline stages; the rest is plain build output. */
export function buildDeployScript(s: DeploySpec, token?: string): string {
  const appDir = `/var/www/${s.appName}`;
  const workDir = s.rootDir === '/' ? appDir : `${appDir}/${s.rootDir.replace(/^\/+|\/+$/g, '')}`;
  const url = `https://github.com/${s.repo}.git`;
  // Header instead of a token-in-URL: nothing ends up in .git/config. shortcut: the header is briefly visible in ps on the VPS; use a git credential helper if that matters.
  const auth = token ? `-c http.extraHeader=${sq(`Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`)} ` : '';
  const site = `7server-${s.appName}`;
  const envKeys = new Set(s.env.map((e) => e.key.toUpperCase()));
  const defaultRuntimeEnv: Array<{ key: string; value: string }> = [];
  if (!envKeys.has('PORT')) defaultRuntimeEnv.push({ key: 'PORT', value: String(s.port) });
  if (!envKeys.has('NITRO_PORT')) defaultRuntimeEnv.push({ key: 'NITRO_PORT', value: String(s.port) });
  if (!envKeys.has('NUXT_PORT')) defaultRuntimeEnv.push({ key: 'NUXT_PORT', value: String(s.port) });
  if (!envKeys.has('HOST')) defaultRuntimeEnv.push({ key: 'HOST', value: '0.0.0.0' });
  if (!envKeys.has('NITRO_HOST')) defaultRuntimeEnv.push({ key: 'NITRO_HOST', value: '0.0.0.0' });
  if (!envKeys.has('NUXT_HOST')) defaultRuntimeEnv.push({ key: 'NUXT_HOST', value: '0.0.0.0' });
  if (!envKeys.has('HOSTNAME')) defaultRuntimeEnv.push({ key: 'HOSTNAME', value: '0.0.0.0' });
  const allEnv = [...s.env, ...defaultRuntimeEnv];
  const envLines = allEnv.map((e) => `printf '%s=%s\\n' ${sq(e.key)} ${sq(e.value)}`).join('\n');
  const isDocker = s.engine === 'docker';

  return `set -eo pipefail
export PATH="$PATH:/usr/local/bin:/usr/local/go/bin:$HOME/.bun/bin:$HOME/.local/bin"
export PORT=${s.port} NITRO_PORT=${s.port} NUXT_PORT=${s.port} SERVER_PORT=${s.port}
export HOST=0.0.0.0 NITRO_HOST=0.0.0.0 NUXT_HOST=0.0.0.0 HOSTNAME=0.0.0.0 ADDRESS=0.0.0.0 BIND_ADDR=0.0.0.0
# Non-interactive build: CI makes nuxt/next/vite/husky skip prompts (Nuxt asks about telemetry otherwise and waits forever).
export NO_COLOR=1 FORCE_COLOR=0 CI=1 NUXT_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 npm_config_yes=true
export NODE_OPTIONS="\${NODE_OPTIONS:---max-old-space-size=2048}"
step() { echo "@@STAGE $1"; }
# True when something accepts connections on 127.0.0.1:<port>, including holders ss can't see (Windows host under WSL).
port_probe() { (exec 3<>/dev/tcp/127.0.0.1/$1) 2>/dev/null; }
# Any unexpected failure under set -e names the command instead of exiting silently.
trap 'echo "Deploy script stopped at line $LINENO: $BASH_COMMAND" >&2' ERR
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
  git ${auth}-C ${sq(appDir)} fetch --depth=1 origin ${sq(s.branch)}
  git -C ${sq(appDir)} reset --hard FETCH_HEAD
else
  if [ -e ${sq(appDir)} ]; then echo "${appDir} exists and is not a git checkout; refusing to overwrite it"; exit 1; fi
  git ${auth}clone --depth=1 --branch ${sq(s.branch)} ${sq(url)} ${sq(appDir)}
fi
echo "Commit: $(git -C ${sq(appDir)} rev-parse --short HEAD)"

step env
[ -d ${sq(workDir)} ] || { echo "Root directory ${s.rootDir} not found in repository"; exit 1; }
cd ${sq(workDir)}
export PATH="$PWD/node_modules/.bin:${sq(appDir)}/node_modules/.bin:$PATH"
( umask 077
{
  if [ -f .env.example ]; then
    grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env.example 2>/dev/null || true
  fi
${envLines || ':'}
} | awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{k=$1; lines[k]=$0; if(!(k in seen)){order[++n]=k; seen[k]=1}} END{for(i=1;i<=n;i++) print lines[order[i]]}' > .env )
echo "${s.env.length} user variable(s) + runtime port/host written to .env (0600)"

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

step health
${nginxSite(s, site, workDir)}
if true; then
  for i in $(seq 1 15); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${s.port}/ || true)
    if [ -n "$code" ] && [ "$code" != "000" ]; then
      echo "Health check: http://127.0.0.1:${s.port}/ -> HTTP $code"
      ${s.domain ? '' : `# "|| true": under set -e + pipefail a grep with no match would kill the script silently right here.
      bind=$(ss -ltnH 2>/dev/null | awk '{print $4}' | grep -E ':${s.port}$' | head -n 1 || true)
      [ -n "$bind" ] || bind=$(netstat -ltn 2>/dev/null | awk '{print $4}' | grep -E ':${s.port}$' | head -n 1 || true)
      if [ -z "$bind" ]; then
        echo "Deployment is NOT live: HTTP $code came from 127.0.0.1:${s.port}, but no process on this server listens on that port."
        echo "Something outside this Linux holds the port (e.g. the Windows host under WSL), so the app cannot bind it."
        echo "Listening sockets on this server:"
        ss -ltnp 2>/dev/null | awk 'NR>1{print "  " $4 "  " $6}' | sort -u || true
        ${isDocker
          ? `docker ps --format '  {{.Names}}  {{.Ports}}' 2>/dev/null || true
        docker logs --tail 30 ${sq(`7server-${s.appName}`)} 2>&1 || true`
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
            nginx -t 2>/dev/null && systemctl reload nginx || true
          else
            echo "Warning: the app only listens on localhost, so http://<server-ip>:${s.port} will be refused. Set HOST=0.0.0.0 in the app config or add a domain."
          fi
          ;;
      esac
      if [ -n "$pub" ]; then
        ext=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://$pub:${s.port}/" || true)
        echo "Check via http://$pub:${s.port}/ -> HTTP \${ext:-000}"
      fi`}
      break
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
          nginx -t 2>/dev/null && systemctl reload nginx || true
        fi
      fi
    fi
    if [ "$i" = 15 ]; then
      echo "Nothing is answering on port ${s.port}. Ports listening on this server:"
      ss -ltnH 2>/dev/null | awk '{print "  " $4}' | sort -u
      ${isDocker ? `docker ps --format "  {{.Names}}  {{.Ports}}" 2>/dev/null
      echo "Recent container logs:"
      docker logs --tail 35 ${sq('7server-' + s.appName)} 2>&1 || docker compose -p ${sq('7server-' + s.appName)} logs --tail 25 2>&1 || docker compose logs --tail 25 2>&1 || true` : `pm2 logs ${sq(s.appName)} --lines 30 --nostream 2>/dev/null || true`}
      echo "Set Internal Port to the port the app actually listens on, then redeploy."
      exit 1
    fi
    sleep 2
  done
fi
${s.domain ? '' : `echo "No domain set: the app is served directly on port ${s.port} (not through Nginx). Add a domain to get Nginx + SSL."`}
echo "Deployment finished"
`;
}

function buildInstallBlock(s: DeploySpec, appDir: string): string {
  const cmd = s.installCmd.trim();
  const echoed = cmd.replace(/[\\"$`]/g, '\\$&');
  // Smart lockfile & monorepo fallback when standard npm ci / npm install is used
  if (/^npm\s+(ci|install|i)(\s|$)/.test(cmd)) {
    return `echo "$ ${echoed}"
if [ -f pnpm-lock.yaml ] || [ -f ${sq(appDir)}/pnpm-lock.yaml ] || [ -f ${sq(appDir)}/pnpm-workspace.yaml ]; then
  echo "Detected pnpm lockfile/workspace; installing with pnpm..."
  command -v pnpm >/dev/null 2>&1 || corepack enable pnpm 2>/dev/null || npm install -g pnpm
  run_step 'pnpm install --no-frozen-lockfile'
elif [ -f yarn.lock ] || [ -f ${sq(appDir)}/yarn.lock ]; then
  echo "Detected yarn.lock; installing with yarn..."
  command -v yarn >/dev/null 2>&1 || corepack enable yarn 2>/dev/null || npm install -g yarn
  run_step 'yarn install'
elif [ -f bun.lockb ] || [ -f bun.lock ] || [ -f ${sq(appDir)}/bun.lockb ] || [ -f ${sq(appDir)}/bun.lock ]; then
  echo "Detected bun lockfile; installing with bun..."
  run_step 'bun install'
elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  run_step ${sq(`${cmd}${!/--no-progress|--loglevel/.test(cmd) ? ' --no-audit --no-fund --loglevel=http' : ''} || npm install --no-audit --no-fund --loglevel=http`)}
else
  echo "No package-lock.json in $PWD; running npm install..."
  run_step 'npm install --no-audit --no-fund --loglevel=http'
fi`;
  }
  return `echo "$ ${echoed}"
run_step ${sq(cmd)}`;
}

function buildCompileBlock(s: DeploySpec, appDir: string): string {
  const cmd = s.buildCmd.trim();
  const echoed = cmd.replace(/[\\"$`]/g, '\\$&');
  return `export PATH="$PWD/node_modules/.bin:${sq(appDir)}/node_modules/.bin:$PATH"
echo "$ ${echoed}"
run_step ${sq(cmd)}`;
}

function dockerRun(s: DeploySpec, appDir: string): string {
  const name = sq(`7server-${s.appName}`);
  const bindPrefix = s.domain ? '127.0.0.1:' : '';
  return `command -v docker >/dev/null 2>&1 || { echo "Docker is not installed on this server"; exit 1; }
# Clean up any previous PM2 process or Docker container for this app so the port is free
if command -v pm2 >/dev/null 2>&1; then pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true; fi
docker rm -f ${name} >/dev/null 2>&1 || true

COMPOSE_FILE=""
for cf in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
  if [ -f "$cf" ]; then COMPOSE_FILE="$cf"; break; fi
done

if [ -n "$COMPOSE_FILE" ]; then
  # Clean up any broken or previously half-started containers from compose
  docker compose -p ${name} down 2>/dev/null || docker compose down 2>/dev/null || true

  # Collect all host listening ports right now
  USED_PORTS=$( (
    ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | grep -E '^[0-9]+$'
    docker ps --format '{{.Ports}}' 2>/dev/null | grep -oE ':[0-9]+->' | tr -d ':>-'
  ) | sort -un | tr '\\n' ' ' )

  # Rewrite compose file: map main app port to ${s.port}, and auto-resolve any host port collisions (e.g. postgres 5432)
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const file = process.argv[1];
      const targetPort = parseInt(process.argv[2], 10);
      const bindPrefix = process.argv[3] || "";
      const usedPortsList = (process.argv[4] || "").split(/\\s+/).map((p) => parseInt(p, 10)).filter(Boolean);
      const usedSet = new Set(usedPortsList);

      const dbPorts = new Set([5432, 3306, 6379, 27017]);
      let yml = fs.readFileSync(file, "utf8");
      let replacedMain = false;

      function getFree(start) {
        let p = start;
        while (usedSet.has(p) && p < 65535) p++;
        usedSet.add(p);
        return p;
      }

      yml = yml.replace(/^(\\s*-\\s*["\\x27]?)(?:(\\d{1,3}(?:\\.\\d{1,3}){3}):)?(?:\\$\\{[^:}]+:-(\\d+)\\}|(\\d+)):(\\d+)(\\/(?:tcp|udp))?(["\\x27]?\\s*)$/gm, (m, pre, ip, defEnvPort, hPortStr, cPortStr, proto, suf) => {
        const hPort = parseInt(defEnvPort || hPortStr, 10);
        const cPort = parseInt(cPortStr, 10);

        if (!replacedMain && !dbPorts.has(hPort) && !dbPorts.has(cPort)) {
          replacedMain = true;
          usedSet.add(targetPort);
          return \`\${pre}\${bindPrefix}\${targetPort}:\${cPort}\${proto || ""}\${suf}\`;
        }

        if (usedSet.has(hPort)) {
          const newHPort = getFree(hPort >= 5000 ? hPort + 1 : hPort + 10000);
          console.log(\`Port \${hPort} is already in use on host; remapping compose service port to 127.0.0.1:\${newHPort}:\${cPort}\`);
          return \`\${pre}127.0.0.1:\${newHPort}:\${cPort}\${proto || ""}\${suf}\`;
        } else {
          usedSet.add(hPort);
          return m;
        }
      });
      fs.writeFileSync(file, yml);
    ' "$COMPOSE_FILE" "${s.port}" "${bindPrefix}" "$USED_PORTS" 2>/dev/null || true
  fi
  export PORT=${s.port} HOST=0.0.0.0 NITRO_PORT=${s.port} NITRO_HOST=0.0.0.0
  docker compose -p ${name} up -d --build || docker compose up -d --build
else
  if ! docker build --build-arg PORT=${s.port} -t ${name} .; then
    if [ "$PWD" != ${sq(appDir)} ] && [ -f "$PWD/Dockerfile" ]; then
      echo "Retrying Docker build using monorepo root context (${appDir})..."
      docker build --build-arg PORT=${s.port} -t ${name} -f "$PWD/Dockerfile" ${sq(appDir)}
    else
      exit 1
    fi
  fi
  EXPOSED=$(docker image inspect --format '{{range $p, $conf := .Config.ExposedPorts}}{{$p}} {{end}}' ${name} 2>/dev/null | awk -F/ '{print $1}' | grep -E '^[0-9]+$' | head -n 1 || true)
  WORKDIR=$(docker image inspect --format '{{.Config.WorkingDir}}' ${name} 2>/dev/null || true)
  CPORT=${s.port}
  if [ -n "$EXPOSED" ]; then CPORT="$EXPOSED"; fi
  VOL_FLAG=""
  if [ -n "$WORKDIR" ] && [ "$WORKDIR" != "/" ]; then
    VOL_FLAG="-v $PWD:$WORKDIR"
  fi
  docker run -d --name ${name} --restart unless-stopped --env-file .env \\
    $VOL_FLAG \\
    -e PORT="$CPORT" -e NITRO_PORT="$CPORT" -e NUXT_PORT="$CPORT" \\
    -e HOST=0.0.0.0 -e NITRO_HOST=0.0.0.0 -e NUXT_HOST=0.0.0.0 -e HOSTNAME=0.0.0.0 \\
    -p ${bindPrefix}${s.port}:"$CPORT" ${name}

  # Verify container port mapping; if the image listens on a hardcoded EXPOSE port (e.g. 3000/8080/80) instead of $CPORT, remap automatically
  for _t in 1 2 3; do
    sleep 2
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${s.port}/ || true)
    [ -n "$code" ] && [ "$code" != "000" ] && break
  done
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    CPID=$(docker inspect -f '{{.State.Pid}}' ${name} 2>/dev/null || true)
    ACTUAL_CPORT=""
    if [ -n "$CPID" ] && [ "$CPID" != "0" ] && command -v nsenter >/dev/null 2>&1; then
      ACTUAL_CPORT=$(nsenter -t "$CPID" -n ss -ltnH 2>/dev/null | awk '{print $4}' | sed 's/.*://' | grep -E '^[0-9]+$' | head -n 1 || true)
    fi
    [ -z "$ACTUAL_CPORT" ] && [ -n "$EXPOSED" ] && ACTUAL_CPORT="$EXPOSED"
    if [ -n "$ACTUAL_CPORT" ] && [ "$ACTUAL_CPORT" != "$CPORT" ]; then
      echo "Container listens internally on port $ACTUAL_CPORT (not $CPORT); remapping host :${s.port} -> container :$ACTUAL_CPORT..."
      docker rm -f ${name} >/dev/null 2>&1 || true
      docker run -d --name ${name} --restart unless-stopped --env-file .env \\
        $VOL_FLAG \\
        -e PORT="$ACTUAL_CPORT" -e NITRO_PORT="$ACTUAL_CPORT" -e NUXT_PORT="$ACTUAL_CPORT" \\
        -e HOST=0.0.0.0 -e NITRO_HOST=0.0.0.0 -e NUXT_HOST=0.0.0.0 -e HOSTNAME=0.0.0.0 \\
        -p ${bindPrefix}${s.port}:"$ACTUAL_CPORT" ${name}
    fi
  fi
fi`;
}

function pm2Run(s: DeploySpec, appDir: string): string {
  // Replace hardcoded preset ports in startCmd (e.g. -l 3000, --port 8000) with the chosen port
  const normalizedStartCmd = s.startCmd
    .replace(/(\b(?:-l|--port|-p)\s+)(?:3000|3001|4321|8000|8080)\b/g, `$1${s.port}`);

  return `if ! command -v pm2 >/dev/null 2>&1; then
  command -v npm >/dev/null 2>&1 || { echo "pm2/npm not found: install Node.js from Software first"; exit 1; }
  npm install -g pm2
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
[ -f .env ] && . ./.env
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

pm2 start ./.7server-start.sh --name ${sq(s.appName)} --cwd "$PWD" --interpreter bash --update-env >/dev/null
pm2 save >/dev/null 2>&1 || true
echo "PM2: ${s.appName} started on 0.0.0.0:${s.port} (pm2 logs ${s.appName} to follow output)"`;
}

function nginxSite(s: DeploySpec, site: string, workDir: string): string {
  const proxied = !!s.startCmd || s.engine === 'docker';
  if (!s.domain && proxied) return 'echo "No domain set: skipping Nginx"';
  // Static site without a domain: Nginx serves the build output on the chosen port.
  const listen = s.domain ? 'listen 80;' : `listen ${s.port};`;
  const serverName = s.domain || '_';
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
  nginx -t && systemctl reload nginx
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
  let lines = content.split(/\r?\n/);
  let hostIdx = -1, fallbackIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === "hostname: " + host || l === "- hostname: " + host) hostIdx = i;
    if (l.includes("http_status:404")) {
      let bIdx = i;
      for (let k = i; k >= Math.max(0, i - 2); k--) {
        if (/^\s*-\s+/.test(lines[k])) { bIdx = k; break; }
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
  fs.writeFileSync(cfg, lines.join("\n"), "utf8");
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
  find "$DIR" -maxdepth 2 \\( -name docker-compose.yml -o -name docker-compose.yaml -o -name compose.yml -o -name compose.yaml \\) 2>/dev/null | while read -r f; do
    (cd "$(dirname "$f")" && docker compose down --remove-orphans) && echo "stopped compose stack $f"
  done
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
  nginx -t && systemctl reload nginx && echo "nginx reloaded"
fi

if command -v certbot >/dev/null 2>&1; then
  for d in $DOMAINS; do
    certbot delete --cert-name "$d" --non-interactive >/dev/null 2>&1 && echo "deleted certificate $d"
  done
fi

if command -v cloudflared >/dev/null 2>&1 && [ -n "$DOMAINS" ]; then
  echo "==> Cloudflare Tunnel"
  for cfg in /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /root/.cloudflared/config.yml ~/.cloudflared/config.yml; do
    if [ -f "$cfg" ]; then
      CF_RELOAD=""
      for d in $DOMAINS; do
        if grep -q "hostname: $d" "$cfg"; then
          node -e '
const fs = require("fs");
const [cfg, host] = [process.argv[1], process.argv[2]];
if (fs.existsSync(cfg)) {
  let lines = fs.readFileSync(cfg, "utf8").split("\n");
  let out = [], skip = false;
  for (let l of lines) {
    if (l.includes("hostname: " + host)) { skip = true; continue; }
    if (skip && (/^\s*-\s+/.test(l) || /^[a-zA-Z0-9_-]+:/.test(l.trim()))) skip = false;
    if (!skip) out.push(l);
  }
  fs.writeFileSync(cfg, out.join("\n"), "utf8");
}
' "$cfg" "$d" 2>/dev/null || true
          echo "removed ingress route $d from $cfg"
          CF_RELOAD=1
        fi
      done
      [ -n "$CF_RELOAD" ] && (systemctl restart cloudflared 2>/dev/null || pkill -HUP cloudflared 2>/dev/null || true)
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
