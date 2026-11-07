# Connecting & Managing Servers

7Server centralizes all your Linux servers into a unified fleet view.

<img class="only-light" src="/screenshots/fleet-grid-light.png" alt="Fleet Overview Grid">
<img class="only-dark" src="/screenshots/fleet-grid-dark.png" alt="Fleet Overview Grid">

---

## Adding a Server

Navigate to the dashboard and click **+ Add Server**.

### Connection Parameters

- **Server Name**: A friendly human-readable label (e.g., `api-gateway-sg`, `db-replica-01`).
- **Host / IP**: The IPv4 address, IPv6 address, or hostname of the server.
- **Port**: Default is `22`. Custom ports (e.g., `2222`, `5522`) are fully supported.
- **Username**: Usually `root`, `ubuntu`, or `debian`. Ensure the user has `sudo` privileges for administrative tasks.
- **Authentication Method**:
  - **Password**: Standard password authentication.
  - **Private Key (Recommended)**: RSA or Ed25519 OpenSSH private key with optional passphrase.

### Instant Connection Test

Before persisting your credentials to the SQLite vault, 7Server executes a pre-flight probe:
1. Opens an encrypted SSH handshake.
2. Checks system architecture (`uname -m`), OS distribution (`/etc/os-release`), and baseline latency.
3. Only saves if the connection is successful, preventing dead entries in your fleet.

---

## Fleet Overview & Tagging

<img class="only-light" src="/screenshots/server-overview-light.png" alt="Single Server Overview & Quick Maintenance">
<img class="only-dark" src="/screenshots/server-overview-dark.png" alt="Single Server Overview & Quick Maintenance">

Servers can be grouped and filtered using tags:

- Status indicator: **Online** (green LED), **Offline** (red LED), or **Connecting**.
- Live resource chips showing instantaneous CPU, RAM, and disk utilization.
- Quick actions: Open terminal, browse containers, view logs, or launch the AI Copilot.

