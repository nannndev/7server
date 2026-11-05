// Contributors and Support pages. Facts only: contributors come from the GitHub API at view time
// (no invented names or counts); support points at the real channels (GitHub issues, docs, security).
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, Bug, BookOpen, GitPullRequest, HeartHandshake, LifeBuoy, MessageSquare, ShieldAlert, Star } from 'lucide-react';
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
  const faq: [string, ReactNode][] = [
    ['I forgot my password.', <>Another admin can reset it on the Users page. <code>DASHBOARD_PASSWORD</code> only sets the first admin, when no user exists yet. If you are the only admin and locked out, ask on GitHub Issues: there is no reset command yet.</>],
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
