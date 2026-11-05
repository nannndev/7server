import express, { Router, Request, Response } from 'express';
import { sftpTarget } from '../../http/handlers.js';
import { withSftp } from '../../infra/ssh.js';

import { need } from '../../http/auth.js';

export const filesRoutes = Router();
// Paths go to SFTP as arguments, never through a shell.

filesRoutes.get('/servers/:id/files', async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const dir = String(req.query.path || '/');
  const list = await withSftp(target, (sftp) => new Promise<any[]>((resolve, reject) =>
    sftp.readdir(dir, (err, items) => (err ? reject(err) : resolve(items)))
  ));
  const data = list.map((f) => ({
    name: f.filename,
    isDir: (f.attrs.mode & 0o170000) === 0o040000,
    size: f.attrs.size,
    mtime: f.attrs.mtime * 1000
  })).sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
  res.json({ success: true, data });
});

const MAX_EDIT_BYTES = 1024 * 1024;

filesRoutes.get('/servers/:id/files/download', async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const file = String(req.query.path || '');
  try {
    await withSftp(target, (sftp) => new Promise<void>((resolve, reject) => {
      const stream = sftp.createReadStream(file);
      stream.on('error', reject);
      stream.on('end', () => resolve());
      res.setHeader('Content-Type', 'application/octet-stream');
      stream.pipe(res);
    }));
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    else res.end();
  }
});

filesRoutes.get('/servers/:id/files/read', async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const file = String(req.query.path || '');
  const content = await withSftp(target, (sftp) => new Promise<string>((resolve, reject) => {
    sftp.stat(file, (err, st) => {
      if (err) return reject(err);
      if (st.size > MAX_EDIT_BYTES) return reject(new Error('File terlalu besar untuk diedit (>1MB), gunakan download'));
      sftp.readFile(file, (e, buf) => (e ? reject(e) : resolve(buf.toString('utf8'))));
    });
  }));
  res.json({ success: true, data: content });
});

filesRoutes.post('/servers/:id/files/write', need('terminal.open'), async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const { path: file, content } = req.body || {};
  if (!file || typeof content !== 'string') return res.status(400).json({ success: false, error: 'path and content are required' });
  await withSftp(target, (sftp) => new Promise<void>((resolve, reject) =>
    sftp.writeFile(file, content, (err: any) => (err ? reject(err) : resolve()))
  ));
  res.json({ success: true });
});

filesRoutes.post('/servers/:id/files/upload', need('terminal.open'), express.raw({ type: '*/*', limit: '100mb' }), async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const file = String(req.query.path || '');
  if (!file || !Buffer.isBuffer(req.body)) return res.status(400).json({ success: false, error: 'path and file body are required' });
  await withSftp(target, (sftp) => new Promise<void>((resolve, reject) =>
    sftp.writeFile(file, req.body, (err: any) => (err ? reject(err) : resolve()))
  ));
  res.json({ success: true });
});
