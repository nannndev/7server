<p align="center">
  <img src="client/public/favicon.svg" width="72" alt="7Server">
</p>

<h1 align="center">7Server</h1>

<p align="center">
  Self-hosted dashboard for your servers: monitoring, a browser terminal, Docker, Nginx, cron, backups,
  databases and an AI copilot. Agentless, over SSH.
</p>

<p align="center">
  <a href="https://github.com/nannndev/7server/actions/workflows/ci.yml"><img src="https://github.com/nannndev/7server/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/sevenserver"><img src="https://img.shields.io/npm/v/sevenserver?label=npm" alt="npm"></a>
  <a href="https://www.npmjs.com/package/sevenserver"><img src="https://img.shields.io/npm/dm/sevenserver?label=downloads&color=06b6d4" alt="npm downloads"></a>
  <a href="https://github.com/nannndev/7server/pkgs/container/7server"><img src="https://img.shields.io/badge/docker-ghcr.io-blue" alt="Docker image"></a>
  <a href="https://discord.gg/AF2Hc56t3N"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white" alt="Discord"></a>
</p>

<picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fleet-grid-dark.png"><img alt="Fleet overview" src="docs/screenshots/fleet-grid-light.png"></picture>

## What it does

- **Fleet view.** Every server's CPU, memory, disk, load and uptime at a glance, as cards, a rack, a topology map or a matrix.
- **Nothing to install on your servers.** 7Server reads everything over SSH. Credentials are stored encrypted (AES-256-GCM) with a key that never leaves your machine.
- **Browser terminal.** A full xterm.js shell per server: colors, resize, `htop`, `vim`, several sessions side by side.
- **Day-to-day ops in one place.** Processes, systemd services, PM2, Docker containers and images, Nginx sites, SSL certificates, cron jobs, open ports, firewall (UFW), backups, file manager and logs.
- **Databases.** Browse MySQL/MariaDB, PostgreSQL, SQLite, Redis and MongoDB, run queries and see an ER diagram.
- **Monitoring and alerts.** Thresholds per server, uptime history and Discord alerts.
- **AI copilot and gateway.** Ask about a server and let the agent run commands for you (read-only ones run directly, anything else waits for your OK). Use your own API keys or your existing Claude, ChatGPT, Copilot or Gemini subscriptions, with fallback combos and quotas, and an OpenAI-compatible endpoint for your other tools.
- **Users and roles.** Admin, operator and viewer roles, per-server access, sessions and an audit log.

## Screenshots

Every page comes in dark and light; GitHub shows the one matching your theme.

| | |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/server-overview-dark.png"><img alt="Server overview" src="docs/screenshots/server-overview-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/terminal-dark.png"><img alt="Browser terminal" src="docs/screenshots/terminal-light.png"></picture> |
| Server overview | Browser terminal |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/apps-dark.png"><img alt="Apps in /var/www" src="docs/screenshots/apps-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/deploy-dark.png"><img alt="Deploy from GitHub" src="docs/screenshots/deploy-light.png"></picture> |
| Apps in /var/www | Deploy from GitHub |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/docker-dark.png"><img alt="Docker" src="docs/screenshots/docker-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fleet-rack-dark.png"><img alt="Rack view" src="docs/screenshots/fleet-rack-light.png"></picture> |
| Docker | Rack view |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/ai-gateway-dark.png"><img alt="AI gateway" src="docs/screenshots/ai-gateway-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/copilot-dark.png"><img alt="Copilot" src="docs/screenshots/copilot-light.png"></picture> |
| AI gateway | Copilot |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/monitoring-dark.png"><img alt="Monitoring" src="docs/screenshots/monitoring-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/users-dark.png"><img alt="Users and roles" src="docs/screenshots/users-light.png"></picture> |
| Monitoring | Users and roles |

### Deploy from GitHub

| | |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/deploy-repos-dark.png"><img alt="Pick a repository" src="docs/screenshots/deploy-repos-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/deploy-config-dark.png"><img alt="Configure" src="docs/screenshots/deploy-config-light.png"></picture> |
| 1. Pick a repository | 2. Configure: framework, port, missing software |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/deploy-running-dark.png"><img alt="Live pipeline" src="docs/screenshots/deploy-running-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/deploy-success-dark.png"><img alt="Deployed" src="docs/screenshots/deploy-success-light.png"></picture> |
| 3. Live pipeline and build log | 4. Deployed (or failed, with retry and AI fix) |

<details>
<summary>More screenshots</summary>

| | |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fleet-topology-dark.png"><img alt="Fleet topology" src="docs/screenshots/fleet-topology-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fleet-matrix-dark.png"><img alt="Resource matrix" src="docs/screenshots/fleet-matrix-light.png"></picture> |
| Fleet topology | Resource matrix |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/server-topology-dark.png"><img alt="Server architecture" src="docs/screenshots/server-topology-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/services-dark.png"><img alt="Services and processes" src="docs/screenshots/services-light.png"></picture> |
| Server architecture | Services and processes |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/templates-dark.png"><img alt="Template setup" src="docs/screenshots/templates-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/databases-dark.png"><img alt="Databases" src="docs/screenshots/databases-light.png"></picture> |
| Template setup | Databases |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/pm2-dark.png"><img alt="PM2" src="docs/screenshots/pm2-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/nginx-dark.png"><img alt="Nginx sites" src="docs/screenshots/nginx-light.png"></picture> |
| PM2 | Nginx sites |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/ssl-dark.png"><img alt="SSL certificates" src="docs/screenshots/ssl-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/ports-dark.png"><img alt="Ports and firewall" src="docs/screenshots/ports-light.png"></picture> |
| SSL certificates | Ports and firewall |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/security-dark.png"><img alt="SSH and security" src="docs/screenshots/security-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/backups-dark.png"><img alt="Backups" src="docs/screenshots/backups-light.png"></picture> |
| SSH and security | Backups |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/cron-dark.png"><img alt="Scheduled tasks" src="docs/screenshots/cron-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/uptime-dark.png"><img alt="Uptime" src="docs/screenshots/uptime-light.png"></picture> |
| Scheduled tasks | Uptime |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/ai-keys-dark.png"><img alt="AI gateway API keys" src="docs/screenshots/ai-keys-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/ai-usage-dark.png"><img alt="AI gateway request logs" src="docs/screenshots/ai-usage-light.png"></picture> |
| AI gateway API keys | AI gateway request logs |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/audit-dark.png"><img alt="Audit log" src="docs/screenshots/audit-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/roles-dark.png"><img alt="Roles and permissions" src="docs/screenshots/roles-light.png"></picture> |
| Audit log | Roles and permissions |
| <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/integrations-dark.png"><img alt="Git integrations" src="docs/screenshots/integrations-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/fleet-grid-dark.png"><img alt="Fleet grid" src="docs/screenshots/fleet-grid-light.png"></picture> |
| Git integrations | Fleet grid |

</details>

All screenshots use demo data: throwaway containers and made-up names, no real servers. To retake them, see [scripts/demo/README.md](scripts/demo/README.md).

## Install

### npm

Needs Node.js 22.13 or newer.

```bash
npm install -g sevenserver
7server                      # http://127.0.0.1:5001, data in ~/.7server
```

```bash
7server --port 8080 --host 0.0.0.0 --data /srv/7server --no-open
7server reset-password admin # locked out? set a new password
```

When a new version is out, `7server` tells you on startup (it checks npm at most once a day; turn it off with `--no-update-check`). More options in [packages/npm/README.md](packages/npm/README.md).

### Docker

```bash
cp .env.docker.example .env  # optional settings
docker compose up -d
```

Or use the published image: `ghcr.io/nannndev/7server:latest` (also `:0.1`, `:0.1.1`, …), for `linux/amd64` and `linux/arm64`.

- Data (`7server.db` and `secret.key`) lives in the `7server-data` volume. Updating the image never touches it.
- The port is published on `127.0.0.1` only. To reach it from elsewhere, put nginx or Caddy with HTTPS in front and set `TRUST_PROXY` in `.env` (`172.16.0.0/12` for nginx on the same host).
- AI gateway: inside the container, Docker bridge addresses are not trusted as local callers, since a published port can make internet traffic look like it comes from the bridge. Set `AI_GATEWAY_TRUST_DOCKER_BRIDGE=1` only if everything on the bridge is trusted.
- Locked out: `docker compose exec 7server node --import tsx src/resetPassword.ts admin`.
- Update: `git pull && docker compose up -d --build`, or pull a newer image.
- The image holds no data or secrets, runs as a non-root user and has a healthcheck.

### First run

There is no default password. Open the dashboard and create the admin account. From another machine you are also asked for a 6-digit setup code, printed in the terminal (or `docker compose logs 7server`). To skip the browser step, start with `DASHBOARD_PASSWORD=…` and the `admin` user is created with that password.

### Backups

Back up `7server.db` **and** `secret.key` together. Without the key the SSH credentials in the database can't be decrypted.

```bash
docker run --rm -v 7server-data:/data -v "$PWD":/backup alpine tar czf /backup/7server-backup.tgz -C /data .
```

## Development

```bash
npm run dev       # API on :5001, dashboard on :3000 (with hot reload)
npm run dev:all   # also the landing page on :3001
npm test          # every *.test.ts in server/ and client/
```

```
server/src/
  http/        auth, sessions, middleware
  infra/       SQLite storage, encryption, audit log
  modules/     one folder per feature (servers, terminal, docker, ai-gateway, users, …)
client/src/
  app/         routing and layout
  features/    one folder per feature, matching the server modules
  shared/      UI kit, API client, i18n (English and Indonesian)
landing/       the project website
packages/npm/  the sevenserver npm package (bundled server + built dashboard)
```

Architecture notes: [backend](docs/backend-architecture.md), [frontend](docs/frontend-architecture.md), [roles and access](docs/rbac-and-access.md).

## Releases

CI runs typecheck, tests, the npm package build, the landing build and the Docker build on every pull request and push to `main`.

To release, from a clean `main`:

```bash
npm run release patch        # or minor, major, 1.2.3: bumps, commits and tags vX.Y.Z
git push origin main vX.Y.Z
```

The tag starts the release workflow: it publishes `sevenserver` to npm (Trusted Publishing, with provenance), pushes the multi-arch image to GHCR and creates a GitHub Release. Versions like `1.2.0-beta.1` go to the npm `next` tag and are marked as prereleases.

Release notes are grouped by pull request label. Labels live in [.github/labels.yml](.github/labels.yml); pull requests are labeled by the files they touch and by their title prefix (`feat:` → enhancement, `fix:` → bug, `feat!:` → breaking).

## Support

7Server is free and open source. If it saves you time, you can [buy me a coffee](https://buymeacoffee.com/ekaprasety8) or support it on [Saweria](https://saweria.co/nannndev).
