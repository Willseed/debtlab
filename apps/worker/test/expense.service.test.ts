import assert from 'node:assert/strict';
import test from 'node:test';

import { createExpense } from '../src/services/expense.service';
import { CalculatedShare } from '../src/services/split.service';
import { ExpenseCreateInput } from '../src/validation/schemas';

class FakeD1Database {
  readonly statements: unknown[][][] = [];

  prepare(sql: string) {
    return new FakeD1PreparedStatement(sql);
  }

  async batch(statements: FakeD1PreparedStatement[]) {
    this.statements.push(statements.map((statement) => [statement.sql, ...statement.values]));
    return statements.map(() => ({ success: true }));
  }
}

class FakeD1PreparedStatement {
  readonly values: readonly unknown[] = [];

  constructor(readonly sql: string) {}

  bind(...values: unknown[]) {
    return Object.assign(new FakeD1PreparedStatement(this.sql), { values });
  }
}

const expenseInput: ExpenseCreateInput = {
  title: 'Lab coffee',
  description: 'Beans',
  amount: 1280,
  currency: 'TWD',
  paidByUserId: 'usr_alice',
  category: 'coffee',
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
  assert.equal(db.statements[0]?.[2]?.[3], 'Lab coffee');
  assert.equal(db.statements[0]?.[3]?.[3], 'usr_alice');
});
