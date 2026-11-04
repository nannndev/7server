import assert from 'node:assert';
import { TERMINAL_THEMES, BUILTIN_SHORTCUTS, type TerminalThemeId } from './terminalThemes';

console.log('Testing terminal themes and shortcuts...');

// 1. Verify Themes
const expectedThemeIds: TerminalThemeId[] = [
  'dark-doff',
  'tokyo-night',
  'dracula',
  'cyberpunk',
  'monokai',
  'nord',
  'github-dark'
];

for (const id of expectedThemeIds) {
  const cfg = TERMINAL_THEMES[id];
  assert.ok(cfg, `Theme ${id} must exist in TERMINAL_THEMES`);
  assert.strictEqual(cfg.id, id);
  assert.ok(cfg.name.length > 0, `Theme ${id} must have a non-empty name`);
  assert.ok(cfg.dotColor.startsWith('#'), `Theme ${id} dotColor must be a valid hex color`);
  assert.ok(cfg.theme.background, `Theme ${id} must define background color`);
  assert.ok(cfg.theme.foreground, `Theme ${id} must define foreground color`);
  assert.ok(cfg.theme.cursor, `Theme ${id} must define cursor color`);
}

// 2. Verify Built-in Shortcuts
assert.ok(BUILTIN_SHORTCUTS.length >= 20, `Expected at least 20 shortcuts, got ${BUILTIN_SHORTCUTS.length}`);

const validCategories = new Set(['monitoring', 'services', 'docker', 'network', 'maintenance']);
const shortcutIds = new Set<string>();

for (const sc of BUILTIN_SHORTCUTS) {
  assert.ok(sc.id, 'Shortcut must have an id');
  assert.ok(!shortcutIds.has(sc.id), `Duplicate shortcut id: ${sc.id}`);
  shortcutIds.add(sc.id);

  assert.ok(sc.label && sc.label.trim().length > 0, `Shortcut ${sc.id} must have a label`);
  assert.ok(sc.cmd && sc.cmd.trim().length > 0, `Shortcut ${sc.id} must have a non-empty command`);
  assert.ok(validCategories.has(sc.category), `Shortcut ${sc.id} category invalid: ${sc.category}`);
}

console.log('All terminal themes and shortcuts tests passed successfully!');

