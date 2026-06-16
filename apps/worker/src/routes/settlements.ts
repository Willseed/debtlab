import { Hono } from 'hono';

import { requireDefaultGroupMember } from '../middleware/require-default-group-member';
import { requireAuth } from '../middleware/require-auth';
import { loadSettlementData } from '../services/payment.service';
import { calculateBalances, calculateSuggestedTransfers } from '../services/settlement.service';
import { AppBindings } from '../types';

export const settlementRoutes = new Hono<AppBindings>();

settlementRoutes.use('*', requireAuth);
settlementRoutes.use('*', requireDefaultGroupMember);

settlementRoutes.get('/summary', async (c) => {
  const db = c.env.DB;
  const data = await loadSettlementData(db);

  const settledPayments = data.payments.map((p) => ({
    fromUserId: p.fromUserId,
    toUserId: p.toUserId,
    amount: p.amount,
    status: p.status,
  }));

  const balances = calculateBalances(data.members, data.expenses, settledPayments);
  const suggestedTransfers = calculateSuggestedTransfers(balances);

  const pendingPayments = data.payments
    .filter((p) => p.status === 'pending')
    .map((p) => ({
      id: p.id,
      fromUserId: p.fromUserId,
      fromDisplayName: p.fromDisplayName,
      toUserId: p.toUserId,
      toDisplayName: p.toDisplayName,
      amount: p.amount,
      currency: p.currency,
      note: p.note,
      createdAt: p.createdAt,
    }));

  return c.json({
    currency: 'TWD',
    balances,
    suggestedTransfers,
    pendingPayments,
  });
});
