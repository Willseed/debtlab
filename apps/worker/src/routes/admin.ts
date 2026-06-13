import { Hono } from 'hono';

import { notImplemented } from '../http/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { AppBindings } from '../types';

export const adminRoutes = new Hono<AppBindings>();

adminRoutes.use('*', requireAuth, requireAdmin);

adminRoutes.get('/audit-logs', (c) => {
  return c.json({ auditLogs: [] });
});

adminRoutes.get('/export.csv', (c) => {
  return notImplemented(c, 'Admin CSV export is not implemented yet.');
});

adminRoutes.patch('/easter-eggs/:eggId', (c) => {
  return notImplemented(c, `Easter egg ${c.req.param('eggId')} settings are not implemented yet.`);
});
