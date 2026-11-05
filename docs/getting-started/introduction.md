# Introduction to 7Server

<div class="dok-pill mb-4"><span class="led"></span> v2.0 AI-Ready · Self-Hosted · Agentless</div>

**7Server** is a modern, self-hosted web control plane built for developers, system administrators, and homelab enthusiasts who manage multiple Linux VPS instances, bare-metal servers, and cloud droplets.

Traditional server panels (such as cPanel, Portainer, or Coolify) typically require installing an always-running daemon or agent inside every single managed server. **7Server takes a radically different path: 100% Agentless via SSH.**

---

## The Core Philosophy: "The Object is the Explanation"

If you can SSH into a machine, 7Server can manage it.

1. **Zero Extra Footprint**: 7Server installs nothing permanently on your target servers. All telemetry, container metrics, and configuration modifications run over standard SSH sessions (`exec` and `sftp`).
2. **Encrypted at Rest**: Your private keys and passwords never leave your hardware. Credentials are encrypted on disk with **AES-256-GCM** using a local master secret.
3. **Safety First**: Dangerous actions (restarting critical containers, deleting volumes, modifying UFW firewall rules) require manual approval. The integrated **AI SRE Copilot** inspects logs and telemetry automatically in read-only mode, but must pause and ask for confirmation before modifying server state.

---

## Feature Comparison

| Capability | 7Server | Traditional Panels (cPanel/Plesk) | Container Agents (Portainer) |
| :--- | :---: | :---: | :---: |
| **Agentless over SSH** | **Yes** (Zero daemons) | ❌ (Heavy agent) | ❌ (Portainer agent) |
| **Multi-VPS Fleet View** | **Yes** (Unified) | ❌ (Per-server license) | Limited |
| **AI SRE Copilot** | **Yes** (Multi-step auto-diagnosis) | ❌ None | ❌ None |
| **Universal AI Gateway** | **Yes** (Claude, OpenAI, Copilot) | ❌ None | ❌ None |
| **Centralized UFW Firewall** | **Yes** (With lockout safeguard) | Partial | ❌ None |
| **In-Browser Terminal** | **Yes** (WebSocket xterm.js) | Varies | Web terminal |
| **Resource Overhead** | **0 MB** on managed servers | 500 MB - 1 GB+ | 50 MB+ |

---

## Next Steps

Ready to get started? Check out the [Quick Start Guide](/getting-started/quick-start) to spin up 7Server on your local workstation or management node in under two minutes.

