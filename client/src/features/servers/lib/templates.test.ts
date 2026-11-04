import assert from 'node:assert/strict';
import { TEMPLATE_PRESETS, analyzeTemplate, formatTerminalCommand } from './templates.js';
import type { SoftwareItem } from '../api.js';

console.log('Testing template presets and analysis...');

// 1. Verify 4 presets exist
assert.equal(TEMPLATE_PRESETS.length, 4);
const [nodePreset, phpPreset, dockerPreset, hardeningPreset] = TEMPLATE_PRESETS;

assert.equal(nodePreset.id, 'node-app');
assert.equal(phpPreset.id, 'laravel-php');
assert.equal(dockerPreset.id, 'docker-host');
assert.equal(hardeningPreset.id, 'hardening');

// 2. Test Smart Skip when some tools are installed
const mockInventory: SoftwareItem[] = [
  { id: 'node', name: 'Node.js', category: 'runtime', installed: true, version: '20.14.0' },
  { id: 'nginx', name: 'Nginx', category: 'web', installed: true, version: '1.18.0' },
  { id: 'pm2', name: 'PM2', category: 'tooling', installed: false, version: null },
  { id: 'certbot', name: 'Certbot', category: 'web', installed: false, version: null }
];

const analysis = analyzeTemplate(nodePreset, mockInventory);

// Should skip node and nginx
assert.equal(analysis.itemsSkipped.length, 2);
assert.equal(analysis.itemsSkipped[0].tool.id, 'node');
assert.equal(analysis.itemsSkipped[0].installedVersion, '20.14.0');
assert.equal(analysis.itemsSkipped[1].tool.id, 'nginx');

// Should install pm2 and certbot
assert.equal(analysis.itemsToInstall.length, 2);
assert.equal(analysis.itemsToInstall[0].tool.id, 'pm2');
assert.equal(analysis.itemsToInstall[1].tool.id, 'certbot');

// Script should contain PM2 & Certbot commands, but NOT node install command
assert.ok(analysis.generatedScript.includes('npm install -g pm2'));
assert.ok(analysis.generatedScript.includes('apt-get install -y certbot'));
assert.ok(!analysis.generatedScript.includes('curl -fsSL https://deb.nodesource.com/setup_20.x'));

// 3. Test forceAll option
const forceAnalysis = analyzeTemplate(nodePreset, mockInventory, { forceAll: true });
assert.equal(forceAnalysis.itemsToInstall.length, 4);
assert.equal(forceAnalysis.itemsSkipped.length, 0);

// 4. Test formatTerminalCommand
const terminalCmd = formatTerminalCommand(analysis.generatedScript, '/tmp/test.sh');
assert.ok(terminalCmd.startsWith("cat << 'EOF' > /tmp/test.sh"));
assert.ok(terminalCmd.endsWith('bash /tmp/test.sh'));

console.log('All template unit tests passed successfully!');

