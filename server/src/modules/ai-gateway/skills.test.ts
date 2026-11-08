import assert from 'node:assert/strict';
import { SKILLS, pickSkills, skillsSection } from './skills.js';

assert.deepEqual(pickSkills('webapps', '').map((s) => s.id), ['deploy', 'publish']);
assert.deepEqual(pickSkills('overview', 'kenapa nginx 502?').map((s) => s.id), ['performance', 'nginx']);
assert.deepEqual(pickSkills(undefined, 'docker container restart loop').map((s) => s.id), ['docker']);
assert.equal(pickSkills('terminal', 'hello').length, 0);
assert.equal(skillsSection('terminal', 'hello'), '');
assert.ok(pickSkills('webapps', 'cpu disk mysql nginx docker').length <= 2, 'prompt stays small');
// Playbooks are trusted prompt text: they must never tell the model to reveal secrets.
for (const s of SKILLS) assert.ok(!/cat .*\.env/.test(s.playbook), s.id);
// "build a site and deploy it" gets the publish playbook (survey first, tunnel/free port) on any tab.
assert.ok(pickSkills('overview', 'bikin web html calculator di /var/www langsung deploy').some((s) => s.id === 'publish'));
assert.match(skillsSection('webapps', 'deploy a landing page'), /Cloudflare Tunnel exists/);
assert.match(skillsSection('webapps', 'deploy a landing page'), /Never invent a \.local/);
console.log('skills ok');
