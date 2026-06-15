import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { expenseRoutes } from '../src/routes/expenses';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, ApiErrorCode, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const currentUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

type FakeExpenseUpdateRow = {
  readonly group_id?: string;
  readonly created_by: string;
  readonly amount: number;
};

type FakeExpenseDeleteRow = {
  readonly group_id: string;
  readonly created_by: string;
  readonly title: string;
  readonly amount: number;
  readonly currency: 'TWD';
};

class FakeExpenseRouteD1 {
  readonly batchStatements: [string, ...unknown[]][][] = [];
  readonly expenseRows: readonly unknown[];
  readonly participantRows: readonly unknown[];
  readonly expenseDeleteRow: FakeExpenseDeleteRow | null;

  constructor(
    readonly user: SessionUser = currentUser,
    readonly expenseOwnerRow: FakeExpenseUpdateRow | null = {
      group_id: 'grp_default',
      created_by: currentUser.id,
      amount: 420,
    },
    expenseDeleteRow: FakeExpenseDeleteRow | null = expenseOwnerRow
      ? {
          group_id: expenseOwnerRow.group_id ?? 'grp_default',
          created_by: expenseOwnerRow.created_by,
          title: 'Route coffee',
          amount: expenseOwnerRow.amount,
          currency: 'TWD',
        }
      : null,
  ) {
    this.expenseDeleteRow = expenseDeleteRow;
    this.expenseRows = [
      {
        id: 'exp_route',
        title: 'Route coffee',
        description: null,
        amount: 420,
        currency: 'TWD',
        category: 'ingredients',
        expense_date: '2026-06-14',
        paid_by_user_id: user.id,
        paid_by_display_name: user.displayName,
      },
    ];
    this.participantRows = [
      {
        expense_id: 'exp_route',
        user_id: user.id,
        display_name: user.displayName,
        share_amount: 420,
      },
    ];
  }

  prepare(sql: string) {
    return new FakeExpenseRouteStatement(this, sql);
  }

  async batch(statements: readonly FakeExpenseRouteStatement[]) {
    this.batchStatements.push(
      statements.map((statement): [string, ...unknown[]] => [statement.sql, ...statement.values]),
    );
    return statements.map((statement) => ({
      success: true,
      meta: {
        changes: this.readChangeCount(statement.sql),
      },
    }));
  }

  private readChangeCount(sql: string): number {
    if (sql.includes('SET deleted_at')) {
      return this.expenseDeleteRow === null ? 0 : 1;
    }

    if (sql.includes('UPDATE expenses') && this.expenseOwnerRow === null) {
      return 0;
    }

    return 1;
  }
}

class FakeExpenseRouteStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeExpenseRouteD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]) {
    return Object.assign(new FakeExpenseRouteStatement(this.db, this.sql), { values });
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM users')) {
      return {
        id: this.db.user.id,
        email: this.db.user.email,
        display_name: this.db.user.displayName,
        avatar_url: null,
        role: this.db.user.role,
        status: this.db.user.status,
      } as T;
    }

    if (this.sql.includes('SELECT group_id') && this.sql.includes('FROM expenses')) {
      if (!this.db.expenseDeleteRow || this.db.expenseDeleteRow.group_id !== this.values[1]) {
        return null;
      }

      return this.db.expenseDeleteRow as T;
    }

    if (this.sql.includes('SELECT amount') && this.sql.includes('FROM expenses')) {
      if (
        !this.db.expenseOwnerRow ||
        (this.db.expenseOwnerRow.group_id ?? 'grp_default') !== this.values[1]
      ) {
        return null;
      }

      return this.db.expenseOwnerRow as T;
    }

    if (this.sql.includes('SELECT id') && this.sql.includes('FROM expenses')) {
      return this.db.expenseOwnerRow ? ({ id: 'exp_route' } as T) : null;
    }

    return null;
  }

  async all<T>(): Promise<{ readonly results: readonly T[] }> {
    if (this.sql.includes('FROM expenses e')) {
      return { results: this.db.expenseRows as readonly T[] };
    }

    if (this.sql.includes('FROM expense_participants ep')) {
      return { results: this.db.participantRows as readonly T[] };
    }

    return { results: [] };
  }
}

test('GET /api/expenses returns persisted D1 expenses', async () => {
  const response = await requestExpenseRoute('/api/expenses');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    expenses: [
      {
        id: 'exp_route',
        title: 'Route coffee',
        description: null,
        amount: 420,
        currency: 'TWD',
        category: 'ingredients',
        expenseDate: '2026-06-14',
        paidBy: {
          id: currentUser.id,
          displayName: currentUser.displayName,
        },
        participants: [
          {
            userId: currentUser.id,
            displayName: currentUser.displayName,
            shareAmount: 420,
          },
        ],
      },
    ],
    nextCursor: null,
  });
});

test('POST /api/expenses writes a lodging self-paid expense', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses', db, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createExpenseBody({ title: 'Conference Hotel', category: 'lodging' })),
  });

  assert.equal(response.status, 201);
  assert.match(
    ((await response.json()) as { readonly expense: { readonly id: string } }).expense.id,
    /^[0-9a-f-]+$/u,
  );
  assert.equal(db.batchStatements.length, 1);
  assert.equal(db.batchStatements[0]?.[2]?.[3], 'Conference Hotel');
  assert.equal(db.batchStatements[0]?.[2]?.[8], 'lodging');
});

test('POST /api/expenses rejects invalid bodies before D1 writes', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses', db, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: '' }),
  });

  assert.equal(response.status, 422);
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/expenses rejects creating for other users', async () => {
  const response = await requestExpenseRoute('/api/expenses', new FakeExpenseRouteD1(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      createExpenseBody({
        paidByUserId: 'usr_other',
        participants: [{ userId: currentUser.id }],
      }),
    ),
  });

  assert.equal(response.status, 403);
});

test('POST /api/expenses returns split validation failures', async () => {
  const response = await requestExpenseRoute('/api/expenses', new FakeExpenseRouteD1(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      createExpenseBody({
        splitMethod: 'custom',
        participants: [{ userId: currentUser.id }],
      }),
    ),
  });

  assert.equal(response.status, 422);
  assert.equal(
    ((await response.json()) as { readonly error: { readonly code: string } }).error.code,
    'SPLIT_TOTAL_MISMATCH',
  );
});

test('GET /api/expenses/:expenseId returns the current placeholder detail response', async () => {
  const response = await requestExpenseRoute('/api/expenses/exp_route');

  assert.equal(response.status, 501);
});

test('PATCH /api/expenses/:expenseId persists member updates', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Updated route coffee', category: 'lodging' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { expense: { id: 'exp_route' } });
  assert.equal(db.batchStatements.length, 1);
  assert.equal(db.batchStatements[0]?.[0]?.[5], 'lodging');
});

test('PATCH /api/expenses/:expenseId requires authentication', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route',
    db,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated route coffee' }),
    },
    null,
  );

  await assertApiError(response, 401, 'UNAUTHORIZED', 'Authentication is required.');
  assert.equal(db.batchStatements.length, 0);
});

test('PATCH /api/expenses/:expenseId validates update bodies', async () => {
  const response = await requestExpenseRoute('/api/expenses/exp_route', new FakeExpenseRouteD1(), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 422);
});

test('PATCH /api/expenses/:expenseId maps missing expenses to not found', async () => {
  const response = await requestExpenseRoute(
    '/api/expenses/exp_missing',
    new FakeExpenseRouteD1(currentUser, null),
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Missing' }),
    },
  );

  assert.equal(response.status, 404);
});

test('PATCH /api/expenses/:expenseId maps already deleted expenses to not found', async () => {
  const db = new FakeExpenseRouteD1(currentUser, null);
  const response = await requestExpenseRoute('/api/expenses/exp_deleted', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Deleted expense' }),
  });

  await assertApiError(response, 404, 'NOT_FOUND', 'Expense not found.');
  assert.equal(db.batchStatements.length, 0);
});

test('PATCH /api/expenses/:expenseId allows regular members to update non-creator expenses', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    created_by: 'usr_other',
    amount: 420,
  });
  const response = await requestExpenseRoute('/api/expenses/exp_other', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Other user expense' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { expense: { id: 'exp_other' } });
  assert.equal(db.batchStatements.length, 1);
});

test('PATCH /api/expenses/:expenseId validates Origin when the app middleware is mounted', async () => {
  const db = new FakeExpenseRouteD1(currentUser);
  const token = await createSessionToken(currentUser, SESSION_SECRET);
  const app = createOriginProtectedExpenseApp();
  const blockedResponse = await app.request(
    '/api/expenses/exp_route',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ title: 'Blocked update' }),
    },
    {
      DB: db as unknown as D1Database,
      SESSION_SECRET,
    },
  );

  await assertApiError(blockedResponse, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
  assert.equal(db.batchStatements.length, 0);

  const allowedResponse = await app.request(
    '/api/expenses/exp_route',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ title: 'Allowed update' }),
    },
    {
      DB: db as unknown as D1Database,
      SESSION_SECRET,
    },
  );

  assert.equal(allowedResponse.status, 200);
  assert.equal(db.batchStatements.length, 1);
});

test('DELETE /api/expenses/:expenseId soft deletes non-creator expenses for regular members', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    created_by: 'usr_other',
    amount: 420,
  });
  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(db.batchStatements.length, 1);
  assert.match(db.batchStatements[0]?.[0]?.[0] ?? '', /SET deleted_at = datetime/u);
  assert.match(db.batchStatements[0]?.[1]?.[0] ?? '', /expense_deleted/u);
});

test('DELETE /api/expenses/:expenseId requires authentication', async () => {
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route',
    new FakeExpenseRouteD1(),
    {
      method: 'DELETE',
    },
    null,
  );

  await assertApiError(response, 401, 'UNAUTHORIZED', 'Authentication is required.');
});

test('DELETE /api/expenses/:expenseId maps missing expenses to not found', async () => {
  const db = new FakeExpenseRouteD1(currentUser, null);
  const response = await requestExpenseRoute('/api/expenses/exp_missing', db, {
    method: 'DELETE',
  });

  await assertApiError(response, 404, 'NOT_FOUND', 'Expense not found.');
  assert.equal(db.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId maps already deleted expenses to not found', async () => {
  const db = new FakeExpenseRouteD1(
    currentUser,
    { group_id: 'grp_default', created_by: currentUser.id, amount: 420 },
    null,
  );
  const response = await requestExpenseRoute('/api/expenses/exp_deleted', db, {
    method: 'DELETE',
  });

  await assertApiError(response, 404, 'NOT_FOUND', 'Expense not found.');
  assert.equal(db.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId validates Origin when the app middleware is mounted', async () => {
  const db = new FakeExpenseRouteD1(currentUser);
  const token = await createSessionToken(currentUser, SESSION_SECRET);
  const app = createOriginProtectedExpenseApp();
  const blockedResponse = await app.request(
    '/api/expenses/exp_route',
    {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    },
    {
      DB: db as unknown as D1Database,
      SESSION_SECRET,
    },
  );

  await assertApiError(blockedResponse, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
  assert.equal(db.batchStatements.length, 0);

  const allowedResponse = await app.request(
    '/api/expenses/exp_route',
    {
      method: 'DELETE',
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
        Origin: 'https://lab.buy2330.cc',
      },
    },
    {
      DB: db as unknown as D1Database,
      SESSION_SECRET,
    },
  );

  assert.equal(allowedResponse.status, 200);
  assert.equal(db.batchStatements.length, 1);
});

async function requestExpenseRoute(
  path: string,
  db: FakeExpenseRouteD1 = new FakeExpenseRouteD1(),
  init: RequestInit = {},
  sessionUser: SessionUser | null = currentUser,
): Promise<Response> {
  const app = new Hono<AppBindings>();
  app.route('/api/expenses', expenseRoutes);
  const headers = new Headers(init.headers);

  if (sessionUser) {
    const token = await createSessionToken(sessionUser, SESSION_SECRET);
    headers.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
  }

  return app.request(
    path,
    {
      ...init,
      headers,
    },
    {
      DB: db as unknown as D1Database,
      SESSION_SECRET,
    },
  );
}

function createOriginProtectedExpenseApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('/api/*', validateOrigin);
  app.route('/api/expenses', expenseRoutes);

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
      readonly details: unknown;
    };
  };
  assert.equal(body.error.code, code);
  assert.equal(body.error.message, message);
  assert.deepEqual(body.error.details, {});
}

function createExpenseBody(
  overrides: Partial<{
    readonly title: string;
    readonly description: string;
    readonly amount: number;
    readonly currency: 'TWD';
    readonly paidByUserId: string;
    readonly category: 'ingredients' | 'prize' | 'lodging' | 'other';
    readonly expenseDate: string;
    readonly splitMethod: 'equal' | 'custom' | 'ratio';
    readonly participants: readonly {
      readonly userId: string;
      readonly shareAmount?: number;
      readonly ratio?: number;
    }[];
  }> = {},
) {
  return {
    title: 'Route coffee',
    description: 'Route-created coffee',
    amount: 420,
    currency: 'TWD' as const,
    paidByUserId: currentUser.id,
    category: 'ingredients' as const,
    expenseDate: '2026-06-14',
    splitMethod: 'equal' as const,
    participants: [{ userId: currentUser.id }],
    ...overrides,
  };
}
