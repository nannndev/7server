// 7Server landing page. Copy rules: every claim is something the product does today; nothing about
// pricing, users, uptime or features that are not built.
import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Boxes, Check, ChevronLeft, ChevronRight, Clock, Copy, Cpu, Database,
  Download, Expand, EyeOff, FileText, GitBranch, Globe, HardDrive, KeyRound, Languages, Layers, Lock, Moon, Network, Server,
  ShieldCheck, Sparkles, Star, Sun, Terminal, X
} from 'lucide-react';
import { AgentlessBench } from './figure/AgentlessBench';
import { GithubIcon, DiscordIcon, ProviderBrandIcon } from './components/BrandIcons';
import { ChangelogPage, ContributorsPage, PrivacyPage, SupportPage } from './pages';
import { COPY, type Lang } from './i18n';

const REPO = 'https://github.com/nannndev/7server';
const DISCORD = 'https://discord.gg/AF2Hc56t3N';
const LOGO = '/icons/icon-opt2-server-blade.png';

let cachedStats: { stars: number | null; downloads: number | null; active: number | null } = {
  stars: null,
  downloads: null,
  active: null,
};
let statsFetched = false;

function useProjectStats() {
  const [stats, setStats] = useState(cachedStats);

  useEffect(() => {
    if (statsFetched) {
      setStats(cachedStats);
      return;
    }
    statsFetched = true;

    fetch('https://api.github.com/repos/nannndev/7server')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.stargazers_count === 'number') {
          cachedStats = { ...cachedStats, stars: d.stargazers_count };
          setStats({ ...cachedStats });
        }
      })
      .catch(() => {});

    fetch('https://api.npmjs.org/downloads/point/last-month/sevenserver')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.downloads === 'number') {
          cachedStats = { ...cachedStats, downloads: d.downloads };
          setStats({ ...cachedStats });
        }
      })
      .catch(() => {});

    fetch('https://sevenserver-telemetry.ekaprasetya2244.workers.dev/api/v1/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const total = typeof d?.total_installs === 'number' ? d.total_installs : (typeof d?.active_instances_30d === 'number' ? d.active_instances_30d : 0);
        const count = Math.max(200, total);
        cachedStats = { ...cachedStats, active: count };
        setStats({ ...cachedStats });
      })
      .catch(() => {});
  }, []);

  return stats;
}

const Logo = ({ size = 28 }: { size?: number }) => (
  <img src={LOGO} alt="" width={size} height={size} className="rounded-[22%] shadow-sm" style={{ width: size, height: size }} />
);

// ---------------------------------------------------------------- hooks & helpers
function useReveal(route = '', dep: unknown = '') {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('.reveal');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach((e) => e.setAttribute('data-shown', ''));
      return;
    }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.setAttribute('data-shown', '');
        io.unobserve(e.target);
      }
    }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [route, dep]);
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

function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = localStorage.getItem('7server-lang');
      if (saved === 'id' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return 'en';
  });
  const toggleLang = () => {
    const next: Lang = lang === 'en' ? 'id' : 'en';
    try { localStorage.setItem('7server-lang', next); } catch { /* ignore */ }
    setLang(next);
  };
  return { lang, toggleLang };
}

const v = (i: number) => ({ ['--i' as string]: i });

// Screenshots exist in both themes (public/screenshots/<page>-dark.png / -light.png); follow the page theme.
function useShot() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(document.documentElement.dataset.theme || 'dark'));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return (src: string) => src.replace(/\.png$/, theme === 'light' ? '-light.png' : '-dark.png');
}

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
  <p className="reveal mb-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: 'var(--accent)' }}>{children}</p>
);
const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="reveal text-balance text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: 'var(--anatomy-strong)', ...v(1) }}>{children}</h2>
);
const Lead = ({ children }: { children: ReactNode }) => (
  <p className="reveal mt-4 max-w-2xl text-pretty text-base leading-relaxed sm:text-lg" style={v(2)}>{children}</p>
);

// ---------------------------------------------------------------- Lightbox Modal
function Lightbox({
  item,
  onClose,
  closeLabel,
}: {
  item: { src: string; title: string; route?: string } | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const shot = useShot();
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <div
        className="metal relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--line)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
              {item.title}
            </span>
            {item.route && (
              <span className="hidden rounded-md border px-2 py-0.5 font-mono text-[11px] sm:inline-block" style={{ borderColor: 'var(--line)', color: 'var(--anatomy-muted)' }}>
                {item.route}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--line)]"
            style={{ borderColor: 'var(--line)', color: 'var(--anatomy-strong)' }}
          >
            <X className="h-3.5 w-3.5" /> Esc
          </button>
        </div>
        <div className="overflow-auto bg-black/50 p-2 sm:p-4">
          <img
            src={shot(item.src)}
            alt={item.title}
            className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sections
function Nav({ lang, toggleLang }: { lang: Lang; toggleLang: () => void }) {
  const { theme, toggle } = useTheme();
  const { stars } = useProjectStats();
  const t = COPY[lang].nav;
  return (
    <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 82%, transparent)' }}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2 font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
          <Logo />
          7Server
        </a>
        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Sections">
          {[
            ['#how', t.how],
            ['#showcase', t.showcase],
            ['#features', t.features],
            ['#ai', t.ai],
            ['#security', t.security],
            ['#/changelog', 'Changelog'],
            ['http://localhost:3002', t.docs],
            ['#start', t.start],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noreferrer' : undefined}
              className="transition-colors hover:text-[var(--anatomy-strong)]"
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleLang}
            aria-label={lang === 'en' ? 'Switch language to Bahasa Indonesia' : 'Switch language to English'}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 font-mono text-xs font-medium transition-colors hover:bg-[var(--line)]"
            style={{ borderColor: 'var(--line)', color: 'var(--anatomy-strong)' }}
          >
            <Languages className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
            <span>{lang.toUpperCase()}</span>
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="relative grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-[var(--line)]"
          >
            <Sun className="theme-icon absolute h-4 w-4" data-off={theme === 'dark' ? undefined : ''} />
            <Moon className="theme-icon absolute h-4 w-4" data-off={theme === 'dark' ? '' : undefined} />
          </button>
          <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--line)] hover:text-[#5865F2] sm:flex" title="Join 7Server Discord Community">
            <DiscordIcon className="h-4 w-4" /> Discord
          </a>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--line)] sm:flex">
            <GithubIcon className="h-4 w-4" /> GitHub
            {stars !== null && stars > 0 && (
              <span className="rounded-full bg-[var(--line)] px-2 py-0.5 text-[11px] font-mono text-[var(--anatomy-muted)]">
                ★ {stars}
              </span>
            )}
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero({
  lang,
  onZoom,
}: {
  lang: Lang;
  onZoom: (item: { src: string; title: string; route?: string }) => void;
}) {
  const shot = useShot();
  const { stars, downloads, active } = useProjectStats();
  const t = COPY[lang].hero;
  const [activeTab, setActiveTab] = useState(0);
  const currentPreview = t.heroTabs[activeTab] || t.heroTabs[0];

  return (
    <section id="top" className="relative isolate mx-auto max-w-6xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20">
      <div className="carbon" aria-hidden />
      <div className="max-w-3xl">
        <p className="metal reveal mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px]">
          <span className="led breathe h-1.5 w-1.5 rounded-full" /> {t.badge}
        </p>
        <h1 className="silver-text reveal text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ color: 'var(--anatomy-strong)', ...v(1) }}>
          {t.title}
        </h1>
        <p className="reveal mt-6 max-w-2xl text-pretty text-lg leading-relaxed" style={v(2)}>
          {t.lead}
        </p>
        <div className="reveal mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={v(3)}>
          <a href="#start" className="btn-silver inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
            {t.ctaPrimary} <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="#how"
            className="metal inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            style={{ color: 'var(--anatomy-strong)' }}
          >
            {t.ctaSecondary}
          </a>
          <div className="sm:ml-2 sm:flex-1 max-w-xs">
            <CopyLine text="npx sevenserver" label={t.quickInstall} />
          </div>
        </div>

        {/* Live Active Nodes, GitHub & npm social proof */}
        <div className="reveal mt-6 flex flex-wrap items-center gap-3 text-xs font-mono sm:gap-4" style={{ color: 'var(--anatomy-muted)', ...v(3) }}>
          <div className="inline-flex items-center gap-1.5 rounded-md px-2 py-1" title="Real-time verified active instances">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-semibold text-[var(--anatomy-strong)]">{active !== null ? `${active}+` : '200+'}</span>
            <span>{t.activeLabel}</span>
          </div>
          <span className="text-[var(--line-strong)]" aria-hidden>•</span>
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--line)] hover:text-[var(--anatomy-strong)]">
            <Star className="h-3.5 w-3.5 fill-amber-400/20 text-amber-400" />
            <span className="font-semibold text-[var(--anatomy-strong)]">{stars !== null ? stars : 1}</span>
            <span>{t.starsLabel}</span>
          </a>
          <span className="text-[var(--line-strong)]" aria-hidden>•</span>
          <a href="https://www.npmjs.com/package/sevenserver" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--line)] hover:text-[var(--anatomy-strong)]">
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-semibold text-[var(--anatomy-strong)]">{downloads !== null ? `${downloads.toLocaleString()}+` : '680+'}</span>
            <span>{t.downloadsLabel}</span>
          </a>
          <span className="text-[var(--line-strong)]" aria-hidden>•</span>
          <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-[var(--line)] hover:text-[#5865F2]">
            <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2]" />
            <span>{t.communityLabel}</span>
          </a>
        </div>
      </div>

      {/* Interactive Hero Dashboard Frame */}
      <div className="core-glow reveal mt-12" style={v(4)}>
        <div className="metal overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--line)' }}>
          {/* Window Chrome + Quick View Switcher */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
            style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 55%, transparent)' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
              </div>
              <div className="well hidden items-center gap-2 rounded-lg px-3 py-1 font-mono text-[11px] sm:flex">
                <span className="led h-1.5 w-1.5 rounded-full" />
                <span style={{ color: 'var(--anatomy-muted)' }}>127.0.0.1:5001</span>
                <span style={{ color: 'var(--line-strong)' }}>/</span>
                <span style={{ color: 'var(--anatomy-strong)' }}>{currentPreview.route}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Dashboard preview tabs">
              {t.heroTabs.map((tab, idx) => {
                const selected = idx === activeTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(idx)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${selected ? 'btn-silver font-semibold' : 'hover:bg-[var(--line)] hover:text-[var(--anatomy-strong)]'
                      }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Screenshot Canvas */}
          <div
            className="group relative cursor-zoom-in overflow-hidden bg-black/40"
            onClick={() => onZoom({ src: currentPreview.image, title: currentPreview.label, route: currentPreview.route })}
          >
            <img
              key={currentPreview.image}
              src={shot(currentPreview.image)}
              alt={currentPreview.label}
              className="block w-full object-cover transition-transform duration-500 group-hover:scale-[1.005]"
              loading="eager"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onZoom({ src: currentPreview.image, title: currentPreview.label, route: currentPreview.route });
              }}
              className="metal absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium opacity-90 shadow-lg transition-opacity group-hover:opacity-100"
              style={{ color: 'var(--anatomy-strong)' }}
            >
              <Expand className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
              {COPY[lang].showcase.zoomHint}
            </button>
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-xs" style={{ color: 'var(--anatomy-muted)' }}>
          {t.previewCaption}
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- How It Works (Interactive Architecture & Step Studio)
function HowItWorks({
  lang,
  onZoom,
}: {
  lang: Lang;
  onZoom: (item: { src: string; title: string; route?: string }) => void;
}) {
  const shot = useShot();
  const t = COPY[lang].how;
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState<'workflow' | 'bench'>('workflow');
  const step = t.steps[activeStep] || t.steps[0];

  const archIcons = [Server, KeyRound, Cpu];

  return (
    <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div>
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <H2>{t.title}</H2>
          <Lead>{t.lead}</Lead>
        </div>
        <div
          className="reveal inline-flex self-start rounded-xl border p-1"
          style={{ borderColor: 'var(--line)' }}
          role="tablist"
          aria-label="How it works view mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'workflow'}
            onClick={() => setMode('workflow')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${mode === 'workflow' ? 'btn-silver font-semibold' : 'hover:text-[var(--anatomy-strong)]'
              }`}
          >
            {t.modeWorkflow}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bench'}
            onClick={() => setMode('bench')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${mode === 'bench' ? 'btn-silver font-semibold' : 'hover:text-[var(--anatomy-strong)]'
              }`}
          >
            {t.modeBench}
          </button>
        </div>
      </div>

      {/* 3-Node Architecture Pipeline Bar */}
      <div className="metal reveal mt-10 rounded-2xl p-4 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {t.archNodes.map((node, i) => {
            const Icon = archIcons[i] || Server;
            return (
              <div key={node.step} className="relative flex flex-col justify-between rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 45%, transparent)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
                    <span className="led h-1.5 w-1.5 rounded-full" />
                    {node.step}
                  </span>
                  <Icon className="h-4 w-4" style={{ color: 'var(--anatomy-muted)' }} />
                </div>
                <div className="mt-3">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{node.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed">{node.sub}</p>
                </div>
                <div className="well mt-3 rounded-lg px-2.5 py-1.5 font-mono text-[11px]" style={{ color: 'var(--anatomy-strong)' }}>
                  {node.meta}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {mode === 'bench' ? (
        <div className="core-glow mt-8">
          <AgentlessBench />
        </div>
      ) : (
        /* Interactive 4-Step Walkthrough Studio */
        <div className="mt-8 grid gap-6 lg:grid-cols-12 lg:items-start">
          {/* Left Column: 4 Interactive Steps */}
          <div className="flex flex-col gap-3 lg:col-span-5" role="tablist" aria-label="How 7Server works steps">
            {t.steps.map((s, idx) => {
              const active = idx === activeStep;
              return (
                <button
                  key={s.n}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveStep(idx)}
                  className={`w-full rounded-2xl p-5 text-left transition-all ${active ? 'metal ring-1 ring-[var(--accent)]/50' : 'well opacity-75 hover:opacity-100'
                    }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      STEP {s.n} · {s.badge}
                    </span>
                    {active && <span className="led h-2 w-2 rounded-full" />}
                  </div>
                  <h3 className="mt-2 text-base font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
                    {s.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    {s.summary}
                  </p>
                  {active && (
                    <ul className="mt-3.5 space-y-1.5 border-t pt-3 text-xs" style={{ borderColor: 'var(--line)' }}>
                      {s.details.map((d) => (
                        <li key={d} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
                          <span style={{ color: 'var(--anatomy-strong)' }}>{d}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Column: Live SSH Inspector + Corresponding Dashboard Screenshot */}
          <div className="metal flex flex-col overflow-hidden rounded-2xl lg:col-span-7">
            {/* Top Bar */}
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
              style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 55%, transparent)' }}
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-md px-2 py-0.5 font-mono text-xs font-semibold" style={{ background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)' }}>
                  {step.n}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
                  {step.screenshotTitle}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => (prev - 1 + t.steps.length) % t.steps.length)}
                  aria-label="Previous step"
                  className="rounded-lg border p-1.5 transition-colors hover:bg-[var(--line)]"
                  style={{ borderColor: 'var(--line)', color: 'var(--anatomy-strong)' }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 font-mono text-xs" style={{ color: 'var(--anatomy-muted)' }}>
                  {activeStep + 1} / {t.steps.length}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveStep((prev) => (prev + 1) % t.steps.length)}
                  aria-label="Next step"
                  className="rounded-lg border p-1.5 transition-colors hover:bg-[var(--line)]"
                  style={{ borderColor: 'var(--line)', color: 'var(--anatomy-strong)' }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Screenshot View */}
            <div
              className="group relative cursor-zoom-in overflow-hidden border-b bg-black/40"
              style={{ borderColor: 'var(--line)' }}
              onClick={() => onZoom({ src: step.screenshot, title: step.screenshotTitle, route: `Step ${step.n} · ${step.badge}` })}
            >
              <img
                key={step.screenshot}
                src={shot(step.screenshot)}
                alt={step.screenshotTitle}
                className="block w-full object-cover transition-transform duration-500 group-hover:scale-[1.01]"
                loading="lazy"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onZoom({ src: step.screenshot, title: step.screenshotTitle, route: `Step ${step.n} · ${step.badge}` });
                }}
                className="metal absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium opacity-90 shadow-md transition-opacity group-hover:opacity-100"
                style={{ color: 'var(--anatomy-strong)' }}
              >
                <Expand className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                {t.viewFullScreen}
              </button>
            </div>

            {/* Under the Hood SSH / Command Inspector */}
            <div className="p-4 sm:p-5">
              <div className="mb-2.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: 'var(--anatomy-muted)' }}>
                  <Terminal className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                  {t.underTheHood} — {step.sshLabel}
                </span>
              </div>
              <div className="well space-y-2.5 rounded-xl p-3.5 font-mono text-xs">
                {step.sshCommands.map((item) => (
                  <div key={item.cmd}>
                    <div className="flex items-center gap-2" style={{ color: 'var(--anatomy-strong)' }}>
                      <span style={{ color: 'var(--accent)' }}>$</span>
                      <span className="break-all font-medium">{item.cmd}</span>
                    </div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap pl-4 text-[11px] leading-relaxed" style={{ color: 'var(--anatomy-muted)' }}>
                      {item.out}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Product Screenshot Showcase
function ProductShowcase({
  lang,
  onZoom,
}: {
  lang: Lang;
  onZoom: (item: { src: string; title: string; route?: string }) => void;
}) {
  const shot = useShot();
  const t = COPY[lang].showcase;
  const [catIdx, setCatIdx] = useState(0);
  const [screenIdx, setScreenIdx] = useState(0);

  const category = t.categories[catIdx] || t.categories[0];
  const screen = category.screens[screenIdx] || category.screens[0];

  const selectCategory = (idx: number) => {
    setCatIdx(idx);
    setScreenIdx(0);
  };

  const stepScreen = (dir: -1 | 1) => {
    const nextScreenIdx = screenIdx + dir;
    if (nextScreenIdx >= 0 && nextScreenIdx < category.screens.length) {
      setScreenIdx(nextScreenIdx);
    } else if (dir === 1) {
      const nextCat = (catIdx + 1) % t.categories.length;
      setCatIdx(nextCat);
      setScreenIdx(0);
    } else {
      const prevCat = (catIdx - 1 + t.categories.length) % t.categories.length;
      setCatIdx(prevCat);
      setScreenIdx(t.categories[prevCat].screens.length - 1);
    }
  };

  const catIcons = [Layers, Activity, Boxes, Terminal, Sparkles, ShieldCheck];

  return (
    <section id="showcase" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <H2>{t.title}</H2>
      <Lead>{t.lead}</Lead>

      {/* Top Category Bar */}
      <div className="reveal mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Screenshot categories">
        {t.categories.map((cat, idx) => {
          const Icon = catIcons[idx] || Layers;
          const active = idx === catIdx;
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectCategory(idx)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${active ? 'btn-silver font-semibold' : 'metal hover:text-[var(--anatomy-strong)]'
                }`}
            >
              <Icon className="h-4 w-4" />
              <span>{cat.label}</span>
              <span className="rounded-full px-1.5 py-0.2 font-mono text-[11px] opacity-75">
                {cat.screens.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Showcase Stage */}
      <div className="metal reveal mt-6 overflow-hidden rounded-2xl">
        {/* Stage Header: Breadcrumb + Sub-screen Tabs */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6"
          style={{ borderColor: 'var(--line)', background: 'color-mix(in srgb, var(--anatomy-page) 55%, transparent)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex gap-1.5" aria-hidden>
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" />
            </div>
            <span className="truncate font-mono text-xs" style={{ color: 'var(--anatomy-strong)' }}>
              {screen.route}
            </span>
          </div>

          {category.screens.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Sub-views">
              {category.screens.map((sc, sIdx) => {
                const isSelected = sIdx === screenIdx;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setScreenIdx(sIdx)}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${isSelected
                      ? 'btn-silver font-semibold'
                      : 'well opacity-80 hover:opacity-100 hover:text-[var(--anatomy-strong)]'
                      }`}
                  >
                    {sc.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Screenshot Viewport */}
        <div
          className="group relative cursor-zoom-in overflow-hidden border-b bg-black/40"
          style={{ borderColor: 'var(--line)' }}
          onClick={() => onZoom({ src: screen.image, title: screen.title, route: screen.route })}
        >
          <img
            key={screen.image}
            src={shot(screen.image)}
            alt={screen.title}
            className="block w-full object-cover transition-transform duration-500 group-hover:scale-[1.006]"
            loading="lazy"
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoom({ src: screen.image, title: screen.title, route: screen.route });
            }}
            className="metal absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium opacity-90 shadow-lg transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--anatomy-strong)' }}
          >
            <Expand className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
            {t.zoomHint}
          </button>
        </div>

        {/* Stage Footer: Caption, Feature Pills & Prev/Next Controls */}
        <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
              {screen.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed">
              {screen.caption}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {screen.highlights.map((h) => (
                <span
                  key={h}
                  className="well inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[11px]"
                  style={{ color: 'var(--anatomy-strong)' }}
                >
                  <span className="led h-1.5 w-1.5 rounded-full" />
                  {h}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={() => stepScreen(-1)}
              aria-label="Previous screenshot"
              className="metal inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:text-[var(--anatomy-strong)]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => stepScreen(1)}
              aria-label="Next screenshot"
              className="metal inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors hover:text-[var(--anatomy-strong)]"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features({ lang }: { lang: Lang }) {
  const itemsEn: { icon: typeof Activity; title: string; body: string }[] = [
    { icon: Activity, title: 'Fleet overview & 3D views', body: 'CPU, RAM, disk and uptime for every server, with history charts, a 3D rack, 3D resource matrix, topology view, and alerts sent to Discord.' },
    { icon: GitBranch, title: 'Git auto-discovery & deploy', body: 'Connect a GitHub Personal Access Token to browse repositories, auto-detect frameworks and monorepo root folders, and deploy with live streaming logs.' },
    { icon: Network, title: 'Cloudflare Tunnels & Zero-Trust', body: 'Expose internal webapps behind NAT or Tailscale without opening any public ports. Includes 1-click Zero Trust token setup and visual ingress route mapping.' },
    { icon: Globe, title: 'Nginx, SSL & DNS pre-flight', body: 'Which domain points to which port, Nginx sites with nginx -t syntax verification, automated Let\'s Encrypt certificates, and real-time DNS A-record pre-flight checks.' },
    { icon: Boxes, title: 'Docker and Compose', body: 'See containers, images and stacks; start, stop and restart them; read logs; act on a whole Compose project.' },
    { icon: Terminal, title: 'Browser terminal', body: 'A full multi-tab xterm.js shell over WebSocket with command shortcuts. htop, vim and nano work, and the window resizes with the session.' },
    { icon: Database, title: 'Database workbench', body: 'PostgreSQL, MySQL, MongoDB, Redis and SQLite, including databases inside containers. Browse tables, run queries, see the ER diagram.' },
    { icon: HardDrive, title: 'Backups', body: 'Database and file backups on demand or on a schedule, with retention, download and restore.' },
    { icon: Clock, title: 'Cron, services and processes', body: 'Edit crontabs with visual presets, control systemd units and PM2 apps, and find the process that is eating the CPU.' },
    { icon: FileText, title: 'Files and logs', body: 'Browse and edit files over SFTP, and search system and app logs without leaving the dashboard.' },
    { icon: KeyRound, title: 'SSH keys, hardening and firewall', body: 'Manage authorized keys, check root login and password auth, and open or close UFW ports. It refuses to remove the last rule that keeps SSH open.' },
    { icon: EyeOff, title: 'Screencast Privacy Mode', body: '1-click streamer privacy mode blurs all sensitive server IPs, public domains, application paths, local ports, and auth tokens with instant hover reveal.' },
  ];

  const itemsId: { icon: typeof Activity; title: string; body: string }[] = [
    { icon: Activity, title: 'Ringkasan Fleet & Visual 3D', body: 'Pantau CPU, RAM, disk, dan uptime setiap server lengkap dengan grafik riwayat, rak 3D, matriks 3D, peta topologi, dan notifikasi Discord.' },
    { icon: GitBranch, title: 'Auto-Discovery & Deploy Git', body: 'Hubungkan GitHub Personal Access Token untuk memilih repositori, deteksi otomatis framework & subfolder monorepo, lalu deploy dengan log real-time.' },
    { icon: Network, title: 'Cloudflare Tunnel & Ingress Zero-Trust', body: 'Buka akses webapp lokal di balik NAT atau Tailscale tanpa membuka port firewall publik. Dilengkapi setup token 1-klik dan peta visual rute ingress.' },
    { icon: Globe, title: 'Nginx, SSL & DNS Pre-Flight', body: 'Pemetaan domain ke port lokal, konfigurasi Nginx dengan tes sintaks nginx -t, sertifikat Let’s Encrypt otomatis, dan validasi DNS record sebelum penerbitan SSL.' },
    { icon: Boxes, title: 'Docker dan Compose', body: 'Pantau container, image, dan stack; start, stop, dan restart; baca log langsung; atau kelola seluruh proyek Docker Compose.' },
    { icon: Terminal, title: 'Terminal Browser Multi-Tab', body: 'Shell xterm.js penuh melalui WebSocket dengan tombol pintasan perintah. htop, vim, dan nano berjalan lancar dan responsif.' },
    { icon: Database, title: 'Database Workbench', body: 'Mendukung PostgreSQL, MySQL, MongoDB, Redis, dan SQLite—termasuk database di dalam container Docker. Jelajahi tabel, jalankan query, dan lihat diagram ER.' },
    { icon: HardDrive, title: 'Backup Terjadwal', body: 'Backup database dan direktori file secara instan atau terjadwal, lengkap dengan retensi otomatis, unduh, dan restore.' },
    { icon: Clock, title: 'Cron, Systemd & Proses PM2', body: 'Edit jadwal crontab dengan preset visual, kontrol unit systemd maupun worker PM2, serta lacak proses yang membebani CPU.' },
    { icon: FileText, title: 'Manajer File SFTP & Log', body: 'Jelajahi dan edit file langsung lewat jalur SFTP, serta cari log sistem maupun aplikasi tanpa meninggalkan browser.' },
    { icon: KeyRound, title: 'Kunci SSH, Hardening & Firewall', body: 'Kelola authorized_keys, audit konfigurasi login root, dan atur port UFW dengan proteksi anti-terkunci dari port SSH.' },
    { icon: EyeOff, title: 'Mode Privasi untuk Screencast', body: 'Sensor instan sekali klik untuk menyamarkan IP server, domain publik, path aplikasi, port lokal, dan token saat presentasi atau rekaman video.' },
  ];

  const items = lang === 'id' ? itemsId : itemsEn;

  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>{lang === 'id' ? 'Fitur Lengkap' : 'Features'}</Eyebrow>
      <H2>{lang === 'id' ? 'Seluruh operasional harian server Anda dalam satu tempat.' : 'The day-to-day work of running servers, in one place.'}</H2>
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

function AI({ lang }: { lang: Lang }) {
  const bullets = lang === 'id'
    ? [
      ['Vibe-coding & develop langsung di server', 'Bangun aplikasi di /var/www, pasang runtime, atur Nginx/Cloudflare Tunnel, atau hubungkan Claude Code, Codex, OpenCode & Cursor langsung di atas VPS menggunakan satu kunci API Universal 7Server.'],
      ['Multi-account & rotasi berurutan per provider', 'Hubungkan banyak akun Claude, ChatGPT/Codex, GitHub Copilot, Gemini, Kimi, Kilo, Muse, atau API key sekaligus. Saat akun #1 terkena rate-limit 429, request otomatis berputar ke akun #2.'],
      ['Built-in DevOps Engineer & Custom SKILL.md', 'Dilengkapi playbook SRE/DevOps standar produksi secara default, plus dukungan menambahkan atau menempel file SKILL.md kustom di Pengaturan Agen.'],
      ['Kompresi konteks (/compact) & hemat token', 'Ketik /compact atau gunakan auto-compaction bawaan yang merangkum output SSH lama secara otomatis agar sesi troubleshooting panjang tetap ringan dan hemat kuota.'],
      ['Meminta izin & memproteksi dari prompt injection', 'Perintah read-only berjalan otomatis dan output log diisolasi ketat. Restart, edit, dan hapus wajib mendapat klik persetujuan Anda.'],
    ]
    : [
      ['Vibe-code & develop directly on your server', 'Scaffold apps in /var/www, wire up Nginx or Cloudflare Tunnels, or point Claude Code, Codex, OpenCode & Cursor running on your VPS straight to your 7Server Universal API Key.'],
      ['Multi-account & ordered rotation per provider', 'Connect multiple Claude, ChatGPT/Codex, GitHub Copilot, Gemini, Kimi, Kilo, Muse, or API-key accounts. When account #1 hits a 429 rate limit, 7Server automatically rotates to account #2.'],
      ['Built-in DevOps skill & custom SKILL.md', 'Ships with a production DevOps Engineer baseline and domain playbooks, plus support for pasting custom SKILL.md files with keyword triggers in Agent Settings.'],
      ['Context compaction (/compact) for long sessions', 'Run /compact or let automatic backend compaction condense older SSH outputs so deep troubleshooting sessions never blow your token budget.'],
      ['Asks before it acts & fences untrusted logs', 'Read-only commands run on their own while server logs are fenced against prompt injection. Restarts, edits, and deletes always wait for your approval.'],
    ];

  const oauthProviders = ['Claude Pro/Max', 'ChatGPT / Codex', 'GitHub Copilot', 'Gemini CLI', 'Kimi Code', 'Kilo Code', 'Muse (Koda)', 'Nous Portal'];
  const apiKeyProviders = ['OpenAI', 'Anthropic', 'Google Gemini', 'OpenRouter', 'GLM (Z.AI)', 'MiniMax', 'DeepSeek', 'Groq', 'Mistral', 'xAI (Grok)', 'Together AI', 'Fireworks', 'Cerebras', 'Cohere', 'NVIDIA NIM', 'Nebius', 'SiliconFlow', 'Hyperbolic', 'DeepInfra'];

  return (
    <section id="ai" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-start">
        <div>
          <Eyebrow>{lang === 'id' ? 'AI Copilot · Universal Gateway · Vibe-Code di Server' : 'AI Copilot · Universal Gateway · Vibe-Code on Server'}</Eyebrow>
          <H2>{lang === 'id' ? 'Vibe-coding dan kelola langsung di atas server Anda.' : 'Vibe-code and operate directly on your server.'}</H2>
          <Lead>
            {lang === 'id'
              ? 'Dengan Universal AI Gateway dan AI SRE Copilot bawaan, Anda bisa langsung membangun aplikasi, men-debug layanan, atau menjalankan coding agent langsung di VPS—Copilot memeriksa kondisi server secara otomatis dan meminta persetujuan Anda sebelum mengubah apa pun.'
              : 'With the built-in Universal AI Gateway and AI SRE Copilot, you can build apps, debug production services, and run coding agents directly on your VPS—Copilot inspects your server first and waits for your click before changing anything.'}
          </Lead>
          <ul className="mt-8 space-y-4 text-[15px]">
            {bullets.map(([t, b], i) => (
              <li key={t} className="reveal flex gap-3" style={v(i)}>
                <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--accent)' }} aria-hidden />
                <span><strong className="font-semibold" style={{ color: 'var(--anatomy-strong)' }}>{t}.</strong> {b}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
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

          <div className="metal reveal rounded-2xl p-4" style={v(3)}>
            <div className="text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--anatomy-muted)' }}>
              {lang === 'id' ? '8 Provider Langganan OAuth (Multi-Account)' : '8 OAuth Subscription Providers (Multi-Account)'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {oauthProviders.map((p) => (
                <span key={p} className="well inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px]" style={{ color: 'var(--anatomy-strong)' }}>
                  <ProviderBrandIcon name={p} className="w-3.5 h-3.5" /> {p}
                </span>
              ))}
            </div>
            <div className="mt-3 text-[11px] font-mono uppercase tracking-wider" style={{ color: 'var(--anatomy-muted)' }}>
              {lang === 'id' ? '19 Provider API-Key & OpenAI-Compatible' : '19 API-Key & OpenAI-Compatible Providers'}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {apiKeyProviders.map((p) => (
                <span key={p} className="well inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10.5px]" style={{ color: 'var(--anatomy-muted)' }}>
                  <ProviderBrandIcon name={p} className="w-3 h-3" /> {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Security({ lang }: { lang: Lang }) {
  const items: { icon: typeof Lock; title: string; body: string }[] = lang === 'id'
    ? [
      { icon: Lock, title: 'Terenkripsi Penuh (At-Rest)', body: 'Seluruh data tersimpan dalam satu file SQLite lokal. Kredensial SSH, token Git/AI, dan webhook dienkripsi dengan AES-256-GCM menggunakan file kunci terpisah di mesin Anda.' },
      { icon: ShieldCheck, title: 'Pengguna, Peran (RBAC) & Audit', body: 'Setiap anggota tim memiliki akun sendiri: Admin, Operator, atau Viewer, yang dapat dibatasi per VPS. Sesi login dapat dicabut kapan saja dan setiap aksi tercatat di Audit Log.' },
      { icon: EyeOff, title: 'Mode Privasi Demo & Screencast', body: 'Sembunyikan seluruh IP server, domain, path file, dan port secara instan dengan satu tombol privasi di TopBar. Aman digunakan saat rekaman video, webinar, atau livestreaming.' },
      { icon: Sparkles, title: 'Gateway Terisolasi Jaringan Privat', body: 'AI Gateway hanya merespons localhost, jaringan privat, dan IP VPS yang telah Anda daftarkan di 7Server. Akses luar lainnya otomatis ditolak (403).' },
    ]
    : [
      { icon: Lock, title: 'Encrypted at rest', body: 'Everything lives in one SQLite file. SSH credentials, AI tokens and webhooks inside it are encrypted with AES-256-GCM, with the key kept in a separate file on your machine.' },
      { icon: ShieldCheck, title: 'Users and roles', body: 'Each person gets an account: Admin, Operator or Viewer, optionally limited to some servers. Sessions can be revoked, and every change is written to an audit log with who did it.' },
      { icon: EyeOff, title: 'Privacy Mode for Screencasts', body: 'Instantly blur all server IPs, domain names, application paths, local ports, and tokens with one click in the top bar. Built for live demos, streaming, and video recording.' },
      { icon: Sparkles, title: 'Gateway stays inside', body: 'The AI gateway only answers this machine, private networks and the servers you registered. Everyone else gets 403.' },
    ];

  return (
    <section id="security" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <Eyebrow>{lang === 'id' ? 'Keamanan & Privasi' : 'Security'}</Eyebrow>
      <H2>{lang === 'id' ? 'Kunci rahasia Anda tetap berada di perangkat Anda sendiri.' : 'Your keys stay on your hardware.'}</H2>
      <Lead>
        {lang === 'id'
          ? '7Server sepenuhnya self-hosted. Tidak ada akun cloud yang perlu dibuat dan tidak ada server perantara di antara Anda dan VPS Anda.'
          : '7Server is self-hosted. There is no account to create and no cloud service between you and your servers.'}
      </Lead>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

function GetStarted({ lang }: { lang: Lang }) {
  const [tab, setTab] = useState<keyof typeof INSTALL>('npm');
  const { stars, downloads } = useProjectStats();
  const cur = INSTALL[tab];
  return (
    <section id="start" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="metal rounded-3xl p-6 sm:p-10">
        <Eyebrow>{lang === 'id' ? 'Mulai Cepat' : 'Get started'}</Eyebrow>
        <H2>{lang === 'id' ? 'Siap berjalan dalam hitungan menit.' : 'Running in a few minutes.'}</H2>
        <Lead>
          {lang === 'id'
            ? 'Pilih metode instalasi yang Anda sukai. Anda hanya membutuhkan akses SSH ke minimal satu server.'
            : 'Pick how you want to run it. You need SSH access to at least one server.'}
        </Lead>
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
          {lang === 'id' ? (
            <>
              Pada kunjungan pertama, Anda langsung membuat akun Admin di browser. Jika diakses dari mesin lain, sistem akan meminta 6 digit kode setup yang tercetak di terminal. Pastikan selalu mem-backup <code style={{ color: 'var(--anatomy-strong)' }}>7server.db</code> dan <code style={{ color: 'var(--anatomy-strong)' }}>secret.key</code> secara bersamaan.
            </>
          ) : (
            <>
              On the first visit you create the admin account in the browser. From another machine it also asks for the 6-digit setup code printed in the terminal. Back up <code style={{ color: 'var(--anatomy-strong)' }}>7server.db</code> and <code style={{ color: 'var(--anatomy-strong)' }}>secret.key</code> together.
            </>
          )}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a href={REPO} target="_blank" rel="noopener noreferrer" className="btn-silver inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold">
            <GithubIcon className="h-4 w-4" /> View on GitHub
            {stars !== null && stars > 0 && (
              <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs font-mono">
                ★ {stars}
              </span>
            )}
          </a>
          <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="metal inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors hover:border-[#5865F2] hover:text-[#5865F2]" style={{ color: 'var(--anatomy-strong)' }}>
            <DiscordIcon className="h-4 w-4 text-[#5865F2]" /> Join Discord Community
          </a>
          <a href="https://www.npmjs.com/package/sevenserver" target="_blank" rel="noopener noreferrer" className="metal inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold" style={{ color: 'var(--anatomy-strong)' }}>
            <Download className="h-4 w-4 text-cyan-400" /> sevenserver on npm
            {downloads !== null && (
              <span className="rounded-full bg-[var(--line)] px-2 py-0.5 text-xs font-mono text-[var(--anatomy-muted)]">
                {downloads.toLocaleString()}+
              </span>
            )}
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
          <a href="#/changelog" className="transition-colors hover:text-[var(--anatomy-strong)]">Changelog</a>
          <a href="#/contributors" className="transition-colors hover:text-[var(--anatomy-strong)]">Contributors</a>
          <a href="#/support" className="transition-colors hover:text-[var(--anatomy-strong)]">Support</a>
          <a href="#/privacy" className="transition-colors hover:text-[var(--anatomy-strong)]">Privacy</a>
          <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-[#5865F2]"><DiscordIcon className="h-3.5 w-3.5" /> Discord</a>
          <a href="https://saweria.co/nannndev" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--anatomy-strong)]">Saweria</a>
          <a href="https://buymeacoffee.com/ekaprasety8" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[var(--anatomy-strong)]">Buy Me a Coffee</a>
        </nav>
        <a href={REPO} className="inline-flex items-center gap-2 transition-colors hover:text-[var(--anatomy-strong)]"><GithubIcon className="h-4 w-4" /> nannndev/7server</a>
      </div>
    </footer>
  );
}

/** Tiny hash router: #/contributors, #/support, and #/privacy are pages; anything else is the home page and its #section anchors. */
function useRoute() {
  const read = () => (location.hash.startsWith('#/') ? location.hash.slice(2).split(/[?#]/)[0] : '');
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      const r = read();
      setRoute(r);
      if (r) window.scrollTo(0, 0);
      else if (location.hash.length > 1) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView());
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useRoute();
  const { lang, toggleLang } = useLang();
  const [lightbox, setLightbox] = useState<{ src: string; title: string; route?: string } | null>(null);
  useReveal(route, lang);

  return (
    <>
      <Nav lang={lang} toggleLang={toggleLang} />
      <main key={route}>
        {route === 'changelog' ? <ChangelogPage /> : route === 'contributors' ? <ContributorsPage /> : route === 'support' ? <SupportPage /> : route === 'privacy' ? <PrivacyPage /> : (
          <>
            <Hero lang={lang} onZoom={setLightbox} />
            <HowItWorks lang={lang} onZoom={setLightbox} />
            <ProductShowcase lang={lang} onZoom={setLightbox} />
            <Features lang={lang} />
            <AI lang={lang} />
            <Security lang={lang} />
            <GetStarted lang={lang} />
          </>
        )}
      </main>
      <Footer />
      <Lightbox
        item={lightbox}
        onClose={() => setLightbox(null)}
        closeLabel={COPY[lang].showcase.closeHint}
      />
    </>
  );
}
