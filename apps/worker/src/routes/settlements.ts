import { Hono } from 'hono';

import { requireAuth } from '../middleware/require-auth';
import { AppBindings } from '../types';

export const settlementRoutes = new Hono<AppBindings>();

settlementRoutes.use('*', requireAuth);

settlementRoutes.get('/summary', (c) => {
  return c.json({
    currency: 'TWD',
    balances: [],
    suggestedTransfers: [],
  });
});
