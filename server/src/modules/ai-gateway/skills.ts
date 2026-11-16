// Copilot "skills": SRE, DevOps, Full-Stack, Frontend Design & AppSec playbooks for this dashboard.
// Includes a default Engineering & DevOps baseline plus tab/keyword-triggered playbooks
// so the agent applies production standards across infrastructure, code, UI/UX, and security.

export const DEFAULT_DEVOPS_SKILL = `DevOps & Engineering Baseline (Build / Deploy / Ops Hats):
- Workflow: 1) Assess state & logs read-only -> 2) Design minimal, clean change -> 3) Implement code/IaC/config -> 4) Validate syntax, types & tests (tsc, build, nginx -t, docker compose config) -> 5) State rollout & rollback -> 6) Execute with approval -> 7) Verify health check & output.
- Containers & CI/CD: Use multi-stage Dockerfiles, run as non-root user, pin image versions (avoid :latest in production), define HEALTHCHECK, set resource limits, and never bake secrets into images or git.
- Code & App Quality: Validate inputs at boundaries, handle loading/empty/error states, keep dark/light contrast legible, and avoid generic boilerplate ("AI slop").`;

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
    id: 'publish',
    tabs: ['webapps', 'nginx'],
    keywords: /\b(deploy|publish|host|serve|website|web ?app|landing|html|akses|diakses|domain|subdomain|tunnel|online|live)\b/i,
    playbook: `Publishing a site or app: survey the server FIRST, in one read-only block, then pick the exposure that actually reaches the user.
Survey: ss -ltnH | awk '{print $4}' | sed 's/.*://' | sort -un | tr '\n' ' ' ; ls /etc/nginx/sites-enabled ; nginx -T 2>/dev/null | grep -E '^\s*(listen|server_name)' | sort -u ; command -v cloudflared && (cloudflared tunnel list 2>/dev/null; grep -hE 'tunnel:|hostname:|service:' /etc/cloudflared/config.y*ml ~/.cloudflared/config.y*ml 2>/dev/null) ; curl -s -m 4 https://api.ipify.org
Then choose, in this order:
1. A Cloudflare Tunnel exists (cloudflared configured): serve the app on a FREE local port (pick one not in the ss list, e.g. 8080+), add an ingress rule "- hostname: <name>.<a domain the tunnel already uses>  service: http://localhost:<port>" ABOVE the final "- service: http_status:404" in the existing config file, restart cloudflared. For DNS: if CLOUDFLARE API ACCESS is CONNECTED, emit a \`\`\`cloudflare\`\`\` block with {"action":"upsert_dns","type":"CNAME","name":"<hostname>","content":"<tunnel-uuid>.cfargotunnel.com","proxied":true} (do NOT rely on cert.pem); otherwise try "cloudflared tunnel route dns <tunnel> <hostname>". Reachable at https://<hostname>.
2. No tunnel but a real domain the user named: Nginx server block with that server_name; certbot --nginx for HTTPS once DNS points here.
3. Neither: Nginx server block listening on a FREE port with server_name _ , and give http://<server-ip>:<port>.
Never invent a .local or made-up domain: it resolves nowhere. Never listen on a port already in the ss list. Never edit the default site.
Static files: root /var/www/<name>; Nginx serves them. Verify at the end with curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/ and report the exact URL that works.
Text the user must do on THEIR computer (hosts file, DNS record) is plain text, never a bash block: bash blocks run on the server.`
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
    keywords: /\b(ssh|firewall|ufw|fail2ban|port|brute|hack|attack|security|keamanan|appsec|owasp|xss|csrf|sqli|sql injection|ssrf|idor|rbac|cors|csp|helmet|hardening|vuln|vulnerability|cve|pentest|bcrypt|argon2|sanitize|rate[- ]?limit)\b/i,
    playbook: `Security & AppSec Playbook (VPS Hardening + OWASP Defense-in-Depth):
- Infrastructure Audit: ss -tulpn; ufw status verbose; fail2ban-client status sshd; grep -c 'Failed password' /var/log/auth.log; last -n 10. Flag DBs/Redis bound to 0.0.0.0, PasswordAuthentication yes, PermitRootLogin yes, or world-readable .env (must be chmod 600). Before changing firewall rules, ensure SSH port stays allowed (ufw allow <ssh-port>/tcp first).
- AppSec & Code Hardening:
  1) Injection: Parameterized SQL queries only; execFile with arg arrays instead of shell-interpolated strings; canonicalize file paths with prefix checks (block ../ traversal).
  2) Auth & Access Control: Enforce fail-closed auth + RBAC/ownership checks (prevent IDOR) on every endpoint; hash passwords with bcrypt/argon2/scrypt; compare secrets/HMACs with crypto.timingSafeEqual; rate-limit login & expensive endpoints.
  3) Web & API Boundaries: Escape untrusted output (no raw innerHTML/dangerouslySetInnerHTML); restrict CORS to explicit origins (never * with credentials); set HttpOnly+SameSite cookies and security headers (CSP, X-Content-Type-Options, HSTS); block SSRF to loopback/private CIDRs/169.254.169.254; validate upload MIME, size & magic bytes.
  4) Secrets Hygiene: Never print or commit .env/keys/tokens; store in env/secret manager and rotate immediately if exposed.`
  },
  {
    id: 'frontend',
    tabs: ['frontend', 'ui'],
    keywords: /\b(frontend|front[- ]?end|frontend-design|ui-taste|uizze|anti[- ]?slop|ui|ux|design|desain|tampilan|redesign|polish|layout|wireframe|css|tailwind|react|next\.?js|vue|svelte|vite|component|komponen|responsive|animasi|animation|theme|tema|dark ?mode|light ?mode|typography|landing ?page|navbar|sidebar|modal|styling)\b/i,
    playbook: `Frontend Design & UI Taste Playbook (Anthropics frontend-design + Uizze ui-taste):
- Two-Pass Design Plan (Before Writing Code): Ground aesthetics in the product's actual subject matter (never generic templates). Define: 1) Palette (4-6 hex tokens; one neutral grey family—warm OR cool, never mixed—and ONE locked accent for primary CTAs/active states/progress), 2) Typography (1-2 intentional faces, clear scale, <75ch measure, tabular numerals for stats/tables), 3) Layout grammar & alignment, 4) One memorable focal point ("Chanel rule: remove one excess decoration").
- Strict Anti-Slop Laws: Never default to purple gradient CTAs, glassmorphism on every card, mesh-gradient heroes, sparkles in headlines, mixed border-radii, identical rounded SaaS card grids with soft gray shadows, ALL-CAPS tracked eyebrows above every heading, or emoji stand-ins for icons (use consistent SVG icons like Lucide).
- Microcopy & Craft: Use plain, active-voice CTA verbs that match feedback toasts ("Save changes" -> "Saved"). Support both Dark & Light modes via CSS variables with >=4.5:1 contrast, visible focus rings, keyboard access, mobile-first grids, GPU-friendly motion (transform/opacity, reduced-motion aware), and genuine loading/empty/error states (name the problem & recovery).
- Close the Loop: Run typecheck + build (npm run build), verify responsive widths, and verify live assets/HTML via curl if deployed in /var/www/<app>.`
  },
  {
    id: 'triage',
    tabs: ['alerts', 'logs'],
    keywords: /\b(triage|triase|issue|bug|pr|pull request|repro|reproduce|regression|incident|alert|root cause|diagnos[ea]|broken|rusak|debug|error log)\b/i,
    playbook: `Engineering Triage Playbook (adapted from mattpocock/skills triage):
- Classify Explicitly: Assign one Category (bug | enhancement) and one State (needs-triage | needs-info | ready-for-agent | ready-for-human | wontfix [already-implemented vs rejected]).
- Workflow:
  1) Gather Context & Check Redundancy: Read the full issue, PR diff, or service/systemd/nginx/app logs first. Search the codebase/server config by domain concept to check if the behavior already exists or was previously ruled out.
  2) Verify Claim First: Always attempt to reproduce the bug or verify the PR diff/failing service using read-only commands, logs, or tests BEFORE jumping to conclusions or edits. Report exact evidence: confirmed (file path / command output), failed-to-reproduce, or insufficient detail.
  3) Targeted Follow-Up (If Blocked): Separate "What is established" from specific, actionable missing questions (never ask vaguely for "more info").
  4) Produce an Agent-Ready Brief: Root cause + verified file paths/endpoints + minimal change scope + exact test/verification commands before applying or handing off the fix.`
  },
  {
    id: 'fullstack',
    tabs: ['fullstack', 'api'],
    keywords: /\b(fullstack|full[- ]?stack|backend|back[- ]?end|api|endpoint|rest|graphql|trpc|express|fastify|nestjs|prisma|drizzle|orm|schema|migration|auth|jwt|oauth|session|middleware|crud|websocket|webhook|saas|controller|service|repository)\b/i,
    playbook: `Full-Stack Architecture Playbook (End-to-End Reliability & Clean Contracts):
- Layered Structure: Separate HTTP transport/routes, strict input validation (schema/type guards returning 400 with clear field errors), domain services, and parameterized DB repositories. Never leak raw stack traces or DB internals to clients.
- API & Data Integrity: Return consistent JSON error/success shapes and accurate HTTP status codes (200/201/400/401/403/404/409/500); paginate list endpoints; wrap multi-step writes in DB transactions; add indexes on foreign keys & query filters; write additive, reversible migrations.
- Client-Server Sync & Proxy: Handle request timeouts, retry/backoff or abort controllers, optimistic/disabled submit states to avoid double-submits. Behind Nginx, forward Host, X-Real-IP, X-Forwarded-Proto, and Upgrade/Connection headers for WebSockets/SSE; implement /health readiness checks and graceful SIGTERM shutdown.
- Verification: Typecheck both client and server (tsc --noEmit), run automated tests, and smoke-test live endpoints via curl before concluding.`
  },
  {
    id: 'performance',
    tabs: ['overview', 'topology', 'pm2', 'services'],
    keywords: /\b(cpu|memory|ram|memori|load|slow|lambat|disk|swap|oom)\b/i,
    playbook: `Inspect: uptime; free -m; df -h; ps aux --sort=-%cpu | head -n 8; ps aux --sort=-%mem | head -n 8; dmesg -T | grep -i -E 'oom|killed' | tail -n 5; du -xh / --max-depth=2 2>/dev/null | sort -rh | head -n 10.
Big disk users are usually /var/log (journalctl --vacuum-size), docker images, or node_modules caches. A server with no swap and <2GB RAM will OOM during npm builds: suggest adding swap.`
  },
  {
    id: 'devops-engineer',
    tabs: ['cicd', 'pipelines'],
    keywords: /\b(devops|ci\/?cd|pipeline|github actions|gitlab[- ]ci|jenkins|dockerfile|kubernetes|k8s|kubectl|helm|argocd|flux|terraform|pulumi|gitops|canary|blue[- ]green|rollback|runbook|postmortem)\b/i,
    playbook: `DevOps Engineer Playbook (CI/CD, IaC, Containers, K8s & Release Automation):
- Dockerfiles: multi-stage builds (builder -> slim runtime), pin base image digests/versions (never :latest), copy dependency manifests first for layer caching, run as non-root USER, include HEALTHCHECK CMD curl -f http://127.0.0.1:<port>/health || exit 1.
- CI/CD (GitHub Actions / GitLab CI): stages = lint/test -> build image tagged with commit SHA -> vulnerability scan (trivy) -> deploy with health verification. Keep secrets in secret stores/CI variables, never in repo files.
- Kubernetes / GitOps / Terraform: validate before apply (kubectl diff / helm lint / terraform plan), set CPU/memory requests & limits, configure readinessProbe + livenessProbe, and always provide the exact rollback command (e.g. kubectl rollout undo, pm2 reload, or git revert + redeploy) alongside every deployment.`
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
