import { Context, Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
import {
  MysteryChallengeConfigurationError,
  MysteryChallengeInvalidPasswordError,
  MysteryChallengeUnavailableError,
  readMysteryChallengeLeaderboard,
  readMysteryChallengeState,
  submitMysteryChallengePassword,
} from '../services/mystery-challenge.service';
import { AppBindings } from '../types';
import { mysteryChallengeSubmissionSchema } from '../validation/schemas';

export const mysteryChallengeRoutes = new Hono<AppBindings>();

mysteryChallengeRoutes.use('*', requireAuth);

mysteryChallengeRoutes.get('/', async (c) => {
  const user = c.get('currentUser');
  try {
    return c.json(await readMysteryChallengeState(c.env.DB, user));
  } catch (error) {
    if (error instanceof MysteryChallengeConfigurationError) {
      return errorResponse(c, 500, 'INTERNAL_ERROR', error.message);
    }

    throw error;
  }
});

mysteryChallengeRoutes.get('/leaderboard', async (c) => {
  return c.json({ leaderboard: await readMysteryChallengeLeaderboard(c.env.DB) });
});

mysteryChallengeRoutes.post('/submissions', async (c) => {
  return await handleSubmission(c);
});

async function handleSubmission(c: Context<AppBindings>) {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = mysteryChallengeSubmissionSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Mystery challenge submission is invalid.',
      parsed.error.flatten(),
    );
  }

  const user = c.get('currentUser');

  try {
    const result = await submitMysteryChallengePassword(c.env.DB, user, parsed.data.password);
    return c.json(
      {
        completed: true,
        completedAt: result.completedAt,
        leaderboard: result.leaderboard,
      },
      201,
    );
  } catch (error) {
    if (error instanceof MysteryChallengeInvalidPasswordError) {
      return errorResponse(c, 422, 'VALIDATION_ERROR', error.message, {
        reason: 'PASSWORD_INVALID',
      });
    }

    if (error instanceof MysteryChallengeUnavailableError) {
      return errorResponse(c, 409, 'CONFLICT', error.message, {
        reason: 'ALREADY_COMPLETED_OR_UNAVAILABLE',
      });
    }

    if (error instanceof MysteryChallengeConfigurationError) {
      return errorResponse(c, 500, 'INTERNAL_ERROR', error.message);
    }

    throw error;
  }
}
