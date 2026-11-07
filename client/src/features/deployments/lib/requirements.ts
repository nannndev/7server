import type { DetectedEngine } from '@/features/git/types';

export interface DeployNeeds {
  engine?: DetectedEngine;
  /** repo ships a compose file with its database/cache */
  composeSidecar?: boolean;
  installCmd: string;
  buildCmd: string;
  startCmd: string;
  domain: string;
}

// Command word -> software ids (as named by the server's software scan and the install catalog).
const BY_COMMAND: Array<[RegExp, string[]]> = [
  [/\b(npm|npx|node)\b/, ['node']],
  [/\bpnpm\b/, ['node', 'pnpm']],
  [/\byarn\b/, ['node', 'yarn']],
  [/\bbun\b/, ['bun']],
  [/\bcomposer\b/, ['php', 'composer']],
  [/\b(php|artisan)\b/, ['php']],
  [/\b(pip3?|python3?|uvicorn|gunicorn)\b/, ['python']],
  [/\bgo\b/, ['go']]
];

/** Software a deploy needs on the target server, in install order. */
export function requiredSoftware(n: DeployNeeds): string[] {
  const ids = ['git'];
  if (n.engine === 'docker') {
    ids.push('docker', 'compose');
  } else {
    const cmds = `${n.installCmd}\n${n.buildCmd}\n${n.startCmd}`;
    for (const [re, tools] of BY_COMMAND) if (re.test(cmds)) ids.push(...tools);
    if (n.engine === 'native_php') ids.push('php', 'composer');
    if (n.startCmd.trim()) ids.push('node', 'pm2'); // the deploy script runs start commands under PM2
  }
  if (n.composeSidecar) ids.push('docker', 'compose');
  if (n.domain.trim()) {
    ids.push('nginx', 'certbot');
  } else if (n.engine === 'static' || (n.engine === 'native_php' && !n.startCmd.trim())) {
    ids.push('nginx');
  }
  return [...new Set(ids)];
}

/**
 * Which required tools to (re)install, given the server scan (id -> version, only installed ones).
 * Node counts as missing when it's older than the repo's declared major, and gets installed at that major.
 */
export function planInstall(required: string[], installed: Map<string, string | null>, nodeMajor?: number) {
  const nodeHave = parseInt(installed.get('node') || '', 10);
  const nodeTooOld = !!nodeMajor && installed.has('node') && Number.isFinite(nodeHave) && nodeHave < nodeMajor;
  const missing = required.filter((id) => !installed.has(id) || (id === 'node' && nodeTooOld));
  // NodeSource publishes setup_<major>.x for every LTS; below 20 we keep the catalog default.
  const versions: Record<string, string> = nodeMajor && nodeMajor > 20 ? { node: `${nodeMajor}.x` } : {};
  return { missing, versions, nodeTooOld };
}

/** Keeps the wanted port unless something already listens there; then the next free one above it. */
export function freePort(wanted: number, used: Iterable<number>): number {
  const taken = new Set(used);
  let p = wanted === 80 || wanted === 443 ? 3000 : wanted;
  while (taken.has(p) && p < 65535) p++;
  return p;
}
