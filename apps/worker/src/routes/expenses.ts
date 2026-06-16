import { Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireDefaultGroupMember } from '../middleware/require-default-group-member';
import { requireAuth } from '../middleware/require-auth';
import {
  createExpense,
  deleteExpense,
  ExpenseForbiddenError,
  ExpenseInvalidParticipantsError,
  ExpenseLastParticipantError,
  ExpenseParticipantLockForbiddenError,
  ExpenseParticipantLockedError,
  ExpenseNotFoundError,
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
  validateExpenseMembers,
} from '../services/expense.service';
import { calculateExpenseShares } from '../services/split.service';
import { AppBindings } from '../types';
import { expenseCreateSchema, expenseUpdateSchema } from '../validation/schemas';

export const expenseRoutes = new Hono<AppBindings>();

expenseRoutes.use('*', requireAuth);
expenseRoutes.use('*', requireDefaultGroupMember);

expenseRoutes.get('/', async (c) => {
  const expenses = await listExpenses(c.env.DB, c.get('currentUser'));

  return c.json({ expenses, nextCursor: null });
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

  try {
    await validateExpenseMembers(c.env.DB, currentUser, parsed.data);
  } catch (error) {
    if (error instanceof ExpenseInvalidParticipantsError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    throw error;
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

expenseRoutes.get('/:expenseId', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    const expense = await getExpense(c.env.DB, currentUser, expenseId);
    return c.json({ expense });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    throw error;
  }
});

expenseRoutes.put('/:expenseId/participants/me', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    const expense = await joinExpenseParticipant(c.env.DB, currentUser, expenseId);
    return c.json({ expense });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    if (error instanceof ExpenseParticipantForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    if (error instanceof ExpenseParticipantLockedError) {
      return errorResponse(c, 409, 'CONFLICT', error.message);
    }
    if (error instanceof ExpenseParticipantSplitMethodError) {
      return errorResponse(c, 409, 'CONFLICT', error.message);
    }
    throw error;
  }
});

expenseRoutes.delete('/:expenseId/participants/me', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    const expense = await leaveExpenseParticipant(c.env.DB, currentUser, expenseId);
    return c.json({ expense });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    if (error instanceof ExpenseParticipantForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    if (
      error instanceof ExpenseParticipantSplitMethodError ||
      error instanceof ExpenseParticipantNotFoundError ||
      error instanceof ExpenseLastParticipantError ||
      error instanceof ExpenseParticipantSettledError
    ) {
      return errorResponse(c, 409, 'CONFLICT', error.message);
    }
    throw error;
  }
});

expenseRoutes.put('/:expenseId/participant-lock', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    const expense = await lockExpenseParticipants(c.env.DB, currentUser, expenseId);
    return c.json({ expense });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    if (error instanceof ExpenseParticipantLockForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    throw error;
  }
});

expenseRoutes.delete('/:expenseId/participant-lock', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    const expense = await unlockExpenseParticipants(c.env.DB, currentUser, expenseId);
    return c.json({ expense });
  } catch (error) {
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    if (error instanceof ExpenseParticipantLockForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    throw error;
  }
});

expenseRoutes.patch('/:expenseId', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = expenseUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Expense update is invalid.',
      parsed.error.flatten(),
    );
  }

  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    await updateExpense(c.env.DB, currentUser, expenseId, parsed.data);
  } catch (error) {
    if (error instanceof ExpenseForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    throw error;
  }

  return c.json({ expense: { id: expenseId } });
});

expenseRoutes.delete('/:expenseId', async (c) => {
  const currentUser = c.get('currentUser');
  const expenseId = c.req.param('expenseId');

  try {
    await deleteExpense(c.env.DB, currentUser, expenseId);
  } catch (error) {
    if (error instanceof ExpenseForbiddenError) {
      return errorResponse(c, 403, 'FORBIDDEN', error.message);
    }
    if (error instanceof ExpenseNotFoundError) {
      return errorResponse(c, 404, 'NOT_FOUND', error.message);
    }
    throw error;
  }

  return c.json({ ok: true });
});

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Split total does not match expense amount.';
}
