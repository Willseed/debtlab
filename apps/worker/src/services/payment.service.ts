import { SessionUser } from '../types';
import { PaymentCreateInput } from '../validation/schemas';

const DEFAULT_GROUP_ID = 'grp_default';

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
  constructor() {
    super('Only the payment sender may record a payment.');
    this.name = 'PaymentCreationForbiddenError';
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
): Promise<string> {
  if (input.fromUserId === input.toUserId) {
    throw new SelfPaymentError();
  }

  if (input.fromUserId !== user.id) {
    throw new PaymentCreationForbiddenError();
  }

  const paymentId = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO payments (id, group_id, from_user_id, to_user_id, amount, currency, note, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'TWD', ?, 'pending', ?)`,
      )
      .bind(
        paymentId,
        DEFAULT_GROUP_ID,
        input.fromUserId,
        input.toUserId,
        input.amount,
        input.note ?? null,
        user.id,
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
        }),
      ),
  ]);

  return paymentId;
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
