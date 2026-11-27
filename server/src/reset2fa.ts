// `7server reset-2fa [username]`: disables TOTP 2FA straight in the database.
// Crucial emergency rescue command for self-hosted instances if admin loses phone/authenticator app.
import { initUsersStore, getUsers, getUserByUsername, updateUser } from './modules/users/store.js';
import { writeAudit } from './infra/audit.js';

const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};

await initUsersStore(undefined);
const users = getUsers();
if (!users.length) fail('No accounts exist yet.');

const name = (process.argv[2] || 'admin').trim().toLowerCase();
const user = getUserByUsername(name) ?? fail(`No user "${name}". Existing: ${users.map((u) => u.username).join(', ')}`);

if (!user.totpEnabled) {
  console.log(`  ℹ 2FA is already disabled for user "${user.username}".`);
  process.exit(0);
}

await updateUser(user.id, {
  totpEnabled: false,
  totpSecretEnc: null,
  totpRecoveryHashes: []
});

writeAudit({
  t: new Date().toISOString(),
  ip: 'local',
  method: 'AUTH',
  path: 'cli',
  detail: `action=2fa.reset.cli target=${user.username}`,
  user: user.username,
  role: user.role,
  status: 200
});

console.log(`  ✓ 2FA has been disabled for "${user.username}". You can now log in with just password.`);
