# Architecture & Security Model

7Server is engineered around zero-trust containment, local credential custody, and agentless orchestration over SSH.

```
+-----------------------------------------------------------------------+
|                             Your Machine / Hub                        |
|                                                                       |
|  +--------------------+         WebSocket (PTY)     +--------------+  |
|  |   Vite + React UI  | <-------------------------> |  API Server  |  |
|  |  (Tailwind/xterm)  |                             | (Node/TSX)   |  |
|  +--------------------+                             +-------+------+  |
|                                                             |         |
|                                 AES-256-GCM Vault           |         |
|                                 +-----------------------+   |         |
|                                 | server/data/7server.db| <-+         |
|                                 +-----------------------+             |
+-------------------------------------------------------------|---------+
                                                              |
                       SSH Tunnel (Port 22)                   |
                       +--------------------------------------+
                       |
                       v
         +----------------------------+
         |    Managed Target VPS      |
         |                            |
         |  * Standard sshd           |
         |  * Docker / Compose        |
         |  * Nginx / UFW             |
         |  * Databases (MySQL/PG)    |
         |  * NO 7Server agent daemon |
         +----------------------------+
```

---

## 1. Zero Daemons on Managed Servers

Unlike agent-based platforms that require custom binaries running as `root` on your nodes, 7Server executes non-interactive commands over standard SSH channels:

- **Metrics Collection**: Runs lightweight POSIX shell pipelines (reading `/proc/meminfo`, `/proc/stat`, `df`, `uptime`) with zero continuous memory consumption.
- **Docker Management**: Connects directly to the Docker socket or executes `docker` CLI over SSH.
- **Cleanup**: When you disconnect or delete a server from 7Server, nothing is left behind on the remote VPS.

---

## 2. AES-256-GCM Credential Vault

All sensitive artifacts are encrypted before hitting the disk:

- **SSH Passwords & Private Keys**: Encrypted with **AES-256-GCM** using an authentication tag (`authTag`) preventing tampering.
- **AI Gateway Provider Tokens**: OAuth refresh tokens (Claude, OpenAI, GitHub Copilot) are encrypted in the local SQLite database.
- **Master Secret**: Stored in `server/data/.secret_key` with strict filesystem permissions (`0600`).

---

## 3. Network Isolation & Reverse Proxies

By default, 7Server binds to loopback (`127.0.0.1`):

- **Internal AI Gateway**: The `/v1` endpoint is strictly guarded. It only responds to loopback clients, private RFC 1918 subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and explicitly registered VPS IP addresses. Unauthorized external clients receive `403 Forbidden`.
- **TRUST_PROXY Support**: When deploying behind Nginx, Caddy, or Cloudflare, set:
  ```env
  TRUST_PROXY=127.0.0.1,::1
  ```
  7Server validates the real client socket address against the configured upstream proxies to prevent spoofed `X-Forwarded-For` injection.

