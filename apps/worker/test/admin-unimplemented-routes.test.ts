import assert from 'node:assert/strict';
import test from 'node:test';

import app from '../src/index';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { ApiErrorCode, AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const APP_BASE_URL = 'https://lab.buy2330.cc';

type UnfinishedAdminEndpoint = {
  readonly name: string;
  readonly path: string;
  readonly method: 'GET' | 'PATCH';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly sensitiveFragments: readonly string[];
};

const jsonMutationHeaders = {
  'Content-Type': 'application/json',
  Origin: APP_BASE_URL,
};

const unfinishedAdminEndpoints: readonly UnfinishedAdminEndpoint[] = [
  {
    name: 'audit logs',
    path: '/api/admin/audit-logs',
    method: 'GET',
    sensitiveFragments: ['auditLogs'],
  },
  {
    name: 'CSV export',
    path: '/api/admin/export.csv',
    method: 'GET',
    sensitiveFragments: ['CSV', 'export', 'admin_csv_export'],
  },
  {
    name: 'Easter egg settings',
    path: '/api/admin/easter-eggs/internal-egg-id',
    method: 'PATCH',
    headers: jsonMutationHeaders,
    body: JSON.stringify({ enabled: true }),
    sensitiveFragments: ['internal-egg-id', 'Easter egg', 'settings', 'implemented'],
  },
  {
    name: 'member update',
    path: '/api/members/internal-user-id',
    method: 'PATCH',
    headers: jsonMutationHeaders,
    body: JSON.stringify({ role: 'admin' }),
    sensitiveFragments: ['internal-user-id', 'Member', 'persistence', 'implemented'],
  },
];

for (const endpoint of unfinishedAdminEndpoints) {
  test(`${endpoint.name} requires authentication before hiding unfinished endpoint`, async () => {
    const response = await requestEndpoint(endpoint);

    await assertApiError(response, 401, 'UNAUTHORIZED', 'Authentication is required.');
  });

  test(`${endpoint.name} requires admin before hiding unfinished endpoint`, async () => {
    const member = createUser({ role: 'member' });
    const response = await requestEndpoint(endpoint, member);

    await assertApiError(response, 403, 'FORBIDDEN', 'Admin authorization is required.');
  });

  test(`${endpoint.name} returns a generic 404 for admins while unfinished`, async () => {
    const admin = createUser({ role: 'admin' });
    const response = await requestEndpoint(endpoint, admin);
    const body = await assertApiError(response, 404, 'NOT_FOUND', 'Route not found.');
    const serializedBody = JSON.stringify(body).toLowerCase();

    for (const fragment of endpoint.sensitiveFragments) {
      assert.equal(serializedBody.includes(fragment.toLowerCase()), false);
    }
  });
}

async function requestEndpoint(
  endpoint: UnfinishedAdminEndpoint,
  currentUser?: SessionUser,
): Promise<Response> {
  const headers: Record<string, string> = { ...endpoint.headers };

  if (currentUser) {
    const token = await createSessionToken(currentUser, SESSION_SECRET);
    headers['Cookie'] = `${SESSION_COOKIE_NAME}=${token}`;
  }

  return app.request(
    endpoint.path,
    {
      method: endpoint.method,
      headers,
      body: endpoint.body,
    },
    createEnv(currentUser ?? null),
  );
}

async function assertApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): Promise<unknown> {
  assert.equal(response.status, status);

  const body = await response.json();

  assert.deepEqual(body, {
    error: {
      code,
      message,
      details: {},
    },
  });

  return body;
}

function createEnv(currentUser: SessionUser | null): AppBindings['Bindings'] {
  return {
    DB: new FakeCurrentUserD1(currentUser) as unknown as D1Database,
    SESSION_SECRET,
    APP_BASE_URL,
  };
}

function createUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'usr_current',
    email: 'current@example.test',
    displayName: 'Current User',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    ...overrides,
  };
}

class FakeCurrentUserD1 {
  constructor(private readonly currentUser: SessionUser | null) {}

  prepare() {
    return new FakeCurrentUserStatement(this.currentUser);
  }
}

class FakeCurrentUserStatement {
  constructor(private readonly currentUser: SessionUser | null) {}

  bind() {
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (!this.currentUser) {
      return null;
    }

    return {
      id: this.currentUser.id,
      email: this.currentUser.email ?? null,
      display_name: this.currentUser.displayName,
      avatar_url: this.currentUser.avatarUrl ?? null,
      role: this.currentUser.role,
      status: this.currentUser.status,
    } as T;
  }
}
