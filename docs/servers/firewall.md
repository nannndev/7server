# Centralized Firewall (UFW) & SSH Lockout Safeguards

Managing iptables or UFW rules across multiple VPS machines is prone to fatal operator error—especially accidentally locking yourself out of SSH.

7Server introduces a **Centralized Firewall Control Panel** with built-in **SSH Lockout Prevention**.

<img class="only-light" src="/screenshots/ports-light.png" alt="Listening Ports & Firewall Manager">
<img class="only-dark" src="/screenshots/ports-dark.png" alt="Listening Ports & Firewall Manager">

---

## The SSH Lockout Safeguard

When enabling UFW or deleting rules:

1. **Active SSH Port Detection**: 7Server inspects the server's running SSH daemon (`sshd`) port (e.g., port 22 or custom port).
2. **Pre-Enforcement Verification**: If UFW is currently disabled, 7Server **blocks** the user from turning UFW on unless an explicit `ALLOW` rule for the SSH port already exists in the ruleset.
3. **Delete Safeguard Warnings**: Attempting to delete the active SSH rule triggers a high-severity alert dialog informing the user that deletion will sever 7Server's connection to the node.

---

## Quick Presets

Easily open standard service ports with one click:
- `HTTP (80)`: Web traffic
- `HTTPS (443)`: Secure SSL traffic
- `SSH (22)`: Secure Shell access
- `MySQL (3306)`: Database connections (recommend restricting to specific source IP)
- `PostgreSQL (5432)`: PostgreSQL connections
- `Redis (6379)`: In-memory store (recommend restricting to private VPC IP)

---

## Adding Custom Rules

- **Port / Service**: Port number or range (e.g., `8080`, `3000:3005`).
- **Protocol**: `TCP`, `UDP`, or `Any`.
- **Action**: `ALLOW` (allow incoming traffic) or `DENY` (drop packets).
- **Source IP Filter**: Restrict traffic to a specific management IP (e.g., `203.0.113.50`) or leave blank for anywhere (`0.0.0.0/0`).

