# Changelog

All notable changes to **7Server** (`sevenserver` on npm and `ghcr.io/nannndev/7server`) are documented here.

---

## v0.3.0 — Universal AI Gateway 2.0, Multi-Account Rotation, Custom `SKILL.md` & `/compact`

### Universal AI Gateway (27 Built-In Providers)
- **8 OAuth Subscription Providers**: Added **Kimi Code** (`km/`), **Kilo Code** (`kc/`), **Muse / Koda CLI** (`ms/`), and **Nous Portal** (`ns/`) alongside **Claude Pro/Max** (`cc/`), **ChatGPT / Codex** (`cx/`), **GitHub Copilot** (`gh/`), and **Gemini CLI** (`gc/`).
- **19 API-Key & OpenAI-Compatible Providers**: Added first-class support for **Groq**, **Mistral**, **xAI Grok**, **Together AI**, **Fireworks**, **Cerebras**, **Perplexity**, **Moonshot Kimi**, **Alibaba Qwen (DashScope)**, **Z.ai GLM**, **MiniMax**, **NVIDIA NIM**, **Cohere**, **Nebius**, **SiliconFlow**, **Hyperbolic**, and **DeepInfra** alongside **OpenAI**, **Anthropic**, **Google Gemini**, **OpenRouter**, and **Ollama**.
- **Multi-Account Ordered Rotation (`#1 → #2 → #3`)**:
  - Connect unlimited OAuth subscription accounts or API keys per provider (`+ Add Account` / `+ Add Another Key`).
  - Reorder account priority anytime using `↑` / `↓` controls.
  - Automatic per-account `429` rate-limit cooldown and sub-second rotation to the next account before falling back to secondary combo providers.
  - Per-account live quota bars and status badges.

### AI SRE Copilot — Vibe-Code on Server, Custom `SKILL.md` & `/compact`
- **Built-in `devops-engineer` Skill**: Ships with the *Build / Deploy / Ops Hats* methodology and 7-step operational loop (*Observe → Correlate → Root Cause → Minimal Fix → Verify → Harden*) enabled by default.
- **Custom Skills (`SKILL.md`)**: Paste raw `SKILL.md` files (with YAML frontmatter `name` & `triggers`) or author custom SRE playbooks directly in **Copilot Drawer → Agent Settings**.
- **Context Compaction (`/compact` & Auto-Compaction)**:
  - Interactive `/compact` slash command and quick `Compact` pill button condense older messages into an expandable **Context Compacted** summary card.
  - Automatic backend compaction (`compactCopilotHistory`) trims older `UNTRUSTED_OUTPUT` terminal blocks to preserve token budget during long debugging sessions.
- **Sudo Password Support, Pre-Publish Survey & Opt-in Auto-Run**:
  - Approved `sudo` commands automatically use the server's saved sudo password.
  - Surveys active ports, Nginx vhosts, and Cloudflare Tunnels before exposing apps in `/var/www`.
  - Opt-in Auto-Run mode with confirmation dialog.

### UI, Branding & Infrastructure
- Added crisp SVG brand icons (`BrandIcon`) for all 27 AI providers across the Dashboard, Landing Page, and Documentation.
- Fixed Docker multi-stage Dockerfile detection during Git deployments.
- Improved squircle brand icon transparency and dark-mode SVG favicon contrast.

---

## v0.2.0 — Cloudflare Tunnels, Git Deploy Studio, 3D Views & Privacy Mode

- **Zero-Trust Cloudflare Tunnels**: 1-click Zero Trust connector and visual ingress route map to expose local webapps behind NAT without opening firewall ports.
- **Full-Width Git Deployment Studio**: Connect GitHub Personal Access Tokens, auto-detect frameworks & monorepo subfolders, pre-install missing runtimes, and stream live build & health-check logs.
- **Automated Let's Encrypt SSL with DNS Pre-Flight**: Validates public DNS A-records before running Certbot to prevent rate-limit lockouts.
- **3D Fleet Visualization**: Interactive 3D Server Rack, 3D Isometric Resource Matrix, and 4-Layer Service Topology Graph.
- **Database Workbench**: Browse tables, run queries, and view interactive ER Diagrams for PostgreSQL, MySQL/MariaDB, MongoDB, Redis, and SQLite.
- **Screencast Privacy Mode**: 1-click toggle in the top bar blurs sensitive server IPs, domains, file paths, local ports, and tokens with hover-to-reveal.

---

## v0.1.1 — Initial Open-Source Release

- **Agentless SSH Architecture**: Connect any Linux VPS over standard OpenSSH (port 22) with zero background daemons installed on target nodes.
- **Local Encrypted Vault**: SQLite storage (`7server.db`) with AES-256-GCM encryption (`secret.key`) for SSH keys, passwords, and tokens.
- **Multi-Tab Browser Terminal & SFTP File Manager**: Full `xterm.js` WebSocket shell with command shortcuts and visual file editor.
- **Workloads & Operations**: Docker containers/images/Compose management, PM2 & systemd service control, visual Crontab scheduler, UFW firewall manager, and scheduled backups.
- **RBAC & Security Audit Trail**: Admin, Operator, and Viewer roles with per-server access scopes, active session revocation, Discord webhook alerts, and CSV audit log export.

