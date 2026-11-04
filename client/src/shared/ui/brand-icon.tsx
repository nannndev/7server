// Real product logos (simple-icons, CC0). Only the icons imported here end up in the bundle.
// Look a product up by id or by free text ("Laravel (PHP)", "nginx:1.25-alpine", "Ubuntu 22.04.4 LTS").
import React from 'react';
import {
  siNodedotjs, siNpm, siPnpm, siBun, siPhp, siComposer, siPython, siGo, siOpenjdk,
  siNginx, siApache, siCaddy, siLetsencrypt,
  siMysql, siMariadb, siPostgresql, siRedis, siMongodb, siSqlite,
  siDocker, siPm2, siGit, siLaravel, siVite, siPhpmyadmin,
  siUbuntu, siDebian, siCentos, siRockylinux, siAlmalinux, siFedora, siLinux,
  type SimpleIcon
} from 'simple-icons';

// Order matters for text matching: more specific names first ("mariadb" before "mysql", "laravel" before "php").
const BRANDS: [id: string, icon: SimpleIcon, match: RegExp][] = [
  ['laravel', siLaravel, /laravel/i],
  ['vite', siVite, /\bvite\b|\bspa\b/i],
  ['phpmyadmin', siPhpmyadmin, /phpmyadmin/i],
  ['composer', siComposer, /composer/i],
  ['php', siPhp, /\bphp/i],
  ['pnpm', siPnpm, /pnpm/i],
  ['npm', siNpm, /^npm$/i],
  ['bun', siBun, /^bun$|oven\/bun/i],
  ['node', siNodedotjs, /node/i],
  ['python', siPython, /python/i],
  ['go', siGo, /^go$|golang/i],
  ['java', siOpenjdk, /java|openjdk|jdk/i],
  ['nginx', siNginx, /nginx/i],
  ['apache', siApache, /apache|httpd/i],
  ['caddy', siCaddy, /caddy/i],
  ['certbot', siLetsencrypt, /certbot|letsencrypt/i],
  ['mariadb', siMariadb, /mariadb/i],
  ['mysql', siMysql, /mysql/i],
  ['postgres', siPostgresql, /postgres/i],
  ['redis', siRedis, /redis|valkey/i],
  ['mongodb', siMongodb, /mongo/i],
  ['sqlite', siSqlite, /sqlite/i],
  ['compose', siDocker, /compose/i],
  ['docker', siDocker, /docker/i],
  ['pm2', siPm2, /pm2/i],
  ['git', siGit, /^git$/i],
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
