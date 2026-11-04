// Tiny shell-building helpers shared by adapters and the runner.
import { badRequest } from '../http/errors.js';

/** Single-quote for POSIX sh. Safe for any string, including quotes and newlines. */
export const sq = (v: string) => `'${String(v).replace(/'/g, `'\\''`)}'`;

const IDENT = /^[A-Za-z0-9_$.\-]{1,128}$/;

/** Database/schema/table names from listings. Anything odd (spaces, quotes) is refused, not escaped. */
export function ident(v: unknown, what = 'Nama'): string {
  const s = String(v ?? '');
  if (!IDENT.test(s)) throw badRequest(`${what} tidak valid: ${s.slice(0, 60)}`);
  return s;
}

export const CONTAINER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/** `export K='v'; ` prefix for env vars inside the target shell. Keys are restricted to [A-Z_]. */
export function envPrefix(env: Record<string, string> = {}): string {
  return Object.entries(env)
    .map(([k, v]) => {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(k)) throw badRequest(`env key tidak valid: ${k}`);
      return `export ${k}=${sq(v)}; `;
    })
    .join('');
}

/** `-h host -P port`-style flags; omitted when unset. */
export const flag = (name: string, v: string | number | undefined) => (v === undefined || v === '' ? '' : ` ${name} ${sq(String(v))}`);

/** Reads the first non-empty env var from a list, inside the target shell. */
export const firstEnv = (names: string[] = []) =>
  names.length ? names.map((n) => `\${${n}:-`).join('') + '}'.repeat(names.length) : '';
