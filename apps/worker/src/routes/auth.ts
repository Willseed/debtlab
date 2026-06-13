import { deleteCookie } from 'hono/cookie';
import { Hono } from 'hono';

import { errorResponse, notImplemented } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
import { SESSION_COOKIE_NAME } from '../services/auth.service';
import { AppBindings } from '../types';
import { appleAuthSchema, googleAuthSchema } from '../validation/schemas';

export const authRoutes = new Hono<AppBindings>();

authRoutes.post('/google', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = googleAuthSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Google credential is invalid.',
      parsed.error.flatten(),
    );
  }

  return notImplemented(c, 'Google OAuth verification is not implemented yet.');
});

authRoutes.post('/apple', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = appleAuthSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Apple credential is invalid.',
      parsed.error.flatten(),
    );
  }

  return notImplemented(c, 'Apple identity token verification is not implemented yet.');
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('currentUser') });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });

  return c.json({ ok: true });
});
