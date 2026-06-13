import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { requireAdmin } from '../src/middleware/require-admin';
import { requireAuth } from '../src/middleware/require-auth';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';

test('requireAuth rejects stale active session after user is disabled in D1', async () => {
  const token = await createSessionToken(createSessionUser({ status: 'active' }), SESSION_SECRET);
  const app = createProtectedApp(createFakeD1(createSessionUser({ status: 'disabled' })));

  const response = await app.request('/private', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  });

  assert.equal(response.status, 403);
});

test('requireAuth rejects requests without a valid session token', async () => {
  const app = createProtectedApp(createFakeD1(createSessionUser()));

  const response = await app.request('/private');

  assert.equal(response.status, 401);
});

test('requireAuth rejects sessions whose user no longer exists in D1', async () => {
  const token = await createSessionToken(createSessionUser(), SESSION_SECRET);
  const app = createProtectedApp(createMissingUserD1());

  const response = await app.request('/private', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  });

  assert.equal(response.status, 401);
});

test('requireAdmin rejects stale admin session after user is demoted in D1', async () => {
  const token = await createSessionToken(createSessionUser({ role: 'admin' }), SESSION_SECRET);
  const app = createProtectedApp(createFakeD1(createSessionUser({ role: 'member' })));

  const response = await app.request('/admin', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  });

  assert.equal(response.status, 403);
});

test('requireAdmin accepts current active admins from D1', async () => {
  const token = await createSessionToken(createSessionUser({ role: 'admin' }), SESSION_SECRET);
  const app = createProtectedApp(createFakeD1(createSessionUser({ role: 'admin' })));

  const response = await app.request('/admin', {
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
    },
  });

  assert.equal(response.status, 200);
});

function createProtectedApp(db: D1Database) {
  const app = new Hono<AppBindings>();

  app.get('/private', requireAuth, (c) => c.json({ user: c.get('currentUser') }));
  app.get('/admin', requireAuth, requireAdmin, (c) => c.json({ ok: true }));

  return {
    request: (path: string, init?: RequestInit) =>
      app.request(path, init, {
        DB: db,
        SESSION_SECRET,
      }),
  };
}

function createFakeD1(user: SessionUser): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          id: user.id,
          email: user.email ?? null,
          display_name: user.displayName,
          avatar_url: user.avatarUrl ?? null,
          role: user.role,
          status: user.status,
        }),
      }),
    }),
  } as unknown as D1Database;
}

function createMissingUserD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => null,
      }),
    }),
  } as unknown as D1Database;
}

function createSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'usr_1',
    email: 'user@example.com',
    displayName: 'User',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    ...overrides,
  };
}
