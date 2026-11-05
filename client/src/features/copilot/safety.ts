// Decides which AI-proposed shell commands may run without asking. Conservative allowlist: every
// segment of a pipeline/chain must be a known read-only command, with no redirection, substitution,
// or follow/interactive flags (exec has a 30s timeout). Anything else needs explicit approval.
// Prompt-injection stance: the AI reads server output, which an attacker may control (logs, files).
// So auto-run also excludes anything that talks to the network (exfiltration channel) and anything
// that reads secrets (they would be sent to the AI provider).
// shortcut: allowlist is hand-written; extend READ_ONLY when the AI keeps asking for a harmless tool.

const READ_ONLY = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'egrep', 'zgrep', 'wc', 'sort', 'uniq', 'cut', 'tr', 'column',
  'df', 'du', 'free', 'uptime', 'uname', 'hostname', 'hostnamectl', 'whoami', 'id', 'w', 'who', 'last',
  'ps', 'pgrep', 'ss', 'netstat', 'lsof', 'date', 'timedatectl', 'lsblk', 'blkid', 'findmnt', 'mount',
  'stat', 'file', 'which', 'whereis', 'type', 'echo', 'printf', 'nproc', 'lscpu', 'vmstat', 'iostat',
  'nginx', 'apachectl', 'certbot',
  'systemctl', 'journalctl', 'docker', 'crontab', 'find', 'sed', 'awk', 'top', 'test', 'true', 'basename', 'dirname',
  'php', 'node', 'python3', 'mysql', 'psql', 'pm2', 'ufw', 'iptables', 'getent', 'sha256sum', 'md5sum', 'openssl'
]);

/** Per-command extra rules; return true when that particular use is read-only. */
const RULES: Record<string, (args: string) => boolean> = {
  systemctl: (a) => /^(status|list-units|list-unit-files|list-timers|is-active|is-enabled|is-failed)\b|^--failed\b|^$/.test(a.replace(/^(--no-pager|-l|--full)\s+/g, '').trim()),
  journalctl: (a) => !/(^|\s)(-f|--follow|--vacuum\S*|--rotate|--flush|--sync)\b/.test(a),
  docker: (a) => /^(ps|images|logs|info|version|top|port|diff|history|stats\s+--no-stream|network\s+ls|volume\s+ls|image\s+ls|container\s+ls|system\s+df|compose\s+(ps|ls|logs))\b/.test(a.trim()) && !/(^|\s)(-f|--follow)\b/.test(a),
  tail: (a) => !/(^|\s)(-f|-F|--follow)\b/.test(a),
  top: (a) => /(^|\s)-b/.test(a),
  // only line printing: `sed -n '10,20p' file` (sed's e/w commands execute or write)
  sed: (a) => /^-n\s+(['"]?)\$?\d*(,\s*\$?\d+)?p\1(\s|$)/.test(a.trim()),
  awk: (a) => !/system\s*\(|>\s*"/.test(a),
  find: (a) => !/(^|\s)(-delete|-exec|-execdir|-ok|-fprint\S*)\b/.test(a),
  nginx: (a) => /^-(t|v|V)\b/.test(a.trim()), // not -T: dumps full config incl. credentials
  apachectl: (a) => /^(-t|-S|configtest|-v)\b/.test(a.trim()),
  certbot: (a) => /^certificates\b/.test(a.trim()),
  crontab: (a) => /^-l\b/.test(a.trim()) || /^-u\s+\S+\s+-l\b/.test(a.trim()),
  openssl: (a) => /^(x509\s.*-noout|version)\b/.test(a.trim()),
  php: (a) => /^(-v|-m|-i|--version|--ini)\b/.test(a.trim()),
  node: (a) => /^(-v|--version)\b/.test(a.trim()),
  python3: (a) => /^(-V|--version)\b/.test(a.trim()),
  mysql: (a) => /^(-V|--version)\b/.test(a.trim()),
  psql: (a) => /^(-V|--version)\b/.test(a.trim()),
  pm2: (a) => /^(ls|list|status|logs\s.*--nostream|--version)\b/.test(a.trim()),
  ufw: (a) => /^status\b/.test(a.trim()),
  iptables: (a) => /^(-L|-S|-nL|-nvL|-vnL|-t\s+\w+\s+-(L|S|nL|nvL))\b/.test(a.trim()),
  mount: (a) => a.trim() === '' || /^-l\b/.test(a.trim())
};

// Paths/words that point at credentials: reading them is never automatic.
const SENSITIVE = /(\/etc\/(shadow|gshadow|sudoers)|\.ssh\/|id_(rsa|ed25519|ecdsa|dsa)|authorized_keys|\.env\b|\.pem\b|\.key\b|\.p12\b|\.pfx\b|\.kube|\.aws|\.docker\/config|\.npmrc|\.pgpass|\.my\.cnf|\.netrc|\.git-credentials|wp-config|\/proc\/[^\s]*\/environ|secret|passw|credential|token|private|letsencrypt\/(live|archive)|\bprintenv\b|history\b)/i;

/** true = safe to auto-run. */
export function isReadOnlyCommand(command: string): boolean {
  const cmd = command.trim();
  if (!cmd) return false;
  if (SENSITIVE.test(cmd)) return false;
  // Redirection to files, command substitution, background jobs, heredocs, sudo/env tricks.
  if (/(^|[^0-9&])>|>>|\$\(|`|<<|&\s*$|(^|[;&|]\s*)(sudo|su|env|nohup|xargs|eval|exec|source|\.)\s/.test(cmd.replace(/2>&1|2>\/dev\/null|>\/dev\/null/g, ''))) return false;
  const lines = cmd.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) return false;
  return lines.every((line) =>
    line.split(/\|\||&&|;|\|/).every((seg) => {
      const s = seg.trim().replace(/^(\w+=\S*\s+)+/, '');
      if (!s) return true;
      const [bin, ...rest] = s.split(/\s+/);
      const name = bin.replace(/^.*\//, '');
      if (!READ_ONLY.has(name)) return false;
      const rule = RULES[name];
      return rule ? rule(rest.join(' ')) : true;
    })
  );
}

const SHELL_LANGS = ['', 'bash', 'sh', 'shell', 'zsh', 'console'];

export type Segment = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string; shell: boolean };

/** Splits an AI message into text and fenced code; an unclosed fence (still streaming) runs to the end. */
export function parseSegments(content: string): Segment[] {
  return content.split(/(```[\s\S]*?(?:```|$))/g).filter(Boolean).map((part): Segment => {
    if (!part.startsWith('```')) return { type: 'text', text: part };
    const body = part.slice(3).replace(/```$/, '');
    const nl = body.indexOf('\n');
    const lang = (nl >= 0 ? body.slice(0, nl) : '').trim().toLowerCase();
    const code = (nl >= 0 ? body.slice(nl + 1) : body).trim();
    return { type: 'code', lang, code, shell: SHELL_LANGS.includes(lang) && !!code };
  });
}

/** Shell blocks the agent may run, in order (other languages are only shown). */
export const extractCommands = (content: string) =>
  parseSegments(content).flatMap((s) => (s.type === 'code' && s.shell ? [s.code] : []));

/** Destructive patterns: extra confirmation even after the user clicks Run. */
export const isRiskyCommand = (cmd: string) =>
  [/\brm\s+-[rf]{1,2}\b/i, /\bdrop\s+(database|table)\b/i, /\biptables\s+-F\b/i, /\breboot\b/i, /\bshutdown\b/i, /\bmkfs\b/i, /\bdd\s+if=/i, /\btruncate\b/i, /\bdocker\s+(system|volume|image)\s+prune\b/i].some((r) => r.test(cmd));

// Text in server output that tries to talk to the AI. Not a guarantee, just a tripwire that turns
// auto-run off for the next step and warns the user.
const INJECTION = /(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|your|system)\s+(instructions?|prompts?|rules?|messages?)|\byou\s+are\s+now\b|\bnew\s+instructions?\b|\bsystem\s+prompt\b|<\|im_(start|end)\|>|\[\/?INST\]|<\/?(system|assistant|instructions?)>|\b(as\s+an?\s+ai|dear\s+(ai|assistant|llm|model))\b|\bassistant\s*:/i;
export const looksLikeInjection = (text: string) => INJECTION.test(text);

/** Wraps untrusted server output so the model can tell data from instructions (random fence per call). */
export function fenceUntrusted(label: string, body: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `<<<UNTRUSTED_OUTPUT ${id} ${label}>>>\n${body.split(id).join('')}\n<<<END_UNTRUSTED_OUTPUT ${id}>>>`;
}
