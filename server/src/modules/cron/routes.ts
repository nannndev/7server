import { Router, Request } from 'express';
import { withServer } from '../../http/handlers.js';
import { fetchCronJobs, saveCronJobs, addCronJob, testRunCron } from './service.js';
import type { CronJobItem } from './types.js';

export const cronRoutes = Router();

cronRoutes.get('/servers/:id/cron', withServer(async (target) => {
  return await fetchCronJobs(target);
}));

cronRoutes.post('/servers/:id/cron', withServer(async (target, req: Request) => {
  const { schedule, command, comment, enabled } = req.body;
  if (!schedule || !command) {
    throw new Error('Schedule and command are required');
  }
  return await addCronJob(target, { schedule, command, comment, enabled });
}));

cronRoutes.put('/servers/:id/cron', withServer(async (target, req: Request) => {
  const { jobs } = req.body;
  if (!Array.isArray(jobs)) {
    throw new Error('Jobs array is required');
  }
  return await saveCronJobs(target, jobs as CronJobItem[]);
}));

cronRoutes.delete('/servers/:id/cron/:jobId', withServer(async (target, req: Request) => {
  const { jobId } = req.params;
  const current = await fetchCronJobs(target);
  const updated = current.filter((j) => j.id !== jobId);
  return await saveCronJobs(target, updated);
}));

cronRoutes.post('/servers/:id/cron/run', withServer(async (target, req: Request) => {
  const { command } = req.body;
  if (!command) throw new Error('Command is required');
  return await testRunCron(target, command);
}));

