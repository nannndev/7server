// User & RBAC types for 7Server
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

export const ALL_PERMISSIONS: Permission[] = [
  'server.read',
  'server.manage',
  'service.control',
  'terminal.open',
  'db.read',
  'db.write',
  'copilot.chat',
  'copilot.execute',
  'gateway.manage',
  'users.manage',
  'firewall.manage'
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL_PERMISSIONS,
  operator: [
    'server.read',
    'service.control',
    'terminal.open',
    'db.read',
    'db.write',
    'copilot.chat',
    'copilot.execute',
    'firewall.manage'
  ],
  viewer: [
    'server.read',
    'db.read',
    'copilot.chat'
  ]
};

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  servers: string[] | '*';
  disabled?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

export interface Session {
  id: string;
  tokenHash: string;
  userId: string;
  username: string;
  role: Role;
  expiresAt: number;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
}

export interface AuthContextUser {
  id: string;
  username: string;
  role: Role;
  permissions: Permission[];
  servers: string[] | '*';
  sessionId: string;
}
