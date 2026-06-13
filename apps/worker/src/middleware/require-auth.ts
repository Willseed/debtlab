import { getCookie } from 'hono/cookie';
import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../services/auth.service';
import { AppBindings } from '../types';

export const requireAuth: MiddlewareHandler<AppBindings> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  const user = await verifySessionToken(token, c.env.SESSION_SECRET);

  if (!user) {
    return errorResponse(c, 401, 'UNAUTHORIZED', 'Authentication is required.');
  }

  if (user.status !== 'active') {
    return errorResponse(c, 403, 'FORBIDDEN', 'User is not active.');
  }

  c.set('currentUser', user);
  return next();
};
