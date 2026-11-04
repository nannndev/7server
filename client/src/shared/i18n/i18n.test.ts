// Run (from client/): npx --prefix ../server tsx src/shared/i18n/i18n.test.ts
import assert from 'node:assert/strict';
import { en } from './en';
import { id } from './id';
import { format, translate } from './index';

// Same key set in both catalogs (the type already enforces this; this guards against `as any` edits).
assert.deepEqual(Object.keys(id).sort(), Object.keys(en).sort());

// Every {var} used in English must exist in the Indonesian string too, or interpolation silently breaks.
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
for (const k of Object.keys(en) as (keyof typeof en)[]) {
  assert.deepEqual(vars(id[k]), vars(en[k]), `placeholder mismatch in ${k}`);
  assert.ok(id[k].trim().length > 0, `empty translation: ${k}`);
}

assert.equal(format('Servers · {n}', { n: 3 }), 'Servers · 3');
assert.equal(format('{a} and {b}', { a: 1 }), '1 and {b}'); // unknown var left visible, not swallowed
assert.equal(format('no vars'), 'no vars');
assert.equal(translate('id', 'nav.servers', { n: 2 }), 'Server · 2');
assert.equal(translate('en', 'fleet.onlineOffline', { online: 2, offline: 1 }), '2 online · 1 offline');

console.log('i18n tests ok');
