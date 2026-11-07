# Role-Based Access Control (RBAC)

7Server provides multi-user enterprise governance with granular permission enforcement and server scoping.

<img class="only-light" src="/screenshots/roles-light.png" alt="Roles & Permissions Matrix">
<img class="only-dark" src="/screenshots/roles-dark.png" alt="Roles & Permissions Matrix">

---

## Pre-Built Roles

| Permission Scope | Admin | Operator | Viewer |
| :--- | :---: | :---: | :---: |
| **Manage Users & RBAC** | ✅ Full | ❌ None | ❌ None |
| **Add / Delete Servers** | ✅ Full | ❌ None | ❌ None |
| **Open Web Terminal** | ✅ Full | ✅ Full | ❌ Blocked |
| **Manage UFW Firewall** | ✅ Full | ✅ Full | ❌ Blocked |
| **Start/Stop Containers** | ✅ Full | ✅ Full | ❌ Blocked |
| **View Telemetry & Logs** | ✅ Full | ✅ Full | ✅ Read-only |
| **Execute Databases Queries**| ✅ Full | ✅ Full | ❌ Blocked |

---

## Server Scoping

Administrators can restrict any user account to specific servers:

- **Wildcard (`*`)**: The user has access to all servers in the fleet.
- **Specific Server IDs**: The user can only view and interact with explicitly assigned server IDs. Any attempt to query or execute actions against unassigned servers returns `403 Forbidden`.

