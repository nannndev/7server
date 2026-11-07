// Run: npx tsx src/modules/exec/sudo.test.ts
import assert from 'node:assert/strict';
const { callsSudo, withoutSudo } = await import('./routes.js');

assert.ok(callsSudo('sudo mkdir -p /var/www/app'));
assert.ok(callsSudo('mkdir a && sudo chown www-data a'));
assert.ok(!callsSudo('echo pseudo test'), 'only the sudo command, not a word containing it');
assert.ok(!callsSudo('ls -la /var/www'));
assert.equal(withoutSudo('sudo mkdir -p /var/www/app'), 'mkdir -p /var/www/app');
assert.equal(withoutSudo('sudo -E tee /var/www/x > /dev/null <<EOF\nhi\nEOF'), 'tee /var/www/x > /dev/null <<EOF\nhi\nEOF');
assert.equal(withoutSudo('mkdir a && sudo chown www-data a'), 'mkdir a && chown www-data a');
assert.equal(withoutSudo('echo pseudo'), 'echo pseudo');
console.log('sudo exec ok');
