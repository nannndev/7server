import { sq } from '../../databases/shell.js';
import { DeploySpec } from './types.js';

export function buildInstallBlock(s: DeploySpec, appDir: string): string {
  const cmd = s.installCmd.trim();
  const echoed = cmd.replace(/[\\"$`]/g, '\\$&');
  // Smart lockfile & monorepo fallback when standard npm ci / npm install is used
  if (/^npm\s+(ci|install|i)(\s|$)/.test(cmd)) {
    return `echo "$ ${echoed}"
if [ -f pnpm-lock.yaml ] || [ -f ${sq(appDir)}/pnpm-lock.yaml ] || [ -f ${sq(appDir)}/pnpm-workspace.yaml ]; then
  echo "Detected pnpm lockfile/workspace; installing with pnpm..."
  command -v pnpm >/dev/null 2>&1 || corepack enable pnpm 2>/dev/null || npm install -g pnpm
  run_step 'pnpm install --no-frozen-lockfile'
elif [ -f yarn.lock ] || [ -f ${sq(appDir)}/yarn.lock ]; then
  echo "Detected yarn.lock; installing with yarn..."
  command -v yarn >/dev/null 2>&1 || corepack enable yarn 2>/dev/null || npm install -g yarn
  run_step 'yarn install'
elif [ -f bun.lockb ] || [ -f bun.lock ] || [ -f ${sq(appDir)}/bun.lockb ] || [ -f ${sq(appDir)}/bun.lock ]; then
  echo "Detected bun lockfile; installing with bun..."
  run_step 'bun install'
elif [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then
  run_step ${sq(`${cmd}${!/--no-progress|--loglevel/.test(cmd) ? ' --no-audit --no-fund --loglevel=http' : ''} || npm install --no-audit --no-fund --loglevel=http`)}
else
  echo "No package-lock.json in $PWD; running npm install..."
  run_step 'npm install --no-audit --no-fund --loglevel=http'
fi`;
  }
  return `echo "$ ${echoed}"
run_step ${sq(cmd)}`;
}

export function buildCompileBlock(s: DeploySpec, appDir: string): string {
  const cmd = s.buildCmd.trim();
  const echoed = cmd.replace(/[\\"$`]/g, '\\$&');
  return `export PATH="$PWD/node_modules/.bin:${sq(appDir)}/node_modules/.bin:$PATH"
echo "$ ${echoed}"
run_step ${sq(cmd)}`;
}

