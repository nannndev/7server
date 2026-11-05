// `7server reset-password [username]`: sets a new password straight in the database, for a locked-out
// admin. Runs on the machine that holds the data (whoever can read 7server.db is already trusted).
// Reads the new password from the environment (RESET_PASSWORD) or from an interactive prompt.
// Signs the user out everywhere and records it in the audit log.
import readline from 'node:readline';
import { initUsersStore, getUsers, getUserByUsername, updateUser } from './modules/users/store.js';
import { writeAudit } from './infra/audit.js';

async function ask(question: string, hidden: boolean): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Echo nothing while typing: mute output after the prompt is written.
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let muted = false;
    out._writeToOutput = (s: string) => { if (!muted || s.includes('\n')) out.output.write(muted ? '\n' : s); };
    const p = new Promise<string>((r) => rl.question(question, r));
    muted = true;
    const answer = await p;
    rl.close();
    return answer;
  }
  const answer = await new Promise<string>((r) => rl.question(question, r));
  rl.close();
  return answer;
}

const fail = (msg: string): never => { console.error(`  ✗ ${msg}`); process.exit(1); };

await initUsersStore(undefined);
const users = getUsers();
if (!users.length) fail('No accounts exist yet. Start 7server and create the admin in the browser.');

const name = (process.argv[2] || 'admin').trim().toLowerCase();
const user = getUserByUsername(name);
if (!user) fail(`No user "${name}". Existing: ${users.map((u) => u.username).join(', ')}`);

let password = process.env.RESET_PASSWORD || '';
if (!password) {
  if (!process.stdin.isTTY) fail('No terminal to type in. Set RESET_PASSWORD instead.');
  password = await ask(`  New password for ${user!.username}: `, true);
  const again = await ask('  Repeat it: ', true);
  if (password !== again) fail('The passwords do not match.');
}
if (password.length < 8) fail('The password needs at least 8 characters.');

await updateUser(user!.id, { password, disabled: false });
writeAudit({ t: new Date().toISOString(), ip: 'local', method: 'AUTH', path: 'cli', detail: `action=password.reset.cli target=${user!.username}`, user: user!.username, role: user!.role, status: 200 });
console.log(`  ✓ Password for ${user!.username} changed. Other sessions of this user were signed out.`);
