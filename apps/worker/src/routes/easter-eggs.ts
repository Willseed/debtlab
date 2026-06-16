import { Hono } from 'hono';
import { z } from 'zod';

import { errorResponse } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
import { verifyGarageCtfPassword } from '../services/garage-ctf.service';
import {
  clearRateLimit,
  consumeRateLimit,
  RateLimitExceededError,
} from '../services/rate-limit.service';
import { AppBindings } from '../types';

const solveSchema = z
  .object({
    password: z.string().min(1).max(256),
  })
  .strict();

type GarageCTFFirstSolveRow = {
  readonly user_id: string;
  readonly display_name: string;
  readonly solved_at: string;
};

export const easterEggRoutes = new Hono<AppBindings>();

const GARAGE_CTF_RATE_LIMIT = {
  scope: 'garage-ctf-solve',
  limit: 3,
  windowSeconds: 60,
} as const;

easterEggRoutes.use('*', requireAuth);

easterEggRoutes.get('/garage-ctf', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT user_id, display_name, solved_at FROM garage_ctf_first_solve WHERE id = 1',
  ).first<GarageCTFFirstSolveRow>();

  if (!row) {
    return c.json({ solved: false, solvedAt: null, firstSolverDisplayName: null });
  }

  return c.json({
    solved: true,
    solvedAt: row.solved_at,
    firstSolverDisplayName: row.display_name,
  });
});

easterEggRoutes.post('/garage-ctf/solve', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = solveSchema.safeParse(body);

  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      'VALIDATION_ERROR',
      'Request body is invalid.',
      parsed.error.flatten(),
    );
  }

  const user = c.get('currentUser');

  try {
    await consumeRateLimit(c.env.DB, {
      ...GARAGE_CTF_RATE_LIMIT,
      userId: user.id,
    });
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      c.header('Retry-After', String(error.retryAfterSeconds));
      return errorResponse(c, 429, 'RATE_LIMITED', '車庫 CTF 嘗試太頻繁，請稍後再試。', {
        retryAfterSeconds: error.retryAfterSeconds,
        limit: error.limit,
        windowSeconds: error.windowSeconds,
      });
    }

    throw error;
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM garage_ctf_first_solve WHERE id = 1',
  ).first<{ id: number }>();

  if (existing) {
    return errorResponse(c, 409, 'CONFLICT', 'The Garage CTF has already been solved.');
  }

  if (!(await verifyGarageCtfPassword(c.env.DB, parsed.data.password))) {
    return errorResponse(c, 422, 'VALIDATION_ERROR', 'Incorrect password.');
  }

  const firstSolveResult = await c.env.DB.prepare(
    'INSERT OR IGNORE INTO garage_ctf_first_solve (id, user_id, display_name) VALUES (1, ?, ?)',
  )
    .bind(user.id, user.displayName)
    .run();

  if ((firstSolveResult.meta.changes ?? 0) === 0) {
    return errorResponse(c, 409, 'CONFLICT', 'The Garage CTF has already been solved.');
  }

  // Also record per-user unlock in user_easter_egg_unlocks if egg exists.
  const egg = await c.env.DB.prepare(
    "SELECT id FROM easter_eggs WHERE code = 'hidden_garage' AND is_enabled = 1",
  ).first<{ id: string }>();

  if (egg) {
    await c.env.DB.prepare(
      `INSERT INTO user_easter_egg_unlocks (id, user_id, easter_egg_id)
       VALUES (lower(hex(randomblob(16))), ?, ?)
       ON CONFLICT(user_id, easter_egg_id) DO NOTHING`,
    )
      .bind(user.id, egg.id)
      .run();
  }

  await clearRateLimit(c.env.DB, GARAGE_CTF_RATE_LIMIT.scope, user.id);

  const row = await c.env.DB.prepare(
    'SELECT solved_at FROM garage_ctf_first_solve WHERE id = 1',
  ).first<{ solved_at: string }>();

  return c.json(
    {
      solved: true,
      solvedAt: row?.solved_at ?? null,
      firstSolverDisplayName: user.displayName,
    },
    201,
  );
});
