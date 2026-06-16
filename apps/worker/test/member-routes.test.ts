import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { memberRoutes } from '../src/routes/members';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { ApiErrorCode, AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';

const alice: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

const admin: SessionUser = {
  id: 'usr_admin',
  email: 'admin@example.test',
  displayName: 'Admin',
  role: 'admin',
  status: 'active',
};

class FakeMemberD1 {
  constructor(
    readonly currentUser: SessionUser = alice,
    private readonly memberRows: readonly {
      readonly user_id: string;
      readonly display_name: string;
      readonly role: 'member' | 'admin';
      readonly status: 'active' | 'disabled' | 'pending';
      readonly user_status?: 'active' | 'disabled' | 'pending';
      readonly joined_at: string | null;
    }[] = [],
    private readonly activeMemberIds: readonly string[] = [currentUser.id],
  ) {}

  prepare(sql: string) {
    return new FakeMemberStatement(this, sql);
  }

  async batch() {
    return [];
  }

  getMembers() {
    return this.memberRows;
  }

  getActiveMemberIds() {
    return this.activeMemberIds;
  }
}

class FakeMemberStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeMemberD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]) {
    return Object.assign(new FakeMemberStatement(this.db, this.sql), { values });
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
      return {
        results: this.db.getActiveMemberIds().map((userId) => ({ user_id: userId })) as T[],
      };
    }

    if (this.sql.includes('FROM group_members')) {
      return { results: this.db.getMembers() as readonly T[] };
    }

    return { results: [] };
  }
}

test('GET /api/members returns only active minimal member fields to active members', async () => {
  const db = new FakeMemberD1(alice, [
    {
      user_id: 'usr_bob',
      display_name: 'Bob',
      role: 'member',
      status: 'active',
      joined_at: '2026-06-16 09:00:00',
    },
    {
      user_id: 'usr_pending',
      display_name: 'Pending',
      role: 'member',
      status: 'pending',
      joined_at: '2026-06-16 09:01:00',
    },
    {
      user_id: 'usr_disabled',
      display_name: 'Disabled',
      role: 'member',
      status: 'disabled',
      joined_at: '2026-06-16 09:02:00',
    },
    {
      user_id: 'usr_user_disabled',
      display_name: 'User Disabled',
      role: 'member',
      status: 'active',
      user_status: 'disabled',
      joined_at: '2026-06-16 09:03:00',
    },
  ]);
  const response = await requestMembers(db, alice);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    members: [
      {
        userId: 'usr_bob',
        displayName: 'Bob',
      },
      {
        userId: alice.id,
        displayName: alice.displayName,
      },
    ],
  });
});

test('GET /api/members returns full member fields and inactive members to admins', async () => {
  const db = new FakeMemberD1(admin, [
    {
      user_id: admin.id,
      display_name: admin.displayName,
      role: 'admin',
      status: 'active',
      joined_at: '2026-06-16 09:00:00',
    },
    {
      user_id: 'usr_pending',
      display_name: 'Pending',
      role: 'member',
      status: 'pending',
      joined_at: '2026-06-16 09:01:00',
    },
    {
      user_id: 'usr_disabled',
      display_name: 'Disabled',
      role: 'member',
      status: 'active',
      user_status: 'disabled',
      joined_at: '2026-06-16 09:02:00',
    },
  ]);
  const response = await requestMembers(db, admin);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    members: [
      {
        userId: admin.id,
        displayName: admin.displayName,
        role: 'admin',
        status: 'active',
        joinedAt: '2026-06-16 09:00:00',
      },
      {
        userId: 'usr_pending',
        displayName: 'Pending',
        role: 'member',
        status: 'pending',
        joinedAt: '2026-06-16 09:01:00',
      },
      {
        userId: 'usr_disabled',
        displayName: 'Disabled',
        role: 'member',
        status: 'disabled',
        joinedAt: '2026-06-16 09:02:00',
      },
    ],
  });
});

test('GET /api/members does not duplicate the current user when already joined', async () => {
  const db = new FakeMemberD1(alice, [
    {
      user_id: alice.id,
      display_name: alice.displayName,
      role: 'member',
      status: 'active',
      joined_at: '2026-06-16 09:00:00',
    },
  ]);
  const response = await requestMembers(db, alice);
  const body = (await response.json()) as { members: unknown[] };

  assert.equal(response.status, 200);
  assert.equal(body.members.length, 1);
});

test('GET /api/members requires authentication', async () => {
  const app = makeApp();
  const db = new FakeMemberD1();
  const response = await app.request('/api/members', {}, env(db));

  assert.equal(response.status, 401);
});

test('GET /api/members rejects pending default-group members with 403', async () => {
  const response = await requestMembers(
    new FakeMemberD1(
      alice,
      [
        {
          user_id: alice.id,
          display_name: alice.displayName,
          role: 'member',
          status: 'pending',
          joined_at: '2026-06-16 09:00:00',
        },
      ],
      [],
    ),
    alice,
  );

  await assertApiError(response, 403, 'FORBIDDEN', 'Default group access is required.');
});

test('GET /api/members rejects disabled default-group members with 403', async () => {
  const response = await requestMembers(
    new FakeMemberD1(
      alice,
      [
        {
          user_id: alice.id,
          display_name: alice.displayName,
          role: 'member',
          status: 'disabled',
          joined_at: '2026-06-16 09:00:00',
        },
      ],
      [],
    ),
    alice,
  );

  await assertApiError(response, 403, 'FORBIDDEN', 'Default group access is required.');
});

test('GET /api/members rejects non-members with 403', async () => {
  const response = await requestMembers(new FakeMemberD1(alice, [], []), alice);

  await assertApiError(response, 403, 'FORBIDDEN', 'Default group access is required.');
});

test('GET /api/members rejects disabled current users with 403', async () => {
  const disabledUser: SessionUser = { ...alice, status: 'disabled' };
  const response = await requestMembers(new FakeMemberD1(disabledUser), disabledUser);

  await assertApiError(response, 403, 'FORBIDDEN', 'User is not active.');
});

async function requestMembers(db: FakeMemberD1, user: SessionUser): Promise<Response> {
  const app = makeApp();
  const token = await createSessionToken(user, SESSION_SECRET);

  return app.request(
    '/api/members',
    {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    },
    env(db),
  );
}

function makeApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.route('/api/members', memberRoutes);
  return app;
}

function env(db: FakeMemberD1) {
  return { DB: db as unknown as D1Database, SESSION_SECRET };
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
