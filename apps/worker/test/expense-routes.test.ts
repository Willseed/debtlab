import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { DEFAULT_GROUP_ACCESS_MESSAGE } from '../src/middleware/require-default-group-member';
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
  readonly paid_by_user_id?: string;
  readonly created_by: string;
  readonly amount: number;
  readonly split_method?: 'equal' | 'custom' | 'ratio';
  readonly participant_locked_at?: string | null;
  readonly participant_locked_by?: string | null;
};

type FakeExpenseDeleteRow = {
  readonly group_id: string;
  readonly paid_by_user_id?: string;
  readonly created_by: string;
  readonly title: string;
  readonly amount: number;
  readonly currency: 'TWD';
};

type FakeExpenseListRow = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly category: 'ingredients' | 'prize' | 'lodging' | 'other';
  readonly expense_date: string;
  readonly split_method?: 'equal' | 'custom' | 'ratio';
  readonly paid_by_user_id: string;
  readonly paid_by_display_name: string;
  readonly created_by: string;
  readonly participant_locked_at?: string | null;
  readonly participant_locked_by?: string | null;
};

type FakeExpenseParticipantRow = {
  readonly expense_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly share_amount: number;
  readonly share_ratio?: number | null;
  readonly is_settled?: 0 | 1;
  readonly settled_at?: string | null;
};

class FakeExpenseRouteD1 {
  readonly batchStatements: [string, ...unknown[]][][] = [];
  expenseRows: FakeExpenseListRow[];
  participantRows: FakeExpenseParticipantRow[];
  throwOnExpenseDetailLookup = false;
  throwOnExpenseUpdateLookup = false;
  pendingSettlementPaymentId: string | null = null;
  readonly expenseDeleteRow: FakeExpenseDeleteRow | null;
  readonly activeMemberIds: readonly string[];

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
          paid_by_user_id: expenseOwnerRow.paid_by_user_id ?? expenseOwnerRow.created_by,
          created_by: expenseOwnerRow.created_by,
          title: 'Route coffee',
          amount: expenseOwnerRow.amount,
          currency: 'TWD',
        }
      : null,
    activeMemberIds: readonly string[] = [user.id],
    participantRows: readonly FakeExpenseParticipantRow[] = [
      {
        expense_id: 'exp_route',
        user_id: user.id,
        display_name: user.displayName,
        share_amount: expenseOwnerRow?.amount ?? 420,
      },
    ],
  ) {
    this.expenseDeleteRow = expenseDeleteRow;
    this.activeMemberIds = activeMemberIds;
    this.expenseRows = [
      {
        id: 'exp_route',
        title: 'Route coffee',
        description: null,
        amount: expenseOwnerRow?.amount ?? 420,
        currency: 'TWD',
        category: 'ingredients',
        expense_date: '2026-06-14',
        paid_by_user_id: expenseOwnerRow?.paid_by_user_id ?? user.id,
        paid_by_display_name: displayNameForUser(expenseOwnerRow?.paid_by_user_id ?? user.id),
        created_by: expenseOwnerRow?.created_by ?? user.id,
      },
    ];
    this.participantRows = [...participantRows];
  }

  prepare(sql: string) {
    return new FakeExpenseRouteStatement(this, sql);
  }

  async batch(statements: readonly FakeExpenseRouteStatement[]) {
    this.batchStatements.push(
      statements.map((statement): [string, ...unknown[]] => [statement.sql, ...statement.values]),
    );
    for (const statement of statements) {
      this.applyStatement(statement);
    }
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

  private applyStatement(statement: FakeExpenseRouteStatement): void {
    if (statement.sql.includes('INSERT') && statement.sql.includes('INTO expense_participants')) {
      this.insertParticipant(statement.values);
      return;
    }

    if (statement.sql.includes('UPDATE expense_participants')) {
      this.updateParticipantShare(statement.values);
      return;
    }

    if (statement.sql.includes('DELETE FROM expense_participants')) {
      this.deleteParticipant(statement.values);
      return;
    }

    if (statement.sql.includes('participant_locked_at = COALESCE')) {
      this.lockParticipants(statement.values);
      return;
    }

    if (statement.sql.includes('participant_locked_at = NULL')) {
      this.unlockParticipants(statement.values);
    }
  }

  private insertParticipant(values: readonly unknown[]): void {
    const expenseId = readBoundString(values[1]);
    const userId = readBoundString(values[2]);

    if (!expenseId || !userId) {
      return;
    }

    if (
      this.participantRows.some((row) => row.expense_id === expenseId && row.user_id === userId)
    ) {
      return;
    }

    this.participantRows.push({
      expense_id: expenseId,
      user_id: userId,
      display_name: displayNameForUser(userId),
      share_amount: readBoundNumber(values[3]) ?? 0,
      share_ratio: readBoundNumber(values[4]),
      is_settled: 0,
      settled_at: null,
    });
  }

  private updateParticipantShare(values: readonly unknown[]): void {
    const shareAmount = readBoundNumber(values[0]);
    const shareRatio = readBoundNumber(values[1]);
    const expenseId = readBoundString(values[2]);
    const userId = readBoundString(values[3]);

    if (shareAmount === null || !expenseId || !userId) {
      return;
    }

    this.participantRows = this.participantRows.map((row) =>
      row.expense_id === expenseId && row.user_id === userId
        ? { ...row, share_amount: shareAmount, share_ratio: shareRatio }
        : row,
    );
  }

  private deleteParticipant(values: readonly unknown[]): void {
    const expenseId = readBoundString(values[0]);
    const userId = readBoundString(values[1]);

    if (!expenseId || !userId) {
      return;
    }

    this.participantRows = this.participantRows.filter(
      (row) => row.expense_id !== expenseId || row.user_id !== userId,
    );
  }

  private lockParticipants(values: readonly unknown[]): void {
    const userId = readBoundString(values[0]);
    const expenseId = readBoundString(values[1]);

    if (!userId || !expenseId) {
      return;
    }

    this.expenseRows = this.expenseRows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            participant_locked_at: row.participant_locked_at ?? '2026-06-17 01:34:00',
            participant_locked_by: row.participant_locked_by ?? userId,
          }
        : row,
    );
  }

  private unlockParticipants(values: readonly unknown[]): void {
    const expenseId = readBoundString(values[0]);

    if (!expenseId) {
      return;
    }

    this.expenseRows = this.expenseRows.map((row) =>
      row.id === expenseId
        ? {
            ...row,
            participant_locked_at: null,
            participant_locked_by: null,
          }
        : row,
    );
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
      return this.currentUserRow() as T;
    }

    if (this.sql.includes('FROM expenses e')) {
      return this.expenseListRow() as T | null;
    }

    if (this.isExpenseDeleteLookup()) {
      return this.expenseDeleteRow() as T | null;
    }

    if (this.isExpenseUpdateLookup()) {
      return this.expenseUpdateRow() as T | null;
    }

    if (this.sql.includes('SELECT id') && this.sql.includes('FROM expenses')) {
      return this.db.expenseOwnerRow ? ({ id: 'exp_route' } as T) : null;
    }

    return null;
  }

  private currentUserRow() {
    return {
      id: this.db.user.id,
      email: this.db.user.email,
      display_name: this.db.user.displayName,
      avatar_url: null,
      role: this.db.user.role,
      status: this.db.user.status,
    };
  }

  private expenseListRow() {
    if (this.db.throwOnExpenseDetailLookup) {
      throw new Error('Simulated D1 failure');
    }

    const expenseId = this.values[0];
    const row = this.db.expenseRows.find((expense) => expense.id === expenseId);
    return row ? withExpenseLockDefaults(row) : null;
  }

  private isExpenseDeleteLookup(): boolean {
    return (
      this.sql.includes('SELECT group_id') &&
      this.sql.includes('created_by') &&
      this.sql.includes('currency') &&
      this.sql.includes('FROM expenses')
    );
  }

  private expenseDeleteRow() {
    const row = this.db.expenseDeleteRow;

    if (!row || row.group_id !== this.values[1]) {
      return null;
    }

    return {
      ...row,
      paid_by_user_id: row.paid_by_user_id ?? row.created_by,
    };
  }

  private isExpenseUpdateLookup(): boolean {
    return (
      this.sql.includes('paid_by_user_id') &&
      this.sql.includes('amount') &&
      this.sql.includes('split_method') &&
      this.sql.includes('FROM expenses')
    );
  }

  private expenseUpdateRow() {
    if (this.db.throwOnExpenseUpdateLookup) {
      throw new Error('Simulated D1 failure');
    }

    const row = this.db.expenseOwnerRow;

    if (!row || (row.group_id ?? 'grp_default') !== this.values[1]) {
      return null;
    }

    return {
      ...row,
      paid_by_user_id: row.paid_by_user_id ?? row.created_by,
      split_method: row.split_method ?? 'equal',
      participant_locked_at: row.participant_locked_at ?? null,
      participant_locked_by: row.participant_locked_by ?? null,
    };
  }

  async all<T>(): Promise<{ readonly results: readonly T[] }> {
    if (this.sql.includes('FROM expenses e')) {
      return {
        results: this.db.expenseRows.map(withExpenseLockDefaults) as unknown as readonly T[],
      };
    }

    if (
      this.sql.includes('SELECT user_id, share_amount, share_ratio') &&
      this.sql.includes('FROM expense_participants')
    ) {
      return {
        results: this.db.participantRows.map((row) => ({
          user_id: row.user_id,
          share_amount: row.share_amount,
          share_ratio: row.share_ratio ?? null,
          is_settled: row.is_settled ?? 0,
          settled_at: row.settled_at ?? null,
        })) as unknown as readonly T[],
      };
    }

    if (this.sql.includes('FROM expense_participants ep')) {
      return { results: this.db.participantRows as unknown as readonly T[] };
    }

    if (this.sql.includes('FROM payments')) {
      return {
        results: this.db.pendingSettlementPaymentId
          ? ([{ to_user_id: 'usr_bob' }] as unknown as readonly T[])
          : [],
      };
    }

    if (this.sql.includes('FROM group_members')) {
      return {
        results: this.db.activeMemberIds.map((userId) => ({
          user_id: userId,
        })) as unknown as readonly T[],
      };
    }

    return { results: [] };
  }
}

function displayNameForUser(userId: string): string {
  if (userId === currentUser.id) return currentUser.displayName;
  if (userId === 'usr_bob') return 'Bob';
  if (userId === 'usr_other') return 'Other Member';
  if (userId === 'usr_carol') return 'Carol';
  return userId;
}

function withExpenseLockDefaults(row: FakeExpenseListRow) {
  return {
    ...row,
    split_method: row.split_method ?? 'equal',
    participant_locked_at: row.participant_locked_at ?? null,
    participant_locked_by: row.participant_locked_by ?? null,
  };
}

function readBoundString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoundNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
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
        participantLocked: false,
        canLockParticipants: true,
        canUnlockParticipants: false,
        canJoinParticipants: false,
        canLeaveParticipants: false,
        canEdit: true,
        canDelete: true,
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

test('POST /api/expenses accepts active default-group payer and participants', async () => {
  const db = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: currentUser.id,
      amount: 420,
    },
    undefined,
    [currentUser.id, 'usr_bob'],
  );
  const response = await requestExpenseRoute('/api/expenses', db, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      createExpenseBody({
        paidByUserId: 'usr_bob',
        participants: [{ userId: currentUser.id }, { userId: 'usr_bob' }],
      }),
    ),
  });

  assert.equal(response.status, 201);
  const participantInserts = db.batchStatements[0]?.filter(([sql]) =>
    sql.includes('INSERT INTO expense_participants'),
  );
  assert.equal(participantInserts?.length, 2);
  assert.equal(participantInserts?.[0]?.[3], currentUser.id);
  assert.equal(participantInserts?.[1]?.[3], 'usr_bob');
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

test('POST /api/expenses rejects inactive or unrelated payer users', async () => {
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

test('GET /api/expenses/:expenseId returns authorized non-creator details as read-only', async () => {
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route',
    new FakeExpenseRouteD1(currentUser, {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_other',
      created_by: 'usr_other',
      amount: 420,
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    expense: {
      id: 'exp_route',
      title: 'Route coffee',
      description: null,
      amount: 420,
      currency: 'TWD',
      category: 'ingredients',
      expenseDate: '2026-06-14',
      paidBy: {
        id: 'usr_other',
        displayName: 'Other Member',
      },
      participants: [
        {
          userId: currentUser.id,
          displayName: currentUser.displayName,
          shareAmount: 420,
        },
      ],
      participantLocked: false,
      canLockParticipants: false,
      canUnlockParticipants: false,
      canJoinParticipants: false,
      canLeaveParticipants: false,
      canEdit: false,
      canDelete: false,
    },
  });
});

test('GET /api/expenses/:expenseId propagates unexpected errors as 500', async () => {
  const db = new FakeExpenseRouteD1();
  db.throwOnExpenseDetailLookup = true;

  const response = await requestExpenseRoute('/api/expenses/exp_route', db);

  assert.equal(response.status, 500);
});

test('PUT /api/expenses/:expenseId/participants/me joins the current member', async () => {
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  const db = new FakeExpenseRouteD1(
    bob,
    {
      group_id: 'grp_default',
      paid_by_user_id: currentUser.id,
      created_by: currentUser.id,
      amount: 421,
    },
    undefined,
    ['usr_bob'],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 421,
      },
    ],
  );
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    db,
    {
      method: 'PUT',
    },
    bob,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    expense: {
      id: 'exp_route',
      title: 'Route coffee',
      description: null,
      amount: 421,
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
          shareAmount: 211,
        },
        {
          userId: 'usr_bob',
          displayName: 'Bob',
          shareAmount: 210,
        },
      ],
      participantLocked: false,
      canLockParticipants: false,
      canUnlockParticipants: false,
      canJoinParticipants: false,
      canLeaveParticipants: true,
      canEdit: false,
      canDelete: false,
    },
  });
  assert.equal(db.batchStatements.length, 1);
  assert.match(
    db.batchStatements[0]?.[0]?.[0] ?? '',
    /INSERT(?: OR IGNORE)? INTO expense_participants/u,
  );
  assert.equal(db.batchStatements[0]?.[4]?.[3], 'expense_participant_joined');
});

test('PUT /api/expenses/:expenseId/participants/me is idempotent when already joined', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses/exp_route/participants/me', db, {
    method: 'PUT',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    ((await response.json()) as { readonly expense: { readonly participants: readonly unknown[] } })
      .expense.participants,
    [
      {
        userId: currentUser.id,
        displayName: currentUser.displayName,
        shareAmount: 420,
      },
    ],
  );
  assert.equal(db.batchStatements.length, 0);
});

test('PUT /api/expenses/:expenseId/participants/me rejects locked expenses', async () => {
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  const db = new FakeExpenseRouteD1(
    bob,
    {
      group_id: 'grp_default',
      paid_by_user_id: currentUser.id,
      created_by: currentUser.id,
      amount: 420,
      participant_locked_at: '2026-06-17 01:34:00',
      participant_locked_by: currentUser.id,
    },
    undefined,
    ['usr_bob'],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 420,
      },
    ],
  );
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    db,
    { method: 'PUT' },
    bob,
  );

  await assertApiError(
    response,
    409,
    'CONFLICT',
    'Participant joining is locked for this expense.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('PUT /api/expenses/:expenseId/participants/me rejects non-member callers', async () => {
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  const db = new FakeExpenseRouteD1(
    bob,
    {
      group_id: 'grp_default',
      paid_by_user_id: currentUser.id,
      created_by: currentUser.id,
      amount: 420,
    },
    undefined,
    [],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 420,
      },
    ],
  );
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    db,
    {
      method: 'PUT',
    },
    bob,
  );

  await assertApiError(response, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  assert.equal(db.batchStatements.length, 0);
});

test('PUT /api/expenses/:expenseId/participants/me rejects custom splits', async () => {
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  const db = new FakeExpenseRouteD1(
    bob,
    {
      group_id: 'grp_default',
      paid_by_user_id: currentUser.id,
      created_by: currentUser.id,
      amount: 420,
      split_method: 'custom',
    },
    undefined,
    ['usr_bob'],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 420,
      },
    ],
  );
  const response = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    db,
    {
      method: 'PUT',
    },
    bob,
  );

  await assertApiError(
    response,
    409,
    'CONFLICT',
    'Self join and leave are only supported for equal split expenses; custom splits require payer editing.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId/participants/me leaves the current member', async () => {
  const db = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: 'usr_bob',
      amount: 421,
    },
    undefined,
    [currentUser.id],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 141,
      },
      {
        expense_id: 'exp_route',
        user_id: 'usr_bob',
        display_name: 'Bob',
        share_amount: 140,
      },
      {
        expense_id: 'exp_route',
        user_id: 'usr_carol',
        display_name: 'Carol',
        share_amount: 140,
      },
    ],
  );
  const response = await requestExpenseRoute('/api/expenses/exp_route/participants/me', db, {
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(
    ((await response.json()) as { readonly expense: { readonly participants: readonly unknown[] } })
      .expense.participants,
    [
      {
        userId: 'usr_bob',
        displayName: 'Bob',
        shareAmount: 211,
      },
      {
        userId: 'usr_carol',
        displayName: 'Carol',
        shareAmount: 210,
      },
    ],
  );
  assert.equal(db.batchStatements.length, 1);
  assert.match(db.batchStatements[0]?.[0]?.[0] ?? '', /DELETE FROM expense_participants/u);
  assert.equal(db.batchStatements[0]?.[4]?.[3], 'expense_participant_left');
});

test('DELETE /api/expenses/:expenseId/participants/me rejects non-participants and last participants', async () => {
  const nonParticipantDb = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: 'usr_bob',
      amount: 420,
    },
    undefined,
    [currentUser.id],
    [
      {
        expense_id: 'exp_route',
        user_id: 'usr_bob',
        display_name: 'Bob',
        share_amount: 420,
      },
    ],
  );
  const nonParticipantResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    nonParticipantDb,
    {
      method: 'DELETE',
    },
  );

  await assertApiError(
    nonParticipantResponse,
    409,
    'CONFLICT',
    'Current user is not an expense participant.',
  );
  assert.equal(nonParticipantDb.batchStatements.length, 0);

  const lastParticipantDb = new FakeExpenseRouteD1();
  const lastParticipantResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    lastParticipantDb,
    {
      method: 'DELETE',
    },
  );

  await assertApiError(
    lastParticipantResponse,
    409,
    'CONFLICT',
    'Expense must keep at least one participant.',
  );
  assert.equal(lastParticipantDb.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId/participants/me rejects settled participants', async () => {
  const db = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: 'usr_bob',
      amount: 420,
    },
    undefined,
    [currentUser.id],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 210,
        is_settled: 1,
        settled_at: '2026-06-17 01:34:00',
      },
      {
        expense_id: 'exp_route',
        user_id: 'usr_bob',
        display_name: 'Bob',
        share_amount: 210,
      },
    ],
  );
  const response = await requestExpenseRoute('/api/expenses/exp_route/participants/me', db, {
    method: 'DELETE',
  });

  await assertApiError(
    response,
    409,
    'CONFLICT',
    'Expense participants with pending or confirmed settlements cannot leave this expense.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId/participants/me rejects non-members and custom splits', async () => {
  const nonMemberDb = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: 'usr_bob',
      amount: 420,
    },
    undefined,
    [],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 210,
      },
      {
        expense_id: 'exp_route',
        user_id: 'usr_bob',
        display_name: 'Bob',
        share_amount: 210,
      },
    ],
  );
  const nonMemberResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    nonMemberDb,
    {
      method: 'DELETE',
    },
  );

  await assertApiError(nonMemberResponse, 403, 'FORBIDDEN', DEFAULT_GROUP_ACCESS_MESSAGE);
  assert.equal(nonMemberDb.batchStatements.length, 0);

  const customSplitDb = new FakeExpenseRouteD1(
    currentUser,
    {
      group_id: 'grp_default',
      paid_by_user_id: 'usr_bob',
      created_by: 'usr_bob',
      amount: 420,
      split_method: 'custom',
    },
    undefined,
    [currentUser.id],
    [
      {
        expense_id: 'exp_route',
        user_id: currentUser.id,
        display_name: currentUser.displayName,
        share_amount: 210,
      },
      {
        expense_id: 'exp_route',
        user_id: 'usr_bob',
        display_name: 'Bob',
        share_amount: 210,
      },
    ],
  );
  const customSplitResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participants/me',
    customSplitDb,
    {
      method: 'DELETE',
    },
  );

  await assertApiError(
    customSplitResponse,
    409,
    'CONFLICT',
    'Self join and leave are only supported for equal split expenses; custom splits require payer editing.',
  );
  assert.equal(customSplitDb.batchStatements.length, 0);
});

test('participant self-mutation routes map missing expenses to not found', async () => {
  const db = new FakeExpenseRouteD1(currentUser, null);
  const response = await requestExpenseRoute('/api/expenses/exp_missing/participants/me', db, {
    method: 'PUT',
  });

  await assertApiError(response, 404, 'NOT_FOUND', 'Expense not found.');
  assert.equal(db.batchStatements.length, 0);
});

test('PUT /api/expenses/:expenseId/participant-lock lets payer lock joining', async () => {
  const db = new FakeExpenseRouteD1();
  const response = await requestExpenseRoute('/api/expenses/exp_route/participant-lock', db, {
    method: 'PUT',
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    readonly expense: {
      readonly participantLocked: boolean;
      readonly canLockParticipants: boolean;
      readonly canUnlockParticipants: boolean;
    };
  };
  assert.equal(body.expense.participantLocked, true);
  assert.equal(body.expense.canLockParticipants, false);
  assert.equal(body.expense.canUnlockParticipants, true);
  assert.match(db.batchStatements[0]?.[0]?.[0] ?? '', /participant_locked_at/u);
  assert.equal(db.batchStatements[0]?.[1]?.[3], 'expense_participants_locked');
});

test('DELETE /api/expenses/:expenseId/participant-lock lets payer unlock joining', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: currentUser.id,
    created_by: currentUser.id,
    amount: 420,
    participant_locked_at: '2026-06-17 01:34:00',
    participant_locked_by: currentUser.id,
  });
  db.expenseRows = db.expenseRows.map((row) => ({
    ...row,
    participant_locked_at: '2026-06-17 01:34:00',
    participant_locked_by: currentUser.id,
  }));

  const response = await requestExpenseRoute('/api/expenses/exp_route/participant-lock', db, {
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    readonly expense: {
      readonly participantLocked: boolean;
      readonly canLockParticipants: boolean;
      readonly canUnlockParticipants: boolean;
    };
  };
  assert.equal(body.expense.participantLocked, false);
  assert.equal(body.expense.canLockParticipants, true);
  assert.equal(body.expense.canUnlockParticipants, false);
  assert.match(db.batchStatements[0]?.[0]?.[0] ?? '', /participant_locked_at = NULL/u);
  assert.equal(db.batchStatements[0]?.[1]?.[3], 'expense_participants_unlocked');
});

test('participant lock routes reject non-payers and allow admins', async () => {
  const nonPayerDb = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_other',
    created_by: 'usr_other',
    amount: 420,
  });
  const nonPayerResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participant-lock',
    nonPayerDb,
    { method: 'PUT' },
  );

  await assertApiError(
    nonPayerResponse,
    403,
    'FORBIDDEN',
    'Only the expense payer or an admin may lock participant joining.',
  );
  assert.equal(nonPayerDb.batchStatements.length, 0);

  const admin: SessionUser = {
    id: 'usr_carol',
    email: 'carol@example.test',
    displayName: 'Carol',
    role: 'admin',
    status: 'active',
  };
  const adminDb = new FakeExpenseRouteD1(admin, {
    group_id: 'grp_default',
    paid_by_user_id: currentUser.id,
    created_by: currentUser.id,
    amount: 420,
  });
  const adminResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participant-lock',
    adminDb,
    { method: 'PUT' },
    admin,
  );

  assert.equal(adminResponse.status, 200);
  assert.equal(adminDb.batchStatements.length, 1);
});

test('participant lock routes map missing expenses to not found', async () => {
  const lockResponse = await requestExpenseRoute(
    '/api/expenses/exp_missing/participant-lock',
    new FakeExpenseRouteD1(currentUser, null),
    { method: 'PUT' },
  );

  await assertApiError(lockResponse, 404, 'NOT_FOUND', 'Expense not found.');

  const unlockResponse = await requestExpenseRoute(
    '/api/expenses/exp_missing/participant-lock',
    new FakeExpenseRouteD1(currentUser, null),
    { method: 'DELETE' },
  );

  await assertApiError(unlockResponse, 404, 'NOT_FOUND', 'Expense not found.');
});

test('DELETE /api/expenses/:expenseId/participant-lock rejects non-payers', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_other',
    created_by: 'usr_other',
    amount: 420,
    participant_locked_at: '2026-06-17 01:34:00',
    participant_locked_by: 'usr_other',
  });
  const response = await requestExpenseRoute('/api/expenses/exp_route/participant-lock', db, {
    method: 'DELETE',
  });

  await assertApiError(
    response,
    403,
    'FORBIDDEN',
    'Only the expense payer or an admin may lock participant joining.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('participant lock routes propagate unexpected errors as 500', async () => {
  const lockDb = new FakeExpenseRouteD1();
  lockDb.throwOnExpenseUpdateLookup = true;
  const lockResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participant-lock',
    lockDb,
    {
      method: 'PUT',
    },
  );

  assert.equal(lockResponse.status, 500);
  assert.equal(lockDb.batchStatements.length, 0);

  const unlockDb = new FakeExpenseRouteD1();
  unlockDb.throwOnExpenseUpdateLookup = true;
  const unlockResponse = await requestExpenseRoute(
    '/api/expenses/exp_route/participant-lock',
    unlockDb,
    {
      method: 'DELETE',
    },
  );

  assert.equal(unlockResponse.status, 500);
  assert.equal(unlockDb.batchStatements.length, 0);
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

test('PATCH /api/expenses/:expenseId propagates unexpected errors as 500', async () => {
  const db = new FakeExpenseRouteD1();
  db.throwOnExpenseUpdateLookup = true;

  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Updated route coffee' }),
  });

  assert.equal(response.status, 500);
  assert.equal(db.batchStatements.length, 0);
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

test('PATCH /api/expenses/:expenseId rejects non-payers', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_other',
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

  await assertApiError(
    response,
    403,
    'FORBIDDEN',
    'Only the expense payer may edit or delete this expense.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('PATCH /api/expenses/:expenseId allows payer even when another member recorded it', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: currentUser.id,
    created_by: 'usr_bob',
    amount: 420,
  });
  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Payer update' }),
  });

  assert.equal(response.status, 200);
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

test('DELETE /api/expenses/:expenseId rejects non-payers', async () => {
  const db = new FakeExpenseRouteD1(currentUser, {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_other',
    created_by: 'usr_other',
    amount: 420,
  });
  const response = await requestExpenseRoute('/api/expenses/exp_route', db, {
    method: 'DELETE',
  });

  await assertApiError(
    response,
    403,
    'FORBIDDEN',
    'Only the expense payer may edit or delete this expense.',
  );
  assert.equal(db.batchStatements.length, 0);
});

test('DELETE /api/expenses/:expenseId soft deletes creator expenses', async () => {
  const db = new FakeExpenseRouteD1();
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
