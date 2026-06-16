import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { listActiveDefaultGroupMemberIdsForUsers } from '../services/default-group.service';
import { AppBindings } from '../types';

export const DEFAULT_GROUP_ACCESS_MESSAGE = 'Default group access is required.';

export const requireDefaultGroupMember: MiddlewareHandler<AppBindings> = async (c, next) => {
  const user = c.get('currentUser');

  if (user.status !== 'active') {
    return errorResponse(c, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  }

  if (user.role === 'admin') {
    return next();
  }

  const activeMemberIds = await listActiveDefaultGroupMemberIdsForUsers(c.env.DB, [user.id]);

  if (!activeMemberIds.has(user.id)) {
    return errorResponse(c, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  }

  return next();
};
