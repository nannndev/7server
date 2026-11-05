export type Role = 'admin' | 'operator' | 'viewer';

export type Permission =
  | 'server.read'
  | 'server.manage'
  | 'service.control'
  | 'terminal.open'
  | 'db.read'
  | 'db.write'
  | 'copilot.chat'
  | 'copilot.execute'
  | 'gateway.manage'
  | 'users.manage'
  | 'firewall.manage';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  servers?: string[] | '*';
  permissions: Permission[];
}

export interface UserSession {
  id: string;
  userId: string;
  username?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  ip: string;
  userAgent: string;
  isCurrent?: boolean;
}

export interface ManagedUser {
  id: string;
  username: string;
  role: Role;
  servers?: string[] | '*';
  disabled?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

