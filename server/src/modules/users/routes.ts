import { Router, Request, Response } from 'express';
import { need } from '../../http/auth.js';
import { 
  getSafeUsers, 
  createUser, 
  updateUser, 
  deleteUser 
} from './store.js';
import { 
  changePasswordService, 
  resetPasswordByAdmin, 
  listSessionsService, 
  revokeSessionService,
  logoutService
} from './service.js';
import { readAudit, exportAuditCsv } from '../../infra/audit.js';

export const usersRoutes = Router();

// ---------------- User Self Profile & Sessions ----------------

usersRoutes.get('/auth/me', (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  res.json({
    success: true,
    data: {
      user: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        servers: req.user.servers,
        permissions: req.user.permissions
      },
      sessionId: req.user.sessionId
    }
  });
});

usersRoutes.post('/auth/change-password', async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { oldPassword, newPassword } = req.body || {};
    await changePasswordService(req.user.id, oldPassword, newPassword, req.ip || '');
    res.json({ success: true, message: 'Password berhasil diubah' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

usersRoutes.post('/auth/logout', (req: Request, res: Response) => {
  if (req.user?.sessionId) {
    logoutService(req.user.sessionId, req.user.username, req.ip || '');
  }
  res.json({ success: true, message: 'Logout berhasil' });
});

// ---------------- Sessions Management ----------------

usersRoutes.get('/sessions', (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const sessions = listSessionsService(req.user);
  res.json({ success: true, data: sessions });
});

usersRoutes.delete('/sessions/:id', (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    revokeSessionService(req.user, req.params.id as string, req.ip || '');
    res.json({ success: true, message: 'Sesi berhasil dicabut' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------- Admin User Management ----------------

usersRoutes.get('/users', need('users.manage'), (req: Request, res: Response) => {
  res.json({ success: true, data: getSafeUsers() });
});

usersRoutes.post('/users', need('users.manage'), async (req: Request, res: Response) => {
  try {
    const { username, password, role, servers } = req.body || {};
    if (!username || !password || !role) {
      return res.status(400).json({ success: false, error: 'Username, password, dan role wajib diisi' });
    }
    const newUser = await createUser({ username, password, role, servers });
    res.json({ success: true, data: newUser });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

usersRoutes.put('/users/:id', need('users.manage'), async (req: Request, res: Response) => {
  try {
    const { role, servers, disabled, password } = req.body || {};
    const updated = await updateUser(req.params.id as string, { role, servers, disabled, password });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

usersRoutes.delete('/users/:id', need('users.manage'), (req: Request, res: Response) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ success: false, error: 'Tidak dapat menghapus akun Anda sendiri' });
    }
    const ok = deleteUser(req.params.id as string);
    if (!ok) return res.status(404).json({ success: false, error: 'User tidak ditemukan' });
    res.json({ success: true, message: 'User berhasil dihapus' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

usersRoutes.post('/users/:id/reset-password', need('users.manage'), async (req: Request, res: Response) => {
  try {
    const { password } = req.body || {};
    await resetPasswordByAdmin(req.user?.username || 'admin', req.params.id as string, password, req.ip || '');
    res.json({ success: true, message: 'Password user berhasil direset' });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------- Audit Log Per User ----------------

usersRoutes.get('/audit', need('server.read'), (req: Request, res: Response) => {
  const { limit, user, server, search } = req.query;
  const entries = readAudit({
    limit: limit ? parseInt(String(limit), 10) : 200,
    user: user ? String(user) : undefined,
    server: server ? String(server) : undefined,
    search: search ? String(search) : undefined
  });
  res.json({ success: true, data: entries });
});

usersRoutes.get('/audit/export.csv', need('server.read'), (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 1000;
  const csv = exportAuditCsv(limit);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="7server-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
