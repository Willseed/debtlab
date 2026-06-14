import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createExpense,
  ExpenseAccessDeniedError,
  ExpenseNotFoundError,
  updateExpense,
} from '../src/services/expense.service';
import { CalculatedShare } from '../src/services/split.service';
import { ExpenseCreateInput, ExpenseUpdateInput } from '../src/validation/schemas';
import type { SessionUser } from '../src/types';

class FakeD1Database {
  readonly statements: unknown[][][] = [];
  expenseOwnerRow: { readonly created_by: string; readonly amount: number } | null = null;

  prepare(sql: string) {
    return new FakeD1PreparedStatement(this, sql);
  }

  async batch(statements: FakeD1PreparedStatement[]) {
    this.statements.push(statements.map((statement) => [statement.sql, ...statement.values]));
    return statements.map(() => ({ success: true }));
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
    if (this.sql.includes('FROM expenses')) {
      return (this.db.expenseOwnerRow ?? null) as T | null;
    }
    return null;
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
});

const sessionUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'admin',
  status: 'active',
};

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

test('updateExpense forbids editing expenses created by other users', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { created_by: 'usr_bob', amount: 500 };

  await assert.rejects(
    () =>
      updateExpense(db as unknown as D1Database, sessionUser, 'exp_other', {
        title: 'New',
      } satisfies ExpenseUpdateInput),
    ExpenseAccessDeniedError,
  );
});

test('updateExpense persists field updates and audit log without touching shares when amount is unchanged', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { created_by: 'usr_alice', amount: 1280 };

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
});

test('updateExpense rewrites participant shares when the amount changes', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { created_by: 'usr_alice', amount: 1000 };

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', {
    amount: 2500,
  });

  const batch = db.statements[0];
  assert.equal(batch?.length, 3);
  assert.match(String(batch?.[0]?.[0]), /UPDATE expenses/u);
  assert.match(String(batch?.[1]?.[0]), /UPDATE expense_participants/u);
  assert.equal(batch?.[1]?.[1], 2500);
  assert.match(String(batch?.[2]?.[0]), /INSERT INTO audit_logs/u);
});

test('updateExpense passes through a null description so it clears the stored value', async () => {
  const db = new FakeD1Database();
  db.expenseOwnerRow = { created_by: 'usr_alice', amount: 1280 };

  await updateExpense(db as unknown as D1Database, sessionUser, 'exp_alice', {
    description: null,
  });

  const update = db.statements[0]?.[0];
  assert.equal(update?.[2], 1);
  assert.equal(update?.[3], null);
});
