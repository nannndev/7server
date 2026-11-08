// Contributors and Support pages. Facts only: contributors come from the GitHub API at view time
// (no invented names or counts); support points at the real channels (GitHub issues, docs, security).
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft, Bug, BookOpen, Coffee, EyeOff, GitPullRequest, HeartHandshake,
  LifeBuoy, Lock, MessageSquare, Radio, Server, ShieldAlert, ShieldCheck, Star
} from 'lucide-react';
import { GithubIcon } from './components/BrandIcons';

export const REPO = 'https://github.com/nannndev/7server';
const REPO_API = 'https://api.github.com/repos/nannndev/7server';

const v = (i: number) => ({ ['--i' as string]: i });

function PageShell({ eyebrow, title, lead, children }: { eyebrow: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section className="relative isolate mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20">
      <div className="carbon" aria-hidden />
      <a href="#/" className="reveal mb-8 inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--anatomy-strong)]">
        <ArrowLeft className="h-4 w-4" /> Back to home
      </a>
      <p className="reveal mb-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--anatomy-muted)' }}>{eyebrow}</p>
      <h1 className="silver-text reveal text-balance text-4xl font-semibold tracking-tight sm:text-5xl" style={v(1)}>{title}</h1>
      <p className="reveal mt-5 max-w-2xl text-pretty text-lg leading-relaxed" style={v(2)}>{lead}</p>
      <div className="mt-12">{children}</div>
    </section>
  );
}

interface Contributor { login: string; avatar_url: string; html_url: string; contributions: number; type: string }

export function ContributorsPage() {
  const [list, setList] = useState<Contributor[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${REPO_API}/contributors?per_page=100`, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Contributor[]) => setList(d.filter((c) => c.type !== 'Bot')))
      .catch((e) => { if (e.name !== 'AbortError') setError(true); });
    return () => ctrl.abort();
  }, []);

  const ways: { icon: typeof Bug; title: string; body: string; href: string; cta: string }[] = [
    { icon: Bug, title: 'Report a bug', body: 'What you did, what happened, what you expected, and your version (7server --version). Logs help; remove IPs and secrets first.', href: `${REPO}/issues/new`, cta: 'Open an issue' },
    { icon: GitPullRequest, title: 'Send a pull request', body: 'Fork, branch from main, keep the change focused, and run the tests (server: npx tsx src/contract.test.ts --compare). Describe what you checked.', href: `${REPO}/pulls`, cta: 'See pull requests' },
    { icon: MessageSquare, title: 'Translate', body: 'The dashboard ships in English and Indonesian. Every string lives in client/src/shared/i18n; a new language is one more catalog with the same keys.', href: `${REPO}/tree/main/client/src/shared/i18n`, cta: 'Open the catalogs' },
    { icon: Star, title: 'Star and share', body: 'A star helps other people find the project, and telling someone who runs servers about it helps even more.', href: REPO, cta: 'Star on GitHub' }
  ];

  return (
    <PageShell eyebrow="Contributors" title="Built in the open." lead="7Server is open source. These are the people whose commits are in it, straight from GitHub, and how you can join them.">
      <div className="metal reveal rounded-2xl p-6" style={v(3)}>
        <h2 className="font-semibold" style={{ color: 'var(--anatomy-strong)' }}>People who contributed code</h2>
        {error ? (
          <p className="mt-3 text-sm">GitHub didn't answer right now. See the list on <a className="underline" href={`${REPO}/graphs/contributors`}>GitHub</a>.</p>
        ) : !list ? (
          <p className="mt-3 text-sm" aria-live="polite">Loading from GitHub…</p>
        ) : (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((c) => (
              <li key={c.login}>
                <a href={c.html_url} className="well flex items-center gap-3 rounded-xl p-3 transition-transform hover:-translate-y-0.5">
                  <img src={`${c.avatar_url}&s=96`} alt="" width={40} height={40} className="h-10 w-10 rounded-full" loading="lazy" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium" style={{ color: 'var(--anatomy-strong)' }}>{c.login}</span>
                    <span className="block text-xs">{c.contributions} {c.contributions === 1 ? 'commit' : 'commits'}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="reveal mt-14 text-2xl font-semibold tracking-tight" style={{ color: 'var(--anatomy-strong)' }}>Ways to help</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ways.map(({ icon: Icon, title, body, href, cta }, i) => (
          <article key={title} className="metal reveal flex flex-col rounded-2xl p-6" style={v(i % 2)}>
            <Icon className="h-5 w-5" style={{ color: 'var(--anatomy-strong)' }} aria-hidden />
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{title}</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed">{body}</p>
            <a href={href} className="mt-4 text-sm font-semibold underline-offset-4 hover:underline" style={{ color: 'var(--anatomy-strong)' }}>{cta} →</a>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function SupportPage() {
  const channels: { icon: typeof Bug; title: string; body: string; href: string; cta: string }[] = [
    { icon: BookOpen, title: 'Read the docs first', body: 'Install with npm, Docker or from source, backups, reverse proxy and environment settings are in the README.', href: `${REPO}#readme`, cta: 'Open the README' },
    { icon: LifeBuoy, title: 'Ask or report on GitHub', body: 'Questions, bugs and feature requests go to GitHub Issues, so the answer helps the next person too. Search first; your question may already be answered.', href: `${REPO}/issues`, cta: 'Go to Issues' },
    { icon: ShieldAlert, title: 'Security issue? Don\'t post it publicly', body: 'Report vulnerabilities privately through GitHub security advisories so they can be fixed before anyone else hears about them.', href: `${REPO}/security/advisories/new`, cta: 'Report privately' },
    { icon: HeartHandshake, title: 'Support the project', body: 'Starring the repository and sending fixes or translations keeps it moving. It is free and open source.', href: REPO, cta: 'Star on GitHub' }
  ];
  const donate = [
    { name: 'Buy Me a Coffee', href: 'https://buymeacoffee.com/ekaprasety8', note: 'Card / PayPal' },
    { name: 'Saweria', href: 'https://saweria.co/nannndev', note: 'QRIS, e-wallet, bank (Indonesia)' }
  ];
  const faq: [string, ReactNode][] = [
    ['I forgot my password.', <>Another admin can reset it on the Users page. If you are the only admin, run <code>7server reset-password admin</code> on the machine that holds the data (Docker: <code>docker compose exec 7server node --import tsx src/resetPassword.ts admin</code>).</>],
    ['Where is my data?', <>In the data directory: <code>~/.7server</code> for npm, the <code>7server-data</code> volume for Docker, <code>server/data</code> from source. Back up <code>7server.db</code> and <code>secret.key</code> together; one is useless without the other.</>],
    ['Does it install anything on my servers?', <>No. It runs ordinary commands over SSH with the credentials you add. Remove a server from the dashboard and nothing is left behind on it.</>],
    ['Which Node.js version do I need?', <>22.13 or newer for the npm package (it uses the built-in SQLite). Docker brings its own.</>],
    ['Can I put it on the internet?', <>Put it behind nginx or Caddy with HTTPS, set <code>TRUST_PROXY</code>, and give every person their own account. Don't expose the port directly.</>]
  ];
  return (
    <PageShell eyebrow="Support" title="Help when you need it." lead="7Server is community supported. Here is where to look, where to ask, and how to report a security problem safely.">
      <div className="grid gap-4 sm:grid-cols-2">
        {channels.map(({ icon: Icon, title, body, href, cta }, i) => (
          <article key={title} className="metal reveal flex flex-col rounded-2xl p-6" style={v(i % 2)}>
            <Icon className="h-5 w-5" style={{ color: i === 2 ? 'var(--accent)' : 'var(--anatomy-strong)' }} aria-hidden />
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{title}</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed">{body}</p>
            <a href={href} className="mt-4 text-sm font-semibold underline-offset-4 hover:underline" style={{ color: 'var(--anatomy-strong)' }}>{cta} →</a>
          </article>
        ))}
      </div>

      <div className="metal reveal mt-10 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center gap-2"><Coffee className="h-5 w-5" style={{ color: 'var(--accent)' }} aria-hidden /><h2 className="font-semibold" style={{ color: 'var(--anatomy-strong)' }}>Buy the developer a coffee</h2></div>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed">7Server is free. If it saves you time, a small donation helps keep it maintained.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {donate.map((d) => (
            <a key={d.name} href={d.href} target="_blank" rel="noopener noreferrer" className="btn-silver inline-flex flex-col rounded-xl px-5 py-3 text-sm font-semibold">
              <span>{d.name}</span><span className="text-[11px] font-normal opacity-70">{d.note}</span>
            </a>
          ))}
        </div>
      </div>

      <h2 className="reveal mt-14 text-2xl font-semibold tracking-tight" style={{ color: 'var(--anatomy-strong)' }}>Common questions</h2>
      <div className="mt-6 divide-y rounded-2xl border" style={{ borderColor: 'var(--line)' }}>
        {faq.map(([q, a]) => (
          <details key={q} className="group p-5" style={{ borderColor: 'var(--line)' }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium" style={{ color: 'var(--anatomy-strong)' }}>
              {q}
              <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="mt-3 text-[15px] leading-relaxed">{a}</div>
          </details>
        ))}
      </div>

      <p className="reveal mt-10 inline-flex items-center gap-2 text-sm">
        <GithubIcon className="h-4 w-4" /> Everything happens on <a className="underline" href={REPO}>github.com/nannndev/7server</a>.
      </p>
    </PageShell>
  );
}

export function PrivacyPage() {
  const principles = [
    {
      icon: ShieldCheck,
      title: 'Zero Telemetry & Tracking',
      body: '7Server contains zero analytics trackers, telemetry beacons, or crash reporters. It never phones home to external servers or collects metrics on how you manage your servers.',
    },
    {
      icon: Lock,
      title: 'Encrypted Local Storage (At Rest)',
      body: 'All data is stored on your own host machine in a single SQLite database. Passwords, private SSH keys, and provider tokens are encrypted at rest with AES-256-GCM using a master key kept separately in secret.key.',
    },
    {
      icon: Server,
      title: 'Pure Agentless SSH',
      body: 'No background daemons, agents, or extra ports are installed on your VPS nodes. 7Server executes standard read-only commands over standard OpenSSH (port 22) and leaves zero traces when a server is removed.',
    },
    {
      icon: Radio,
      title: 'Direct API Connections',
      body: 'When you interact with GitHub, Cloudflare, AI providers (Claude, OpenAI, Gemini), or Discord, your 7Server instance communicates directly with their official APIs. No traffic passes through any third-party intermediary.',
    },
    {
      icon: EyeOff,
      title: 'Built-In Privacy Mode for Screencasts',
      body: 'Includes a one-click streamer privacy mode that immediately blurs all server IPs, domain names, file paths, ports, and credentials, allowing you to safely record tutorials and present live demonstrations.',
    },
  ];

  return (
    <PageShell
      eyebrow="Privacy Policy & Architecture"
      title="Your infrastructure. Your data. Zero telemetry."
      lead="7Server is open source and strictly self-hosted. There is no cloud account to sign up for, no tracking pixels, and no phone-home telemetry."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {principles.map(({ icon: Icon, title, body }, i) => (
          <article key={title} className="metal reveal flex flex-col rounded-2xl p-6" style={v(i % 3)}>
            <Icon className="h-5 w-5" style={{ color: 'var(--accent)' }} aria-hidden />
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{title}</h3>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed">{body}</p>
          </article>
        ))}
      </div>

      <div className="metal reveal mt-10 rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-semibold" style={{ color: 'var(--anatomy-strong)' }}>Open Source & Security Disclosures</h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed">
          7Server is released under the <strong>MIT License</strong> by Nandang Eka Prasetya (nannndev). If you discover a potential security issue, please report it privately via GitHub Security Advisories so it can be resolved safely.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href={`${REPO}/security/advisories/new`} className="btn-silver inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4" /> Report Security Advisory
          </a>
          <a href={REPO} className="metal inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
            <GithubIcon className="h-4 w-4" /> View Source on GitHub
          </a>
        </div>
      </div>
    </PageShell>
  );
}

interface ReleaseEntry {
  version: string;
  date: string;
  tag: string;
  title: string;
  highlights: string[];
}

const RELEASES: ReleaseEntry[] = [
  {
    version: 'v0.3.0',
    date: '2026-11-08',
    tag: 'Latest Release',
    title: 'Universal AI Gateway 2.0, Multi-Account Rotation, Custom SKILL.md & /compact',
    highlights: [
      '27 Built-In AI Providers: 8 OAuth Subscription providers (Claude, ChatGPT/Codex, GitHub Copilot, Gemini CLI, Kimi Code, Kilo Code, Muse/Koda, Nous Portal) + 19 API-Key & OpenAI-compatible providers.',
      'Multi-Account Ordered Rotation (#1 → #2 → #3): Connect multiple OAuth accounts or API keys per provider with priority reordering, per-account quota bars, and automatic 429 rate-limit rotation.',
      'Built-In DevOps Engineer Skill & Custom SKILL.md: Default production SRE baseline (Build/Deploy/Ops Hats) plus support for pasting custom SKILL.md playbooks with keyword triggers in Agent Settings.',
      'Context Compaction (/compact & Auto-Compaction): Condense long SSH troubleshooting sessions with /compact or automatic backend compaction of older UNTRUSTED_OUTPUT blocks.',
      'Vibe-Code on Server: Approved sudo password execution, pre-publish port/Nginx/Cloudflare Tunnel survey, and opt-in Auto-Run mode.',
      'Brand Icons & Deploy Fixes: Crisp SVG brand icons for all 27 AI providers across Dashboard, Landing & Docs, plus Docker multi-stage build detection fixes.'
    ]
  },
  {
    version: 'v0.2.0',
    date: '2026-11-07',
    tag: 'Feature Release',
    title: 'Cloudflare Tunnels, Git Deployment Studio, 3D Fleet Views & Privacy Mode',
    highlights: [
      'Zero-Trust Cloudflare Tunnels: 1-click Zero Trust token connector and visual ingress route map to expose local webapps behind NAT without opening public firewall ports.',
      'Full-Width Git Deployment Studio: Connect a GitHub token to browse repositories, branches, and monorepo root folders, install missing runtimes, and stream live build & health-check logs.',
      'Automated Let\'s Encrypt SSL with DNS Pre-Flight: Verifies DNS A-records before running Certbot to prevent rate-limit lockouts.',
      '3D Fleet Matrix, Rack & Topology: Interactive 3D Server Rack, 3D Isometric Resource Matrix, and 4-Layer Service Topology Graph.',
      'Database Workbench & ER Diagrams: Inspect tables, run queries, and view ER diagrams for PostgreSQL, MySQL/MariaDB, MongoDB, Redis, and SQLite.',
      'Screencast Privacy Mode: 1-click top-bar toggle blurs server IPs, domains, paths, local ports, and tokens for safe streaming and demos.'
    ]
  },
  {
    version: 'v0.1.1',
    date: '2026-11-05',
    tag: 'Initial Release',
    title: 'Initial Open-Source Release — Agentless Multi-VPS Control Plane',
    highlights: [
      'Pure Agentless SSH Architecture: Manage any Linux VPS over standard OpenSSH (port 22) with zero background agents installed on target servers.',
      'Encrypted Local Vault: SQLite storage (7server.db) with AES-256-GCM encryption (secret.key) for SSH keys, passwords, and provider tokens.',
      'Multi-Tab Browser Terminal & SFTP File Manager: Full xterm.js WebSocket terminal with command shortcuts and visual file editor.',
      'Docker, PM2, Systemd, Cron & Backups: Full container/image/Compose control, service management, crontab scheduler, UFW firewall, and scheduled backups.',
      'Granular RBAC & Security Audit Log: Admin, Operator, and Viewer roles with per-VPS access scopes, active session revocation, Discord alerts, and CSV audit export.'
    ]
  }
];

export function ChangelogPage() {
  return (
    <PageShell
      eyebrow="Changelog & Releases"
      title="What's new in 7Server."
      lead="Every release of sevenserver on npm and ghcr.io/nannndev/7server. Upgrade anytime with npm install -g sevenserver@latest or docker compose pull."
    >
      <div className="space-y-6">
        {RELEASES.map((rel, i) => (
          <article key={rel.version} className="metal reveal rounded-2xl p-6 sm:p-8" style={v(i)}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="btn-silver rounded-lg px-3 py-1 font-mono text-sm font-semibold">
                  {rel.version}
                </span>
                <span className="well rounded-md px-2.5 py-0.5 font-mono text-xs" style={{ color: 'var(--accent)' }}>
                  {rel.tag}
                </span>
              </div>
              <time className="font-mono text-xs" style={{ color: 'var(--anatomy-muted)' }}>
                {rel.date}
              </time>
            </div>
            <h2 className="mt-4 text-xl font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
              {rel.title}
            </h2>
            <ul className="mt-4 space-y-2.5 text-[15px] leading-relaxed">
              {rel.highlights.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--accent)' }} aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer" className="btn-silver inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold">
          <GithubIcon className="h-4 w-4" /> View GitHub Releases
        </a>
        <a href="https://www.npmjs.com/package/sevenserver?activeTab=versions" target="_blank" rel="noopener noreferrer" className="metal inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
          npm Version History
        </a>
      </div>
    </PageShell>
  );
}
