import express, { Router, Request, Response } from 'express';
import { sftpTarget } from '../../http/handlers.js';
import { withSftp, executeCommand } from '../../infra/ssh.js';
import { sq } from '../../databases/shell.js';
import type { ServerCredentials } from '../servers/types.js';

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
const isDenied = (err: any) => err?.code === 3 || /permission denied/i.test(String(err?.message));

/**
 * SFTP runs as the SSH user, so root-owned files (deployed .env, /etc/nginx) fail with "Permission denied".
 * Retry through sudo. -k forces sudo to read the password even when a timestamp is cached, so the password
 * line can never leak into tee's input.
 */
async function sudoFile(t: ServerCredentials, cmd: string, input = ''): Promise<string> {
  const pass = t.sudoPassword || (t.authType === 'password' ? t.password : undefined);
  const sudo = pass ? "sudo -k -S -p ''" : 'sudo -n';
  const r = await executeCommand(t, `${sudo} ${cmd}`, 20000, { stdin: pass ? `${pass}\n${input}` : input, maxBytes: MAX_EDIT_BYTES + 1 });
  if (r.code !== 0) {
    const msg = (r.stderr || r.stdout).trim();
    throw new Error(/password|terminal/i.test(msg) ? 'Permission denied (sudo password required: save it in Edit server)' : msg || 'Permission denied');
  }
  return r.stdout;
}

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
  const tooBig = new Error('File terlalu besar untuk diedit (>1MB), gunakan download');
  const content = await withSftp(target, (sftp) => new Promise<string>((resolve, reject) => {
    sftp.stat(file, (err, st) => {
      if (err) return reject(err);
      if (st.size > MAX_EDIT_BYTES) return reject(tooBig);
      sftp.readFile(file, (e, buf) => (e ? reject(e) : resolve(buf.toString('utf8'))));
    });
  })).catch(async (err) => {
    if (!isDenied(err)) throw err;
    const out = await sudoFile(target, `head -c ${MAX_EDIT_BYTES + 1} -- ${sq(file)}`);
    if (out.length > MAX_EDIT_BYTES) throw tooBig;
    return out;
  });
  res.json({ success: true, data: content });
});

filesRoutes.post('/servers/:id/files/write', need('terminal.open'), async (req: Request, res: Response) => {
  const target = sftpTarget(req, res); if (!target) return;
  const { path: file, content } = req.body || {};
  if (!file || typeof content !== 'string') return res.status(400).json({ success: false, error: 'path and content are required' });
  await withSftp(target, (sftp) => new Promise<void>((resolve, reject) =>
    sftp.writeFile(file, content, (err: any) => (err ? reject(err) : resolve()))
  )).catch(async (err) => {
    if (!isDenied(err)) throw err;
    // tee keeps the file's owner and mode (a deployed .env stays root:root 0600).
    await sudoFile(target, `tee -- ${sq(file)} >/dev/null`, content);
  });
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
