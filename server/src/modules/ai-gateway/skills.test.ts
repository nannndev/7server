import assert from 'node:assert/strict';
import { SKILLS, DEFAULT_DEVOPS_SKILL, pickSkills, skillsSection } from './skills.js';
import { preferencesSection } from './copilot.js';

assert.deepEqual(pickSkills('webapps', '').map((s) => s.id), ['deploy', 'publish']);
assert.deepEqual(pickSkills('overview', 'kenapa nginx 502?').map((s) => s.id), ['performance', 'nginx']);
assert.deepEqual(pickSkills(undefined, 'docker container restart loop').map((s) => s.id), ['docker']);
assert.deepEqual(pickSkills(undefined, 'setup github actions ci/cd pipeline and dockerfile').map((s) => s.id), ['devops-engineer']);
assert.deepEqual(pickSkills(undefined, 'create responsive react tailwind frontend ui design').map((s) => s.id), ['frontend']);
assert.ok(pickSkills(undefined, 'review ui-taste uizze anti-slop typography and redesign').some((s) => s.id === 'frontend'));
assert.ok(pickSkills(undefined, 'bikin tampilan dashboard dark mode pakai tailwind').some((s) => s.id === 'frontend'));
assert.deepEqual(pickSkills(undefined, 'triage bug issue #42 and reproduce regression').map((s) => s.id), ['triage']);
assert.deepEqual(pickSkills(undefined, 'implement fullstack rest api with prisma schema migration and jwt auth').map((s) => s.id), ['fullstack']);
assert.deepEqual(pickSkills(undefined, 'audit xss csrf sqli and ufw firewall hardening').map((s) => s.id), ['security']);
assert.ok(DEFAULT_DEVOPS_SKILL.includes('Build / Deploy / Ops Hats'));
assert.equal(pickSkills('terminal', 'hello').length, 0);
assert.equal(skillsSection('terminal', 'hello'), '');
assert.ok(pickSkills('webapps', 'cpu disk mysql nginx docker').length <= 2, 'prompt stays small');
// Playbooks are trusted prompt text: they must never tell the model to reveal secrets.
for (const s of SKILLS) assert.ok(!/cat .*\.env/.test(s.playbook), s.id);
// "build a site and deploy it" gets the publish playbook (survey first, tunnel/free port) on any tab.
assert.ok(pickSkills('overview', 'bikin web html calculator di /var/www langsung deploy').some((s) => s.id === 'publish'));
assert.match(skillsSection('webapps', 'deploy a landing page'), /Cloudflare Tunnel exists/);
assert.match(skillsSection('webapps', 'deploy a landing page'), /Never invent a \.local/);
assert.match(preferencesSection({ personality: 'grumpy' }), /GRUMPY/);
assert.match(preferencesSection({ personality: 'comedic' }), /COMEDIC/);
assert.match(preferencesSection({ personality: 'casual' }), /CASUAL/);
assert.match(preferencesSection({ personality: 'calm' }), /CALM/);
assert.equal(preferencesSection({ personality: 'default' }), '');
console.log('skills ok');
