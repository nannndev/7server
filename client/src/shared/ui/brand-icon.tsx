// Real product logos (simple-icons, CC0). Only the icons imported here end up in the bundle.
// Look a product up by id or by free text ("Laravel (PHP)", "nginx:1.25-alpine", "Ubuntu 22.04.4 LTS").
import React from 'react';
import {
  siNodedotjs, siNpm, siPnpm, siYarn, siBun, siDeno, siPhp, siComposer, siPython, siGo, siOpenjdk, siNginx, siApache, siCaddy, siLetsencrypt, siCloudflare, siTailscale, siWireguard, siMysql, siMariadb, siPostgresql, siRedis, siMongodb, siSqlite, siMeilisearch, siMinio, siDocker, siPodman, siK3s, siKubernetes, siPm2, siGit, siLaravel, siVite, siPhpmyadmin, siUbuntu, siDebian, siCentos, siRockylinux, siAlmalinux, siFedora, siLinux, siClaude, siAnthropic, siGithubcopilot, siGooglegemini, siDeepseek, siOllama, siOpenrouter, siNextdotjs, siNuxt, siRemix, siAstro, siReact, siVuedotjs, siSvelte, siAngular, siNestjs, siExpress, siFastify, siHono, siDjango, siFastapi, siFlask, siTypescript, siJavascript, siSwift, siDart, siFlutter, siRust, siKotlin, siRuby, siRubyonrails, siHtml5, siGithub, siGitlab, siBitbucket, siTmux, siFfmpeg, siGnubash, siCurl, siMistralai, siX, siPerplexity, siNvidia, siAlibabacloud, siMinimax, type SimpleIcon
} from 'simple-icons';

// OpenAI's mark is not in simple-icons (trademark request); same 24x24 path format.
const siOpenaiMark = {
  title: 'OpenAI',
  hex: '412991',
  path: 'M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z'
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
  ['deepseek', siDeepseek, /deepseek/i],
  ['openrouter', siOpenrouter, /openrouter/i],
  ['ollama', siOllama, /ollama/i],
  ['mistral', siMistralai, /mistral/i],
  ['xai', siX, /\bxai\b|grok/i],
  ['perplexity', siPerplexity, /perplexity|sonar/i],
  ['nvidia', siNvidia, /nvidia/i],
  ['dashscope', siAlibabacloud, /dashscope|qwen|alibaba/i],
  ['minimax', siMinimax, /minimax/i],
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
