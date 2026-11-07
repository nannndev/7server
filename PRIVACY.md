# Privacy Policy & Architecture

**7Server** is self-hosted, open-source server management software built with a strict privacy-first architecture. 

Our philosophy is simple: **Your infrastructure, keys, and operational telemetry belong solely to you.**

---

## 1. Zero Telemetry & No Phone-Home

- **No Analytics:** 7Server contains no tracking pixels, analytics beacons, telemetry engines, or crash reporting services.
- **No External Cloud Dependency:** 7Server runs entirely on your own hardware or virtual machine. When you start 7Server, it binds to localhost or your specified interface and communicates directly with your servers.
- **No Central Servers:** There is no centralized 7Server account, licensing server, or backend API that collects data about you or your fleet.

---

## 2. Agentless Operations & Remote Data

- **Pure SSH:** 7Server manages target VPS nodes strictly through standard OpenSSH (Port 22).
- **Zero Installed Agents:** No background daemon, agent process, or persistent monitoring binary is installed on your target servers.
- **Clean Disconnect:** Removing a server from your 7Server dashboard leaves zero residual files or running processes on that server.

---

## 3. Data Storage & Encryption At Rest

- **Local SQLite Database:** All configuration, server metadata, and application settings are stored locally in a single SQLite database file (`7server.db` in `~/.7server/` or your Docker volume).
- **AES-256-GCM Vault:** Sensitive data — including SSH private keys, passwords, AI provider tokens, GitHub Personal Access Tokens, and Discord webhook URLs — are encrypted at rest using AES-256-GCM.
- **Separate Key Storage:** The encryption master key (`secret.key`) is generated on initialization and stored in a separate file on your host machine. Without this key, the database contents cannot be decrypted.

---

## 4. Direct Third-Party Integrations

When you configure external services, all communication happens directly between your 7Server instance and the provider:
- **GitHub API:** Used solely to fetch repositories, branches, and monorepo folders for Git deployments using the Personal Access Token you supply.
- **AI Providers (Claude, OpenAI, Gemini):** Requests sent through the AI Copilot or AI Gateway route directly to the respective API endpoints from your local machine. No prompt data or server diagnostics pass through any intermediary 7Server servers.
- **Cloudflare Tunnels:** Managed directly using the official `cloudflared` binary on your servers with your configured tunnel tokens.
- **Discord Webhooks:** Health alert notifications are pushed directly from your server to Discord's official webhook API.

---

## 5. Privacy Mode (Screencasts & Demos)

7Server includes a dedicated **Privacy Mode** toggle in the top bar. When activated, all sensitive information — including server IP addresses, domain names, file paths, open ports, and usernames — is visually blurred with CSS. This allows operators, streamers, and developers to safely record tutorials, present live demos, or share screenshots without exposing infrastructure details.

---

## 6. Questions & Security Reports

For privacy inquiries or to report a security vulnerability responsibly, please submit a private report via [GitHub Security Advisories](https://github.com/nannndev/7server/security/advisories/new) or open an issue on [GitHub](https://github.com/nannndev/7server).

