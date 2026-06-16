import { DEFAULT_GROUP_ID, listActiveDefaultGroupMemberIds } from './default-group.service';
import { calculateBalances, calculateSuggestedTransfers } from './settlement.service';
import { SessionUser } from '../types';
import { PaymentCreateInput } from '../validation/schemas';

export class PaymentNotFoundError extends Error {
  constructor() {
    super('Payment not found.');
    this.name = 'PaymentNotFoundError';
  }
}

export class PaymentAlreadyConfirmedError extends Error {
  constructor() {
    super('Payment is already confirmed or cancelled.');
    this.name = 'PaymentAlreadyConfirmedError';
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Only the payment receiver or an admin may confirm a payment.');
    this.name = 'ForbiddenError';
  }
}

export class PaymentCreationForbiddenError extends Error {
  constructor(message = 'Only an active default-group member or an admin may record a payment.') {
    super(message);
    this.name = 'PaymentCreationForbiddenError';
  }
}

export class PaymentTransferNotRelevantError extends Error {
  constructor() {
    super('Payment must match an outstanding suggested transfer.');
    this.name = 'PaymentTransferNotRelevantError';
  }
}

export class PendingPaymentAlreadyExistsError extends Error {
  constructor() {
    super('A pending payment already exists for this transfer.');
    this.name = 'PendingPaymentAlreadyExistsError';
  }
}

export class SelfPaymentError extends Error {
  constructor() {
    super('Sender and receiver must be different users.');
    this.name = 'SelfPaymentError';
  }
}

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

type SettlementPaymentRow = {
  readonly id: string;
  readonly from_user_id: string;
  readonly from_display_name: string;
  readonly to_user_id: string;
  readonly to_display_name: string;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly note: string | null;
  readonly status: 'pending' | 'confirmed' | 'cancelled';
  readonly created_at: string;
  readonly confirmed_at: string | null;
};

export type PaymentRecord = {
  readonly id: string;
  readonly fromUserId: string;
  readonly fromDisplayName: string;
  readonly toUserId: string;
  readonly toDisplayName: string;
  readonly amount: number;
  readonly currency: 'TWD';
  readonly note: string | null;
  readonly status: 'pending' | 'confirmed' | 'cancelled';
  readonly createdAt: string;
  readonly confirmedAt: string | null;
};

export type PaymentCreateResult = {
  readonly id: string;
  readonly status: 'pending' | 'confirmed';
};

type MemberRow = {
  readonly user_id: string;
  readonly display_name: string;
};

type ExpenseRow = {
  readonly id: string;
  readonly paid_by_user_id: string;
  readonly amount: number;
  readonly deleted_at: string | null;
};

type ParticipantRow = {
  readonly expense_id: string;
  readonly user_id: string;
  readonly share_amount: number;
};

export type SettlementData = {
  readonly members: readonly { readonly userId: string; readonly displayName: string }[];
  readonly expenses: readonly {
    readonly id: string;
    readonly paidByUserId: string;
    readonly amount: number;
    readonly deletedAt: string | null;
    readonly participants: readonly { readonly userId: string; readonly shareAmount: number }[];
  }[];
  readonly payments: readonly PaymentRecord[];
};

export async function createPayment(
  db: D1Database,
  user: SessionUser,
  input: PaymentCreateInput,
): Promise<PaymentCreateResult> {
  if (input.fromUserId === input.toUserId) {
    throw new SelfPaymentError();
  }

  if (user.role !== 'admin' && input.fromUserId !== user.id) {
    throw new PaymentCreationForbiddenError(
      'Only the payment sender or an admin may record a payment.',
    );
  }

  const [activeMemberIds, settlementData] = await Promise.all([
    listActiveDefaultGroupMemberIds(db),
    loadSettlementData(db),
  ]);
  const userCanRecordPayment = user.role === 'admin' || activeMemberIds.has(user.id);
  const transferPartiesAreActive =
    activeMemberIds.has(input.fromUserId) && activeMemberIds.has(input.toUserId);

  if (!userCanRecordPayment || !transferPartiesAreActive) {
    throw new PaymentCreationForbiddenError();
  }

  const settledPayments = settlementData.payments.map((payment) => ({
    fromUserId: payment.fromUserId,
    toUserId: payment.toUserId,
    amount: payment.amount,
    status: payment.status,
  }));
  const suggestedTransfers = calculateSuggestedTransfers(
    calculateBalances(settlementData.members, settlementData.expenses, settledPayments),
  );
  const matchingTransfer = suggestedTransfers.find(
    (transfer) => transfer.fromUserId === input.fromUserId && transfer.toUserId === input.toUserId,
  );

  if (!matchingTransfer || input.amount > matchingTransfer.amount) {
    throw new PaymentTransferNotRelevantError();
  }

  const duplicatePendingPayment = await db
    .prepare(
      `SELECT id
       FROM payments
       WHERE group_id = ?
         AND from_user_id = ?
         AND to_user_id = ?
         AND status = 'pending'
       LIMIT 1`,
    )
    .bind(DEFAULT_GROUP_ID, input.fromUserId, input.toUserId)
    .first<Pick<PaymentRow, 'id'>>();

  if (duplicatePendingPayment) {
    throw new PendingPaymentAlreadyExistsError();
  }

  const paymentId = crypto.randomUUID();
  const status: PaymentCreateResult['status'] = user.role === 'admin' ? 'confirmed' : 'pending';

  const statements = [
    db
      .prepare(
        `INSERT INTO payments (
           id,
           group_id,
           from_user_id,
           to_user_id,
           amount,
           currency,
           note,
           status,
           created_by,
           confirmed_at
         )
         VALUES (?, ?, ?, ?, ?, 'TWD', ?, ?, ?, CASE WHEN ? = 'confirmed' THEN datetime('now', '+8 hours') END)`,
      )
      .bind(
        paymentId,
        DEFAULT_GROUP_ID,
        input.fromUserId,
        input.toUserId,
        input.amount,
        input.note ?? null,
        status,
        user.id,
        status,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, 'payment_created', 'payment', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        paymentId,
        JSON.stringify({
          fromUserId: input.fromUserId,
          toUserId: input.toUserId,
          amount: input.amount,
          note: input.note ?? null,
          status,
        }),
      ),
  ];

  if (status === 'confirmed') {
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, after_json)
           VALUES (?, ?, 'payment_confirmed', 'payment', ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          user.id,
          paymentId,
          JSON.stringify({
            fromUserId: input.fromUserId,
            toUserId: input.toUserId,
            amount: input.amount,
          }),
        ),
    );
  }

  await db.batch(statements);

  return { id: paymentId, status };
}

export async function confirmPayment(
  db: D1Database,
  user: SessionUser,
  paymentId: string,
): Promise<void> {
  const payment = await db
    .prepare(
      `SELECT id, group_id, from_user_id, to_user_id, amount, status
       FROM payments
       WHERE id = ? AND group_id = ?`,
    )
    .bind(paymentId, DEFAULT_GROUP_ID)
    .first<
      Pick<PaymentRow, 'id' | 'group_id' | 'from_user_id' | 'to_user_id' | 'amount' | 'status'>
    >();

  if (!payment) {
    throw new PaymentNotFoundError();
  }

  if (payment.status !== 'pending') {
    throw new PaymentAlreadyConfirmedError();
  }

  if (payment.to_user_id !== user.id && user.role !== 'admin') {
    throw new ForbiddenError();
  }

  const [updateResult] = await db.batch([
    db
      .prepare(
        `UPDATE payments
         SET status = 'confirmed', confirmed_at = datetime('now', '+8 hours')
         WHERE id = ? AND group_id = ? AND status = 'pending'`,
      )
      .bind(paymentId, DEFAULT_GROUP_ID),
  ]);

  if ((updateResult?.meta?.changes ?? 0) === 0) {
    throw new PaymentAlreadyConfirmedError();
  }

  await db.batch([
    db
      .prepare(
        `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, 'payment_confirmed', 'payment', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        user.id,
        paymentId,
        JSON.stringify({
          fromUserId: payment.from_user_id,
          toUserId: payment.to_user_id,
          amount: payment.amount,
        }),
      ),
  ]);
}

export async function loadSettlementData(db: D1Database): Promise<SettlementData> {
  const [memberResult, expenseResult, participantResult, paymentResult] = await Promise.all([
    db
      .prepare(
        `SELECT gm.user_id, COALESCE(u.display_name, u.email, gm.user_id) AS display_name
         FROM group_members gm
         INNER JOIN users u ON u.id = gm.user_id
         WHERE gm.group_id = ?`,
      )
      .bind(DEFAULT_GROUP_ID)
      .all<MemberRow>(),
    db
      .prepare(
        `SELECT id, paid_by_user_id, amount, deleted_at
         FROM expenses
         WHERE group_id = ?`,
      )
      .bind(DEFAULT_GROUP_ID)
      .all<ExpenseRow>(),
    db
      .prepare(
        `SELECT ep.expense_id, ep.user_id, ep.share_amount
         FROM expense_participants ep
         INNER JOIN expenses e ON e.id = ep.expense_id
         WHERE e.group_id = ?`,
      )
      .bind(DEFAULT_GROUP_ID)
      .all<ParticipantRow>(),
    db
      .prepare(
        `SELECT
           p.id,
           p.from_user_id,
           COALESCE(sender.display_name, sender.email, p.from_user_id) AS from_display_name,
           p.to_user_id,
           COALESCE(receiver.display_name, receiver.email, p.to_user_id) AS to_display_name,
           p.amount,
           p.currency,
           p.note,
           p.status,
           p.created_at,
           p.confirmed_at
         FROM payments p
         INNER JOIN users sender ON sender.id = p.from_user_id
         INNER JOIN users receiver ON receiver.id = p.to_user_id
         WHERE p.group_id = ? AND p.status IN ('pending', 'confirmed')`,
      )
      .bind(DEFAULT_GROUP_ID)
      .all<SettlementPaymentRow>(),
  ]);

  const participantsByExpenseId = new Map<
    string,
    readonly { readonly userId: string; readonly shareAmount: number }[]
  >();
  for (const row of participantResult.results ?? []) {
    const existing = participantsByExpenseId.get(row.expense_id) ?? [];
    participantsByExpenseId.set(row.expense_id, [
      ...existing,
      { userId: row.user_id, shareAmount: row.share_amount },
    ]);
  }

  const expenses = (expenseResult.results ?? []).map((row) => ({
    id: row.id,
    paidByUserId: row.paid_by_user_id,
    amount: row.amount,
    deletedAt: row.deleted_at,
    participants: participantsByExpenseId.get(row.id) ?? [],
  }));

  const payments: PaymentRecord[] = (paymentResult.results ?? []).map((row) => ({
    id: row.id,
    fromUserId: row.from_user_id,
    fromDisplayName: row.from_display_name,
    toUserId: row.to_user_id,
    toDisplayName: row.to_display_name,
    amount: row.amount,
    currency: row.currency,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  }));

  return {
    members: (memberResult.results ?? []).map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
    })),
    expenses,
    payments,
  };
}
