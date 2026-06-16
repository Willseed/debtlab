import { Handler, Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireDefaultGroupMember } from '../middleware/require-default-group-member';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { type DefaultGroupMember, listDefaultGroupMembers } from '../services/default-group.service';
import { AppBindings } from '../types';

export const memberRoutes = new Hono<AppBindings>();
const unfinishedMemberAdminEndpoint: Handler<AppBindings> = (c) =>
  errorResponse(c, 404, 'NOT_FOUND', 'Route not found.');

memberRoutes.use('*', requireAuth);
memberRoutes.use('*', requireDefaultGroupMember);

memberRoutes.get('/', async (c) => {
  const currentUser = c.get('currentUser');
  const members = await listDefaultGroupMembers(c.env.DB, currentUser);

  return c.json({
    members: currentUser.role === 'admin' ? members : mapActiveMemberDirectory(members),
  });
});

memberRoutes.patch('/:userId', requireAdmin, unfinishedMemberAdminEndpoint);

function mapActiveMemberDirectory(members: readonly DefaultGroupMember[]) {
  return members
    .filter((member) => member.status === 'active')
    .map((member) => ({
      userId: member.userId,
      displayName: member.displayName,
    }));
}
