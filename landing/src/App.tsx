// 7Server landing page. Copy rules: every claim is something the product does today; nothing about
// pricing, users, uptime or features that are not built. The figure (Fig 1) carries the core idea.
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity, ArrowRight, Boxes, Check, Clock, Copy, Database, FileText, Globe, HardDrive, KeyRound,
  Lock, Moon, ShieldCheck, Sparkles, Sun, Terminal
} from 'lucide-react';
import { AgentlessBench } from './figure/AgentlessBench';
import { GithubIcon } from './components/BrandIcons';
import { ContributorsPage, SupportPage } from './pages';

const REPO = 'https://github.com/nannndev/7server';
// The chosen app icon (Server Blade). JPG: the SVG variants use React-style stopColor and render without gradients.
const LOGO = '/icons/icon-opt2-server-blade.jpg';

const Logo = ({ size = 28 }: { size?: number }) => (
  <img src={LOGO} alt="" width={size} height={size} className="rounded-[22%] shadow-sm" style={{ width: size, height: size }} />
);

// ---------------------------------------------------------------- small pieces
function useReveal(route = '') {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.setAttribute('data-shown', '')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.setAttribute('data-shown', ''); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [route]);
}

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('7server-theme', next); } catch { /* private mode */ }
    setTheme(next);
  };
  return { theme, toggle };
}

const v = (i: number) => ({ ['--i' as string]: i });

function CopyLine({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="well flex items-center gap-3 rounded-xl px-4 py-3 font-mono text-[13px]">
      <span aria-hidden style={{ color: 'var(--accent)' }}>$</span>
      <code className="flex-1 overflow-x-auto whitespace-nowrap" style={{ color: 'var(--anatomy-strong)' }}>{text}</code>
      <button
        type="button"
        onClick={() => { navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); }}
        aria-label={`Copy: ${label}`}
        className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--line)]"
        style={{ color: 'var(--anatomy-muted)' }}
      >
        {done ? <Check className="h-4 w-4" style={{ color: 'var(--accent)' }} /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="reveal mb-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--anatomy-muted)' }}>{children}</p>
);
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="reveal text-balance text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--anatomy-strong)', ...v(1) }}>{children}</h2>
);
const Lead = ({ children }: { children: ReactNode }) => (
  <p className="reveal mt-4 max-w-2xl text-pretty text-base leading-relaxed sm:text-lg" style={v(2)}>{children}</p>
);

// ---------------------------------------------------------------- sections
function Nav() {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 82%, transparent)' }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
          <Logo />
          7Server
        </a>
        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Sections">
          {[['#how', 'How it works'], ['#features', 'Features'], ['#ai', 'AI'], ['#security', 'Security'], ['#start', 'Get started'], ['#/support', 'Support']].map(([href, label]) => (
            <a key={href} href={href} className="transition-colors hover:text-[var(--anatomy-strong)]">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="relative grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-[var(--line)]">
            <Sun className="theme-icon absolute h-4 w-4" data-off={theme === 'dark' ? undefined : ''} />
            <Moon className="theme-icon absolute h-4 w-4" data-off={theme === 'dark' ? '' : undefined} />
          </button>
          <a href={REPO} className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--line)] sm:flex">
            <GithubIcon className="h-4 w-4" /> GitHub
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative isolate mx-auto max-w-6xl px-4 pb-12 pt-16 sm:px-6 sm:pt-24">
      <div className="carbon" aria-hidden />
      <div className="max-w-3xl">
        <p className="metal reveal mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px]">
          <span className="led breathe h-1.5 w-1.5 rounded-full" /> self-hosted · open source · agentless
        </p>
        <h1 className="silver-text reveal text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ color: 'var(--anatomy-strong)', ...v(1) }}>
          Run every VPS from one dashboard. Install nothing on them.
        </h1>
        <p className="reveal mt-6 max-w-2xl text-pretty text-lg leading-relaxed" style={v(2)}>
          7Server connects to your servers over the SSH access you already have. Watch CPU, RAM and disk, open a terminal in the browser,
          manage Docker, Nginx, cron, SSL, backups and databases, and ask an AI copilot that checks the server itself and asks before it changes anything.
        </p>
        <div className="reveal mt-8 flex flex-col gap-3 sm:flex-row" style={v(3)}>
          <a href="#start" className="btn-silver inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
            Get started <ArrowRight className="h-4 w-4" />
          </a>
          <a href="#how" className="metal inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            style={{ color: 'var(--anatomy-strong)' }}>
            See how it works
          </a>
        </div>
      </div>
      <div id="how" className="core-glow reveal mt-14" style={v(4)}>
        <AgentlessBench />
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: '01', title: 'Add a server', body: 'Host, user and a password or private key. 7Server tests the connection before saving and stores the credential encrypted (AES-256-GCM).' },
    { n: '02', title: 'It reads over SSH', body: 'Metrics, processes, services, containers and logs come from ordinary commands over SSH. No agent, no daemon, no extra port on the server.' },
    { n: '03', title: 'You act from one place', body: 'Restart a service, edit a cron job, renew a certificate, query a database or run one command on many servers at once, with the output streamed back.' }
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>How it works</Eyebrow>
      <H2>Your servers stay as they are.</H2>
      <Lead>If you can SSH into it, 7Server can manage it. Remove it from the dashboard and nothing is left behind on the server.</Lead>
      <ol className="metal mt-12 grid divide-y overflow-hidden rounded-2xl md:grid-cols-3 md:divide-x md:divide-y-0" style={{ ['--tw-divide-opacity' as string]: 1, borderColor: 'var(--line)' }}>
        {steps.map((s, i) => (
          <li key={s.n} className="reveal border-[var(--line)] p-6 sm:p-7" style={v(i)}>
            <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>{s.n}</span>
            <h3 className="mt-3 text-lg font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Features() {
  const items: { icon: typeof Activity; title: string; body: string }[] = [
    { icon: Activity, title: 'Fleet overview', body: 'CPU, RAM, disk and uptime for every server, with history charts, a rack and topology view, and alerts sent to Discord.' },
    { icon: Terminal, title: 'Browser terminal', body: 'A full xterm.js shell over WebSocket. htop, vim and nano work, and the window resizes with the session.' },
    { icon: Boxes, title: 'Docker and Compose', body: 'See containers, images and stacks; start, stop and restart them; read logs; act on a whole Compose project.' },
    { icon: Globe, title: 'Web apps, Nginx and SSL', body: 'Which domain points to which port, Nginx sites, listening ports, and Let’s Encrypt certificates with renewal.' },
    { icon: Database, title: 'Database workbench', body: 'PostgreSQL, MySQL, MongoDB, Redis and SQLite, including databases inside containers. Browse tables, run queries, see the ER diagram.' },
    { icon: HardDrive, title: 'Backups', body: 'Database and file backups on demand or on a schedule, with retention, download and restore.' },
    { icon: Clock, title: 'Cron, services and processes', body: 'Edit crontabs, control systemd units and PM2 apps, and find the process that is eating the CPU.' },
    { icon: FileText, title: 'Files and logs', body: 'Browse and edit files over SFTP, and search system and app logs without leaving the dashboard.' },
    { icon: KeyRound, title: 'SSH keys, hardening and firewall', body: 'Manage authorized keys, check root login and password auth, and open or close UFW ports. It refuses to remove the last rule that keeps SSH open.' }
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>Features</Eyebrow>
      <H2>The day-to-day work of running servers, in one place.</H2>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, body }, i) => (
          <article key={title} className="metal reveal rounded-2xl p-6" style={v(i % 3)}>
            <Icon className="h-5 w-5" style={{ color: 'var(--anatomy-strong)' }} aria-hidden />
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function AI() {
  return (
    <section id="ai" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <Eyebrow>AI copilot and gateway</Eyebrow>
          <H2>An assistant that looks before it answers.</H2>
          <Lead>
            Ask why a server is slow and the copilot runs the read-only checks itself (status, logs, disk, containers), reads the output and explains what it found.
            Anything that would change the server waits for your click.
          </Lead>
          <ul className="mt-8 space-y-4 text-[15px]">
            {[
              ['Uses your subscriptions', 'Log in with Claude, ChatGPT, GitHub Copilot or Gemini, or add an API key. No separate AI bill.'],
              ['Asks before it acts', 'Read-only commands run on their own. Restarts, edits and deletes need approval, and risky ones a second confirmation.'],
              ['Treats logs as data', 'Server output is fenced off from the instructions, and text that tries to steer the AI turns automatic runs off.'],
              ['One key for your tools', 'The same gateway gives Claude Code, Cursor and other tools one 7Server key, usable only from your own servers.']
            ].map(([t, b], i) => (
              <li key={t} className="reveal flex gap-3" style={v(i)}>
                <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
                <span><strong className="font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{t}.</strong> {b}</span>
              </li>
            ))}
          </ul>
        </div>
        <figure className="metal reveal rounded-2xl p-5 font-mono text-[12.5px] leading-relaxed" style={v(2)}>
          <figcaption className="sr-only">Example copilot session</figcaption>
          <p style={{ color: 'var(--anatomy-muted)' }}>you · vps-2</p>
          <p className="mt-1" style={{ color: 'var(--anatomy-strong)' }}>why is the api slow?</p>
          <div className="well mt-4 rounded-lg p-3">
            <p style={{ color: 'var(--anatomy-muted)' }}>read-only · ran automatically</p>
            <p style={{ color: 'var(--anatomy-strong)' }}>docker stats --no-stream</p>
            <p className="mt-1" style={{ color: 'var(--anatomy-muted)' }}>web-api  98% mem · restarted 14×</p>
          </div>
          <p className="mt-4">
            The <span style={{ color: 'var(--anatomy-strong)' }}>web-api</span> container is hitting its memory limit and being killed (exit 137).
            Raising the limit to 1 GB should stop the restart loop.
          </p>
          <div className="well mt-4 rounded-lg p-3">
            <p style={{ color: 'var(--anatomy-muted)' }}>changes the server · needs your approval</p>
            <p style={{ color: 'var(--anatomy-strong)' }}>docker update --memory 1g web-api</p>
            <div className="mt-3 flex gap-2 font-sans text-xs" aria-hidden>
              <span className="metal rounded-md px-2.5 py-1">Skip</span>
              <span className="btn-silver rounded-md px-2.5 py-1 font-semibold">Run</span>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}

function Security() {
  const items: { icon: typeof Lock; title: string; body: string }[] = [
    { icon: Lock, title: 'Encrypted at rest', body: 'Everything lives in one SQLite file. SSH credentials, AI tokens and webhooks inside it are encrypted with AES-256-GCM, with the key kept in a separate file on your machine.' },
    { icon: ShieldCheck, title: 'Users and roles', body: 'Each person gets an account: Admin, Operator or Viewer, optionally limited to some servers. Sessions can be revoked, and every change is written to an audit log with who did it.' },
    { icon: Sparkles, title: 'Gateway stays inside', body: 'The AI gateway only answers this machine, private networks and the servers you registered. Everyone else gets 403.' }
  ];
  return (
    <section id="security" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>Security</Eyebrow>
      <H2>Your keys stay on your hardware.</H2>
      <Lead>7Server is self-hosted. There is no account to create and no cloud service between you and your servers.</Lead>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {items.map(({ icon: Icon, title, body }, i) => (
          <article key={title} className="metal reveal rounded-2xl p-6" style={v(i)}>
            <Icon className="h-5 w-5" style={{ color: 'var(--accent)' }} aria-hidden />
            <h3 className="mt-4 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const INSTALL = {
  npm: { label: 'npm', note: 'Node.js 22.13 or newer. Data lives in ~/.7server.', steps: [['Install', 'npm install -g sevenserver'], ['Run', '7server']] as [string, string][] },
  docker: { label: 'Docker', note: 'Best for a VPS. Data lives in the 7server-data volume; the port is bound to localhost, so put HTTPS in front.', steps: [['Get the compose file', `git clone ${REPO}.git && cd 7server`], ['Set a password', 'cp .env.docker.example .env'], ['Start', 'docker compose up -d']] as [string, string][] },
  source: { label: 'From source', note: 'For development: UI on :3000, API on :5001.', steps: [['Clone', `git clone ${REPO}.git && cd 7server`], ['Install', '(cd server && npm install) && (cd client && npm install)'], ['Run', 'npm run dev']] as [string, string][] }
};

function GetStarted() {
  const [tab, setTab] = useState<keyof typeof INSTALL>('npm');
  const cur = INSTALL[tab];
  return (
    <section id="start" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="metal rounded-3xl p-6 sm:p-10">
        <Eyebrow>Get started</Eyebrow>
        <H2>Running in a few minutes.</H2>
        <Lead>Pick how you want to run it. You need SSH access to at least one server.</Lead>
        <div className="reveal mt-8 inline-flex rounded-xl border p-1" role="tablist" aria-label="Install method" style={{ borderColor: 'var(--line)', ...v(3) }}>
          {(Object.keys(INSTALL) as (keyof typeof INSTALL)[]).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} type="button"
              className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${tab === k ? 'btn-silver font-semibold' : 'hover:text-[var(--anatomy-strong)]'}`}>
              {INSTALL[k].label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4" role="tabpanel">
          {cur.steps.map(([label, cmd], i) => (
            <div key={tab + label}>
              <p className="mb-1.5 text-sm" style={{ color: 'var(--anatomy-strong)' }}>
                <span className="mr-2 font-mono text-xs" style={{ color: 'var(--accent)' }}>{`0${i + 1}`}</span>{label}
              </p>
              <CopyLine text={cmd} label={label} />
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm">{cur.note}</p>
        <p className="mt-4 text-sm leading-relaxed">
          Sign in as <code style={{ color: 'var(--anatomy-strong)' }}>admin</code> with <code style={{ color: 'var(--anatomy-strong)' }}>DASHBOARD_PASSWORD</code>, or the random password written to{' '}
          <code style={{ color: 'var(--anatomy-strong)' }}>dashboard.password</code> in the data directory on first start. Back up <code style={{ color: 'var(--anatomy-strong)' }}>7server.db</code> and <code style={{ color: 'var(--anatomy-strong)' }}>secret.key</code> together.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={REPO} className="btn-silver inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
            <GithubIcon className="h-4 w-4" /> View on GitHub
          </a>
          <a href="https://www.npmjs.com/package/sevenserver" className="metal inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
            sevenserver on npm
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--line)' }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="inline-flex items-center gap-2.5"><Logo size={22} /> 7Server · self-hosted server management</span>
        <nav className="flex gap-5" aria-label="More">
          <a href="#/contributors" className="transition-colors hover:text-[var(--anatomy-strong)]">Contributors</a>
          <a href="#/support" className="transition-colors hover:text-[var(--anatomy-strong)]">Support</a>
        </nav>
        <a href={REPO} className="inline-flex items-center gap-2 transition-colors hover:text-[var(--anatomy-strong)]"><GithubIcon className="h-4 w-4" /> nannndev/7server</a>
      </div>
    </footer>
  );
}

/** Tiny hash router: #/contributors and #/support are pages; anything else is the home page and its #section anchors. */
function useRoute() {
  const read = () => (location.hash.startsWith('#/') ? location.hash.slice(2).split(/[?#]/)[0] : '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      const r = read();
      setRoute(r);
      if (r) window.scrollTo(0, 0);
      // A section anchor (#features) clicked on a sub-page: render home first, then scroll to it.
      else if (location.hash.length > 1) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  useReveal(route);
  return (
    <>
      <Nav />
      <main key={route}>
        {route === 'contributors' ? <ContributorsPage /> : route === 'support' ? <SupportPage /> : (
          <>
            <Hero />
            <HowItWorks />
            <Features />
            <AI />
            <Security />
            <GetStarted />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
