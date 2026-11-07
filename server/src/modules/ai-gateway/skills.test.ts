import assert from 'node:assert/strict';
import { SKILLS, pickSkills, skillsSection } from './skills.js';

assert.deepEqual(pickSkills('webapps', '').map((s) => s.id), ['deploy']);
assert.deepEqual(pickSkills('overview', 'kenapa nginx 502?').map((s) => s.id), ['performance', 'nginx']);
assert.deepEqual(pickSkills(undefined, 'docker container restart loop').map((s) => s.id), ['docker']);
assert.equal(pickSkills('terminal', 'hello').length, 0);
assert.equal(skillsSection('terminal', 'hello'), '');
assert.ok(pickSkills('webapps', 'cpu disk mysql nginx docker').length <= 2, 'prompt stays small');
// Playbooks are trusted prompt text: they must never tell the model to reveal secrets.
for (const s of SKILLS) assert.ok(!/cat .*\.env/.test(s.playbook), s.id);
console.log('skills ok');
