import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import {
  DEFAULT_GROUP_ACCESS_MESSAGE,
  requireDefaultGroupMember,
} from '../src/middleware/require-default-group-member';
import { expenseRoutes } from '../src/routes/expenses';
import { memberRoutes } from '../src/routes/members';
import { paymentRoutes } from '../src/routes/payments';
import { settlementRoutes } from '../src/routes/settlements';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { ApiErrorCode, AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';

const activeMember: SessionUser = {
  id: 'usr_active_member',
  email: 'active@example.test',
  displayName: 'Active Member',
  role: 'member',
  status: 'active',
};

const adminUser: SessionUser = {
  id: 'usr_admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  role: 'admin',
  status: 'active',
};

type MembershipState = 'active' | 'pending' | 'disabled' | 'none';

type BusinessRouteCase = {
  readonly name: string;
  readonly path: string;
  readonly init: RequestInit;
  readonly successStatus: number;
};

const businessRouteCases: readonly BusinessRouteCase[] = [
  {
    name: 'members',
    path: '/api/members',
    init: { method: 'GET' },
    successStatus: 200,
  },
  {
    name: 'expenses',
    path: '/api/expenses',
    init: { method: 'GET' },
    successStatus: 200,
  },
  {
    name: 'settlements',
    path: '/api/settlements/summary',
    init: { method: 'GET' },
    successStatus: 200,
  },
  {
    name: 'payments',
    path: '/api/payments',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    successStatus: 422,
  },
];

for (const routeCase of businessRouteCases) {
  test(`${routeCase.name} API keeps unauthenticated callers at 401`, async () => {
    const response = await requestBusinessRoute(routeCase, activeMember, 'active', false);

    await assertApiError(response, 401, 'UNAUTHORIZED', 'Authentication is required.');
  });

  test(`${routeCase.name} API rejects pending default-group members with 403`, async () => {
    const response = await requestBusinessRoute(routeCase, activeMember, 'pending');

    await assertApiError(response, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  });

  test(`${routeCase.name} API rejects disabled default-group members with 403`, async () => {
    const response = await requestBusinessRoute(routeCase, activeMember, 'disabled');

    await assertApiError(response, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  });

  test(`${routeCase.name} API rejects non-members with 403`, async () => {
    const response = await requestBusinessRoute(routeCase, activeMember, 'none');

    await assertApiError(response, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  });

  test(`${routeCase.name} API allows active default-group members`, async () => {
    const response = await requestBusinessRoute(routeCase, activeMember, 'active');

    assert.equal(response.status, routeCase.successStatus);
  });

  test(`${routeCase.name} API allows admins without default-group membership`, async () => {
    const response = await requestBusinessRoute(routeCase, adminUser, 'none');

    assert.equal(response.status, routeCase.successStatus);
  });
}

test('requireDefaultGroupMember rejects inactive current users with the generic group access error', async () => {
  const inactiveUser: SessionUser = { ...activeMember, status: 'pending' };
  const app = new Hono<AppBindings>();
  app.use('*', async (c, next) => {
    c.set('currentUser', inactiveUser);
    await next();
  });
  app.get('/protected', requireDefaultGroupMember, (c) => c.json({ ok: true }));

  const response = await app.request(
    '/protected',
    {},
    {
      DB: new FakeBusinessD1(inactiveUser, 'active') as unknown as D1Database,
      SESSION_SECRET,
    },
  );

  await assertApiError(response, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
});

class FakeBusinessD1 {
  constructor(
    readonly currentUser: SessionUser,
    private readonly membershipState: MembershipState,
  ) {}

  prepare(sql: string): FakeBusinessStatement {
    return new FakeBusinessStatement(this, sql);
  }

  readActiveMembershipRows(): readonly { readonly user_id: string }[] {
    if (this.membershipState !== 'active') {
      return [];
    }

    return [{ user_id: this.currentUser.id }];
  }

  readListedMemberRows(): readonly {
    readonly user_id: string;
    readonly display_name: string;
    readonly role: 'member' | 'admin';
    readonly status: 'active' | 'pending' | 'disabled';
    readonly joined_at: string | null;
  }[] {
    if (this.membershipState === 'none') {
      return [];
    }

    return [
      {
        user_id: this.currentUser.id,
        display_name: this.currentUser.displayName,
        role: this.currentUser.role,
        status: this.membershipState,
        joined_at: '2026-06-16 09:00:00',
      },
    ];
  }
}

class FakeBusinessStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeBusinessD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]): FakeBusinessStatement {
    return Object.assign(new FakeBusinessStatement(this.db, this.sql), { values });
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM users')) {
      return {
        id: this.db.currentUser.id,
        email: this.db.currentUser.email,
        display_name: this.db.currentUser.displayName,
        avatar_url: null,
        role: this.db.currentUser.role,
        status: this.db.currentUser.status,
      } as T;
    }

    return null;
  }

  async all<T>(): Promise<{ readonly results: readonly T[] }> {
    if (this.sql.includes('FROM group_members') && this.sql.includes('gm.user_id IN')) {
      return { results: this.db.readActiveMembershipRows() as readonly T[] };
    }

    if (this.sql.includes('FROM group_members') && this.sql.includes('gm.role')) {
      return { results: this.db.readListedMemberRows() as readonly T[] };
    }

    if (this.sql.includes('FROM group_members')) {
      return {
        results: this.db.readListedMemberRows().map((row) => ({
          user_id: row.user_id,
          display_name: row.display_name,
        })) as unknown as readonly T[],
      };
    }

    return { results: [] };
  }
}

async function requestBusinessRoute(
  routeCase: BusinessRouteCase,
  user: SessionUser,
  membershipState: MembershipState,
  includeCookie = true,
): Promise<Response> {
  const app = createBusinessApp();
  const headers = new Headers(routeCase.init.headers);

  if (includeCookie) {
    const token = await createSessionToken(user, SESSION_SECRET);
    headers.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
  }

  return app.request(
    routeCase.path,
    {
      ...routeCase.init,
      headers,
    },
    {
      DB: new FakeBusinessD1(user, membershipState) as unknown as D1Database,
      SESSION_SECRET,
    },
  );
}

function createBusinessApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.route('/api/members', memberRoutes);
  app.route('/api/expenses', expenseRoutes);
  app.route('/api/settlements', settlementRoutes);
  app.route('/api/payments', paymentRoutes);

  return app;
}

async function assertApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): Promise<void> {
  assert.equal(response.status, status);
  const body = (await response.json()) as {
    readonly error: {
      readonly code: ApiErrorCode;
      readonly message: string;
    };
  };
  assert.equal(body.error.code, code);
  assert.equal(body.error.message, message);
}
