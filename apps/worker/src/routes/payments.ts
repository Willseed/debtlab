import { Hono } from 'hono';

import { errorResponse, notImplemented } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
import { AppBindings } from '../types';
import { paymentCreateSchema } from '../validation/schemas';

export const paymentRoutes = new Hono<AppBindings>();

paymentRoutes.use('*', requireAuth);

paymentRoutes.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = paymentCreateSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Payment request is invalid.',
      parsed.error.flatten(),
    );
  }

  return notImplemented(c, 'Payment persistence is not implemented yet.');
});

paymentRoutes.patch('/:paymentId/confirm', (c) => {
  return notImplemented(
    c,
    `Payment ${c.req.param('paymentId')} confirmation is not implemented yet.`,
  );
});
