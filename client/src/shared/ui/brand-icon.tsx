// Real product logos (simple-icons, CC0). Only the icons imported here end up in the bundle.
// Look a product up by id or by free text ("Laravel (PHP)", "nginx:1.25-alpine", "Ubuntu 22.04.4 LTS").
import React from 'react';
import {
  siNodedotjs, siNpm, siPnpm, siYarn, siBun, siDeno, siPhp, siComposer, siPython, siGo, siOpenjdk, siNginx, siApache, siCaddy, siLetsencrypt, siCloudflare, siTailscale, siWireguard, siMysql, siMariadb, siPostgresql, siRedis, siMongodb, siSqlite, siMeilisearch, siMinio, siDocker, siPodman, siK3s, siKubernetes, siPm2, siGit, siLaravel, siVite, siPhpmyadmin, siUbuntu, siDebian, siCentos, siRockylinux, siAlmalinux, siFedora, siLinux, siClaude, siAnthropic, siGithubcopilot, siGooglegemini, siDeepseek, siOllama, siOpenrouter, siNextdotjs, siNuxt, siRemix, siAstro, siReact, siVuedotjs, siSvelte, siAngular, siNestjs, siExpress, siFastify, siHono, siDjango, siFastapi, siFlask, siTypescript, siJavascript, siSwift, siDart, siFlutter, siRust, siKotlin, siRuby, siRubyonrails, siHtml5, siGithub, siGitlab, siBitbucket, siTmux, siFfmpeg, siGnubash, siCurl, siMistralai, siX, siPerplexity, siNvidia, siAlibabacloud, siMinimax, siKimi, siMoonshotai, siMeta, type SimpleIcon
} from 'simple-icons';

// OpenAI's mark is not in simple-icons (trademark request); same 24x24 path format.
const siOpenaiMark = {
  title: 'OpenAI',
  hex: '10A37F',
  path: 'M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 6.046 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z'
} as SimpleIcon;

const siKiloMark = {
  title: 'Kilo Code',
  hex: 'FACC15',
  path: 'M4 3h3.5v7.5L15 3h4.5l-7.5 8 8 10H15.5l-6.2-7.8L7.5 15v6H4V3z'
} as SimpleIcon;

const siNousMark = {
  title: 'Nous Research',
  hex: 'E4E4E7',
  path: 'M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 3a7 7 0 1 1-7 7 7.008 7.008 0 0 1 7-7zm0 3.5a3.5 3.5 0 1 0 3.5 3.5A3.504 3.504 0 0 0 12 8.5z'
} as SimpleIcon;

const siGroqMark = {
  title: 'Groq',
  hex: 'F55036',
  path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h7v-8h-7v3h-1a5 5 0 1 1 5-5h3c0-5.52-3.48-10-7-10z'
} as SimpleIcon;

const siTogetherMark = {
  title: 'Together AI',
  hex: '3B82F6',
  path: 'M8.5 5a5.5 5.5 0 1 0 0 11 5.48 5.48 0 0 0 3.5-1.26A5.5 5.5 0 1 0 15.5 5a5.48 5.48 0 0 0-3.5 1.26A5.48 5.48 0 0 0 8.5 5zm0 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm7 0a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z'
} as SimpleIcon;

const siFireworksMark = {
  title: 'Fireworks AI',
  hex: 'A855F7',
  path: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2zm7 13l1.1 2.9L23 19l-2.9 1.1L19 23l-1.1-2.9L15 19l2.9-1.1L19 15z'
} as SimpleIcon;

const siCerebrasMark = {
  title: 'Cerebras',
  hex: 'F97316',
  path: 'M12 2L2 19.5h20L12 2zm0 5.2l5.6 9.8H6.4L12 7.2z'
} as SimpleIcon;

const siZaiMark = {
  title: 'Z.ai GLM',
  hex: '38BDF8',
  path: 'M4 4h16v3.2L9.4 16.8H20V20H4v-3.2L14.6 7.2H4V4z'
} as SimpleIcon;

const siCohereMark = {
  title: 'Cohere',
  hex: '39594D',
  path: 'M7.5 4A5.5 5.5 0 0 0 2 9.5v5A5.5 5.5 0 0 0 7.5 20h9a5.5 5.5 0 0 0 5.5-5.5v-1a3.5 3.5 0 0 0-3.5-3.5H12a2 2 0 0 1 0-4h6.5A3.5 3.5 0 0 0 15 4H7.5z'
} as SimpleIcon;

const siNebiusMark = {
  title: 'Nebius',
  hex: '6366F1',
  path: 'M4 3h4l8 11V3h4v18h-4L8 10v11H4V3z'
} as SimpleIcon;

const siSiliconFlowMark = {
  title: 'SiliconFlow',
  hex: '8B5CF6',
  path: 'M6 4h12l-3 6h5l-9 10 2-7H7l-1-9z'
} as SimpleIcon;

const siHyperbolicMark = {
  title: 'Hyperbolic',
  hex: 'EC4899',
  path: 'M4 4h3.5v6.2h9V4H20v16h-3.5v-6.3h-9V20H4V4z'
} as SimpleIcon;

const siDeepInfraMark = {
  title: 'DeepInfra',
  hex: '14B8A6',
  path: 'M4 4h8a8 8 0 1 1 0 16H4V4zm3.5 3.5v9H12a4.5 4.5 0 1 0 0-9H7.5z'
} as SimpleIcon;

// Order matters for text matching: more specific names first ("mariadb" before "mysql", "laravel" before "php").
const BRANDS: [id: string, icon: SimpleIcon, match: RegExp][] = [
  // AI providers (ids match AiProviderId / OAuth provider ids)
  ['copilot', siGithubcopilot, /copilot/i],
  ['claude', siClaude, /claude/i],
  ['anthropic', siAnthropic, /anthropic/i],
  ['codex', siOpenaiMark, /codex|chatgpt/i],
  ['openai', siOpenaiMark, /openai/i],
  ['gemini-cli', siGooglegemini, /gemini/i],
  ['gemini', siGooglegemini, /gemini/i],
  ['kimi', siKimi, /\bkimi\b/i],
  ['moonshot', siMoonshotai, /moonshot/i],
  ['kilocode', siKiloMark, /kilo\s*code|kilocode/i],
  ['muse', siMeta, /\bmuse\b|koda/i],
  ['nous', siNousMark, /\bnous\b/i],
  ['deepseek', siDeepseek, /deepseek/i],
  ['openrouter', siOpenrouter, /openrouter/i],
  ['ollama', siOllama, /ollama/i],
  ['groq', siGroqMark, /\bgroq\b/i],
  ['mistral', siMistralai, /mistral/i],
  ['xai', siX, /\bxai\b|grok/i],
  ['together', siTogetherMark, /together/i],
  ['fireworks', siFireworksMark, /fireworks/i],
  ['cerebras', siCerebrasMark, /cerebras/i],
  ['perplexity', siPerplexity, /perplexity|sonar/i],
  ['nvidia', siNvidia, /nvidia/i],
  ['dashscope', siAlibabacloud, /dashscope|qwen|alibaba/i],
  ['zai', siZaiMark, /\bz\.?ai\b|\bglm\b/i],
  ['minimax', siMinimax, /minimax/i],
  ['cohere', siCohereMark, /cohere/i],
  ['nebius', siNebiusMark, /nebius/i],
  ['siliconflow', siSiliconFlowMark, /siliconflow/i],
  ['hyperbolic', siHyperbolicMark, /hyperbolic/i],
  ['deepinfra', siDeepInfraMark, /deepinfra/i],
  ['nextjs', siNextdotjs, /next\.?js|^next$/i],
  ['nuxt', siNuxt, /nuxt/i],
  ['remix', siRemix, /\bremix\b/i],
  ['astro', siAstro, /\bastro\b/i],
  ['nestjs', siNestjs, /nestjs|nest\.js/i],
  ['express', siExpress, /\bexpress\b/i],
  ['fastify', siFastify, /\bfastify\b/i],
  ['hono', siHono, /\bhono\b/i],
  ['django', siDjango, /\bdjango\b/i],
  ['fastapi', siFastapi, /\bfastapi\b/i],
  ['flask', siFlask, /\bflask\b/i],
  ['rails', siRubyonrails, /rails/i],
  ['laravel', siLaravel, /laravel/i],
  ['vite', siVite, /\bvite\b|\bspa\b/i],
  ['react', siReact, /\breact\b/i],
  ['vue', siVuedotjs, /\bvue\b/i],
  ['svelte', siSvelte, /\bsvelte\b/i],
  ['angular', siAngular, /\bangular\b/i],
  ['flutter', siFlutter, /\bflutter\b/i],
  ['phpmyadmin', siPhpmyadmin, /phpmyadmin/i],
  ['composer', siComposer, /composer/i],
  ['php', siPhp, /\bphp/i],
  ['pnpm', siPnpm, /pnpm/i],
  ['yarn', siYarn, /\byarn\b/i],
  ['npm', siNpm, /^npm$/i],
  ['bun', siBun, /^bun$|oven\/bun/i],
  ['deno', siDeno, /\bdeno\b/i],
  ['node', siNodedotjs, /node/i],
  ['typescript', siTypescript, /\btypescript\b|^ts$/i],
  ['javascript', siJavascript, /\bjavascript\b|^js$/i],
  ['python', siPython, /python/i],
  ['go', siGo, /^go$|golang/i],
  ['rust', siRust, /\brust\b|cargo/i],
  ['swift', siSwift, /\bswift\b/i],
  ['dart', siDart, /\bdart\b/i],
  ['kotlin', siKotlin, /\bkotlin\b/i],
  ['ruby', siRuby, /\bruby\b/i],
  ['html', siHtml5, /\bhtml5?\b|static html/i],
  ['java', siOpenjdk, /java|openjdk|jdk/i],
  ['nginx', siNginx, /nginx/i],
  ['apache', siApache, /apache|httpd/i],
  ['caddy', siCaddy, /caddy/i],
  ['certbot', siLetsencrypt, /certbot|letsencrypt/i],
  ['cloudflared', siCloudflare, /cloudflare/i],
  ['tailscale', siTailscale, /tailscale/i],
  ['wireguard', siWireguard, /wireguard/i],
  ['mariadb', siMariadb, /mariadb/i],
  ['mysql', siMysql, /mysql/i],
  ['postgres', siPostgresql, /postgres/i],
  ['redis', siRedis, /redis|valkey/i],
  ['mongodb', siMongodb, /mongo/i],
  ['sqlite', siSqlite, /sqlite/i],
  ['meilisearch', siMeilisearch, /meilisearch/i],
  ['minio', siMinio, /minio/i],
  ['compose', siDocker, /compose/i],
  ['lazydocker', siDocker, /lazydocker/i],
  ['docker', siDocker, /docker/i],
  ['podman', siPodman, /podman/i],
  ['k3s', siK3s, /k3s/i],
  ['kubernetes', siKubernetes, /kubernetes|kubectl/i],
  ['pm2', siPm2, /pm2/i],
  ['git', siGit, /^git$/i],
  ['gh', siGithub, /^gh$|github cli/i],
  ['github', siGithub, /^github$/i],
  ['gitlab', siGitlab, /^gitlab$/i],
  ['bitbucket', siBitbucket, /^bitbucket$/i],
  ['tmux', siTmux, /tmux/i],
  ['ffmpeg', siFfmpeg, /ffmpeg/i],
  ['bash', siGnubash, /\bbash\b/i],
  ['curl', siCurl, /\bcurl\b/i],
  ['ubuntu', siUbuntu, /ubuntu/i],
  ['debian', siDebian, /debian/i],
  ['centos', siCentos, /centos/i],
  ['rocky', siRockylinux, /rocky/i],
  ['alma', siAlmalinux, /alma/i],
  ['fedora', siFedora, /fedora/i],
  ['linux', siLinux, /linux/i]
];
const BY_ID = new Map(BRANDS.map(([id, icon]) => [id, icon]));

/** Exact id first, then the first brand whose pattern appears in the text. */
export function findBrand(idOrText?: string | null): SimpleIcon | undefined {
  if (!idOrText) return undefined;
  return BY_ID.get(idOrText.toLowerCase()) ?? BRANDS.find(([, , re]) => re.test(idOrText))?.[1];
}

// Brand colors that vanish on our dark surfaces (near-black logos) get the text color instead.
const tooDark = (hex: string) => {
  const n = parseInt(hex, 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 60;
};

interface Props {
  /** product id ("nginx") or any text containing the product name */
  name?: string | null;
  className?: string;
  /** shown when no brand matches; omit to render nothing */
  fallback?: React.ReactNode;
  /** single-color logo in the current text color instead of the brand color */
  mono?: boolean;
}

/** Decorative: the product name is always rendered next to it as text, so the logo is aria-hidden. */
export function BrandIcon({ name, className = 'w-4 h-4', fallback = null, mono }: Props) {
  const icon = findBrand(name);
  if (!icon) return <>{fallback}</>;
  const color = mono || tooDark(icon.hex) ? 'currentColor' : `#${icon.hex}`;
  return (
    <svg role="img" aria-hidden viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill={color}>
      <path d={icon.path} />
    </svg>
  );
}
