// Copilot "skills": short SRE playbooks for this dashboard. The one matching the open tab (or the user's wording)
// goes into the system prompt so the agent uses the paths and conventions 7Server actually deploys with.

interface Skill {
  id: string;
  tabs: string[];
  /** Matched against the latest user message so a skill also applies outside its tab. */
  keywords: RegExp;
  playbook: string;
}

export const SKILLS: Skill[] = [
  {
    id: 'deploy',
    tabs: ['webapps'],
    keywords: /\b(deploy|build|npm (ci|install)|pm2|app (down|not|tidak)|aplikasi)\b/i,
    playbook: `Apps deployed by 7Server live in /var/www/<app> (git checkout, .env mode 0600 in the app root dir).
Node/Python/Go apps run under PM2 named <app>; Docker apps run as container 7server-<app> (or the repo's compose stack), bound to 127.0.0.1:<port>.
Nginx site is /etc/nginx/sites-available/7server-<app> (symlinked into sites-enabled), certificates via certbot --nginx.
Diagnose in this order: git -C /var/www/<app> log --oneline -3; pm2 jlist / pm2 logs <app> --lines 50 --nostream (or docker logs --tail 50 7server-<app>);
ss -ltnp | grep :<port>; curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/; nginx -t; tail -n 50 /var/log/nginx/error.log.
Common causes: Node older than package.json "engines" (EBADENGINE, then build failures), missing build step before start, app listening on a different port than the Nginx proxy_pass, PORT not read from env, DNS not pointing at the server (certbot fails).
Redeploy = fetch + reset to the branch, install, build, pm2 restart <app>. Never print .env contents.`
  },
  {
    id: 'nginx',
    tabs: ['nginx', 'ssl'],
    keywords: /\b(nginx|ssl|https|certbot|certificate|sertifikat|domain|proxy|502|504|bad gateway)\b/i,
    playbook: `Always validate with nginx -t before any reload, and use systemctl reload nginx (not restart) so live connections survive.
Inspect: nginx -T 2>/dev/null | grep -nE 'server_name|listen|root|proxy_pass' ; ls -l /etc/nginx/sites-enabled ; tail -n 50 /var/log/nginx/error.log.
502 = upstream down or wrong port; 504 = upstream slow (proxy_read_timeout); 413 = client_max_body_size; duplicate server_name = conflicting sites.
Certificates: certbot certificates; renewal check: certbot renew --dry-run. A failed HTTP-01 challenge usually means DNS is not pointing here or port 80 is blocked.`
  },
  {
    id: 'docker',
    tabs: ['docker'],
    keywords: /\b(docker|container|compose|image|kontainer)\b/i,
    playbook: `Inspect: docker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'; docker logs --tail 50 <name>; docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}} {{.RestartCount}}' <name>; docker system df.
Exit 137 + OOMKilled = memory limit; restart loops = check the entrypoint error in the first log lines. Use docker stats --no-stream, never the streaming form.
Prefer docker compose up -d <service> in the project dir over manual docker run. Pruning (docker system prune) needs approval and never with --volumes unless the user asks.`
  },
  {
    id: 'database',
    tabs: ['databases'],
    keywords: /\b(mysql|mariadb|postgres|postgresql|redis|mongo|database|db|query)\b/i,
    playbook: `Check service state first (systemctl status mysql|postgresql|redis-server --no-pager) and disk space (df -h), since a full disk is the most common cause of DB crashes.
MySQL: mysqladmin status; SHOW PROCESSLIST for stuck queries. Postgres: sudo -u postgres psql -c "select pid,state,query_start,left(query,80) from pg_stat_activity where state<>'idle'".
Never run DROP/DELETE/TRUNCATE/ALTER without explicit approval, and suggest a dump (mysqldump / pg_dump) before schema changes.`
  },
  {
    id: 'security',
    tabs: ['security', 'ports', 'audit'],
    keywords: /\b(ssh|firewall|ufw|fail2ban|port|brute|hack|attack|security|keamanan)\b/i,
    playbook: `Inspect: ss -tulpn; ufw status verbose; fail2ban-client status sshd; grep -c 'Failed password' /var/log/auth.log; last -n 10.
Flag databases/Redis listening on 0.0.0.0, PasswordAuthentication yes, PermitRootLogin yes, missing unattended-upgrades.
Before any firewall change, confirm the SSH port stays allowed (ufw allow <ssh-port>/tcp first) so the user is not locked out.`
  },
  {
    id: 'performance',
    tabs: ['overview', 'topology', 'pm2', 'services'],
    keywords: /\b(cpu|memory|ram|memori|load|slow|lambat|disk|swap|oom)\b/i,
    playbook: `Inspect: uptime; free -m; df -h; ps aux --sort=-%cpu | head -n 8; ps aux --sort=-%mem | head -n 8; dmesg -T | grep -i -E 'oom|killed' | tail -n 5; du -xh / --max-depth=2 2>/dev/null | sort -rh | head -n 10.
Big disk users are usually /var/log (journalctl --vacuum-size), docker images, or node_modules caches. A server with no swap and <2GB RAM will OOM during npm builds: suggest adding swap.`
  }
];

/** Playbooks for the open tab plus any whose keywords appear in the user's latest message (max 2, to keep the prompt small). */
export function pickSkills(tab: string | undefined, lastUserMessage: string): Skill[] {
  const byTab = SKILLS.filter((s) => tab && s.tabs.includes(tab));
  // Most keyword hits first, so "nginx 502" prefers the nginx playbook over deploy (which also knows 502).
  const hits = (s: Skill) => (lastUserMessage.match(new RegExp(s.keywords.source, 'gi')) || []).length;
  const byText = SKILLS.filter((s) => !byTab.includes(s) && hits(s) > 0).sort((x, y) => hits(y) - hits(x));
  return [...byTab, ...byText].slice(0, 2);
}

export function skillsSection(tab: string | undefined, lastUserMessage: string): string {
  const picked = pickSkills(tab, lastUserMessage);
  if (!picked.length) return '';
  return `\n\n--- PLAYBOOKS (how this dashboard sets things up; use them to pick the right commands) ---\n` +
    picked.map((s) => `[${s.id}]\n${s.playbook}`).join('\n\n');
}
