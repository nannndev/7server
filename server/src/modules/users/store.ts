import { v4 as uuidv4 } from 'uuid';
import { listDocs, replaceDocs } from '../../infra/db.js';
import { User, SafeUser, Session, Role } from './types.js';
import { hashPassword, hashToken, generateToken } from './passwords.js';

// Users and sessions live in 7server.db (collections users, sessions); sessions keep only a token hash.
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let memoryUsers: User[] = [];
let memorySessions: Session[] = [];
let initialized = false;

function loadUsers(): User[] {
  try {
    return listDocs<User>('users');
  } catch (e: any) {
    console.warn('[users] Failed to read users:', e.message);
  }
  return [];
}

function saveUsers(users: User[]) {
  memoryUsers = users;
  try {
    replaceDocs('users', users, (u) => u.id);
  } catch (e: any) {
    console.error('[users] Failed to write users:', e.message);
  }
}

function loadSessions(): Session[] {
  try {
    const now = Date.now();
    return listDocs<Session>('sessions').filter((s) => s.expiresAt > now);
  } catch (e: any) {
    console.warn('[sessions] Failed to read sessions:', e.message);
  }
  return [];
}

function saveSessions(sessions: Session[]) {
  memorySessions = sessions;
  try {
    replaceDocs('sessions', sessions, (x) => x.id);
  } catch (e: any) {
    console.error('[sessions] Failed to write sessions:', e.message);
  }
}

export async function initUsersStore(fallbackPassword = 'admin') {
  if (initialized) return;
  memoryUsers = loadUsers();
  memorySessions = loadSessions();

  // Seamless migration: if users.json doesn't exist or is empty, create initial admin
  if (memoryUsers.length === 0) {
    console.log('[users] Initializing users.json with admin user...');
    const hashed = await hashPassword(fallbackPassword);
    const adminUser: User = {
      id: uuidv4(),
      username: 'admin',
      passwordHash: hashed,
      role: 'admin',
      servers: '*',
      createdAt: new Date().toISOString()
    };
    saveUsers([adminUser]);
    console.log('[users] Admin user created with default/existing dashboard password.');
  }

  initialized = true;
}

export function toSafeUser(user: User): SafeUser {
  const { passwordHash, ...safe } = user;
  return safe;
}

export function getUsers(): User[] {
  if (!initialized) memoryUsers = loadUsers();
  return memoryUsers;
}

export function getSafeUsers(): SafeUser[] {
  return getUsers().map(toSafeUser);
}

export function getUserById(id: string): User | undefined {
  return getUsers().find((u) => u.id === id);
}

export function getUserByUsername(username: string): User | undefined {
  const norm = username.trim().toLowerCase();
  return getUsers().find((u) => u.username.toLowerCase() === norm);
}

export async function createUser(data: {
  username: string;
  password: string;
  role: Role;
  servers?: string[] | '*';
}): Promise<SafeUser> {
  const existing = getUserByUsername(data.username);
  if (existing) {
    throw new Error(`Username "${data.username}" already exists`);
  }

  const passwordHash = await hashPassword(data.password);
  const newUser: User = {
    id: uuidv4(),
    username: data.username.trim(),
    passwordHash,
    role: data.role,
    servers: data.servers ?? '*',
    createdAt: new Date().toISOString()
  };

  const users = [...getUsers(), newUser];
  saveUsers(users);
  return toSafeUser(newUser);
}

export async function updateUser(
  id: string,
  updates: {
    role?: Role;
    servers?: string[] | '*';
    disabled?: boolean;
    password?: string;
  }
): Promise<SafeUser> {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('User not found');

  const user = { ...users[idx] };
  if (updates.role !== undefined) user.role = updates.role;
  if (updates.servers !== undefined) user.servers = updates.servers;
  if (updates.disabled !== undefined) user.disabled = updates.disabled;
  if (updates.password) {
    user.passwordHash = await hashPassword(updates.password);
    // Invalidate existing sessions for this user on password change
    deleteSessionsByUserId(id);
  }

  users[idx] = user;
  saveUsers(users);
  return toSafeUser(user);
}

export function deleteUser(id: string): boolean {
  const users = getUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return false;
  if (target.username.toLowerCase() === 'admin') {
    throw new Error('Cannot delete primary admin user');
  }

  saveUsers(users.filter((u) => u.id !== id));
  deleteSessionsByUserId(id);
  return true;
}

export function recordUserLogin(userId: string) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx !== -1) {
    users[idx].lastLoginAt = new Date().toISOString();
    saveUsers(users);
  }
}

// ---------------- Sessions ----------------

export function getAllSessions(): Session[] {
  if (!initialized) memorySessions = loadSessions();
  const now = Date.now();
  return memorySessions.filter((s) => s.expiresAt > now);
}

export function getUserSessions(userId: string): Session[] {
  return getAllSessions().filter((s) => s.userId === userId);
}

export function getSessionByToken(token: string): Session | undefined {
  if (!token) return undefined;
  const hash = hashToken(token);
  const session = getAllSessions().find((s) => s.tokenHash === hash);
  if (!session) return undefined;
  if (session.expiresAt <= Date.now()) {
    deleteSession(session.id);
    return undefined;
  }
  return session;
}

export function createSession(data: {
  userId: string;
  username: string;
  role: Role;
  ip: string;
  userAgent: string;
  ttlDays?: number;
}): { token: string; session: Session } {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = Date.now();
  const ttlMs = (data.ttlDays ?? 7) * 24 * 60 * 60 * 1000;

  const session: Session = {
    id: uuidv4().slice(0, 8), // short 8-char session id for clean logging
    tokenHash,
    userId: data.userId,
    username: data.username,
    role: data.role,
    expiresAt: now + ttlMs,
    ip: data.ip,
    userAgent: data.userAgent || 'unknown',
    createdAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString()
  };

  const sessions = [...getAllSessions(), session];
  saveSessions(sessions);
  return { token, session };
}

export function touchSession(sessionId: string, ttlDays = 7) {
  const sessions = getAllSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx !== -1) {
    const now = Date.now();
    sessions[idx].lastUsedAt = new Date(now).toISOString();
    sessions[idx].expiresAt = now + ttlDays * 24 * 60 * 60 * 1000;
    saveSessions(sessions);
  }
}

export function deleteSession(sessionId: string): boolean {
  const sessions = getAllSessions();
  const next = sessions.filter((s) => s.id !== sessionId);
  if (next.length !== sessions.length) {
    saveSessions(next);
    return true;
  }
  return false;
}

export function deleteSessionsByUserId(userId: string): number {
  const sessions = getAllSessions();
  const next = sessions.filter((s) => s.userId !== userId);
  const removed = sessions.length - next.length;
  if (removed > 0) {
    saveSessions(next);
  }
  return removed;
}

