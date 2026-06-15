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

type ExpenseUpdateRow = {
  readonly amount: number;
};

type ExpenseDeleteRow = {
  readonly group_id: string;
  readonly created_by: string;
  readonly title: string;
  readonly amount: number;
  readonly currency: 'TWD';
};

type ExpenseListRow = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly category: ExpenseCreateInput['category'];
  readonly expense_date: string;
  readonly paid_by_user_id: string;
  readonly paid_by_display_name: string;
};

type ExpenseParticipantRow = {
  readonly expense_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly share_amount: number;
};

export type ExpenseListItem = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly category: ExpenseCreateInput['category'];
  readonly expenseDate: string;
  readonly paidBy: {
    readonly id: string;
    readonly displayName: string;
  };
  readonly participants: readonly {
    readonly userId: string;
    readonly displayName: string;
    readonly shareAmount: number;
  }[];
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

export async function listExpenses(db: D1Database): Promise<readonly ExpenseListItem[]> {
  const result = await db
    .prepare(
      `SELECT
         e.id,
         e.title,
         e.description,
         e.amount,
         e.currency,
         e.category,
         e.expense_date,
         e.paid_by_user_id,
         COALESCE(payer.display_name, payer.email, e.paid_by_user_id) AS paid_by_display_name
       FROM expenses e
       INNER JOIN users payer ON payer.id = e.paid_by_user_id
       WHERE e.group_id = ? AND e.deleted_at IS NULL
       ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
       LIMIT 100`,
    )
    .bind(DEFAULT_GROUP_ID)
    .all<ExpenseListRow>();
  const rows = result.results ?? [];

  if (rows.length === 0) {
    return [];
  }

  const participantsByExpenseId = await listParticipantsByExpenseId(db);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    expenseDate: row.expense_date,
    paidBy: {
      id: row.paid_by_user_id,
      displayName: row.paid_by_display_name,
    },
    participants: participantsByExpenseId.get(row.id) ?? [],
  }));
}

export async function updateExpense(
  db: D1Database,
  user: SessionUser,
  expenseId: string,
  input: ExpenseUpdateInput,
): Promise<void> {
  const expense = await db
    .prepare(
      `SELECT amount
       FROM expenses
       WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
    )
    .bind(expenseId, DEFAULT_GROUP_ID)
    .first<ExpenseUpdateRow>();

  if (!expense) {
    throw new ExpenseNotFoundError();
  }

  const descriptionProvided = input.description === undefined ? 0 : 1;
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
         WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
      )
      .bind(
        input.title ?? null,
        descriptionProvided,
        input.description ?? null,
        input.amount ?? null,
        input.category ?? null,
        input.expenseDate ?? null,
        expenseId,
        DEFAULT_GROUP_ID,
      ),
  ];

  if (input.amount !== undefined && input.amount !== expense.amount) {
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

export async function deleteExpense(
  db: D1Database,
  user: SessionUser,
  expenseId: string,
): Promise<void> {
  const expense = await db
    .prepare(
      `SELECT group_id, created_by, title, amount, currency
       FROM expenses
       WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
    )
    .bind(expenseId, DEFAULT_GROUP_ID)
    .first<ExpenseDeleteRow>();

  if (!expense || expense.group_id !== DEFAULT_GROUP_ID) {
    throw new ExpenseNotFoundError();
  }

  const beforeJson = JSON.stringify({
    groupId: expense.group_id,
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    createdBy: expense.created_by,
  });

  const [deleteResult] = await db.batch([
    db
      .prepare(
        `UPDATE expenses
         SET deleted_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
         WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
      )
      .bind(expenseId, DEFAULT_GROUP_ID),
    db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, before_json)
         SELECT ?, ?, 'expense_deleted', 'expense', ?, ?
         WHERE changes() = 1`,
      )
      .bind(crypto.randomUUID(), user.id, expenseId, beforeJson),
  ]);

  if ((deleteResult?.meta?.changes ?? 0) === 0) {
    throw new ExpenseNotFoundError();
  }
}

async function listParticipantsByExpenseId(
  db: D1Database,
): Promise<ReadonlyMap<string, ExpenseListItem['participants']>> {
  const result = await db
    .prepare(
      `SELECT
         ep.expense_id,
         ep.user_id,
         COALESCE(u.display_name, u.email, ep.user_id) AS display_name,
         ep.share_amount
       FROM expense_participants ep
       INNER JOIN users u ON u.id = ep.user_id
       INNER JOIN expenses e ON e.id = ep.expense_id
       WHERE e.group_id = ? AND e.deleted_at IS NULL
       ORDER BY ep.expense_id ASC, ep.user_id ASC`,
    )
    .bind(DEFAULT_GROUP_ID)
    .all<ExpenseParticipantRow>();
  const participantsByExpenseId = new Map<string, ExpenseListItem['participants']>();

  for (const row of result.results ?? []) {
    const participants = participantsByExpenseId.get(row.expense_id) ?? [];
    participantsByExpenseId.set(row.expense_id, [
      ...participants,
      {
        userId: row.user_id,
        displayName: row.display_name,
        shareAmount: row.share_amount,
      },
    ]);
  }

  return participantsByExpenseId;
}
