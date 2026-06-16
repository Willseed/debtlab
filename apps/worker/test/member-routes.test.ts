import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { memberRoutes } from '../src/routes/members';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';

const alice: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
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
      readonly joined_at: string | null;
    }[] = [],
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
    if (this.sql.includes('FROM group_members')) {
      return { results: this.db.getMembers() as readonly T[] };
    }

    return { results: [] };
  }
}

test('GET /api/members returns default-group members and the current user fallback', async () => {
  const db = new FakeMemberD1(alice, [
    {
      user_id: 'usr_bob',
      display_name: 'Bob',
      role: 'member',
      status: 'active',
      joined_at: '2026-06-16 09:00:00',
    },
  ]);
  const response = await requestMembers(db, alice);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    members: [
      {
        userId: 'usr_bob',
        displayName: 'Bob',
        role: 'member',
        status: 'active',
        joinedAt: '2026-06-16 09:00:00',
      },
      {
        userId: alice.id,
        displayName: alice.displayName,
        role: alice.role,
        status: alice.status,
        joinedAt: null,
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
