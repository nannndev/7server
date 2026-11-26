import { 
  User, 
  SafeUser, 
  Session, 
  Role, 
  Permission, 
  ROLE_PERMISSIONS 
} from './types.js';
import { 
  getUsers, 
  getSafeUsers, 
  getUserById, 
  getUserByUsername, 
  createUser as dbCreateUser, 
  updateUser as dbUpdateUser, 
  deleteUser as dbDeleteUser,
  recordUserLogin,
  getAllSessions,
  getUserSessions,
  createSession as dbCreateSession,
  deleteSession as dbDeleteSession,
  deleteSessionsByUserId
} from './store.js';
import { verifyPassword, hashPassword } from './passwords.js';
import { writeAudit } from '../../infra/audit.js';
import { encrypt, decrypt } from '../../infra/crypto.js';
import { 
  generateTotpSecret, 
  generateOtpAuthUri, 
  verifyTotpCode, 
  generateRecoveryCodes, 
  hashRecoveryCode 
} from './totp.js';

// Pending MFA login challenge tickets (valid for 5 minutes)
interface MfaChallenge {
  userId: string;
  expiresAt: number;
  ip: string;
  userAgent: string;
}
const mfaChallenges = new Map<string, MfaChallenge>();

export type LoginServiceResult =
  | {
      requiresMfa: true;
      mfaTicket: string;
      user: { id: string; username: string };
    }
  | {
      requiresMfa?: false;
      token: string;
      user: SafeUser;
      permissions: Permission[];
      session: { id: string; expiresAt: number };
    };

export async function loginService(params: {
  username?: string;
  password?: string;
  ip: string;
  userAgent: string;
}): Promise<LoginServiceResult> {
  const username = (params.username || 'admin').trim();
  const password = String(params.password || '');

  const user = getUserByUsername(username);
  if (!user) {
    writeAudit({
      t: new Date().toISOString(),
      ip: params.ip,
      method: 'AUTH',
      path: '/api/login',
      detail: `action=login.failed username=${username} reason=user_not_found`,
      status: 401
    });
    throw new Error('Username atau password salah');
  }

  if (user.disabled) {
    writeAudit({
      t: new Date().toISOString(),
      ip: params.ip,
      method: 'AUTH',
      path: '/api/login',
      detail: `action=login.failed username=${username} reason=account_disabled`,
      status: 403
    });
    const err: any = new Error('Akun Anda dinonaktifkan oleh administrator');
    err.code = 'ACCOUNT_DISABLED';
    throw err;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    writeAudit({
      t: new Date().toISOString(),
      ip: params.ip,
      method: 'AUTH',
      path: '/api/login',
      detail: `action=login.failed username=${username} reason=invalid_password`,
      status: 401
    });
    throw new Error('Username atau password salah');
  }

  // 2FA / TOTP Check: If enabled, return MFA ticket challenge
  if (user.totpEnabled && user.totpSecretEnc) {
    const mfaTicket = crypto.randomUUID();
    mfaChallenges.set(mfaTicket, {
      userId: user.id,
      expiresAt: Date.now() + 5 * 60_000,
      ip: params.ip,
      userAgent: params.userAgent
    });

    writeAudit({
      t: new Date().toISOString(),
      ip: params.ip,
      method: 'AUTH',
      path: '/api/login',
      detail: `action=login.mfa_prompt username=${user.username}`,
      user: user.username,
      status: 200
    });

    return {
      requiresMfa: true,
      mfaTicket,
      user: { id: user.id, username: user.username }
    };
  }

  const { token, session } = dbCreateSession({
    userId: user.id,
    username: user.username,
    role: user.role,
    ip: params.ip,
    userAgent: params.userAgent
  });

  recordUserLogin(user.id);

  writeAudit({
    t: new Date().toISOString(),
    ip: params.ip,
    method: 'AUTH',
    path: '/api/login',
    detail: `action=login.success username=${user.username} role=${user.role} sessionId=${session.id}`,
    user: user.username,
    role: user.role,
    status: 200
  });

  const { passwordHash, ...safe } = user;
  return {
    token,
    user: safe,
    permissions: ROLE_PERMISSIONS[user.role],
    session: { id: session.id, expiresAt: session.expiresAt }
  };
}

export async function verifyMfaLoginService(params: {
  mfaTicket: string;
  code: string;
  ip: string;
  userAgent: string;
}): Promise<{ token: string; user: SafeUser; permissions: Permission[]; session: { id: string; expiresAt: number } }> {
  const challenge = mfaChallenges.get(params.mfaTicket);
  if (!challenge || challenge.expiresAt < Date.now()) {
    mfaChallenges.delete(params.mfaTicket);
    throw new Error('Sesi verifikasi 2FA telah kedaluwarsa, silakan login ulang');
  }

  const user = getUserById(challenge.userId);
  if (!user || user.disabled) {
    mfaChallenges.delete(params.mfaTicket);
    throw new Error('User tidak ditemukan atau dinonaktifkan');
  }

  const secret = decrypt(user.totpSecretEnc || '');
  if (!secret) {
    mfaChallenges.delete(params.mfaTicket);
    throw new Error('Konfigurasi 2FA rusak pada akun ini');
  }

  const trimmedCode = (params.code || '').trim();
  let verified = false;
  let usedRecovery = false;

  if (trimmedCode.length === 6 && /^\d+$/.test(trimmedCode)) {
    verified = verifyTotpCode(secret, trimmedCode);
  } else {
    // Check emergency recovery codes
    const hashed = hashRecoveryCode(trimmedCode);
    const hashes = user.totpRecoveryHashes || [];
    const matchIdx = hashes.indexOf(hashed);
    if (matchIdx !== -1) {
      verified = true;
      usedRecovery = true;
      // Invalidate the used recovery code
      const updatedHashes = hashes.filter((_, idx) => idx !== matchIdx);
      await dbUpdateUser(user.id, { totpRecoveryHashes: updatedHashes });
    }
  }

  if (!verified) {
    writeAudit({
      t: new Date().toISOString(),
      ip: params.ip,
      method: 'AUTH',
      path: '/api/login/totp',
      detail: `action=login.mfa_failed username=${user.username}`,
      user: user.username,
      status: 401
    });
    throw new Error('Kode autentikasi 2FA atau recovery code tidak valid');
  }

  mfaChallenges.delete(params.mfaTicket);

  const { token, session } = dbCreateSession({
    userId: user.id,
    username: user.username,
    role: user.role,
    ip: params.ip,
    userAgent: params.userAgent
  });

  recordUserLogin(user.id);

  writeAudit({
    t: new Date().toISOString(),
    ip: params.ip,
    method: 'AUTH',
    path: '/api/login/totp',
    detail: `action=login.success username=${user.username} role=${user.role} mfa=true recovery=${usedRecovery} sessionId=${session.id}`,
    user: user.username,
    role: user.role,
    status: 200
  });

  const { passwordHash, ...safe } = user;
  return {
    token,
    user: safe,
    permissions: ROLE_PERMISSIONS[user.role],
    session: { id: session.id, expiresAt: session.expiresAt }
  };
}

// ---------------- 2FA Profile Management ----------------

export async function setupTotpService(userId: string): Promise<{ secret: string; otpauthUri: string }> {
  const user = getUserById(userId);
  if (!user) throw new Error('User tidak ditemukan');

  const secret = generateTotpSecret();
  const encryptedSecret = encrypt(secret);

  // Store unconfirmed secret on user record
  await dbUpdateUser(userId, {
    totpSecretEnc: encryptedSecret,
    totpEnabled: false
  });

  const uri = generateOtpAuthUri(user.username, secret);
  return { secret, otpauthUri: uri };
}

export async function confirmTotpService(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
  const user = getUserById(userId);
  if (!user || !user.totpSecretEnc) throw new Error('Inisialisasi 2FA belum dimulai');

  const secret = decrypt(user.totpSecretEnc);
  if (!verifyTotpCode(secret, code)) {
    throw new Error('Kode verifikasi TOTP salah, periksa jam perangkat Anda');
  }

  const recoveryCodes = generateRecoveryCodes(10);
  const recoveryHashes = recoveryCodes.map(hashRecoveryCode);

  await dbUpdateUser(userId, {
    totpEnabled: true,
    totpRecoveryHashes: recoveryHashes
  });

  return { recoveryCodes };
}

export async function disableTotpService(userId: string, passwordConfirm: string): Promise<void> {
  const user = getUserById(userId);
  if (!user) throw new Error('User tidak ditemukan');

  const valid = await verifyPassword(passwordConfirm, user.passwordHash);
  if (!valid) throw new Error('Password konfirmasi salah');

  await dbUpdateUser(userId, {
    totpEnabled: false,
    totpSecretEnc: null,
    totpRecoveryHashes: []
  });
}

export function logoutService(sessionId: string, username?: string, ip = '') {
  const deleted = dbDeleteSession(sessionId);
  if (deleted) {
    writeAudit({
      t: new Date().toISOString(),
      ip,
      method: 'AUTH',
      path: '/api/auth/logout',
      detail: `action=logout sessionId=${sessionId}`,
      user: username,
      status: 200
    });
  }
  return { success: true };
}

export async function changePasswordService(
  userId: string,
  oldPass: string,
  newPass: string,
  ip = ''
): Promise<{ success: boolean }> {
  if (!newPass || newPass.length < 6) {
    throw new Error('Password baru minimal 6 karakter');
  }

  const user = getUserById(userId);
  if (!user) throw new Error('User tidak ditemukan');

  const valid = await verifyPassword(oldPass, user.passwordHash);
  if (!valid) throw new Error('Password lama salah');

  await dbUpdateUser(userId, { password: newPass });

  writeAudit({
    t: new Date().toISOString(),
    ip,
    method: 'AUTH',
    path: '/api/auth/change-password',
    detail: `action=password.changed username=${user.username}`,
    user: user.username,
    role: user.role,
    status: 200
  });

  return { success: true };
}

export async function resetPasswordByAdmin(
  adminUsername: string,
  targetUserId: string,
  newPass: string,
  ip = ''
): Promise<{ success: boolean }> {
  if (!newPass || newPass.length < 6) {
    throw new Error('Password baru minimal 6 karakter');
  }

  const target = getUserById(targetUserId);
  if (!target) throw new Error('User target tidak ditemukan');

  await dbUpdateUser(targetUserId, { password: newPass });

  writeAudit({
    t: new Date().toISOString(),
    ip,
    method: 'AUTH',
    path: `/api/users/${targetUserId}/reset-password`,
    detail: `action=password.reset target=${target.username} by=${adminUsername}`,
    user: adminUsername,
    role: 'admin',
    status: 200
  });

  return { success: true };
}

export function listSessionsService(user: { id: string; role: Role }) {
  if (user.role === 'admin') {
    return getAllSessions();
  }
  return getUserSessions(user.id);
}

export function revokeSessionService(user: { id: string; role: Role; username: string }, sessionId: string, ip = '') {
  const sessions = getAllSessions();
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) throw new Error('Sesi tidak ditemukan');

  if (user.role !== 'admin' && target.userId !== user.id) {
    throw new Error('Forbidden: Anda hanya bisa mencabut sesi sendiri');
  }

  dbDeleteSession(sessionId);

  writeAudit({
    t: new Date().toISOString(),
    ip,
    method: 'AUTH',
    path: `/api/sessions/${sessionId}`,
    detail: `action=session.revoked sessionId=${sessionId} targetUser=${target.username} by=${user.username}`,
    user: user.username,
    role: user.role,
    status: 200
  });

  return { success: true };
}

