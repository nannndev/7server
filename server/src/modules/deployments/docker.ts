import { sq } from '../../databases/shell.js';
import { DeploySpec } from './types.js';

export function dockerRun(s: DeploySpec, appDir: string): string {
  const name = sq(`7server-${s.appName}`);
  const bindPrefix = s.domain ? '127.0.0.1:' : '';
  return `command -v docker >/dev/null 2>&1 || { echo "Docker is not installed on this server"; exit 1; }
# Clean up any previous PM2 process or Docker container for this app so the port is free
if command -v pm2 >/dev/null 2>&1; then pm2 delete ${sq(s.appName)} >/dev/null 2>&1 || true; fi
docker rm -f ${name} >/dev/null 2>&1 || true
docker ps -a --filter "name=^/7server-${s.appName}" -q | xargs -r docker rm -f >/dev/null 2>&1 || true

COMPOSE_FILE=""
for cf in docker-compose.prod.yml docker-compose.production.yml docker-compose.yml docker-compose.yaml compose.yml compose.yaml docker-compose.dev.yml compose.dev.yml; do
  if [ -f "$cf" ]; then COMPOSE_FILE="$cf"; break; fi
done
if [ -z "$COMPOSE_FILE" ]; then
  COMPOSE_FILE=$(ls docker-compose*.yml docker-compose*.yaml compose*.yml compose*.yaml 2>/dev/null | head -n 1 || true)
fi
if [ -z "$COMPOSE_FILE" ] && [ "$PWD" != ${sq(appDir)} ]; then
  for cf in docker-compose.prod.yml docker-compose.production.yml docker-compose.yml docker-compose.yaml compose.yml compose.yaml docker-compose.dev.yml compose.dev.yml; do
    if [ -f "${appDir}/$cf" ]; then COMPOSE_FILE="${appDir}/$cf"; break; fi
  done
  if [ -z "$COMPOSE_FILE" ]; then
    COMPOSE_FILE=$(ls ${sq(appDir)}/docker-compose*.yml ${sq(appDir)}/docker-compose*.yaml ${sq(appDir)}/compose*.yml ${sq(appDir)}/compose*.yaml 2>/dev/null | head -n 1 || true)
  fi
fi

if [ -n "$COMPOSE_FILE" ]; then
  # Sync .env into every referenced env_file in COMPOSE_FILE (any syntax) and attach .env to non-DB services via override
  rm -f .7server-compose.override.yml 2>/dev/null || true
  if [ -f .env ] && command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const path = require("path");
      const composePath = fs.realpathSync(path.resolve(process.argv[1]));
      const composeDir = path.dirname(composePath);
      const rootDir = fs.realpathSync(process.cwd());
      const dotEnvPath = path.resolve(rootDir, ".env");
      if (!fs.existsSync(dotEnvPath)) process.exit(0);

      const cleanEnvLines = (txt) => txt.replace(/\\r/g, "").split("\\n");
      const mergeEnv = (baseTxt, overTxt) => {
        const map = new Map();
        for (const src of [baseTxt, overTxt]) {
          for (const line of cleanEnvLines(src)) {
            const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
            if (m) map.set(m[1], line);
          }
        }
        return Array.from(map.values()).join("\\n") + "\\n";
      };

      const dotEnvTxt = fs.readFileSync(dotEnvPath, "utf8");
      const ymlLines = fs.readFileSync(composePath, "utf8").split(/\\r?\\n/);
      const dbOnlyRe = /^(postgres|postgresql|pg|db|database|mysql|mariadb|redis|valkey|keydb|mongo|mongodb|minio|rabbitmq|mq|kafka|zookeeper|opensearch|elasticsearch|elastic|meilisearch|typesense|qdrant|milvus|mailpit|mailhog|adminer|pgadmin|phpmyadmin|redis-commander)$/i;

      const referencedFiles = new Set();
      const services = [];
      let inServices = false, curSvc = "", inEnvFile = false, envFileIndent = 0;

      const unquote = (s) => s.trim().replace(/^["\\x27]|["\\x27]$/g, "");
      for (const line of ymlLines) {
        if (/^services:\\s*(#.*)?$/.test(line)) { inServices = true; curSvc = ""; inEnvFile = false; continue; }
        if (/^[A-Za-z0-9_-]+:/.test(line)) { inServices = false; curSvc = ""; inEnvFile = false; continue; }
        if (!inServices) continue;

        const sm = line.match(/^  ([A-Za-z0-9_.-]+):\\s*(#.*)?$/);
        if (sm) {
          curSvc = sm[1];
          services.push(curSvc);
          inEnvFile = false;
          continue;
        }
        if (!curSvc) continue;

        const efHead = line.match(/^(\\s*)env_file:\\s*(.*?)(#.*)?$/);
        if (efHead) {
          envFileIndent = efHead[1].length;
          const rest = (efHead[2] || "").trim();
          if (rest.startsWith("[") && rest.endsWith("]")) {
            for (const item of rest.slice(1, -1).split(",")) {
              const p = unquote(item);
              if (p) referencedFiles.add(p);
            }
            inEnvFile = false;
          } else if (rest) {
            const p = unquote(rest);
            if (p) referencedFiles.add(p);
            inEnvFile = false;
          } else {
            inEnvFile = true;
          }
          continue;
        }

        if (inEnvFile) {
          if (!line.trim() || /^\\s*#/.test(line)) continue;
          const ind = (line.match(/^(\\s*)/) || ["", ""])[1].length;
          if (ind <= envFileIndent && !/^\\s*-/.test(line)) {
            inEnvFile = false;
          } else {
            const li = line.match(/^\\s*-\\s*(?:path:\\s*)?(.+?)\\s*(#.*)?$/);
            if (li) {
              const p = unquote(li[1]);
              if (p && !/^required:/i.test(p)) referencedFiles.add(p);
            } else {
              const pm = line.match(/^\\s*path:\\s*(.+?)\\s*(#.*)?$/);
              if (pm) referencedFiles.add(unquote(pm[1]));
            }
            continue;
          }
        }
      }

      for (const rel of referencedFiles) {
        if (!rel || /^\\$\\{/.test(rel)) continue;
        const resolved = path.resolve(composeDir, rel);
        if (resolved === dotEnvPath) continue;
        if (!resolved.startsWith(rootDir + path.sep) && resolved !== rootDir) continue;
        const existing = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
        fs.mkdirSync(path.dirname(resolved), { recursive: true });
        fs.writeFileSync(resolved, mergeEnv(existing, dotEnvTxt), { mode: 0o644 });
        console.log("Synced .env overrides -> " + path.relative(rootDir, resolved));
      }

      const appServices = services.filter((s) => !dbOnlyRe.test(s));
      if (appServices.length > 0) {
        const overrideLines = ["services:"];
        for (const s of appServices) {
          overrideLines.push(
            "  " + s + ":",
            "    env_file:",
            "      - " + JSON.stringify(dotEnvPath),
            "    environment:",
            "      HOST: \\"0.0.0.0\\"",
            "      HOSTNAME: \\"0.0.0.0\\"",
            "      NITRO_HOST: \\"0.0.0.0\\"",
            "      NUXT_HOST: \\"0.0.0.0\\""
          );
        }
        fs.writeFileSync(path.resolve(rootDir, ".7server-compose.override.yml"), overrideLines.join("\\n") + "\\n", { mode: 0o644 });
      }
    ' "$COMPOSE_FILE" || true
  fi
  COMPOSE_ENV_FLAG=""
  [ -f .env ] && COMPOSE_ENV_FLAG="--env-file .env"
  COMPOSE_OVERRIDE_FLAG=""
  [ -f .7server-compose.override.yml ] && COMPOSE_OVERRIDE_FLAG="-f .7server-compose.override.yml"
  # Replace deprecated / removed MinIO images (quay.io and Docker Hub) with public working images
  sed -i -E 's#^([[:space:]]*image:[[:space:]]*["'"'"']?)(quay\\.io/|docker\\.io/)?minio/minio(:[^"'"'"'[:space:]]*)?(["'"'"']?)#\\1cgr.dev/chainguard/minio:latest\\4#g' "$COMPOSE_FILE" 2>/dev/null || true
  sed -i -E 's#^([[:space:]]*image:[[:space:]]*["'"'"']?)(quay\\.io/|docker\\.io/)?minio/mc(:[^"'"'"'[:space:]]*)?(["'"'"']?)#\\1cgr.dev/chainguard/minio-client:latest\\4#g' "$COMPOSE_FILE" 2>/dev/null || true

  # Ensure data directories exist with write access for unprivileged container users (opensearch UID 1000, postgres UID 999, etc.)
  mkdir -p data/credentials data/opensearch data/postgres data/redis data/minio data/rabbitmq 2>/dev/null || true
  [ -d data ] && chmod -R 777 data 2>/dev/null || true
  chown -R 1000:1000 data/opensearch 2>/dev/null || true

  # OpenSearch security plugin & memory bootstrap
  if grep -qi "opensearch" "$COMPOSE_FILE" 2>/dev/null; then
    export DISABLE_SECURITY_PLUGIN=true
    export DISABLE_INSTALL_DEMO_CONFIG=true
    export OPENSEARCH_INITIAL_ADMIN_PASSWORD="K-Forum@Dev1!2026"
    export OPENSEARCH_JAVA_OPTS="\${OPENSEARCH_JAVA_OPTS:--Xms512m -Xmx512m}"
    grep -q "OPENSEARCH_INITIAL_ADMIN_PASSWORD" .env 2>/dev/null || echo "OPENSEARCH_INITIAL_ADMIN_PASSWORD=K-Forum@Dev1!2026" >> .env
    grep -q "DISABLE_SECURITY_PLUGIN" .env 2>/dev/null || echo "DISABLE_SECURITY_PLUGIN=true" >> .env
    grep -q "DISABLE_INSTALL_DEMO_CONFIG" .env 2>/dev/null || echo "DISABLE_INSTALL_DEMO_CONFIG=true" >> .env
    grep -q "OPENSEARCH_JAVA_OPTS" .env 2>/dev/null || echo "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m" >> .env
    if [ -f .env.prod ]; then
      grep -q "OPENSEARCH_INITIAL_ADMIN_PASSWORD" .env.prod 2>/dev/null || echo "OPENSEARCH_INITIAL_ADMIN_PASSWORD=K-Forum@Dev1!2026" >> .env.prod
      grep -q "DISABLE_SECURITY_PLUGIN" .env.prod 2>/dev/null || echo "DISABLE_SECURITY_PLUGIN=true" >> .env.prod
      grep -q "DISABLE_INSTALL_DEMO_CONFIG" .env.prod 2>/dev/null || echo "DISABLE_INSTALL_DEMO_CONFIG=true" >> .env.prod
      grep -q "OPENSEARCH_JAVA_OPTS" .env.prod 2>/dev/null || echo "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m" >> .env.prod
    fi
  fi

  # Clean up any broken or previously half-started containers from compose
  CP_PROJECT=$( (grep -E '^name:' "$COMPOSE_FILE" 2>/dev/null || true) | head -n 1 | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}')
  # No -v here: keeping volumes preserves database data across redeploys
  if [ -n "$CP_PROJECT" ]; then
    docker compose -p "$CP_PROJECT" -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
  fi
  docker compose -p ${name} -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true
  docker ps -a --filter "label=com.docker.compose.project=7server-${s.appName}" -q | xargs -r docker rm -f >/dev/null 2>&1 || true

  # Actively force remove any container matching container_name: from compose file to eliminate name collisions
  for cn in $( (grep -E '^[[:space:]]*container_name:' "$COMPOSE_FILE" 2>/dev/null || true) | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}'); do
    docker rm -f "$cn" >/dev/null 2>&1 || true
  done

  # Collect all host listening ports right now
  USED_PORTS=$( (
    (ss -ltnH 2>/dev/null || true) | awk '{print $4}' | sed 's/.*://' | (grep -E '^[0-9]+$' || true)
    (docker ps --format '{{.Ports}}' 2>/dev/null || true) | (grep -oE ':[0-9]+->' || true) | tr -d ':>-'
  ) | sort -un | tr '\\n' ' ' )

  # Rewrite compose file: map main app service port to ${s.port}, and auto-resolve any host port collisions (e.g. postgres 5432, minio 9000)
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const file = process.argv[1];
      const targetPort = parseInt(process.argv[2], 10);
      const bindPrefix = process.argv[3] || "";
      const usedPortsList = (process.argv[4] || "").split(/\\s+/).map((p) => parseInt(p, 10)).filter(Boolean);
      const appHint = (process.argv[5] || "").toLowerCase();
      const usedSet = new Set(usedPortsList);

      const infraPorts = new Set([5432, 5433, 3306, 6379, 6380, 27017, 9000, 9001, 5672, 15672, 9200, 9300, 9600, 1025, 8025, 7700, 4222, 8222, 2181, 11211]);
      const infraSvcRe = /^(postgres|postgresql|pg|db|database|mysql|mariadb|redis|valkey|keydb|mongo|mongodb|minio|rabbitmq|mq|kafka|zookeeper|opensearch|elasticsearch|elastic|meilisearch|typesense|qdrant|milvus|mailpit|mailhog|adminer|pgadmin|phpmyadmin|redis-commander|migrate|migrations|seeder|seed|init|setup|worker|cron|scheduler)$/i;
      const appSvcRe = /^(app|web|api|backend|frontend|server|main|gateway)$/i;
      const portRe = /^(\\s*-\\s*["\\x27]?)(?:(\\d{1,3}(?:\\.\\d{1,3}){3}):)?(?:(?:\\$\\{[^}:]+(?::-?(\\d+))?\\}|(\\d+)):)?(\\d+|\\$\\{[^}:]+(?::-?(\\d+))?\\})(\\/(?:tcp|udp))?(["\\x27]?\\s*)(#.*)?$/;

      const raw = fs.readFileSync(file, "utf8");
      const lines = raw.split(/\\r?\\n/);
      const svcMeta = {};
      const candidates = [];
      let inServices = false;
      let curSvc = "";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^services:\\s*(#.*)?$/.test(line)) { inServices = true; curSvc = ""; continue; }
        if (/^[A-Za-z0-9_-]+:/.test(line)) { inServices = false; curSvc = ""; continue; }
        if (!inServices) continue;

        const svcMatch = line.match(/^  ([A-Za-z0-9_.-]+):\\s*(#.*)?$/);
        if (svcMatch) {
          curSvc = svcMatch[1];
          if (!svcMeta[curSvc]) svcMeta[curSvc] = { hasBuild: false };
          continue;
        }
        if (curSvc && /^    build\\s*:/.test(line)) svcMeta[curSvc].hasBuild = true;

        const pm = curSvc ? line.match(portRe) : null;
        if (pm) {
          const hPort = parseInt(pm[3] || pm[4] || pm[6] || pm[5], 10);
          const cPort = parseInt(pm[6] || pm[5], 10);
          candidates.push({ lineIdx: i, svc: curSvc, hPort, cPort, isInfraPort: infraPorts.has(hPort) || infraPorts.has(cPort) });
        }
      }

      const pickMain = () => {
        const nonInfra = candidates.filter((c) => !c.isInfraPort && !infraSvcRe.test(c.svc));
        const byHint = nonInfra.find((c) => appHint && (c.svc.toLowerCase() === appHint || appHint.includes(c.svc.toLowerCase())));
        if (byHint) return byHint.lineIdx;
        const byAppNameOrBuild = nonInfra.find((c) => appSvcRe.test(c.svc) || svcMeta[c.svc]?.hasBuild);
        if (byAppNameOrBuild) return byAppNameOrBuild.lineIdx;
        if (nonInfra.length) return nonInfra[0].lineIdx;
        const anyNonInfraPort = candidates.find((c) => !c.isInfraPort);
        return anyNonInfraPort ? anyNonInfraPort.lineIdx : -1;
      };
      const mainIdx = pickMain();

      function getFree(start) {
        let p = start;
        while (usedSet.has(p) && p < 65535) p++;
        usedSet.add(p);
        return p;
      }

      let mainSvcName = "";
      let mainContainerPort = "";
      for (let i = 0; i < lines.length; i++) {
        const pm = lines[i].match(portRe);
        if (!pm) continue;
        const [, pre, , defHostPort, hPortStr, cSpec, defContPort, proto, suf, comment] = pm;
        const hPort = parseInt(defHostPort || hPortStr || defContPort || cSpec, 10);

        if (i === mainIdx) {
          usedSet.add(targetPort);
          lines[i] = \`\${pre}\${bindPrefix}\${targetPort}:\${cSpec}\${proto || ""}\${suf}\${comment || ""}\`;
          const foundCand = candidates.find((c) => c.lineIdx === i);
          if (foundCand) {
            mainSvcName = foundCand.svc;
            if (/^\\d+$/.test(cSpec)) mainContainerPort = cSpec;
          }
          continue;
        }

        if (usedSet.has(hPort)) {
          const newHPort = getFree(hPort >= 5000 ? hPort + 1 : hPort + 10000);
          console.log(\`Port \${hPort} is already in use on host; remapping compose service port to 127.0.0.1:\${newHPort}:\${cSpec}\`);
          lines[i] = \`\${pre}127.0.0.1:\${newHPort}:\${cSpec}\${proto || ""}\${suf}\${comment || ""}\`;
        } else {
          usedSet.add(hPort);
        }
      }
      fs.writeFileSync(file, lines.join("\\n"));

      // Keep container internal PORT synced to literal container port in compose override so app listens where Docker forwards
      if (mainSvcName && mainContainerPort) {
        const ovPath = path.resolve(process.cwd(), ".7server-compose.override.yml");
        if (fs.existsSync(ovPath)) {
          let ov = fs.readFileSync(ovPath, "utf8");
          const marker = "  " + mainSvcName + ":\\n";
          const idx = ov.indexOf(marker);
          if (idx !== -1) {
            const head = ov.slice(0, idx);
            const tail = ov.slice(idx).replace("    environment:\\n", "    environment:\\n      PORT: \\"" + mainContainerPort + "\\"\\n");
            fs.writeFileSync(ovPath, head + tail, { mode: 0o644 });
          }
        }
      }
    ' "$COMPOSE_FILE" "${s.port}" "${bindPrefix}" "$USED_PORTS" ${sq(s.appName)} 2>/dev/null || true
  fi
  export HOST=0.0.0.0
  # Only activate compose profiles automatically if the compose file defines NO default (unprofiled) services.
  # Otherwise optional/dev profiles (e.g. devtools, minio, seaweedfs, test) would be pulled and started unintentionally.
  if [ -z "\${COMPOSE_PROFILES:-}" ] && (grep -qE '^[[:space:]]*profiles:' "$COMPOSE_FILE" 2>/dev/null || true); then
    DEFAULT_SVCS=$(docker compose -p ${name} -f "$COMPOSE_FILE" \${COMPOSE_OVERRIDE_FLAG} \${COMPOSE_ENV_FLAG} config --services 2>/dev/null || true)
    if [ -z "$DEFAULT_SVCS" ]; then
      if grep -qE '^[[:space:]]*-[[:space:]]*["'"'"']?(prod|production)["'"'"']?[[:space:]]*$|profiles:[[:space:]]*\\[[^]]*(prod|production)' "$COMPOSE_FILE" 2>/dev/null; then
        export COMPOSE_PROFILES="prod,production"
      else
        export COMPOSE_PROFILES="*"
      fi
    fi
  fi
  if ! docker compose -p ${name} -f "$COMPOSE_FILE" \${COMPOSE_OVERRIDE_FLAG} \${COMPOSE_ENV_FLAG} up -d --build; then
    echo "Docker compose up encountered an error. Collecting container logs..."
    docker compose -p ${name} -f "$COMPOSE_FILE" \${COMPOSE_OVERRIDE_FLAG} \${COMPOSE_ENV_FLAG} ps -a 2>/dev/null || true
    docker compose -p ${name} -f "$COMPOSE_FILE" \${COMPOSE_OVERRIDE_FLAG} \${COMPOSE_ENV_FLAG} logs --tail 35 --no-color 2>&1 || true
    for cn in $( (grep -E '^[[:space:]]*container_name:' "$COMPOSE_FILE" 2>/dev/null || true) | awk '{gsub(/[\\x22\\x27]/, ""); print $NF}'); do
      if docker container inspect "$cn" >/dev/null 2>&1; then
        echo "=== Container logs for $cn ==="
        docker logs --tail 30 "$cn" 2>&1 || true
      fi
    done
    exit 1
  fi
else
  TARGET_FLAG=""
  # Support Nixpacks build engine or fallback
  USE_NIXPACKS=0
  if [ "${s.engine}" = "nixpacks" ] || { [ ! -f "Dockerfile" ] && [ ! -f "docker-compose.yml" ] && [ ! -f "compose.yml" ]; }; then
    if command -v nixpacks >/dev/null 2>&1; then
      USE_NIXPACKS=1
    elif command -v npx >/dev/null 2>&1; then
      USE_NIXPACKS=2
    fi
  fi

  if [ "$USE_NIXPACKS" = "1" ]; then
    echo "Building container image with Nixpacks..."
    nixpacks build . --name ${name}
  elif [ "$USE_NIXPACKS" = "2" ]; then
    echo "Building container image with Nixpacks (via npx)..."
    npx -y nixpacks build . --name ${name}
  else
    if [ ! -f "Dockerfile" ]; then
      echo "No Dockerfile found. Generating standard Dockerfile..."
      cat << 'EOF_DOCKERFILE' > Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production 2>/dev/null || npm install 2>/dev/null || true
COPY . .
ENV PORT=${s.port}
EXPOSE ${s.port}
CMD ["npm", "start"]
EOF_DOCKERFILE
    fi
    if [ -f "Dockerfile" ]; then
      for st in app production runner runtime web server main prod; do
        if grep -iqE "^FROM\\s+.*\\s+AS\\s+\${st}\\s*$" "Dockerfile"; then
          TARGET_FLAG="--target \${st}"
          break
        fi
      done
    fi
    if ! docker build \${TARGET_FLAG} --build-arg PORT=${s.port} -t ${name} .; then
      if [ "$PWD" != ${sq(appDir)} ] && [ -f "$PWD/Dockerfile" ]; then
        echo "Retrying Docker build using monorepo root context (${appDir})..."
        docker build \${TARGET_FLAG} --build-arg PORT=${s.port} -t ${name} -f "$PWD/Dockerfile" ${sq(appDir)}
      else
        exit 1
      fi
    fi
  fi

  # Smart Volume Mount Check:
  # Multi-stage builds (Nuxt, Next.js, Vite) use "COPY . ." or "COPY --from=builder ...".
  # For those, mounting host $PWD destroys built artifacts (.output, dist).
  # BUT for environment-only Dockerfiles (e.g. Laravel dev Dockerfile without COPY),
  # host files MUST be mounted to WORKDIR, otherwise /var/www/html is empty and artisan is missing!
  HAS_SOURCE_COPY=$(grep -E '^[[:space:]]*(COPY|ADD)[[:space:]]+(\.|[a-zA-Z0-9_./-]+)[[:space:]]+(\.|/|[a-zA-Z0-9_./-]+)' Dockerfile 2>/dev/null | grep -v -E 'composer|package|\.json|\.lock' || true)
  WORKDIR_VAL=$(grep -E '^[[:space:]]*WORKDIR[[:space:]]+' Dockerfile 2>/dev/null | tail -n 1 | awk '{print $2}' || true)
  VOL_FLAG=""
  if [ -z "$HAS_SOURCE_COPY" ] && [ -n "$WORKDIR_VAL" ]; then
    echo "Notice: Dockerfile does not copy source code into the image; mounting host directory into $WORKDIR_VAL..."
    VOL_FLAG="-v $PWD:$WORKDIR_VAL"
    # If composer.json exists and vendor directory is missing, install dependencies inside container
    if [ -f "composer.json" ] && [ ! -d "vendor" ]; then
      echo "Installing composer dependencies in container environment..."
      docker run --rm -v "$PWD:$WORKDIR_VAL" -w "$WORKDIR_VAL" ${name} composer install --no-dev --ignore-platform-req=php+ --optimize-autoloader 2>&1 || true
    fi
  fi

  EXPOSED=$(docker image inspect --format '{{range $p, $conf := .Config.ExposedPorts}}{{$p}} {{end}}' ${name} 2>/dev/null | awk -F/ '{print $1}' | grep -E '^[0-9]+$' | head -n 1 || true)
  CPORT=${s.port}
  if [ -n "$EXPOSED" ]; then CPORT="$EXPOSED"; fi
  docker run -d --name ${name} --restart unless-stopped --env-file .env \\
    \${VOL_FLAG} \\
    --add-host=host.docker.internal:host-gateway \\
    -e PORT="$CPORT" -e NITRO_PORT="$CPORT" -e NUXT_PORT="$CPORT" \\
    -e HOST=0.0.0.0 -e NITRO_HOST=0.0.0.0 -e NUXT_HOST=0.0.0.0 -e HOSTNAME=0.0.0.0 \\
    -p ${bindPrefix}${s.port}:"$CPORT" ${name}

  # Verify container port mapping; if the image listens on a hardcoded EXPOSE port (e.g. 3000/8080/80) instead of $CPORT, remap automatically
  for _t in 1 2 3; do
    sleep 2
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${s.port}/ || true)
    [ -n "$code" ] && [ "$code" != "000" ] && break
    CSTATE=$(docker inspect -f '{{.State.Status}}' ${name} 2>/dev/null || true)
    [ "$CSTATE" = "exited" ] || [ "$CSTATE" = "dead" ] && break
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
        \${VOL_FLAG} \\
        --add-host=host.docker.internal:host-gateway \\
        -e PORT="$ACTUAL_CPORT" -e NITRO_PORT="$ACTUAL_CPORT" -e NUXT_PORT="$ACTUAL_CPORT" \\
        -e HOST=0.0.0.0 -e NITRO_HOST=0.0.0.0 -e NUXT_HOST=0.0.0.0 -e HOSTNAME=0.0.0.0 \\
        -p ${bindPrefix}${s.port}:"$ACTUAL_CPORT" ${name}
    fi
  fi
fi`;
}

