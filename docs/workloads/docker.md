# Docker & Compose Stacks

7Server turns your remote Docker engine into an interactive visual control center.

---

## Capabilities

- **Container Lifecycle**: Start, stop, restart, pause, and force-kill containers.
- **Docker Compose Orchestration**: Deploy, inspect, edit, and tear down multi-service Compose files directly from the dashboard.
- **Live Container Logs**: Real-time streaming container logs with color formatting and search filtering.
- **Image Management**: Browse local Docker images, inspect image layers and size, and prune dangling images to recover disk space.
- **Volume & Network Inspection**: View container mount points, persistent named volumes, and bridge network allocations.

---

## Safety Approvals

In line with 7Server's safety model:
- Read-only actions (inspecting container list, viewing logs, reading environment variables) occur immediately without interrupting you.
- Destructive actions (removing containers, stopping production databases, pruning volumes) require confirmation dialogs to prevent accidental downtime.

