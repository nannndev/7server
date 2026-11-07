# Active Sessions & Audit Logging

Track who is accessing your servers and review every administrative action.

<img class="only-light" src="/screenshots/audit-light.png" alt="Audit Log & Activity Timeline">
<img class="only-dark" src="/screenshots/audit-dark.png" alt="Audit Log & Activity Timeline">

---

## Active Sessions & Instant Revocation

The **Active Sessions** panel (`#/users?tab=sessions`) displays all currently authenticated browser sessions:
- Browser and Operating System fingerprint (e.g., `Chrome on macOS`, `Firefox on Linux`).
- IP address and creation timestamp.
- **Revoke Session**: Administrators can kill suspicious or stale sessions with a single click, instantly invalidating the session token.

---

## Per-User Audit Logs

Every critical change across 7Server is permanently logged into the SQLite database:
- User identity (`user.username` or `system`)
- Action type (`server.create`, `docker.restart`, `firewall.add_rule`, `user.login`)
- Target server and client IP
- Timestamp and HTTP status code

### Exporting to CSV

Audit logs can be downloaded directly from the UI as a `.csv` spreadsheet for compliance reporting or internal security reviews.

