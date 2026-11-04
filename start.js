import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\x1b[1;36m====================================================\x1b[0m');
console.log('\x1b[1;32m  ⚡ VPS Hub - Multi-VPS Management & Terminal (TS)  \x1b[0m');
console.log('\x1b[1;36m====================================================\x1b[0m\n');

// Start Backend Server (TypeScript tsx)
const serverProcess = spawn('npm run dev', [], {
  cwd: path.join(__dirname, 'server'),
  stdio: 'inherit',
  shell: true
});

// Start Frontend Client (Vite React TypeScript)
const clientProcess = spawn('npm run dev', [], {
  cwd: path.join(__dirname, 'client'),
  stdio: 'inherit',
  shell: true
});

function cleanup() {
  console.log('\n\x1b[33mShutting down VPS Hub...\x1b[0m');
  try { serverProcess.kill(); } catch (e) {}
  try { clientProcess.kill(); } catch (e) {}
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
