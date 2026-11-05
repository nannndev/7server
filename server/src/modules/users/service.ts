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

export async function loginService(params: {
  username?: string;
  password?: string;
  ip: string;
  userAgent: string;
}): Promise<{ token: string; user: SafeUser; permissions: Permission[]; session: { id: string; expiresAt: number } }> {
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
    throw new Error('Akun Anda dinonaktifkan oleh administrator');
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

