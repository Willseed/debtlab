import assert from 'node:assert/strict';
import test from 'node:test';

import { authRoutes } from '../src/routes/auth';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '../src/services/auth.service';
import { DEFAULT_GROUP_ID } from '../src/services/default-group.service';
import { AppBindings, SessionUser, UserStatus } from '../src/types';
import { assertApiError, readSetCookie, requestAuthRoute } from './auth-test-helpers';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const INVITE_CODE = 'test-invite-code-placeholder';
const AUTH_ACTIVATE_RATE_LIMIT_KEY = 'auth-activate:usr_pending';
const TEST_ENV: AppBindings['Bindings'] = {
  DB: {} as D1Database,
  SESSION_SECRET,
  LAB_INVITE_CODE: INVITE_CODE,
  APP_BASE_URL: 'https://lab.buy2330.cc',
};

type UserRow = {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly role: 'member' | 'admin';
  readonly status: UserStatus;
};

type GroupMemberRow = {
  readonly group_id: string;
  readonly user_id: string;
  readonly role: 'member' | 'admin';
  readonly status: UserStatus;
};

type StoredRateLimitRow = {
  attempts: number;
  reset_at: string;
  updated_at: string;
};

type ActivationResponseBody = {
  readonly user: SessionUser;
};

test('invite activation activates a pending user, joins the default group, and reissues the session', async () => {
  const pendingUser = createSessionUser({ status: 'pending' });
  const db = new FakeAuthActivationD1(
    [userRowFromSession(pendingUser)],
    [
      [
        AUTH_ACTIVATE_RATE_LIMIT_KEY,
        {
          attempts: 2,
          reset_at: utc8TextFromNow(60),
          updated_at: utc8TextFromNow(0),
        },
      ],
    ],
  );
  const response = await requestActivate(db, pendingUser, INVITE_CODE);

  assert.equal(response.status, 200);
  const body = (await response.json()) as ActivationResponseBody;
  assert.deepEqual(body, {
    user: {
      ...pendingUser,
      status: 'active',
    },
  });
  assert.equal(JSON.stringify(body).includes(INVITE_CODE), false);
  assert.equal(db.users.get(pendingUser.id)?.status, 'active');
  assert.deepEqual(db.groupMembers.get(groupMemberKey(DEFAULT_GROUP_ID, pendingUser.id)), {
    group_id: DEFAULT_GROUP_ID,
    user_id: pendingUser.id,
    role: 'member',
    status: 'active',
  });
  assert.equal(db.rateLimits.has(AUTH_ACTIVATE_RATE_LIMIT_KEY), false);

  const sessionUser = await verifySessionToken(readSessionCookieValue(response), SESSION_SECRET);
  assert.equal(sessionUser?.status, 'active');
});

test('wrong invite code keeps the pending user unchanged with a generic zh-TW error', async () => {
  const pendingUser = createSessionUser({ status: 'pending' });
  const db = new FakeAuthActivationD1([userRowFromSession(pendingUser)]);
  const response = await requestActivate(db, pendingUser, 'wrong-placeholder-code');

  await assertApiError(response, 422, 'INVITE_CODE_INVALID', '邀請碼不正確或已失效。');
  assert.equal(db.users.get(pendingUser.id)?.status, 'pending');
  assert.equal(db.groupMembers.has(groupMemberKey(DEFAULT_GROUP_ID, pendingUser.id)), false);
  assert.equal(db.rateLimits.get(AUTH_ACTIVATE_RATE_LIMIT_KEY)?.attempts, 1);
  assert.equal(readSetCookie(response), '');
});

test('invite activation returns 429 with retry metadata when the user window is exhausted', async () => {
  const pendingUser = createSessionUser({ status: 'pending' });
  const db = new FakeAuthActivationD1(
    [userRowFromSession(pendingUser)],
    [
      [
        AUTH_ACTIVATE_RATE_LIMIT_KEY,
        {
          attempts: 3,
          reset_at: utc8TextFromNow(60),
          updated_at: utc8TextFromNow(0),
        },
      ],
    ],
  );
  const response = await requestActivate(db, pendingUser, INVITE_CODE);
  const details = await assertApiError(
    response,
    429,
    'RATE_LIMITED',
    '邀請碼嘗試太頻繁，請稍後再試。',
  );

  assert.equal(Number(response.headers.get('Retry-After')) > 0, true);
  assert.deepEqual(details, {
    retryAfterSeconds: Number(response.headers.get('Retry-After')),
    limit: 3,
    windowSeconds: 60,
  });
  assert.equal(db.users.get(pendingUser.id)?.status, 'pending');
  assert.equal(db.groupMembers.has(groupMemberKey(DEFAULT_GROUP_ID, pendingUser.id)), false);
});

for (const status of ['active', 'disabled'] as const) {
  test(`invite activation rejects ${status} users without changing memberships`, async () => {
    const user = createSessionUser({ status });
    const db = new FakeAuthActivationD1([userRowFromSession(user)]);
    const response = await requestActivate(db, user, INVITE_CODE);

    await assertApiError(
      response,
      409,
      'CONFLICT',
      'User activation is only available for pending users.',
    );
    assert.equal(db.users.get(user.id)?.status, status);
    assert.equal(db.groupMembers.has(groupMemberKey(DEFAULT_GROUP_ID, user.id)), false);
    assert.equal(db.rateLimits.size, 0);
  });
}

test('invite activation requires a valid current user session', async () => {
  const noCookieResponse = await requestAuthRoute(
    '/api/auth/activate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: INVITE_CODE }),
    },
    TEST_ENV,
    { DB: new FakeAuthActivationD1() as unknown as D1Database },
    authRoutes,
  );

  await assertApiError(noCookieResponse, 401, 'UNAUTHORIZED', 'Authentication is required.');

  const pendingUser = createSessionUser({ status: 'pending' });
  const missingUserResponse = await requestActivate(
    new FakeAuthActivationD1(),
    pendingUser,
    INVITE_CODE,
  );

  await assertApiError(missingUserResponse, 401, 'UNAUTHORIZED', 'Authentication is required.');
});

class FakeAuthActivationD1 {
  readonly users: Map<string, UserRow>;
  readonly groups = new Set<string>();
  readonly groupMembers = new Map<string, GroupMemberRow>();
  readonly rateLimits: Map<string, StoredRateLimitRow>;

  constructor(
    users: readonly UserRow[] = [],
    rateLimits: readonly (readonly [string, StoredRateLimitRow])[] = [],
  ) {
    this.users = new Map(users.map((user) => [user.id, { ...user }]));
    this.rateLimits = new Map(rateLimits.map(([key, row]) => [key, { ...row }]));
  }

  prepare(sql: string) {
    return new FakeAuthActivationStatement(this, sql);
  }

  async batch(statements: FakeAuthActivationStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

class FakeAuthActivationStatement {
  private values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeAuthActivationD1,
    private readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM rate_limits')) {
      const row = this.db.rateLimits.get(String(this.values[0]));
      return row ? ({ attempts: row.attempts, reset_at: row.reset_at } as T) : null;
    }

    if (this.sql.includes('FROM users')) {
      return (this.db.users.get(String(this.values[0])) ?? null) as T | null;
    }

    return null;
  }

  async run() {
    if (this.sql.includes('INSERT INTO rate_limits')) {
      const [keyValue, resetAtValue, updatedAtValue] = this.values;
      this.db.rateLimits.set(String(keyValue), {
        attempts: 1,
        reset_at: String(resetAtValue),
        updated_at: String(updatedAtValue),
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes('SET attempts = 1')) {
      const [resetAtValue, updatedAtValue, keyValue] = this.values;
      this.db.rateLimits.set(String(keyValue), {
        attempts: 1,
        reset_at: String(resetAtValue),
        updated_at: String(updatedAtValue),
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes('SET attempts = attempts + 1')) {
      const [updatedAtValue, keyValue] = this.values;
      const key = String(keyValue);
      const row = this.db.rateLimits.get(key);

      if (row) {
        this.db.rateLimits.set(key, {
          ...row,
          attempts: row.attempts + 1,
          updated_at: String(updatedAtValue),
        });
      }

      return { meta: { changes: row ? 1 : 0 } };
    }

    if (this.sql.includes('DELETE FROM rate_limits')) {
      const deleted = this.db.rateLimits.delete(String(this.values[0]));
      return { meta: { changes: deleted ? 1 : 0 } };
    }

    if (this.sql.includes("SET status = 'active'")) {
      const [userId] = this.values;
      const user = this.db.users.get(String(userId));

      if (user?.status === 'pending') {
        this.db.users.set(user.id, {
          ...user,
          status: 'active',
        });
      }

      return { meta: { changes: user?.status === 'pending' ? 1 : 0 } };
    }

    if (this.sql.includes('INSERT OR IGNORE INTO groups')) {
      this.db.groups.add(String(this.values[0]));
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes('INSERT INTO group_members')) {
      const [, groupId, userId, role] = this.values;
      this.db.groupMembers.set(groupMemberKey(String(groupId), String(userId)), {
        group_id: String(groupId),
        user_id: String(userId),
        role: role === 'admin' ? 'admin' : 'member',
        status: 'active',
      });
      return { meta: { changes: 1 } };
    }

    throw new Error(`Unsupported auth activation SQL: ${this.sql}`);
  }
}

async function requestActivate(
  db: FakeAuthActivationD1,
  user: SessionUser,
  inviteCode: string,
): Promise<Response> {
  const token = await createSessionToken(user, SESSION_SECRET);

  return requestAuthRoute(
    '/api/auth/activate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ inviteCode }),
    },
    TEST_ENV,
    { DB: db as unknown as D1Database },
    authRoutes,
  );
}

function readSessionCookieValue(response: Response): string {
  const match = new RegExp(`${SESSION_COOKIE_NAME}=([^;\\n]+)`).exec(readSetCookie(response));
  assert.ok(match);

  return match[1];
}

function createSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'usr_pending',
    email: 'pending@example.test',
    displayName: 'Pending User',
    avatarUrl: null,
    role: 'member',
    status: 'pending',
    ...overrides,
  };
}

function userRowFromSession(user: SessionUser): UserRow {
  return {
    id: user.id,
    email: user.email ?? null,
    display_name: user.displayName,
    avatar_url: user.avatarUrl ?? null,
    role: user.role,
    status: user.status,
  };
}

function groupMemberKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

function utc8TextFromNow(offsetSeconds: number): string {
  const date = new Date(Date.now() + offsetSeconds * 1000 + 8 * 60 * 60 * 1000);

  return (
    [
      date.getUTCFullYear(),
      padDatePart(date.getUTCMonth() + 1),
      padDatePart(date.getUTCDate()),
    ].join('-') +
    ` ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(
      date.getUTCSeconds(),
    )}`
  );
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}
