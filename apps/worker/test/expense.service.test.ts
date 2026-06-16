import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExpense,
  deleteExpense,
  ExpenseForbiddenError,
  ExpenseLastParticipantError,
  ExpenseNotFoundError,
  ExpenseParticipantLockForbiddenError,
  ExpenseParticipantLockedError,
  ExpenseParticipantForbiddenError,
  ExpenseParticipantNotFoundError,
  ExpenseParticipantSettledError,
  ExpenseParticipantSplitMethodError,
  getExpense,
  joinExpenseParticipant,
  leaveExpenseParticipant,
  listExpenses,
  lockExpenseParticipants,
  unlockExpenseParticipants,
  updateExpense,
} from '../src/services/expense.service';
import { CalculatedShare } from '../src/services/split.service';
import { ExpenseCreateInput, ExpenseUpdateInput } from '../src/validation/schemas';
import type { SessionUser } from '../src/types';

type FakeExpenseDeleteRow = {
  readonly group_id: string;
  readonly paid_by_user_id?: string;
  readonly created_by: string;
  readonly amount: number;
  readonly currency: 'TWD';
};

type FakeExpenseUpdateRow = {
  readonly group_id: string;
  readonly paid_by_user_id?: string;
  readonly created_by: string;
  readonly amount: number;
  readonly split_method?: 'equal' | 'custom' | 'ratio';
  readonly participant_locked_at?: string | null;
  readonly participant_locked_by?: string | null;
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

class FakeD1Database {
  readonly statements: unknown[][][] = [];
  expenseOwnerRow: FakeExpenseUpdateRow | null = null;
  expenseDeleteRow: FakeExpenseDeleteRow | null = {
    group_id: 'grp_default',
    created_by: 'usr_alice',
    amount: 1280,
    currency: 'TWD',
  };
  deleteChanges = 1;
  expenseRows: FakeExpenseListRow[] = [];
  participantRows: FakeExpenseParticipantRow[] = [];
  activeMemberIds: readonly string[] = ['usr_alice'];
  pendingSettlementPaymentId: string | null = null;

  prepare(sql: string) {
    return new FakeD1PreparedStatement(this, sql);
  }

  async batch(statements: FakeD1PreparedStatement[]) {
    this.statements.push(statements.map((statement) => [statement.sql, ...statement.values]));
    for (const statement of statements) {
      this.applyStatement(statement);
    }
    return statements.map((statement) => ({
      success: true,
      meta: {
        changes: statement.sql.includes('SET deleted_at') ? this.deleteChanges : 1,
      },
    }));
  }

  private applyStatement(statement: FakeD1PreparedStatement): void {
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

class FakeD1PreparedStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeD1Database | null,
    readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    return Object.assign(new FakeD1PreparedStatement(this.db, this.sql), { values });
  }

  async first<T>(): Promise<T | null> {
    if (!this.db) {
      return null;
    }
    if (this.sql.includes('FROM expenses e')) {
      const expenseId = this.values[0];
      const row = this.db.expenseRows.find((expense) => expense.id === expenseId);
      return row ? (withExpenseLockDefaults(row) as T) : null;
    }
    if (
      this.sql.includes('SELECT group_id') &&
      this.sql.includes('created_by') &&
      this.sql.includes('currency') &&
      this.sql.includes('FROM expenses')
    ) {
      if (!this.db.expenseDeleteRow || this.db.expenseDeleteRow.group_id !== this.values[1]) {
        return null;
      }

      return {
        ...this.db.expenseDeleteRow,
        paid_by_user_id:
          this.db.expenseDeleteRow.paid_by_user_id ?? this.db.expenseDeleteRow.created_by,
      } as T;
    }
    if (
      this.sql.includes('paid_by_user_id') &&
      this.sql.includes('amount') &&
      this.sql.includes('split_method') &&
      this.sql.includes('FROM expenses')
    ) {
      if (!this.db.expenseOwnerRow || this.db.expenseOwnerRow.group_id !== this.values[1]) {
        return null;
      }

      return {
        ...this.db.expenseOwnerRow,
        paid_by_user_id:
          this.db.expenseOwnerRow.paid_by_user_id ?? this.db.expenseOwnerRow.created_by,
        split_method: this.db.expenseOwnerRow.split_method ?? 'equal',
        participant_locked_at: this.db.expenseOwnerRow.participant_locked_at ?? null,
        participant_locked_by: this.db.expenseOwnerRow.participant_locked_by ?? null,
      } as T;
    }
    if (this.sql.includes('FROM payments')) {
      return this.db.pendingSettlementPaymentId
        ? ({ id: this.db.pendingSettlementPaymentId } as T)
        : null;
    }
    return null;
  }

  async all<T>(): Promise<{ readonly results: readonly T[] }> {
    if (!this.db) {
      return { results: [] };
    }

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

const expenseInput: ExpenseCreateInput = {
  title: 'Lab ingredients',
  description: 'Beans',
  amount: 1280,
  currency: 'TWD',
  paidByUserId: 'usr_alice',
  category: 'ingredients',
  expenseDate: '2026-06-13',
  splitMethod: 'equal',
  participants: [{ userId: 'usr_alice' }],
};

const shares: readonly CalculatedShare[] = [{ userId: 'usr_alice', shareAmount: 1280 }];

const sessionUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

function readBoundString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoundNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function readBoundJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    assert.fail('Expected a JSON string.');
  }

  const parsed: unknown = JSON.parse(value);
  assert.equal(typeof parsed, 'object');
  assert.notEqual(parsed, null);
  assert.equal(Array.isArray(parsed), false);
  return parsed as Record<string, unknown>;
}

function assertAuditPayloadOmitsSensitiveData(payload: Record<string, unknown>): void {
  const serializedPayload = JSON.stringify(payload);
  const sensitiveFragments = [
    'password',
    'hunter2',
    'authorizationCode',
    'oauth-code-secret',
    'accessToken',
    'access-token-secret',
    'sessionToken',
    'session-token-secret',
    'headers',
    'cookie',
    'labsplit_session=secret',
    'clientSecret',
    'client-secret',
    'privateKey',
    'BEGIN PRIVATE KEY',
  ];

  for (const fragment of sensitiveFragments) {
    assert.equal(serializedPayload.includes(fragment), false);
  }
}

function displayNameForUser(userId: string): string {
  if (userId === 'usr_alice') return 'Alice';
  if (userId === 'usr_bob') return 'Bob';
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

test('createExpense persists group, membership, expense, shares, and audit log', async () => {
  const db = new FakeD1Database();

  const expenseId = await createExpense(
    db as unknown as D1Database,
    {
      id: 'usr_alice',
      email: 'alice@example.test',
      displayName: 'Alice',
      role: 'admin',
      status: 'active',
    },
    expenseInput,
    shares,
  );

  assert.match(expenseId, /^[0-9a-f-]+$/u);
  assert.equal(db.statements[0]?.length, 5);
  assert.match(String(db.statements[0]?.[0]?.[0]), /INSERT OR IGNORE INTO groups/u);
  assert.match(String(db.statements[0]?.[1]?.[0]), /INSERT OR IGNORE INTO group_members/u);
  assert.match(String(db.statements[0]?.[2]?.[0]), /INSERT INTO expenses/u);
  assert.match(String(db.statements[0]?.[3]?.[0]), /INSERT INTO expense_participants/u);
  assert.match(String(db.statements[0]?.[4]?.[0]), /INSERT INTO audit_logs/u);
  assert.equal(db.statements[0]?.[2]?.[3], 'Lab ingredients');
  assert.equal(db.statements[0]?.[3]?.[3], 'usr_alice');
  assert.deepEqual(readBoundJsonObject(db.statements[0]?.[4]?.[4]), {
    amount: 1280,
    currency: 'TWD',
    category: 'ingredients',
    expenseDate: '2026-06-13',
    splitMethod: 'equal',
    paidByUserId: 'usr_alice',
    participantCount: 1,
  });
});

test('createExpense audit payload ignores sensitive extraneous fields', async () => {
  const db = new FakeD1Database();
  const input = {
    ...expenseInput,
    password: 'hunter2',
    authorizationCode: 'oauth-code-secret',
    accessToken: 'access-token-secret',
    sessionToken: 'session-token-secret',
    headers: {
      authorization: 'Bearer access-token-secret',
      cookie: 'labsplit_session=secret',
    },
    clientSecret: 'client-secret',
    privateKey: '-----BEGIN PRIVATE KEY-----',
  };

  await createExpense(db as unknown as D1Database, sessionUser, input, shares);

  const auditPayload = readBoundJsonObject(db.statements[0]?.[4]?.[4]);
  assert.deepEqual(auditPayload, {
    amount: 1280,
    currency: 'TWD',
    category: 'ingredients',
    expenseDate: '2026-06-13',
    splitMethod: 'equal',
    paidByUserId: 'usr_alice',
    participantCount: 1,
  });
  assert.equal(JSON.stringify(auditPayload).includes('Lab ingredients'), false);
  assertAuditPayloadOmitsSensitiveData(auditPayload);
});

test('createExpense stores a null description when no note is provided', async () => {
  const db = new FakeD1Database();

  await createExpense(
    db as unknown as D1Database,
    sessionUser,
    { ...expenseInput, description: undefined },
    shares,
  );

  assert.equal(db.statements[0]?.[2]?.[4], null);
});

test('listExpenses reads persisted expenses with payer and participant data', async () => {
  const db = new FakeD1Database();
  db.expenseRows = [
    {
      id: 'exp_created',
      title: 'Lab ingredients',
      description: 'Beans',
      amount: 1280,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-13',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_created',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 1280,
    },
  ];

  const expenses = await listExpenses(db as unknown as D1Database, sessionUser);

  assert.deepEqual(expenses, [
    {
      id: 'exp_created',
      title: 'Lab ingredients',
      description: 'Beans',
      amount: 1280,
      currency: 'TWD',
      category: 'ingredients',
      expenseDate: '2026-06-13',
      paidBy: {
        id: 'usr_alice',
        displayName: 'Alice',
      },
      participants: [
        {
          userId: 'usr_alice',
          displayName: 'Alice',
          shareAmount: 1280,
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
  ]);
});

test('listExpenses returns an empty list without reading participants', async () => {
  const db = new FakeD1Database();

  const expenses = await listExpenses(db as unknown as D1Database, sessionUser);

  assert.deepEqual(expenses, []);
});

test('listExpenses falls back to no participants when none are returned', async () => {
  const db = new FakeD1Database();
  db.expenseRows = [
    {
      id: 'exp_without_participants',
      title: 'Lab ingredients',
      description: null,
      amount: 1280,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-13',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];

  const expenses = await listExpenses(db as unknown as D1Database, sessionUser);

  assert.deepEqual(expenses[0]?.participants, []);
});

test('getExpense returns authorized non-creator details without edit/delete permission', async () => {
  const db = new FakeD1Database();
  db.expenseRows = [
    {
      id: 'exp_bob',
      title: 'Shared prize',
      description: null,
      amount: 900,
      currency: 'TWD',
      category: 'prize',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_bob',
      paid_by_display_name: 'Bob',
      created_by: 'usr_bob',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_bob',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 900,
    },
  ];

  const expense = await getExpense(db as unknown as D1Database, sessionUser, 'exp_bob');

  assert.equal(expense.id, 'exp_bob');
  assert.equal(expense.canEdit, false);
  assert.equal(expense.canDelete, false);
  assert.deepEqual(expense.participants, [
    {
      userId: 'usr_alice',
      displayName: 'Alice',
      shareAmount: 900,
    },
  ]);
});

test('getExpense rejects unknown or unauthorized expenses', async () => {
  const db = new FakeD1Database();

  await assert.rejects(
    () => getExpense(db as unknown as D1Database, sessionUser, 'exp_missing'),
    ExpenseNotFoundError,
  );
});

test('joinExpenseParticipant adds the current member and recalculates equal shares', async () => {
  const db = new FakeD1Database();
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  db.activeMemberIds = ['usr_bob'];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 1001,
  };
  db.expenseRows = [
    {
      id: 'exp_shared',
      title: 'Shared coffee',
      description: null,
      amount: 1001,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_shared',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 1001,
    },
  ];

  const expense = await joinExpenseParticipant(db as unknown as D1Database, bob, 'exp_shared');

  assert.deepEqual(expense.participants, [
    {
      userId: 'usr_alice',
      displayName: 'Alice',
      shareAmount: 501,
    },
    {
      userId: 'usr_bob',
      displayName: 'Bob',
      shareAmount: 500,
    },
  ]);
  assert.equal(expense.canEdit, false);
  const batch = db.statements[0];
  assert.equal(batch?.length, 5);
  assert.match(String(batch?.[0]?.[0]), /INSERT(?: OR IGNORE)? INTO expense_participants/u);
  assert.match(String(batch?.[1]?.[0]), /UPDATE expense_participants/u);
  assert.equal(batch?.[4]?.[3], 'expense_participant_joined');
  assert.equal(Number(batch?.[1]?.[1]) + Number(batch?.[2]?.[1]), 1001);
});

test('joinExpenseParticipant is idempotent for existing participants', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 420 };
  db.expenseRows = [
    {
      id: 'exp_joined',
      title: 'Joined coffee',
      description: null,
      amount: 420,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_joined',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 420,
    },
  ];

  const expense = await joinExpenseParticipant(
    db as unknown as D1Database,
    sessionUser,
    'exp_joined',
  );

  assert.deepEqual(expense.participants, [
    {
      userId: 'usr_alice',
      displayName: 'Alice',
      shareAmount: 420,
    },
  ]);
  assert.equal(db.statements.length, 0);
});

test('joinExpenseParticipant rejects locked expenses for non-payers', async () => {
  const db = new FakeD1Database();
  const bob: SessionUser = {
    id: 'usr_bob',
    email: 'bob@example.test',
    displayName: 'Bob',
    role: 'member',
    status: 'active',
  };
  db.activeMemberIds = ['usr_bob'];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 420,
    participant_locked_at: '2026-06-17 01:34:00',
    participant_locked_by: 'usr_alice',
  };
  db.participantRows = [
    {
      expense_id: 'exp_locked',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 420,
    },
  ];

  await assert.rejects(
    () => joinExpenseParticipant(db as unknown as D1Database, bob, 'exp_locked'),
    ExpenseParticipantLockedError,
  );
  assert.equal(db.statements.length, 0);
});

test('joinExpenseParticipant sorts newly added equal-split participants deterministically', async () => {
  const db = new FakeD1Database();
  const aaron: SessionUser = {
    id: 'usr_aaron',
    email: 'aaron@example.test',
    displayName: 'Aaron',
    role: 'member',
    status: 'active',
  };
  db.activeMemberIds = ['usr_aaron'];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 421,
  };
  db.expenseRows = [
    {
      id: 'exp_sort_join',
      title: 'Sorted join',
      description: null,
      amount: 421,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_bob',
      paid_by_display_name: 'Bob',
      created_by: 'usr_bob',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_sort_join',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 421,
    },
  ];

  await joinExpenseParticipant(db as unknown as D1Database, aaron, 'exp_sort_join');

  assert.equal(db.statements[0]?.[1]?.[4], 'usr_aaron');
  assert.equal(db.statements[0]?.[2]?.[4], 'usr_bob');
  assert.equal(Number(db.statements[0]?.[1]?.[1]) + Number(db.statements[0]?.[2]?.[1]), 421);
});

test('joinExpenseParticipant rejects custom splits that need explicit shares', async () => {
  const db = new FakeD1Database();
  db.activeMemberIds = ['usr_bob'];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 1000,
    split_method: 'custom',
  };
  db.participantRows = [
    {
      expense_id: 'exp_custom',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 1000,
    },
  ];

  await assert.rejects(
    () =>
      joinExpenseParticipant(
        db as unknown as D1Database,
        {
          id: 'usr_bob',
          email: 'bob@example.test',
          displayName: 'Bob',
          role: 'member',
          status: 'active',
        },
        'exp_custom',
      ),
    ExpenseParticipantSplitMethodError,
  );
  assert.equal(db.statements.length, 0);
});

test('joinExpenseParticipant rejects non-members and disabled users', async () => {
  const db = new FakeD1Database();
  db.activeMemberIds = [];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 1000,
  };

  await assert.rejects(
    () =>
      joinExpenseParticipant(
        db as unknown as D1Database,
        {
          id: 'usr_bob',
          email: 'bob@example.test',
          displayName: 'Bob',
          role: 'member',
          status: 'active',
        },
        'exp_shared',
      ),
    ExpenseParticipantForbiddenError,
  );

  await assert.rejects(
    () =>
      joinExpenseParticipant(
        db as unknown as D1Database,
        { ...sessionUser, status: 'disabled' },
        'exp_shared',
      ),
    ExpenseParticipantForbiddenError,
  );
  assert.equal(db.statements.length, 0);
});

test('joinExpenseParticipant allows active admins even without group membership', async () => {
  const db = new FakeD1Database();
  const admin: SessionUser = {
    id: 'usr_carol',
    email: 'carol@example.test',
    displayName: 'Carol',
    role: 'admin',
    status: 'active',
  };
  db.activeMemberIds = [];
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 900,
  };
  db.expenseRows = [
    {
      id: 'exp_admin_join',
      title: 'Admin-visible coffee',
      description: null,
      amount: 900,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_admin_join',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 900,
    },
  ];

  const expense = await joinExpenseParticipant(
    db as unknown as D1Database,
    admin,
    'exp_admin_join',
  );

  assert.deepEqual(
    expense.participants.map((participant) => participant.userId),
    ['usr_alice', 'usr_carol'],
  );
  assert.equal(db.statements.length, 1);
});

test('leaveExpenseParticipant removes the current member and recalculates equal shares', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 1001,
  };
  db.expenseRows = [
    {
      id: 'exp_leave',
      title: 'Shared beans',
      description: null,
      amount: 1001,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_bob',
      paid_by_display_name: 'Bob',
      created_by: 'usr_bob',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_leave',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 334,
    },
    {
      expense_id: 'exp_leave',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 334,
    },
    {
      expense_id: 'exp_leave',
      user_id: 'usr_carol',
      display_name: 'Carol',
      share_amount: 333,
    },
  ];

  const expense = await leaveExpenseParticipant(
    db as unknown as D1Database,
    sessionUser,
    'exp_leave',
  );

  assert.deepEqual(expense.participants, [
    {
      userId: 'usr_bob',
      displayName: 'Bob',
      shareAmount: 501,
    },
    {
      userId: 'usr_carol',
      displayName: 'Carol',
      shareAmount: 500,
    },
  ]);
  const batch = db.statements[0];
  assert.equal(batch?.length, 5);
  assert.match(String(batch?.[0]?.[0]), /DELETE FROM expense_participants/u);
  assert.equal(batch?.[4]?.[3], 'expense_participant_left');
  assert.equal(Number(batch?.[1]?.[1]) + Number(batch?.[2]?.[1]), 1001);
});

test('leaveExpenseParticipant rejects non-participants and last-participant removal', async () => {
  const nonParticipantDb = new FakeD1Database();
  nonParticipantDb.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 420,
  };
  nonParticipantDb.participantRows = [
    {
      expense_id: 'exp_leave_missing',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 420,
    },
  ];

  await assert.rejects(
    () =>
      leaveExpenseParticipant(
        nonParticipantDb as unknown as D1Database,
        sessionUser,
        'exp_leave_missing',
      ),
    ExpenseParticipantNotFoundError,
  );
  assert.equal(nonParticipantDb.statements.length, 0);

  const lastParticipantDb = new FakeD1Database();
  lastParticipantDb.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 420,
  };
  lastParticipantDb.participantRows = [
    {
      expense_id: 'exp_leave_last',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 420,
    },
  ];

  await assert.rejects(
    () =>
      leaveExpenseParticipant(
        lastParticipantDb as unknown as D1Database,
        sessionUser,
        'exp_leave_last',
      ),
    ExpenseLastParticipantError,
  );
  assert.equal(lastParticipantDb.statements.length, 0);
});

test('leaveExpenseParticipant rejects settled participants to prevent repeat joins', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 420,
  };
  db.participantRows = [
    {
      expense_id: 'exp_settled',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 210,
      is_settled: 1,
      settled_at: '2026-06-17 01:34:00',
    },
    {
      expense_id: 'exp_settled',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 210,
    },
  ];

  await assert.rejects(
    () => leaveExpenseParticipant(db as unknown as D1Database, sessionUser, 'exp_settled'),
    ExpenseParticipantSettledError,
  );
  assert.equal(db.statements.length, 0);
});

test('leaveExpenseParticipant rejects participants with pending settlement payments', async () => {
  const db = new FakeD1Database();
  db.pendingSettlementPaymentId = 'pay_pending';
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 420,
  };
  db.participantRows = [
    {
      expense_id: 'exp_pending_settlement',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 210,
    },
    {
      expense_id: 'exp_pending_settlement',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 210,
    },
  ];

  await assert.rejects(
    () =>
      leaveExpenseParticipant(db as unknown as D1Database, sessionUser, 'exp_pending_settlement'),
    ExpenseParticipantSettledError,
  );
  assert.equal(db.statements.length, 0);
});

test('lockExpenseParticipants lets payer lock and unlock participant joining', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_bob',
    amount: 420,
  };
  db.expenseRows = [
    {
      id: 'exp_lock',
      title: 'Lockable expense',
      description: null,
      amount: 420,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_bob',
    },
  ];
  db.participantRows = [
    {
      expense_id: 'exp_lock',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 420,
    },
  ];

  const lockedExpense = await lockExpenseParticipants(
    db as unknown as D1Database,
    sessionUser,
    'exp_lock',
  );

  assert.equal(lockedExpense.participantLocked, true);
  assert.equal(lockedExpense.canLockParticipants, false);
  assert.equal(lockedExpense.canUnlockParticipants, true);
  assert.match(String(db.statements[0]?.[0]?.[0]), /participant_locked_at/u);
  assert.equal(db.statements[0]?.[1]?.[3], 'expense_participants_locked');

  const unlockedExpense = await unlockExpenseParticipants(
    db as unknown as D1Database,
    sessionUser,
    'exp_lock',
  );

  assert.equal(unlockedExpense.participantLocked, false);
  assert.equal(unlockedExpense.canLockParticipants, true);
  assert.equal(unlockedExpense.canUnlockParticipants, false);
  assert.match(String(db.statements[1]?.[0]?.[0]), /participant_locked_at = NULL/u);
  assert.equal(db.statements[1]?.[1]?.[3], 'expense_participants_unlocked');
});

test('lockExpenseParticipants lets admins lock non-owned expenses but rejects other members', async () => {
  const admin: SessionUser = {
    id: 'usr_carol',
    email: 'carol@example.test',
    displayName: 'Carol',
    role: 'admin',
    status: 'active',
  };
  const adminDb = new FakeD1Database();
  adminDb.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 420,
  };
  adminDb.expenseRows = [
    {
      id: 'exp_admin_lock',
      title: 'Admin lockable',
      description: null,
      amount: 420,
      currency: 'TWD',
      category: 'ingredients',
      expense_date: '2026-06-14',
      paid_by_user_id: 'usr_alice',
      paid_by_display_name: 'Alice',
      created_by: 'usr_alice',
    },
  ];

  const lockedExpense = await lockExpenseParticipants(
    adminDb as unknown as D1Database,
    admin,
    'exp_admin_lock',
  );

  assert.equal(lockedExpense.participantLocked, true);
  assert.equal(lockedExpense.canUnlockParticipants, true);

  const memberDb = new FakeD1Database();
  memberDb.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 420,
  };

  await assert.rejects(
    () => lockExpenseParticipants(memberDb as unknown as D1Database, sessionUser, 'exp_bob'),
    ExpenseParticipantLockForbiddenError,
  );
  assert.equal(memberDb.statements.length, 0);
});

test('lockExpenseParticipants reports not found when the locked row cannot be reloaded', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_alice',
    amount: 420,
  };

  await assert.rejects(
    () =>
      lockExpenseParticipants(db as unknown as D1Database, sessionUser, 'exp_missing_after_lock'),
    ExpenseNotFoundError,
  );
  assert.equal(db.statements.length, 1);
});

test('updateExpense rejects unknown expenses', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = null;

  await assert.rejects(
    () =>
      updateExpense(db as unknown as D1Database, sessionUser, 'exp_missing', {
        title: 'New',
      } satisfies ExpenseUpdateInput),
    ExpenseNotFoundError,
  );
});

test('updateExpense rejects non-payers before D1 writes', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 500,
  };

  await assert.rejects(
    () =>
      updateExpense(db as unknown as D1Database, sessionUser, 'exp_other', {
        title: 'New',
      } satisfies ExpenseUpdateInput),
    ExpenseForbiddenError,
  );
  assert.equal(db.statements.length, 0);
});

test('updateExpense allows the payer even when another member created the record', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_alice',
    created_by: 'usr_bob',
    amount: 500,
  };

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_recorded_by_bob', {
    title: 'Payer-owned update',
  });

  assert.equal(db.statements.length, 1);
  assert.match(String(db.statements[0]?.[0]?.[0]), /paid_by_user_id = \?/u);
  assert.equal(db.statements[0]?.[0]?.[9], 'usr_alice');
});

test('updateExpense ignores expenses outside the default group', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_other', created_by: 'usr_bob', amount: 500 };

  await assert.rejects(
    () =>
      updateExpense(db as unknown as D1Database, sessionUser, 'exp_other_group', {
        title: 'New',
      } satisfies ExpenseUpdateInput),
    ExpenseNotFoundError,
  );
  assert.equal(db.statements.length, 0);
});

test('updateExpense persists field updates and audit log without touching shares when amount is unchanged', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 1280 };

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', {
    title: 'Renamed expense',
    description: 'Updated note',
    category: 'prize',
  });

  assert.equal(db.statements.length, 1);
  const batch = db.statements[0];
  assert.equal(batch?.length, 2);
  assert.match(String(batch?.[0]?.[0]), /UPDATE expenses/u);
  assert.match(String(batch?.[1]?.[0]), /INSERT INTO audit_logs/u);
  assert.equal(batch?.[0]?.[1], 'Renamed expense');
  assert.equal(batch?.[0]?.[2], 1);
  assert.equal(batch?.[0]?.[3], 'Updated note');
  assert.equal(batch?.[0]?.[7], 'exp_alice');
  assert.equal(batch?.[0]?.[8], 'grp_default');
  assert.equal(batch?.[0]?.[9], 'usr_alice');
  assert.deepEqual(readBoundJsonObject(batch?.[1]?.[4]), {
    updatedFields: ['title', 'description', 'category'],
    category: 'prize',
  });
});

test('updateExpense audit payload allowlists safe fields and omits sensitive data', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 1280 };
  const input = Object.assign(
    {
      title: 'Renamed expense',
      description: 'password=hunter2 should stay out',
      amount: 1280,
      category: 'prize',
      expenseDate: '2026-06-14',
    } satisfies ExpenseUpdateInput,
    {
      password: 'hunter2',
      authorizationCode: 'oauth-code-secret',
      accessToken: 'access-token-secret',
      sessionToken: 'session-token-secret',
      headers: {
        authorization: 'Bearer access-token-secret',
        cookie: 'labsplit_session=secret',
      },
      clientSecret: 'client-secret',
      privateKey: '-----BEGIN PRIVATE KEY-----',
    },
  );

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', input);

  const batch = db.statements[0];
  assert.equal(batch?.length, 2);
  const auditPayload = readBoundJsonObject(batch?.[1]?.[4]);
  assert.deepEqual(auditPayload, {
    updatedFields: ['title', 'description', 'amount', 'category', 'expenseDate'],
    amount: 1280,
    category: 'prize',
    expenseDate: '2026-06-14',
  });
  assert.equal(JSON.stringify(auditPayload).includes('Renamed expense'), false);
  assertAuditPayloadOmitsSensitiveData(auditPayload);
});

test('updateExpense rewrites participant shares when the amount changes', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 1000 };
  db.participantRows = [
    {
      expense_id: 'exp_alice',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 500,
    },
    {
      expense_id: 'exp_alice',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 500,
    },
  ];

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', {
    amount: 2501,
  });

  const batch = db.statements[0];
  assert.equal(batch?.length, 4);
  assert.match(String(batch?.[0]?.[0]), /UPDATE expenses/u);
  assert.match(String(batch?.[1]?.[0]), /UPDATE expense_participants/u);
  assert.equal(batch?.[1]?.[1], 1251);
  assert.equal(batch?.[2]?.[1], 1250);
  assert.equal(Number(batch?.[1]?.[1]) + Number(batch?.[2]?.[1]), 2501);
  assert.match(String(batch?.[3]?.[0]), /INSERT INTO audit_logs/u);
});

test('updateExpense recalculates ratio participant shares when the amount changes', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    created_by: 'usr_alice',
    amount: 300,
    split_method: 'ratio',
  };
  db.participantRows = [
    {
      expense_id: 'exp_ratio',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 100,
      share_ratio: 1,
    },
    {
      expense_id: 'exp_ratio',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 200,
      share_ratio: 2,
    },
  ];

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_ratio', {
    amount: 1000,
  });

  const batch = db.statements[0];
  assert.equal(batch?.[1]?.[1], 333);
  assert.equal(batch?.[2]?.[1], 667);
  assert.equal(Number(batch?.[1]?.[1]) + Number(batch?.[2]?.[1]), 1000);
});

test('updateExpense recalculates custom participant shares when the amount changes', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = {
    group_id: 'grp_default',
    created_by: 'usr_alice',
    amount: 500,
    split_method: 'custom',
  };
  db.participantRows = [
    {
      expense_id: 'exp_custom_update',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 200,
    },
    {
      expense_id: 'exp_custom_update',
      user_id: 'usr_bob',
      display_name: 'Bob',
      share_amount: 300,
    },
  ];

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_custom_update', {
    amount: 1001,
  });

  const batch = db.statements[0];
  assert.equal(batch?.[1]?.[1], 400);
  assert.equal(batch?.[2]?.[1], 601);
  assert.equal(Number(batch?.[1]?.[1]) + Number(batch?.[2]?.[1]), 1001);
});

test('updateExpense rejects amount recalculation without valid existing shares', async () => {
  const emptyDb = new FakeD1Database();
  emptyDb.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 500 };

  await assert.rejects(
    () =>
      updateExpense(emptyDb as unknown as D1Database, sessionUser, 'exp_empty_shares', {
        amount: 600,
      }),
    /Existing expense participants are required/u,
  );

  const invalidRatioDb = new FakeD1Database();
  invalidRatioDb.expenseOwnerRow = {
    group_id: 'grp_default',
    created_by: 'usr_alice',
    amount: 500,
    split_method: 'ratio',
  };
  invalidRatioDb.participantRows = [
    {
      expense_id: 'exp_invalid_ratio',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 500,
      share_ratio: null,
    },
  ];

  await assert.rejects(
    () =>
      updateExpense(invalidRatioDb as unknown as D1Database, sessionUser, 'exp_invalid_ratio', {
        amount: 600,
      }),
    /Existing ratio split cannot be recalculated/u,
  );

  const invalidCustomDb = new FakeD1Database();
  invalidCustomDb.expenseOwnerRow = {
    group_id: 'grp_default',
    created_by: 'usr_alice',
    amount: 500,
    split_method: 'custom',
  };
  invalidCustomDb.participantRows = [
    {
      expense_id: 'exp_invalid_custom',
      user_id: 'usr_alice',
      display_name: 'Alice',
      share_amount: 0,
    },
  ];

  await assert.rejects(
    () =>
      updateExpense(invalidCustomDb as unknown as D1Database, sessionUser, 'exp_invalid_custom', {
        amount: 600,
      }),
    /Existing custom split cannot be recalculated/u,
  );
});

test('updateExpense passes through a null description so it clears the stored value', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { group_id: 'grp_default', created_by: 'usr_alice', amount: 1280 };

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', {
    description: null,
  });

  const update = db.statements[0]?.[0];
  assert.equal(update?.[2], 1);
  assert.equal(update?.[3], null);
});

test('deleteExpense rejects deletes when D1 reports no changed rows', async () => {
  const db = new FakeD1Database();
  db.deleteChanges = 0;

  await assert.rejects(
    () => deleteExpense(db as unknown as D1Database, sessionUser, 'exp_missing'),
    ExpenseNotFoundError,
  );
});

test('deleteExpense rejects missing or already deleted expenses before D1 writes', async () => {
  const db = new FakeD1Database();
  db.expenseDeleteRow = null;

  await assert.rejects(
    () => deleteExpense(db as unknown as D1Database, sessionUser, 'exp_deleted'),
    ExpenseNotFoundError,
  );
  assert.equal(db.statements.length, 0);
});

test('deleteExpense rejects non-payers before D1 writes', async () => {
  const db = new FakeD1Database();
  db.expenseDeleteRow = {
    group_id: 'grp_default',
    paid_by_user_id: 'usr_bob',
    created_by: 'usr_bob',
    amount: 1280,
    currency: 'TWD',
  };

  await assert.rejects(
    () => deleteExpense(db as unknown as D1Database, sessionUser, 'exp_bob'),
    ExpenseForbiddenError,
  );
  assert.equal(db.statements.length, 0);
});

test('deleteExpense lets payers soft delete default-group expenses', async () => {
  const db = new FakeD1Database();

  await deleteExpense(db as unknown as D1Database, sessionUser, 'exp_alice');

  assert.equal(db.statements.length, 1);
  const batch = db.statements[0];
  assert.equal(batch?.length, 2);
  assert.match(String(batch?.[0]?.[0]), /SET deleted_at = datetime/u);
  assert.match(String(batch?.[0]?.[0]), /group_id = \?/u);
  assert.equal(batch?.[0]?.[1], 'exp_alice');
  assert.equal(batch?.[0]?.[2], 'grp_default');
  assert.equal(batch?.[0]?.[3], 'usr_alice');
  assert.match(String(batch?.[1]?.[0]), /expense_deleted/u);
  assert.match(String(batch?.[1]?.[0]), /before_json/u);
  const auditPayload = readBoundJsonObject(batch?.[1]?.[4]);
  assert.deepEqual(auditPayload, {
    groupId: 'grp_default',
    amount: 1280,
    currency: 'TWD',
    paidByUserId: 'usr_alice',
    createdBy: 'usr_alice',
  });
  assert.equal(JSON.stringify(auditPayload).includes('Lab ingredients'), false);
});

test('deleteExpense ignores expenses outside the default group', async () => {
  const db = new FakeD1Database();
  db.expenseDeleteRow = {
    group_id: 'grp_other',
    created_by: 'usr_alice',
    amount: 1280,
    currency: 'TWD',
  };

  await assert.rejects(
    () => deleteExpense(db as unknown as D1Database, sessionUser, 'exp_other_group'),
    ExpenseNotFoundError,
  );
  assert.equal(db.statements.length, 0);
});
