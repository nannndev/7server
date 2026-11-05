# sevenserver

Installs the `7server` command.

Self-hosted dashboard for your servers. It connects over the SSH access you already have: nothing is installed on your servers.

Monitoring with Discord alerts, a browser terminal, Docker and Compose, Nginx and SSL, cron, services, backups, a database workbench, and an AI copilot that checks the server itself and asks before it changes anything.

## Install

Needs Node.js 22.13 or newer.

```bash
npm install -g sevenserver
7server
```

It opens `http://127.0.0.1:5001`. Sign in as `admin` with `DASHBOARD_PASSWORD`, or with the random password written to `~/.7server/dashboard.password` on first start.

## Options

```
7server --port 8080            # default 5001
7server --host 0.0.0.0         # reachable from other machines: put HTTPS in front
7server --data /srv/7server    # default ~/.7server
7server --no-open              # don't open the browser
```

Environment variables work too: `PORT`, `HOST`, `VPSHUB_DATA_DIR`, `DASHBOARD_PASSWORD`, `TRUST_PROXY`, `AI_GATEWAY_ALLOWED_IPS`, `GEMINI_OAUTH_CLIENT_ID`, `GEMINI_OAUTH_CLIENT_SECRET`.

## Run it all the time

```bash
pm2 start 7server -- --no-open      # or a systemd unit running `7server --no-open`
```

## Data

Everything lives in the data directory: `7server.db` and `secret.key`. Back them up together. The database is useless without the key, and SSH credentials inside it are encrypted with it.

## Docker

Prefer containers? See the repository: `docker compose up -d`.
