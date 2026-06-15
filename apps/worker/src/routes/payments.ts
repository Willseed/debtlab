import { Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
import {
  confirmPayment,
  createPayment,
  ForbiddenError,
  PaymentCreationForbiddenError,
  PaymentAlreadyConfirmedError,
  PaymentNotFoundError,
  SelfPaymentError,
} from '../services/payment.service';
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

  const user = c.get('currentUser');

  try {
    const paymentId = await createPayment(c.env.DB, user, parsed.data);
    return c.json({ payment: { id: paymentId } }, 201);
  } catch (err) {
    if (err instanceof SelfPaymentError) {
      return errorResponse(c, 422, 'VALIDATION_ERROR', err.message);
    }
    if (err instanceof PaymentCreationForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', err.message);
    }
    throw err;
  }
});

paymentRoutes.patch('/:paymentId/confirm', async (c) => {
  const paymentId = c.req.param('paymentId');
  const user = c.get('currentUser');

  try {
    await confirmPayment(c.env.DB, user, paymentId);
    return c.json({ ok: true, payment: { id: paymentId } });
  } catch (err) {
    if (err instanceof PaymentNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', err.message);
    }
    if (err instanceof PaymentAlreadyConfirmedError) {
      return errorResponse(c, 409, 'CONFLICT', err.message);
    }
    if (err instanceof ForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', err.message);
    }
    throw err;
  }
});
