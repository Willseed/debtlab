import {
  createDefaultGroupMembershipStatements,
  DEFAULT_GROUP_ID,
  listActiveDefaultGroupMemberIdsForUsers,
} from './default-group.service';
import { CalculatedShare } from './split.service';
import { SessionUser } from '../types';
import { ExpenseCreateInput, ExpenseUpdateInput } from '../validation/schemas';

export class ExpenseNotFoundError extends Error {
  constructor() {
    super('Expense not found.');
    this.name = 'ExpenseNotFoundError';
  }
}

export class ExpenseForbiddenError extends Error {
  constructor() {
    super('Only the expense payer may edit or delete this expense.');
    this.name = 'ExpenseForbiddenError';
  }
}

export class ExpenseInvalidParticipantsError extends Error {
  constructor() {
    super('Expense payer and participants must be active default-group members.');
    this.name = 'ExpenseInvalidParticipantsError';
  }
}

type ExpenseUpdateRow = {
  readonly group_id: string;
  readonly paid_by_user_id: string;
  readonly amount: number;
  readonly split_method: ExpenseCreateInput['splitMethod'];
};

type ExpenseDeleteRow = {
  readonly group_id: string;
  readonly paid_by_user_id: string;
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
  readonly created_by: string;
};

type ExpenseParticipantRow = {
  readonly expense_id: string;
  readonly user_id: string;
  readonly display_name: string;
  readonly share_amount: number;
};

type ExpenseParticipantShareRow = {
  readonly user_id: string;
  readonly share_amount: number;
  readonly share_ratio: number | null;
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
  readonly canEdit: boolean;
  readonly canDelete: boolean;
};

export async function validateExpenseMembers(
  db: D1Database,
  user: SessionUser,
  input: ExpenseCreateInput,
): Promise<void> {
  const requestedUserIds = [
    ...new Set([
      input.paidByUserId,
      ...input.participants.map((participant) => participant.userId),
    ]),
  ];
  const validMemberIds = await listActiveDefaultGroupMemberIdsForUsers(db, requestedUserIds);
  const allowedMemberIds = new Set(validMemberIds);
  allowedMemberIds.add(user.id);

  if (requestedUserIds.some((userId) => !allowedMemberIds.has(userId))) {
    throw new ExpenseInvalidParticipantsError();
  }
}

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
    ...createDefaultGroupMembershipStatements(db, user),
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

export async function listExpenses(
  db: D1Database,
  user: SessionUser,
): Promise<readonly ExpenseListItem[]> {
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
        COALESCE(payer.display_name, payer.email, e.paid_by_user_id) AS paid_by_display_name,
        e.created_by
       FROM expenses e
       INNER JOIN users payer ON payer.id = e.paid_by_user_id
       WHERE e.group_id = ? AND e.deleted_at IS NULL
         AND (
           e.created_by = ?
           OR EXISTS (
             SELECT 1
             FROM group_members gm
             WHERE gm.group_id = e.group_id AND gm.user_id = ? AND gm.status = 'active'
           )
           OR EXISTS (
             SELECT 1
             FROM expense_participants ep
             WHERE ep.expense_id = e.id AND ep.user_id = ?
           )
         )
       ORDER BY e.expense_date DESC, e.created_at DESC, e.id DESC
       LIMIT 100`,
    )
    .bind(DEFAULT_GROUP_ID, user.id, user.id, user.id)
    .all<ExpenseListRow>();
  const rows = result.results ?? [];

  if (rows.length === 0) {
    return [];
  }

  const participantsByExpenseId = await listParticipantsByExpenseId(db);

  return rows.map((row) => mapExpenseListItem(row, participantsByExpenseId, user));
}

export async function getExpense(
  db: D1Database,
  user: SessionUser,
  expenseId: string,
): Promise<ExpenseListItem> {
  const row = await db
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
         COALESCE(payer.display_name, payer.email, e.paid_by_user_id) AS paid_by_display_name,
         e.created_by
       FROM expenses e
       INNER JOIN users payer ON payer.id = e.paid_by_user_id
       WHERE e.id = ? AND e.group_id = ? AND e.deleted_at IS NULL
         AND (
           e.created_by = ?
           OR EXISTS (
             SELECT 1
             FROM group_members gm
             WHERE gm.group_id = e.group_id AND gm.user_id = ? AND gm.status = 'active'
           )
           OR EXISTS (
             SELECT 1
             FROM expense_participants ep
             WHERE ep.expense_id = e.id AND ep.user_id = ?
           )
         )`,
    )
    .bind(expenseId, DEFAULT_GROUP_ID, user.id, user.id, user.id)
    .first<ExpenseListRow>();

  if (!row) {
    throw new ExpenseNotFoundError();
  }

  const participantsByExpenseId = await listParticipantsByExpenseId(db);
  return mapExpenseListItem(row, participantsByExpenseId, user);
}

export async function updateExpense(
  db: D1Database,
  user: SessionUser,
  expenseId: string,
  input: ExpenseUpdateInput,
): Promise<void> {
  const expense = await db
    .prepare(
      `SELECT group_id, paid_by_user_id, amount, split_method
       FROM expenses
       WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
    )
    .bind(expenseId, DEFAULT_GROUP_ID)
    .first<ExpenseUpdateRow>();

  if (!expense) {
    throw new ExpenseNotFoundError();
  }

  if (expense.paid_by_user_id !== user.id) {
    throw new ExpenseForbiddenError();
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
         WHERE id = ? AND group_id = ? AND paid_by_user_id = ? AND deleted_at IS NULL`,
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
        user.id,
      ),
  ];

  if (input.amount !== undefined && input.amount !== expense.amount) {
    const participantShares = await listExpenseParticipantShares(db, expenseId);
    const updatedShares = recalculateParticipantShares(
      input.amount,
      expense.split_method,
      participantShares,
    );

    statements.push(
      ...updatedShares.map((share) =>
        db
          .prepare(
            `UPDATE expense_participants
             SET share_amount = ?, share_ratio = ?
             WHERE expense_id = ? AND user_id = ?`,
          )
          .bind(share.share_amount, share.share_ratio, expenseId, share.user_id),
      ),
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
      `SELECT group_id, paid_by_user_id, created_by, title, amount, currency
       FROM expenses
       WHERE id = ? AND group_id = ? AND deleted_at IS NULL`,
    )
    .bind(expenseId, DEFAULT_GROUP_ID)
    .first<ExpenseDeleteRow>();

  if (expense?.group_id !== DEFAULT_GROUP_ID) {
    throw new ExpenseNotFoundError();
  }

  if (expense.paid_by_user_id !== user.id) {
    throw new ExpenseForbiddenError();
  }

  const beforeJson = JSON.stringify({
    groupId: expense.group_id,
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    paidByUserId: expense.paid_by_user_id,
    createdBy: expense.created_by,
  });

  const [deleteResult] = await db.batch([
    db
      .prepare(
        `UPDATE expenses
         SET deleted_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
         WHERE id = ? AND group_id = ? AND paid_by_user_id = ? AND deleted_at IS NULL`,
      )
      .bind(expenseId, DEFAULT_GROUP_ID, user.id),
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

function mapExpenseListItem(
  row: ExpenseListRow,
  participantsByExpenseId: ReadonlyMap<string, ExpenseListItem['participants']>,
  user: SessionUser,
): ExpenseListItem {
  const canManage = row.paid_by_user_id === user.id;

  return {
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
    canEdit: canManage,
    canDelete: canManage,
  };
}

async function listExpenseParticipantShares(
  db: D1Database,
  expenseId: string,
): Promise<readonly ExpenseParticipantShareRow[]> {
  const result = await db
    .prepare(
      `SELECT user_id, share_amount, share_ratio
       FROM expense_participants
       WHERE expense_id = ?
       ORDER BY user_id ASC`,
    )
    .bind(expenseId)
    .all<ExpenseParticipantShareRow>();

  return result.results ?? [];
}

function recalculateParticipantShares(
  amount: number,
  splitMethod: ExpenseCreateInput['splitMethod'],
  participants: readonly ExpenseParticipantShareRow[],
): readonly ExpenseParticipantShareRow[] {
  if (participants.length === 0) {
    throw new Error('Existing expense participants are required for amount updates.');
  }

  if (splitMethod === 'ratio') {
    return recalculateRatioParticipantShares(amount, participants);
  }

  if (splitMethod === 'custom') {
    return recalculateCustomParticipantShares(amount, participants);
  }

  const baseShare = Math.floor(amount / participants.length);
  const remainder = amount % participants.length;

  return participants.map((participant, index) => ({
    ...participant,
    share_amount: baseShare + (index < remainder ? 1 : 0),
  }));
}

function recalculateRatioParticipantShares(
  amount: number,
  participants: readonly ExpenseParticipantShareRow[],
): readonly ExpenseParticipantShareRow[] {
  const ratioParticipants = participants.map((participant, index) => {
    const ratio = participant.share_ratio;

    if (ratio === null || ratio <= 0 || !Number.isFinite(ratio)) {
      throw new Error('Existing ratio split cannot be recalculated.');
    }

    return { ...participant, index, ratio };
  });
  const totalRatio = ratioParticipants.reduce((sum, participant) => sum + participant.ratio, 0);
  const floors = ratioParticipants.map((participant) => {
    const exactShare = (amount * participant.ratio) / totalRatio;
    const floorShare = Math.floor(exactShare);

    return {
      ...participant,
      share_amount: floorShare,
      fractionalRemainder: exactShare - floorShare,
    };
  });
  const floorTotal = floors.reduce((sum, participant) => sum + participant.share_amount, 0);
  const remainder = amount - floorTotal;
  const winners = new Set(
    [...floors]
      .sort((left, right) => {
        const fractionDelta = right.fractionalRemainder - left.fractionalRemainder;
        return fractionDelta === 0 ? left.index - right.index : fractionDelta;
      })
      .slice(0, remainder)
      .map((participant) => participant.index),
  );

  return floors.map((participant) => ({
    user_id: participant.user_id,
    share_amount: participant.share_amount + (winners.has(participant.index) ? 1 : 0),
    share_ratio: participant.share_ratio,
  }));
}

function recalculateCustomParticipantShares(
  amount: number,
  participants: readonly ExpenseParticipantShareRow[],
): readonly ExpenseParticipantShareRow[] {
  const currentTotal = participants.reduce((sum, participant) => sum + participant.share_amount, 0);

  if (currentTotal <= 0) {
    throw new Error('Existing custom split cannot be recalculated.');
  }

  const floors = participants.map((participant, index) => {
    const exactShare = (amount * participant.share_amount) / currentTotal;
    const floorShare = Math.floor(exactShare);

    return {
      ...participant,
      index,
      share_amount: floorShare,
      fractionalRemainder: exactShare - floorShare,
    };
  });
  const floorTotal = floors.reduce((sum, participant) => sum + participant.share_amount, 0);
  const remainder = amount - floorTotal;
  const winners = new Set(
    [...floors]
      .sort((left, right) => {
        const fractionDelta = right.fractionalRemainder - left.fractionalRemainder;
        return fractionDelta === 0 ? left.index - right.index : fractionDelta;
      })
      .slice(0, remainder)
      .map((participant) => participant.index),
  );

  return floors.map((participant) => ({
    user_id: participant.user_id,
    share_amount: participant.share_amount + (winners.has(participant.index) ? 1 : 0),
    share_ratio: participant.share_ratio,
  }));
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
