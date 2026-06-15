import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { paymentRoutes } from '../src/routes/payments';
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

const bob: SessionUser = {
  id: 'usr_bob',
  email: 'bob@example.test',
  displayName: 'Bob',
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

type PaymentRow = {
  readonly id: string;
  readonly group_id: string;
  readonly from_user_id: string;
  readonly to_user_id: string;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly note: string | null;
  readonly status: 'pending' | 'confirmed' | 'cancelled';
  readonly created_by: string;
  readonly created_at: string;
  readonly confirmed_at: string | null;
};

const DEFAULT_PENDING_PAYMENT: PaymentRow = {
  id: 'pay_1',
  group_id: 'grp_default',
  from_user_id: alice.id,
  to_user_id: bob.id,
  amount: 300,
  currency: 'TWD',
  note: null,
  status: 'pending',
  created_by: alice.id,
  created_at: '2026-06-15 10:00:00',
  confirmed_at: null,
};

class FakePaymentD1 {
  readonly batchStatements: [string, ...unknown[]][][] = [];
  readonly pendingPayment: PaymentRow | null;

  constructor(
    readonly currentUser: SessionUser = alice,
    pendingPayment: PaymentRow | null = DEFAULT_PENDING_PAYMENT,
    private readonly opts: {
      forceZeroChanges?: boolean;
      throwOnBatch?: boolean;
      forceNullMeta?: boolean;
    } = {},
  ) {
    this.pendingPayment = pendingPayment;
  }

  prepare(sql: string) {
    return new FakePaymentStatement(this, sql);
  }

  async batch(statements: readonly FakePaymentStatement[]) {
    if (this.opts.throwOnBatch) {
      throw new Error('Simulated D1 failure');
    }
    this.batchStatements.push(statements.map((s): [string, ...unknown[]] => [s.sql, ...s.values]));
    return statements.map((s) => ({
      success: true,
      meta: { changes: this.opts.forceNullMeta ? undefined : this.changeCount(s.sql) },
    }));
  }

  private changeCount(sql: string): number {
    if (sql.includes("SET status = 'confirmed'")) {
      if (this.opts.forceZeroChanges) return 0;
      return this.pendingPayment !== null && this.pendingPayment.status === 'pending' ? 1 : 0;
    }
    return 1;
  }
}

class FakePaymentStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakePaymentD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]) {
    return Object.assign(new FakePaymentStatement(this.db, this.sql), { values });
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

    if (this.sql.includes('FROM payments')) {
      return this.db.pendingPayment as T | null;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }
}

function makeApp(_db: FakePaymentD1) {
  const app = new Hono<AppBindings>();
  app.use('*', validateOrigin);
  app.route('/api/payments', paymentRoutes);
  return app;
}

async function authCookie(user: SessionUser) {
  const token = await createSessionToken(
    { id: user.id, displayName: user.displayName, role: user.role, status: user.status },
    SESSION_SECRET,
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function env(db: FakePaymentD1) {
  return { DB: db as unknown as D1Database, SESSION_SECRET };
}

// POST /api/payments

test('POST /api/payments creates a pending payment and returns its id', async () => {
  const db = new FakePaymentD1(alice);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ fromUserId: alice.id, toUserId: bob.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 201);
  const body = (await response.json()) as { payment: { id: string } };
  assert.ok(typeof body.payment.id === 'string');
  assert.ok(
    db.batchStatements.some((batch) => batch.some(([sql]) => sql.includes('INSERT INTO payments'))),
  );
});

test('POST /api/payments rejects self-payment', async () => {
  const db = new FakePaymentD1(alice);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ fromUserId: alice.id, toUserId: alice.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/payments rejects recording a payment for another sender', async () => {
  const db = new FakePaymentD1(alice);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ fromUserId: bob.id, toUserId: alice.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments rejects invalid body', async () => {
  const db = new FakePaymentD1(alice);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ fromUserId: alice.id, amount: -5 }),
    },
    env(db),
  );

  assert.equal(response.status, 422);
});

test('POST /api/payments requires authentication', async () => {
  const db = new FakePaymentD1(alice);
  const app = makeApp(db);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://lab.buy2330.cc' },
      body: JSON.stringify({ fromUserId: alice.id, toUserId: bob.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 401);
});

// PATCH /api/payments/:paymentId/confirm

test('PATCH /api/payments/:paymentId/confirm confirms pending payment as receiver', async () => {
  const pendingPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  const db = new FakePaymentD1(bob, pendingPayment);
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; payment: { id: string } };
  assert.equal(body.ok, true);
  assert.equal(body.payment.id, 'pay_1');
});

test('PATCH /api/payments/:paymentId/confirm allows admin to confirm any payment', async () => {
  const pendingPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  const db = new FakePaymentD1(adminUser, pendingPayment);
  const app = makeApp(db);
  const cookie = await authCookie(adminUser);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 200);
});

test('PATCH /api/payments/:paymentId/confirm rejects non-receiver member', async () => {
  const pendingPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  // alice is the sender, not receiver; should be forbidden
  const db = new FakePaymentD1(alice, pendingPayment);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
});

test('PATCH /api/payments/:paymentId/confirm returns 404 for missing payment', async () => {
  const db = new FakePaymentD1(bob, null);
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_missing/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 404);
});

test('PATCH /api/payments/:paymentId/confirm returns 409 for already confirmed payment', async () => {
  const confirmedPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'confirmed' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: '2026-06-15 11:00:00',
  };
  const db = new FakePaymentD1(bob, confirmedPayment);
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'CONFLICT');
});

test('PATCH /api/payments/:paymentId/confirm returns 409 when UPDATE returns zero changes (race condition)', async () => {
  const pendingPaymentButRaceCondition = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  // Use null confirmedPayment to force changeCount to return 0
  const db = new FakePaymentD1(bob, pendingPaymentButRaceCondition, { forceZeroChanges: true });
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 409);
  assert.equal(db.batchStatements.length, 1);
  assert.ok(db.batchStatements[0]?.every(([sql]) => !sql.includes('payment_confirmed')));
});

test('PATCH /api/payments/:paymentId/confirm returns 409 when D1 returns null meta changes', async () => {
  const pendingPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  const db = new FakePaymentD1(bob, pendingPayment, { forceNullMeta: true });
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 409);
});

test('POST /api/payments propagates unexpected errors from createPayment as 500', async () => {
  const db = new FakePaymentD1(alice, null, { throwOnBatch: true });
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/payments',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ fromUserId: alice.id, toUserId: bob.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 500);
});

test('PATCH /api/payments/:paymentId/confirm propagates unexpected errors as 500', async () => {
  const pendingPayment = {
    id: 'pay_1',
    group_id: 'grp_default',
    from_user_id: alice.id,
    to_user_id: bob.id,
    amount: 300,
    currency: 'TWD' as const,
    note: null,
    status: 'pending' as const,
    created_by: alice.id,
    created_at: '2026-06-15 10:00:00',
    confirmed_at: null,
  };
  const db = new FakePaymentD1(bob, pendingPayment, { throwOnBatch: true });
  const app = makeApp(db);
  const cookie = await authCookie(bob);

  const response = await app.request(
    '/api/payments/pay_1/confirm',
    {
      method: 'PATCH',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 500);
});
