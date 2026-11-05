import { Router, Request, Response } from 'express';
import { withServer, sftpTarget } from '../../http/handlers.js';
import { withSftp } from '../../infra/ssh.js';
import path from 'path';
import {
  scanBackups,
  executeBackup,
  restoreBackup,
  deleteBackupFile,
  getProfiles,
  saveProfile,
  deleteProfile
} from './service.js';

export const backupRoutes = Router();

// Scan existing backup archives on the server
backupRoutes.get(
  '/servers/:id/backups',
  withServer(async (target) => {
    return await scanBackups(target);
  })
);

// Trigger a backup immediately
backupRoutes.post(
  '/servers/:id/backups/run',
  withServer(async (target, req: Request) => {
    return await executeBackup(target, req.body);
  })
);

// Restore a backup
backupRoutes.post(
  '/servers/:id/backups/restore',
  withServer(async (target, req: Request) => {
    return await restoreBackup(target, req.body);
  })
);

// Delete a backup archive file
backupRoutes.delete(
  '/servers/:id/backups/file',
  withServer(async (target, req: Request) => {
    const { filepath } = req.body;
    if (!filepath) throw new Error('Filepath is required');
    await deleteBackupFile(target, filepath);
    return { success: true };
  })
);

// Download a backup file directly
backupRoutes.get('/servers/:id/backups/download', async (req: Request, res: Response) => {
  const target = sftpTarget(req, res);
  if (!target) return;

  const file = String(req.query.path || '');
  if (!file) {
    res.status(400).json({ success: false, error: 'Filepath is required' });
    return;
  }

  const filename = path.basename(file);
  try {
    await withSftp(target, (sftp) =>
      new Promise<void>((resolve, reject) => {
        const stream = sftp.createReadStream(file);
        stream.on('error', reject);
        stream.on('end', () => resolve());
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        stream.pipe(res);
      })
    );
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
    else res.end();
  }
});

// Profiles CRUD
backupRoutes.get(
  '/servers/:id/backups/profiles',
  withServer(async (target) => {
    return getProfiles(target.id);
  })
);

backupRoutes.post(
  '/servers/:id/backups/profiles',
  withServer(async (target, req: Request) => {
    return saveProfile(target.id, req.body);
  })
);

backupRoutes.delete(
  '/servers/:id/backups/profiles/:profileId',
  withServer(async (target, req: Request) => {
    deleteProfile(target.id, String(req.params.profileId));
    return { success: true };
  })
);
