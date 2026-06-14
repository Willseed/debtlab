import { CalculatedShare } from './split.service';
import { SessionUser } from '../types';
import { ExpenseCreateInput, ExpenseUpdateInput } from '../validation/schemas';

const DEFAULT_GROUP_ID = 'grp_default';
const DEFAULT_GROUP_NAME = 'Default Lab';

export class ExpenseNotFoundError extends Error {
  constructor() {
    super('Expense not found.');
    this.name = 'ExpenseNotFoundError';
  }
}

export class ExpenseAccessDeniedError extends Error {
  constructor() {
    super('Expense is not editable by the current user.');
    this.name = 'ExpenseAccessDeniedError';
  }
}

type ExpenseOwnerRow = {
  readonly created_by: string;
  readonly amount: number;
};

export async function createExpense(
  db: D1Database,
  user: SessionUser,
  input: ExpenseCreateInput,
  shares: readonly CalculatedShare[],
): Promise<string> {
  const expenseId = crypto.randomUUID();
  const auditLogId = crypto.randomUUID();
  const participantStatements = shares.map((share) =>
    db
      .prepare(
        `INSERT INTO expense_participants (id, expense_id, user_id, share_amount, share_ratio)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        expenseId,
        share.userId,
        share.shareAmount,
        share.shareRatio ?? null,
      ),
  );

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO groups (id, name, description, currency, created_by)
         VALUES (?, ?, ?, 'TWD', ?)`,
      )
      .bind(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, 'Default lab expense group', user.id),
    db
      .prepare(
        `INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, status)
         VALUES (?, ?, ?, ?, 'active')`,
      )
      .bind(crypto.randomUUID(), DEFAULT_GROUP_ID, user.id, user.role),
    db
      .prepare(
        `INSERT INTO expenses (
           id,
           group_id,
           title,
           description,
           amount,
           currency,
           paid_by_user_id,
           category,
           expense_date,
           split_method,
           created_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        expenseId,
        DEFAULT_GROUP_ID,
        input.title,
        input.description ?? null,
        input.amount,
        input.currency,
        input.paidByUserId,
        input.category,
        input.expenseDate,
        input.splitMethod,
        user.id,
      ),
    ...participantStatements,
    db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, 'expense_created', 'expense', ?, ?)`,
      )
      .bind(
        auditLogId,
        user.id,
        expenseId,
        JSON.stringify({
          title: input.title,
          amount: input.amount,
          currency: input.currency,
          splitMethod: input.splitMethod,
        }),
      ),
  ]);

  return expenseId;
}

export async function updateExpense(
  db: D1Database,
  user: SessionUser,
  expenseId: string,
  input: ExpenseUpdateInput,
): Promise<void> {
  const owner = await db
    .prepare(
      `SELECT created_by, amount
       FROM expenses
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(expenseId)
    .first<ExpenseOwnerRow>();

  if (!owner) {
    throw new ExpenseNotFoundError();
  }

  if (owner.created_by !== user.id) {
    throw new ExpenseAccessDeniedError();
  }

  const descriptionProvided = input.description !== undefined ? 1 : 0;
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE expenses
         SET title = COALESCE(?, title),
             description = CASE WHEN ? = 1 THEN ? ELSE description END,
             amount = COALESCE(?, amount),
             category = COALESCE(?, category),
             expense_date = COALESCE(?, expense_date),
             updated_at = datetime('now', '+8 hours')
         WHERE id = ?`,
      )
      .bind(
        input.title ?? null,
        descriptionProvided,
        input.description ?? null,
        input.amount ?? null,
        input.category ?? null,
        input.expenseDate ?? null,
        expenseId,
      ),
  ];

  if (input.amount !== undefined && input.amount !== owner.amount) {
    statements.push(
      db
        .prepare(
          `UPDATE expense_participants
           SET share_amount = ?
           WHERE expense_id = ?`,
        )
        .bind(input.amount, expenseId),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, 'expense_updated', 'expense', ?, ?)`,
      )
      .bind(crypto.randomUUID(), user.id, expenseId, JSON.stringify(input)),
  );

  await db.batch(statements);
}
