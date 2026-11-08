// Run (from client/): npx --prefix ../server tsx src/shared/ui/brand-icon.test.ts
import assert from 'node:assert/strict';
import { findBrand } from './brand-icon';

const t = (s: string | null | undefined) => findBrand(s)?.title;

// Software inventory ids
assert.equal(t('node'), 'Node.js');
assert.equal(t('mysql'), 'MySQL');
assert.equal(t('compose'), 'Docker');
assert.equal(t('certbot'), "Let's Encrypt");

// Web app types from the scanner: the framework wins over the language.
assert.equal(t('Laravel (PHP)'), 'Laravel');
assert.equal(t('Frontend (SPA / Vite)'), 'Vite');
assert.equal(t('PHP Application'), 'PHP');
assert.equal(t('Node.js'), 'Node.js');
assert.equal(t('Web App'), undefined);

// Docker images, OS banners, DB engine labels
assert.equal(t('mariadb:11'), 'MariaDB', 'mariadb is not mysql');
assert.equal(t('postgres:16-alpine'), 'PostgreSQL');
assert.equal(t('nginx:1.25-alpine'), 'NGINX');
assert.equal(t('phpmyadmin/phpmyadmin:latest'), 'phpMyAdmin', 'not the PHP logo');
assert.equal(t('Ubuntu 22.04.4 LTS'), 'Ubuntu');
assert.equal(t('Redis / Valkey'), 'Redis');
assert.equal(t('MySQL / MariaDB'), 'MariaDB', 'combined label: either logo is right; first match wins');

// AI Gateway OAuth & API-Key providers
assert.equal(t('Claude Pro/Max'), 'Claude');
assert.equal(t('ChatGPT / Codex'), 'OpenAI');
assert.equal(t('GitHub Copilot'), 'GitHub Copilot');
assert.equal(t('Gemini CLI'), 'Google Gemini');
assert.equal(t('Kimi Code'), 'Kimi');
assert.equal(t('Kilo Code'), 'Kilo Code');
assert.equal(t('Muse (Koda)'), 'Meta');
assert.equal(t('Nous Portal'), 'Nous Research');
assert.equal(t('Groq'), 'Groq');
assert.equal(t('Together AI'), 'Together AI');
assert.equal(t('Fireworks'), 'Fireworks AI');
assert.equal(t('Cerebras'), 'Cerebras');
assert.equal(t('GLM (Z.AI)'), 'Z.ai GLM');

// No false positives on generic words
assert.equal(t('my-app'), undefined);
assert.equal(t('github-runner'), undefined, 'git only matches the exact id');
assert.equal(t(''), undefined);
assert.equal(t(null), undefined);

console.log('brand-icon tests ok');
