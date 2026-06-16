import { Hono } from 'hono';

import { errorResponse, notImplemented } from '../http/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { listDefaultGroupMembers } from '../services/default-group.service';
import { AppBindings } from '../types';
import { memberPatchSchema } from '../validation/schemas';

export const memberRoutes = new Hono<AppBindings>();

memberRoutes.use('*', requireAuth);

memberRoutes.get('/', async (c) => {
  const members = await listDefaultGroupMembers(c.env.DB, c.get('currentUser'));

  return c.json({ members });
});

memberRoutes.patch('/:userId', requireAdmin, async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = memberPatchSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Member update is invalid.',
      parsed.error.flatten(),
    );
  }

  return notImplemented(
    c,
    `Member ${c.req.param('userId')} update persistence is not implemented yet.`,
  );
});
