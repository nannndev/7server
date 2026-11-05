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
  <a href="https://github.com/nannndev/7server/pkgs/container/7server"><img src="https://img.shields.io/badge/docker-ghcr.io-blue" alt="Docker image"></a>
</p>

![Fleet overview](docs/screenshots/fleet-grid.png)

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

| | |
|---|---|
| ![Server overview](docs/screenshots/server-overview.png) | ![Terminal](docs/screenshots/terminal.png) |
| Server overview | Browser terminal |
| ![Docker](docs/screenshots/docker.png) | ![Rack view](docs/screenshots/fleet-rack.png) |
| Docker | Rack view |
| ![AI gateway](docs/screenshots/ai-gateway.png) | ![Copilot](docs/screenshots/copilot.png) |
| AI gateway | Copilot |
| ![Monitoring](docs/screenshots/monitoring.png) | ![Users](docs/screenshots/users.png) |
| Monitoring | Users and roles |

<details>
<summary>More screenshots</summary>

| | |
|---|---|
| ![Topology](docs/screenshots/fleet-topology.png) | ![Matrix](docs/screenshots/fleet-matrix.png) |
| Fleet topology | Resource matrix |
| ![Server topology](docs/screenshots/server-topology.png) | ![Services](docs/screenshots/services.png) |
| Server architecture | Services and processes |
| ![PM2](docs/screenshots/pm2.png) | ![Nginx](docs/screenshots/nginx.png) |
| PM2 | Nginx sites |
| ![Cron](docs/screenshots/cron.png) | ![AI gateway logs](docs/screenshots/ai-usage.png) |
| Scheduled tasks | AI gateway request logs |
| ![Audit log](docs/screenshots/audit.png) | ![Roles](docs/screenshots/roles.png) |
| Audit log | Roles and permissions |

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
