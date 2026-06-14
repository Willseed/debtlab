import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { expenseRoutes } from '../src/routes/expenses';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const currentUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

class FakeExpenseRouteD1 {
  readonly batchStatements: [string, ...unknown[]][][] = [];
  readonly expenseRows: readonly unknown[];
  readonly participantRows: readonly unknown[];

  constructor(
    readonly user: SessionUser = currentUser,
    readonly expenseOwnerRow: { readonly created_by: string; readonly amount: number } | null = {
      created_by: currentUser.id,
      amount: 420,
    },
  ) {
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
        changes:
          statement.sql.includes('UPDATE expenses') && this.expenseOwnerRow === null ? 0 : 1,
      },
    }));
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

    if (this.sql.includes('SELECT created_by, amount')) {
      return (this.db.expenseOwnerRow ?? null) as T | null;
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

test('POST /api/expenses writes a self-paid expense', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses', db, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createExpenseBody()),
  });

  assert.equal(response.status, 201);
  assert.match(
    ((await response.json()) as { readonly expense: { readonly id: string } }).expense.id,
    /^[0-9a-f-]+$/u,
  );
  assert.equal(db.batchStatements.length, 1);
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

test('PATCH /api/expenses/:expenseId persists creator updates', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Updated route coffee' }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { expense: { id: 'exp_route' } });
  assert.equal(db.batchStatements.length, 1);
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

test('PATCH /api/expenses/:expenseId forbids non-creators', async () => {
  const response = await requestExpenseRoute(
    '/api/expenses/exp_other',
    new FakeExpenseRouteD1(currentUser, { created_by: 'usr_other', amount: 420 }),
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Other user expense' }),
    },
  );

  assert.equal(response.status, 403);
});

test('DELETE /api/expenses/:expenseId soft deletes an expense for admins', async () => {
  const adminUser: SessionUser = { ...currentUser, role: 'admin' };
  const db = new FakeExpenseRouteD1(adminUser);
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route',
    db,
    {
      method: 'DELETE',
    },
    adminUser,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(db.batchStatements.length, 1);
  assert.match(db.batchStatements[0]?.[0]?.[0] ?? '', /SET deleted_at = datetime/u);
  assert.match(db.batchStatements[0]?.[1]?.[0] ?? '', /expense_deleted/u);
});

test('DELETE /api/expenses/:expenseId maps missing expenses to not found', async () => {
  const adminUser: SessionUser = { ...currentUser, role: 'admin' };
  const db = new FakeExpenseRouteD1(adminUser, null);
  const response = await requestExpenseRoute(
    '/api/expenses/exp_missing',
    db,
    {
      method: 'DELETE',
    },
    adminUser,
  );

  assert.equal(response.status, 404);
  assert.equal(db.batchStatements.length, 1);
});

async function requestExpenseRoute(
  path: string,
  db: FakeExpenseRouteD1 = new FakeExpenseRouteD1(),
  init: RequestInit = {},
  sessionUser: SessionUser = currentUser,
): Promise<Response> {
  const token = await createSessionToken(sessionUser, SESSION_SECRET);
  const app = new Hono<AppBindings>();
  app.route('/api/expenses', expenseRoutes);
  const headers = new Headers(init.headers);
  headers.set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);

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

function createExpenseBody(
  overrides: Partial<{
    readonly title: string;
    readonly description: string;
    readonly amount: number;
    readonly currency: 'TWD';
    readonly paidByUserId: string;
    readonly category: 'ingredients' | 'prize' | 'other';
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
