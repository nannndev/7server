import assert from 'node:assert/strict';
import { TEMPLATE_PRESETS, MARKETPLACE_CATALOG, analyzeTemplate, formatTerminalCommand } from './templates.js';
import type { SoftwareItem } from '../api.js';

console.log('Testing template presets and analysis...');

// 1. Verify 10 presets and 39 marketplace tools exist
assert.equal(TEMPLATE_PRESETS.length, 10);
assert.equal(MARKETPLACE_CATALOG.length, 39);

const presetIds = TEMPLATE_PRESETS.map((p) => p.id);
assert.ok(presetIds.includes('node-app'));
assert.ok(presetIds.includes('laravel-php'));
assert.ok(presetIds.includes('python-ai'));
assert.ok(presetIds.includes('go-microservice'));
assert.ok(presetIds.includes('bun-modern'));
assert.ok(presetIds.includes('docker-host'));
assert.ok(presetIds.includes('database-cluster'));
assert.ok(presetIds.includes('edge-proxy'));
assert.ok(presetIds.includes('hardening'));
assert.ok(presetIds.includes('devops-media'));

const nodePreset = TEMPLATE_PRESETS.find((p) => p.id === 'node-app')!;

// 2. Test Smart Skip when some tools are installed
const mockInventory: SoftwareItem[] = [
  { id: 'node', name: 'Node.js', category: 'runtime', installed: true, version: '20.14.0' },
  { id: 'pnpm', name: 'pnpm', category: 'runtime', installed: true, version: '9.1.0' },
  { id: 'nginx', name: 'Nginx', category: 'web', installed: true, version: '1.24.0' },
  { id: 'git', name: 'Git', category: 'tooling', installed: true, version: '2.39.0' },
  { id: 'pm2', name: 'PM2', category: 'tooling', installed: false, version: null },
  { id: 'certbot', name: 'Certbot', category: 'web', installed: false, version: null }
];

const analysis = analyzeTemplate(nodePreset, mockInventory);

// Should skip node, pnpm, nginx, git
assert.equal(analysis.itemsSkipped.length, 4);
assert.equal(analysis.itemsSkipped[0].tool.id, 'node');
assert.equal(analysis.itemsSkipped[0].installedVersion, '20.14.0');

// Should install pm2 and certbot
assert.equal(analysis.itemsToInstall.length, 2);
assert.equal(analysis.itemsToInstall[0].tool.id, 'pm2');
assert.equal(analysis.itemsToInstall[1].tool.id, 'certbot');

// Script should contain PM2 & Certbot commands, but NOT node install command
assert.ok(analysis.generatedScript.includes('npm install -g pm2'));
assert.ok(analysis.generatedScript.includes('certbot python3-certbot-nginx'));
assert.ok(!analysis.generatedScript.includes('curl -fsSL https://deb.nodesource.com/setup_20.x'));

// 3. Test excludedToolIds option
const excludedAnalysis = analyzeTemplate(nodePreset, mockInventory, { excludedToolIds: ['certbot'] });
assert.equal(excludedAnalysis.itemsToInstall.length, 1);
assert.equal(excludedAnalysis.itemsToInstall[0].tool.id, 'pm2');
assert.equal(excludedAnalysis.itemsSkipped.length, 5);

// 4. Test forceAll option
const forceAnalysis = analyzeTemplate(nodePreset, mockInventory, { forceAll: true });
assert.equal(forceAnalysis.itemsToInstall.length, 6);
assert.equal(forceAnalysis.itemsSkipped.length, 0);

// 5. Test formatTerminalCommand
const terminalCmd = formatTerminalCommand(analysis.generatedScript, '/tmp/test.sh');
assert.ok(terminalCmd.startsWith("cat << 'EOF' > /tmp/test.sh"));
assert.ok(terminalCmd.endsWith('bash /tmp/test.sh'));

console.log('All template unit tests passed successfully!');
