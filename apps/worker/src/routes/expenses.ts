import { Hono } from 'hono';

import { errorResponse, notImplemented } from '../http/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { createExpense } from '../services/expense.service';
import { calculateExpenseShares } from '../services/split.service';
import { AppBindings } from '../types';
import { expenseCreateSchema } from '../validation/schemas';

export const expenseRoutes = new Hono<AppBindings>();

expenseRoutes.use('*', requireAuth);

expenseRoutes.get('/', (c) => {
  return c.json({ expenses: [], nextCursor: null });
});

expenseRoutes.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = expenseCreateSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Expense request is invalid.',
      parsed.error.flatten(),
    );
  }

  const currentUser = c.get('currentUser');

  if (
    parsed.data.paidByUserId !== currentUser.id ||
    parsed.data.participants.some((participant) => participant.userId !== currentUser.id)
  ) {
    return errorResponse(
      c,
      403,
      'FORBIDDEN',
      'Expense creation is currently limited to the authenticated user.',
    );
  }

  let shares: ReturnType<typeof calculateExpenseShares>;

  try {
    shares = calculateExpenseShares({
      amount: parsed.data.amount,
      splitMethod: parsed.data.splitMethod,
      participants: parsed.data.participants,
    });
  } catch (error) {
    return errorResponse(c, 422, 'SPLIT_TOTAL_MISMATCH', readErrorMessage(error));
  }

  const expenseId = await createExpense(c.env.DB, currentUser, parsed.data, shares);

  return c.json({ expense: { id: expenseId } }, 201);
});

expenseRoutes.get('/:expenseId', (c) => {
  return notImplemented(c, `Expense ${c.req.param('expenseId')} detail is not implemented yet.`);
});

expenseRoutes.patch('/:expenseId', (c) => {
  return notImplemented(c, `Expense ${c.req.param('expenseId')} update is not implemented yet.`);
});

expenseRoutes.delete('/:expenseId', requireAdmin, (c) => {
  return notImplemented(
    c,
    `Expense ${c.req.param('expenseId')} soft delete is not implemented yet.`,
  );
});

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Split total does not match expense amount.';
}
