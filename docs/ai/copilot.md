# AI SRE Copilot

The 7Server **AI SRE Copilot** is an agentic troubleshooting assistant designed specifically for Linux server operations.

Rather than giving generic boilerplate answers, the Copilot **inspects the actual state of your server over SSH before answering**.

---

## How Copilot Agent Mode Works

When you ask a question like *"Why is my API returning 502 errors?"* or *"What is consuming 95% of memory?"*, the Copilot performs an autonomous diagnostic loop:

```
[User Question]
      │
      ▼
1. Copilot plans diagnostic steps
      │
      ▼
2. Copilot runs READ-ONLY commands over SSH (no approval needed)
   - `docker ps --filter "status=restarting"`
   - `journalctl -u nginx --no-pager -n 30`
   - `free -m`
      │
      ▼
3. Copilot inspects command stdout/stderr
      │
      ▼
4. Copilot formulates root cause explanation
      │
      ▼
5. Copilot proposes state-changing fix (NEEDS APPROVAL)
   - `docker update --memory 1g web-api`
   [Skip]  [Approve & Run]
```

---

## Safety Rails & Injection Hardening

1. **Strict Read-Only Allowlist**: Commands like `systemctl status`, `docker stats`, `df`, `cat` (for non-sensitive logs) run automatically.
2. **Untrusted Data Fencing**: Remote server outputs are strictly quarantined from the AI prompt instructions to prevent prompt-injection attacks from malicious log lines.
3. **Approval Gates**: Any command that modifies disk, changes firewall rules, restarts services, or deletes containers requires an explicit user click.
4. **Step Budget Limit**: Copilot operates within a hard limit of 8 autonomous diagnostic steps per query to prevent runaway loops.

