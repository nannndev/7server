# Demo data for screenshots

Throwaway servers and a separate 7Server instance with made-up data. Nothing here touches your real data dir.

```bash
# 1. demo "servers": Ubuntu containers with sshd, nginx, cron and PM2 apps (root / demo-password)
docker build -t 7server-demo-host scripts/demo
docker network create 7s-demo
docker run -d --privileged --name 7sd-dind --network 7s-demo --network-alias dind -e DOCKER_TLS_CERTDIR= docker:dind
i=0; for spec in prod-web-01:web prod-api-01:api db-primary:db worker-sgp-01:worker; do
  name=${spec%:*}; role=${spec#*:}; port=$((2200 + i)); i=$((i + 1))
  docker run -d --name 7sd-$name --hostname $name --network 7s-demo -e ROLE=$role \
    -p 127.0.0.1:$port:22 -p "[::1]:$port:22" --memory 512m 7server-demo-host
done
docker exec 7sd-prod-api-01 sh -c 'echo DOCKER_HOST=tcp://dind:2375 >> /etc/environment'
for c in "shop-frontend nginx:alpine" "orders-db postgres:16-alpine" "cache redis:7-alpine"; do
  set -- $c; docker exec 7sd-dind docker run -d --name $1 -e POSTGRES_PASSWORD=demo $2
done

# 2. a separate 7Server on :5301 with its data in /tmp
cd client && npx vite build --outDir /tmp/7s-demo/client --emptyOutDir && cd ..
cd server && PORT=5301 VPSHUB_DATA_DIR=/tmp/7s-demo/data STATIC_DIR=/tmp/7s-demo/client npx tsx src/index.ts
```

Then open http://127.0.0.1:5301, create the admin and add the servers with hosts `web-01.demo.localhost`,
`api-01.demo.localhost`, `db-01.demo.localhost` and `worker-sgp.demo.localhost` (ports 2200–2203; `*.localhost`
resolves to this machine, so the screenshots show a name instead of 127.0.0.1). Add a few users and API keys,
then fill the AI gateway history and the audit log:

```bash
VPSHUB_DATA_DIR=/tmp/7s-demo/data npx --prefix server tsx scripts/demo/seed.ts   # refuses any dir outside /tmp
```

Restart the demo server so it reads the seeded data. Screenshots in `docs/screenshots` are 1440×900, dark theme.

Clean up: `docker rm -f $(docker ps -aq --filter name=7sd-) && docker network rm 7s-demo && rm -rf /tmp/7s-demo`.
