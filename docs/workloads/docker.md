# Docker & Compose Stacks

7Server turns your remote Docker engine into an interactive visual control center while providing automated healing for common container deployment pitfalls—such as port collisions, empty development containers, and silent container crashes.

---

## Capabilities

- **Container Lifecycle**: Start, stop, restart, pause, and force-kill containers with immediate feedback.
- **Docker Compose Orchestration**: Deploy, inspect, edit, and tear down multi-service Compose stacks directly from the dashboard.
- **Live Container Logs**: Real-time streaming container logs with color formatting, ANSI terminal support, and search filtering.
- **Image Management**: Browse local Docker images, inspect layers and virtual sizes, and prune dangling images to recover disk space.
- **Volume & Network Inspection**: View container mount points, persistent named volumes, and bridge network allocations.

---

## Automated Deployment Healing & Resilience

Deploying containerized workloads on shared VPS nodes often leads to conflicts and runtime failures. 7Server includes built-in safeguards to handle these scenarios automatically:

### 1. Compose Port Collision Auto-Resolver

When deploying repositories that include a `docker-compose.yml` defining common backing services (such as PostgreSQL on `5432`, Redis on `6379`, MySQL on `3306`, or Mailpit on `1025`/`8025`), those ports may already be occupied by host services or existing stacks.

Instead of crashing with `bind: address already in use`, 7Server's deployment engine:
1. Inspects the target server's open ports prior to running `docker compose up`.
2. Identifies colliding published ports on the host.
3. Dynamically generates a non-destructive compose override that remaps colliding host bindings to safe loopback addresses (for example, `127.0.0.1:5433:5432` or `127.0.0.1:13000:3000`).
4. Preserves internal bridge network connectivity so other containers in the same network continue to communicate using service names (e.g. `postgres:5432`) without disruption.

```
Port 5432 is already in use on host; remapping compose service port to 127.0.0.1:5433:5432
Port 3000 is already in use on host; remapping compose service port to 127.0.0.1:13000:3000
```

### 2. Smart `EXPOSE` Port Mapping

When deploying a container via `Dockerfile`, applications often hardcode their listening port internally (e.g. `EXPOSE 8000` or `EXPOSE 3000`).

7Server parses the target Dockerfile:
- If an `EXPOSE` instruction is present, 7Server maps the external host port to the internal exposed port:
  ```bash
  docker run -d --name 7server-<app> -p <host_port>:<exposed_port> ...
  ```
- This prevents common routing failures where a container listening on port `8000` is mistakenly mapped `-p 8003:8003`, causing health checks to timeout because nothing is listening on container port `8003`.

### 3. Development Dockerfile Auto-Volume Mounting

Many developer repositories contain `Dockerfile` definitions intended for local development with docker-compose volume mounts. These Dockerfiles often omit `COPY . /var/www/html` or similar copy instructions, expecting the source code to be mounted from the host at runtime.

When built in isolation on a production server, such containers start with empty working directories (e.g. `/var/www/html/artisan: No such file or directory`) and immediately exit in a crash loop.

7Server automatically detects when a Dockerfile defines a `WORKDIR` but contains no build-stage `COPY` of the project source:
- It automatically mounts the checkout directory into the container working directory (`-v "$PWD":"$WORKDIR"`).
- Your application files are immediately accessible inside the running container without requiring Dockerfile modifications.

### 4. Direct Container Failure Log Streaming

If a container fails health checks or terminates prematurely during the `Process Manager & Port` stage:
- 7Server immediately streams `docker logs --tail 35 <container_name>` into the deployment terminal output.
- Stack traces, fatal runtime errors (such as missing Laravel environment keys, database connection exceptions, or Node.js crashes) are displayed immediately in the deployment feed rather than requiring manual SSH terminal sessions to diagnose.

---

## Safety Approvals

In line with 7Server's safety model:
- **Read-Only Actions**: Inspecting container lists, streaming logs, and viewing environment variables occur immediately without interruption.
- **State-Changing Actions**: Removing containers, stopping production databases, or pruning volumes require explicit confirmation dialogs to prevent accidental downtime.
