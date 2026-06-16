import { Handler, Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { AppBindings } from '../types';

export const adminRoutes = new Hono<AppBindings>();
const unfinishedAdminEndpoint: Handler<AppBindings> = (c) =>
  errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');

adminRoutes.use('*', requireAuth, requireAdmin);

adminRoutes.get('/audit-logs', unfinishedAdminEndpoint);

adminRoutes.get('/export.csv', unfinishedAdminEndpoint);

adminRoutes.patch('/easter-eggs/:eggId', unfinishedAdminEndpoint);
