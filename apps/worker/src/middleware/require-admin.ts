import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { AppBindings } from '../types';

export const requireAdmin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = c.get('currentUser');

  if (user.role !== 'admin') {
    return errorResponse(c, 403, 'FORBIDDEN', 'Admin authorization is required.');
  }

  return next();
};
