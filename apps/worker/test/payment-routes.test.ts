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

const carol: SessionUser = {
  id: 'usr_carol',
  email: 'carol@example.test',
  displayName: 'Carol',
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

type ExpenseParticipantRow = {
  readonly id: string;
  readonly expense_id: string;
  readonly user_id: string;
  readonly share_amount: number;
  readonly is_settled: 0 | 1;
  readonly settled_at: string | null;
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
  pendingPayment: PaymentRow | null;
  readonly duplicatePendingPayment: Pick<PaymentRow, 'id'> | null;
  participantRows: ExpenseParticipantRow[] = [
    {
      id: 'epp_alice',
      expense_id: 'exp_settlement',
      user_id: alice.id,
      share_amount: 300,
      is_settled: 0,
      settled_at: null,
    },
    {
      id: 'epp_bob',
      expense_id: 'exp_settlement',
      user_id: bob.id,
      share_amount: 300,
      is_settled: 0,
      settled_at: null,
    },
  ];

  constructor(
    readonly currentUser: SessionUser = alice,
    pendingPayment: PaymentRow | null = DEFAULT_PENDING_PAYMENT,
    readonly opts: {
      duplicatePendingPayment?: Pick<PaymentRow, 'id'> | null;
      forceZeroChanges?: boolean;
      throwOnBatch?: boolean;
      forceNullMeta?: boolean;
      includeCarolMember?: boolean;
      activeMemberIds?: readonly string[];
      settlementExpensePayerId?: string;
    } = {},
  ) {
    this.pendingPayment = pendingPayment;
    this.duplicatePendingPayment = opts.duplicatePendingPayment ?? null;
  }

  prepare(sql: string) {
    return new FakePaymentStatement(this, sql);
  }

  async batch(statements: readonly FakePaymentStatement[]) {
    if (this.opts.throwOnBatch) {
      throw new Error('Simulated D1 failure');
    }
    this.batchStatements.push(statements.map((s): [string, ...unknown[]] => [s.sql, ...s.values]));
    const results = statements.map((s) => ({
      success: true,
      meta: { changes: this.opts.forceNullMeta ? undefined : this.changeCount(s.sql) },
    }));
    for (const statement of statements) {
      this.applyStatement(statement);
    }
    return results;
  }

  private changeCount(sql: string): number {
    if (sql.includes("SET status = 'confirmed'")) {
      if (this.opts.forceZeroChanges) return 0;
      return this.pendingPayment !== null && this.pendingPayment.status === 'pending' ? 1 : 0;
    }
    return 1;
  }

  private applyStatement(statement: FakePaymentStatement): void {
    if (statement.sql.includes("SET status = 'confirmed'") && this.pendingPayment) {
      this.pendingPayment = {
        ...this.pendingPayment,
        status: 'confirmed',
        confirmed_at: '2026-06-17 01:34:00',
      };
      return;
    }

    if (statement.sql.includes('SET is_settled = 1')) {
      this.markParticipantSettled(statement.values);
    }
  }

  private markParticipantSettled(values: readonly unknown[]): void {
    const fromUserId = values[1];
    const toUserId = values[2];

    const payment = this.pendingPayment;

    if (typeof fromUserId !== 'string' || typeof toUserId !== 'string') {
      return;
    }

    if (
      payment?.status !== 'confirmed' ||
      payment.from_user_id !== fromUserId ||
      payment.to_user_id !== toUserId
    ) {
      return;
    }

    this.participantRows = this.participantRows.map((participant) =>
      participant.user_id === fromUserId && participant.share_amount <= payment.amount
        ? { ...participant, is_settled: 1, settled_at: '2026-06-17 01:34:00' }
        : participant,
    );
  }

  readActiveMemberIds(): readonly string[] {
    if (this.opts.activeMemberIds) {
      return this.opts.activeMemberIds;
    }

    const memberIds = [alice.id, bob.id];

    if (this.opts.includeCarolMember) {
      memberIds.push(carol.id);
    }

    return memberIds;
  }

  readSettlementExpensePayerId(): string {
    return this.opts.settlementExpensePayerId ?? bob.id;
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

    if (this.sql.includes("status = 'pending'") && this.sql.includes('LIMIT 1')) {
      return this.db.duplicatePendingPayment as T | null;
    }

    if (this.sql.includes('FROM payments')) {
      return this.db.pendingPayment as T | null;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM group_members gm')) {
      const members = this.db.readActiveMemberIds().map((userId) => ({
        user_id: userId,
        display_name: displayNameForUser(userId),
      }));
      return { results: members as T[] };
    }

    if (this.sql.includes('FROM group_members')) {
      const members = this.db.readActiveMemberIds().map((userId) => ({ user_id: userId }));
      return { results: members as T[] };
    }

    if (this.sql.includes('FROM expenses')) {
      return {
        results: [
          {
            id: 'exp_settlement',
            paid_by_user_id: this.db.readSettlementExpensePayerId(),
            amount: 600,
            deleted_at: null,
          },
        ] as T[],
      };
    }

    if (this.sql.includes('FROM expense_participants')) {
      return {
        results: this.db.participantRows.map((participant) => ({
          expense_id: participant.expense_id,
          user_id: participant.user_id,
          share_amount: participant.share_amount,
        })) as T[],
      };
    }

    if (this.sql.includes('FROM payments')) {
      return {
        results: this.db.pendingPayment
          ? [mapPaymentRowForSettlement(this.db.pendingPayment) as T]
          : [],
      };
    }

    return { results: [] };
  }
}

function mapPaymentRowForSettlement(row: PaymentRow) {
  return {
    id: row.id,
    from_user_id: row.from_user_id,
    from_display_name: displayNameForUser(row.from_user_id),
    to_user_id: row.to_user_id,
    to_display_name: displayNameForUser(row.to_user_id),
    amount: row.amount,
    currency: row.currency,
    note: row.note,
    status: row.status,
    created_at: row.created_at,
    confirmed_at: row.confirmed_at,
  };
}

function displayNameForUser(userId: string): string {
  if (userId === alice.id) return alice.displayName;
  if (userId === bob.id) return bob.displayName;
  if (userId === carol.id) return carol.displayName;
  if (userId === adminUser.id) return adminUser.displayName;
  return userId;
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

function readAuditPayload(db: FakePaymentD1, action: string): Record<string, unknown> {
  const statement = db.batchStatements.flat().find(([sql]) => sql.includes(`'${action}'`));
  assert.ok(statement);
  return readJsonObject(statement[4]);
}

function readJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    assert.fail('Expected a JSON string.');
  }

  const parsed: unknown = JSON.parse(value);
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

function assertPaymentAuditPayloadOmitsSensitiveData(payload: Record<string, unknown>): void {
  const serializedPayload = JSON.stringify(payload);
  const sensitiveFragments = [
    'note',
    'password',
    'hunter2',
    'access_token',
    'access-token-secret',
    'Cookie',
    'labsplit_session=secret',
  ];

  for (const fragment of sensitiveFragments) {
    assert.equal(serializedPayload.includes(fragment), false);
  }
}

// POST /api/payments

test('POST /api/payments creates a pending payment and returns its id and status', async () => {
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
  const body = (await response.json()) as { payment: { id: string; status: string } };
  assert.ok(typeof body.payment.id === 'string');
  assert.equal(body.payment.status, 'pending');
  assert.ok(
    db.batchStatements.some((batch) => batch.some(([sql]) => sql.includes('INSERT INTO payments'))),
  );
  assert.deepEqual(readAuditPayload(db, 'payment_created'), {
    fromUserId: alice.id,
    toUserId: bob.id,
    amount: 300,
    status: 'pending',
  });
});

test('POST /api/payments audit log omits free-form notes and sensitive-looking values', async () => {
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
      body: JSON.stringify({
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: 300,
        note: 'password=hunter2 access_token=access-token-secret Cookie=labsplit_session=secret',
      }),
    },
    env(db),
  );

  assert.equal(response.status, 201);
  const auditPayload = readAuditPayload(db, 'payment_created');
  assert.deepEqual(auditPayload, {
    fromUserId: alice.id,
    toUserId: bob.id,
    amount: 300,
    status: 'pending',
  });
  assertPaymentAuditPayloadOmitsSensitiveData(auditPayload);
});

test('POST /api/payments lets account B record a suggested transfer from an account A expense', async () => {
  const db = new FakePaymentD1(bob, null, { settlementExpensePayerId: alice.id });
  const app = makeApp(db);
  const cookie = await authCookie(bob);

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

  assert.equal(response.status, 201);
  const body = (await response.json()) as { payment: { id: string; status: string } };
  assert.equal(body.payment.status, 'pending');
  assert.ok(
    db.batchStatements.some((batch) =>
      batch.some(
        ([sql, , , fromUserId, toUserId, amount]) =>
          sql.includes('INSERT INTO payments') &&
          fromUserId === bob.id &&
          toUserId === alice.id &&
          amount === 300,
      ),
    ),
  );
});

test('POST /api/payments rejects a receiver recording payment from another sender', async () => {
  const db = new FakePaymentD1(bob);
  const app = makeApp(db);
  const cookie = await authCookie(bob);

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

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
  assert.match(body.error.message, /payment sender or an admin/u);
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments lets an admin record and confirm a payment between other members', async () => {
  const db = new FakePaymentD1(adminUser);
  const app = makeApp(db);
  const cookie = await authCookie(adminUser);

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
  const body = (await response.json()) as { payment: { id: string; status: string } };
  assert.equal(body.payment.status, 'confirmed');
});

test('POST /api/payments rejects a third-party member recording another sender payment', async () => {
  const db = new FakePaymentD1(carol, DEFAULT_PENDING_PAYMENT, { includeCarolMember: true });
  const app = makeApp(db);
  const cookie = await authCookie(carol);

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

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
  assert.match(body.error.message, /payment sender or an admin/u);
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments rejects transfer parties that are not active default-group members', async () => {
  const db = new FakePaymentD1(alice, null, {
    activeMemberIds: [alice.id],
    settlementExpensePayerId: alice.id,
  });
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

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
  assert.match(body.error.message, /active default-group member/u);
  assert.equal(db.batchStatements.length, 0);
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

test('POST /api/payments rejects recording a payment for unrelated members', async () => {
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
      body: JSON.stringify({ fromUserId: bob.id, toUserId: carol.id, amount: 300 }),
    },
    env(db),
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'FORBIDDEN');
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments rejects transfers from the current user that are not currently suggested', async () => {
  const db = new FakePaymentD1(alice, null, { settlementExpensePayerId: alice.id });
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

  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments rejects amounts larger than the outstanding suggested transfer', async () => {
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
      body: JSON.stringify({ fromUserId: alice.id, toUserId: bob.id, amount: 301 }),
    },
    env(db),
  );

  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(db.batchStatements.length, 0);
});

test('POST /api/payments rejects duplicate pending payments for the same transfer', async () => {
  const db = new FakePaymentD1(alice, DEFAULT_PENDING_PAYMENT, {
    duplicatePendingPayment: { id: 'pay_existing' },
  });
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

  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, 'CONFLICT');
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

test('PATCH /api/payments/:paymentId/confirm marks matching expense participant settled', async () => {
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
  assert.equal(db.participantRows.find((row) => row.id === 'epp_alice')?.is_settled, 1);
  assert.ok(
    db.batchStatements.some((batch) => batch.some(([sql]) => sql.includes('SET is_settled = 1'))),
  );
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
