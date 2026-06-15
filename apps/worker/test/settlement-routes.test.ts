import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { settlementRoutes } from '../src/routes/settlements';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { loadSettlementData } from '../src/services/payment.service';
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

class FakeSettlementD1 {
  constructor(
    readonly currentUser: SessionUser = alice,
    private readonly members = [
      { user_id: alice.id, display_name: alice.displayName },
      { user_id: bob.id, display_name: bob.displayName },
    ],
    private readonly expenses = [
      {
        id: 'exp_1',
        paid_by_user_id: alice.id,
        amount: 600,
        deleted_at: null as string | null,
      },
    ],
    private readonly participants = [
      { expense_id: 'exp_1', user_id: alice.id, share_amount: 300 },
      { expense_id: 'exp_1', user_id: bob.id, share_amount: 300 },
    ],
    private readonly payments: Array<{
      id: string;
      from_user_id: string;
      from_display_name: string;
      to_user_id: string;
      to_display_name: string;
      amount: number;
      currency: 'TWD';
      note: string | null;
      status: 'pending' | 'confirmed';
      created_at: string;
      confirmed_at: string | null;
    }> = [],
  ) {}

  prepare(sql: string) {
    return new FakeSettlementStatement(this, sql);
  }

  async batch() {
    return [];
  }

  getMembers() {
    return this.members;
  }

  getExpenses() {
    return this.expenses;
  }

  getParticipants() {
    return this.participants;
  }

  getPayments() {
    return this.payments;
  }
}

class FakeSettlementStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeSettlementD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]) {
    return Object.assign(new FakeSettlementStatement(this.db, this.sql), { values });
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

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM group_members')) {
      return { results: this.db.getMembers() as unknown as T[] };
    }
    if (this.sql.includes('FROM expenses')) {
      return { results: this.db.getExpenses() as unknown as T[] };
    }
    if (this.sql.includes('FROM expense_participants')) {
      return { results: this.db.getParticipants() as unknown as T[] };
    }
    if (this.sql.includes('FROM payments')) {
      return { results: this.db.getPayments() as unknown as T[] };
    }
    return { results: [] };
  }
}

function makeApp(_db: FakeSettlementD1) {
  const app = new Hono<AppBindings>();
  app.use('*', validateOrigin);
  app.route('/api/settlements', settlementRoutes);
  return app;
}

async function authCookie(user: SessionUser) {
  const token = await createSessionToken(
    { id: user.id, displayName: user.displayName, role: user.role, status: user.status },
    SESSION_SECRET,
  );
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function env(db: FakeSettlementD1) {
  return { DB: db as unknown as D1Database, SESSION_SECRET };
}

// loadSettlementData unit tests

test('loadSettlementData returns members, expenses with participants, and payments', async () => {
  const db = new FakeSettlementD1();
  const data = await loadSettlementData(db as unknown as D1Database);

  assert.equal(data.members.length, 2);
  assert.equal(data.members[0].userId, alice.id);
  assert.equal(data.expenses.length, 1);
  assert.equal(data.expenses[0].participants.length, 2);
  assert.equal(data.payments.length, 0);
});

test('loadSettlementData maps payment rows to camelCase records', async () => {
  const db = new FakeSettlementD1(alice, undefined, undefined, undefined, [
    {
      id: 'pay_1',
      from_user_id: bob.id,
      from_display_name: bob.displayName,
      to_user_id: alice.id,
      to_display_name: alice.displayName,
      amount: 300,
      currency: 'TWD' as const,
      note: null,
      status: 'pending' as const,
      created_at: '2026-06-15 10:00:00',
      confirmed_at: null,
    },
  ]);

  const data = await loadSettlementData(db as unknown as D1Database);
  assert.equal(data.payments.length, 1);
  assert.equal(data.payments[0].fromUserId, bob.id);
  assert.equal(data.payments[0].fromDisplayName, bob.displayName);
  assert.equal(data.payments[0].toUserId, alice.id);
  assert.equal(data.payments[0].toDisplayName, alice.displayName);
  assert.equal(data.payments[0].status, 'pending');
});

test('loadSettlementData handles empty results gracefully', async () => {
  const db = new FakeSettlementD1(alice, [], [], [], []);
  const data = await loadSettlementData(db as unknown as D1Database);

  assert.equal(data.members.length, 0);
  assert.equal(data.expenses.length, 0);
  assert.equal(data.payments.length, 0);
});

test('loadSettlementData handles null results from D1 gracefully', async () => {
  // Simulates D1 returning { results: undefined } (can happen in edge cases)
  const nullResultsDb = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: undefined }),
        first: async () => null,
      }),
    }),
    batch: async () => [],
  };
  const data = await loadSettlementData(nullResultsDb as unknown as D1Database);

  assert.equal(data.members.length, 0);
  assert.equal(data.expenses.length, 0);
  assert.equal(data.payments.length, 0);
});

// GET /api/settlements/summary route tests

test('GET /api/settlements/summary returns balances and suggested transfers', async () => {
  const db = new FakeSettlementD1();
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/settlements/summary',
    {
      method: 'GET',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    currency: string;
    balances: unknown[];
    suggestedTransfers: unknown[];
    pendingPayments: unknown[];
  };
  assert.equal(body.currency, 'TWD');
  assert.ok(Array.isArray(body.balances));
  assert.ok(Array.isArray(body.suggestedTransfers));
  assert.ok(Array.isArray(body.pendingPayments));
  // Alice paid 600, each owes 300: alice net +300, bob net -300
  assert.equal(body.balances.length, 2);
  assert.equal((body.suggestedTransfers as Array<{ amount: number }>)[0].amount, 300);
});

test('GET /api/settlements/summary includes pending payments but does not deduct them from balances', async () => {
  const db = new FakeSettlementD1(alice, undefined, undefined, undefined, [
    {
      id: 'pay_1',
      from_user_id: bob.id,
      from_display_name: bob.displayName,
      to_user_id: alice.id,
      to_display_name: alice.displayName,
      amount: 300,
      currency: 'TWD' as const,
      note: null,
      status: 'pending' as const,
      created_at: '2026-06-15 10:00:00',
      confirmed_at: null,
    },
  ]);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/settlements/summary',
    {
      method: 'GET',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    balances: Array<{ userId: string; net: number }>;
    pendingPayments: Array<{ id: string; fromDisplayName: string; toDisplayName: string }>;
    suggestedTransfers: unknown[];
  };
  // Pending payment should NOT reduce alice's balance
  const aliceBalance = body.balances.find((b) => b.userId === alice.id);
  assert.equal(aliceBalance?.net, 300);
  assert.equal(body.pendingPayments.length, 1);
  assert.equal(body.pendingPayments[0].id, 'pay_1');
  assert.equal(body.pendingPayments[0].fromDisplayName, bob.displayName);
  assert.equal(body.pendingPayments[0].toDisplayName, alice.displayName);
  // Transfer still suggested since pending doesn't settle
  assert.equal(body.suggestedTransfers.length, 1);
});

test('GET /api/settlements/summary confirmed payments reduce balances', async () => {
  const db = new FakeSettlementD1(alice, undefined, undefined, undefined, [
    {
      id: 'pay_1',
      from_user_id: bob.id,
      from_display_name: bob.displayName,
      to_user_id: alice.id,
      to_display_name: alice.displayName,
      amount: 300,
      currency: 'TWD' as const,
      note: null,
      status: 'confirmed' as const,
      created_at: '2026-06-15 10:00:00',
      confirmed_at: '2026-06-15 11:00:00',
    },
  ]);
  const app = makeApp(db);
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/settlements/summary',
    {
      method: 'GET',
      headers: { Cookie: cookie, Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    balances: Array<{ userId: string; net: number }>;
    suggestedTransfers: unknown[];
    pendingPayments: unknown[];
  };
  // Confirmed payment settles the balance: alice net 0, bob net 0
  const aliceBalance = body.balances.find((b) => b.userId === alice.id);
  assert.equal(aliceBalance?.net, 0);
  assert.equal(body.suggestedTransfers.length, 0);
  assert.equal(body.pendingPayments.length, 0);
});

test('GET /api/settlements/summary requires authentication', async () => {
  const db = new FakeSettlementD1();
  const app = makeApp(db);

  const response = await app.request(
    '/api/settlements/summary',
    {
      method: 'GET',
      headers: { Origin: 'https://lab.buy2330.cc' },
    },
    env(db),
  );

  assert.equal(response.status, 401);
});
