import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { easterEggRoutes } from '../src/routes/easter-eggs';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const CORRECT_PASSWORD = 'SystmeLab';
const ALLOWED_ORIGIN = 'http://localhost:4200';
const GARAGE_CTF_RATE_LIMIT_SCOPE = 'garage-ctf-solve';
const GARAGE_CTF_CONFIG_ROW = {
  code: 'hidden_garage',
  password_ciphertext: 'x2VGtRvJNtzm3B1oc+zoEl/mNF+KLy9zlw==',
  password_iv: 'MhrxOR7KxjPubuMx',
  password_salt: 'E2vhKEiWw2pWjmzJlEri2g==',
  ec_private_jwk:
    '{"key_ops":["deriveBits"],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256","d":"LiV8vdtWfMXlthS3h6afHsln6npr5KtnOoZWA-7ADDU"}',
  ec_public_jwk:
    '{"key_ops":[],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256"}',
};

const activeUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

type ApiErrorBody = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: {
      readonly retryAfterSeconds?: number;
      readonly limit?: number;
      readonly windowSeconds?: number;
    };
  };
};

type StoredRateLimitRow = {
  attempts: number;
  reset_at: string;
  updated_at: string;
};

type GarageTestD1 = D1Database & {
  readonly rateLimits: Map<string, StoredRateLimitRow>;
};

// ---------------------------------------------------------------------------
// GET /easter-eggs/garage-ctf
// ---------------------------------------------------------------------------

test('GET garage-ctf returns unsolved state when table is empty', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf', {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json<{ solved: boolean; firstSolverDisplayName: null }>();
  assert.equal(body.solved, false);
  assert.equal(body.firstSolverDisplayName, null);
});

test('GET garage-ctf returns solved state when a row exists', async () => {
  const { app } = createTestApp(
    makeSolvableD1({
      existingRow: {
        id: 1,
        user_id: 'usr_bob',
        display_name: 'Bob',
        solved_at: '2026-06-01 10:00:00',
      },
    }),
  );
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf', {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });

  assert.equal(response.status, 200);
  const body = await response.json<{ solved: boolean; firstSolverDisplayName: string }>();
  assert.equal(body.solved, true);
  assert.equal(body.firstSolverDisplayName, 'Bob');
});

test('GET garage-ctf requires authentication', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));

  const response = await app.request('/api/easter-eggs/garage-ctf');

  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// POST /easter-eggs/garage-ctf/solve
// ---------------------------------------------------------------------------

test('POST solve succeeds with correct password on first solve', async () => {
  const d1 = makeSolvableD1({ existingRow: null, insertSucceeds: true });
  const { app } = createTestApp(d1);
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: CORRECT_PASSWORD }),
  });

  assert.equal(response.status, 201);
  const body = await response.json<{ solved: boolean; firstSolverDisplayName: string }>();
  assert.equal(body.solved, true);
  assert.equal(body.firstSolverDisplayName, activeUser.displayName);
});

test('POST solve clears the user limiter after a successful first solve', async () => {
  const rateLimitKey = scopedUserRateLimitKey(GARAGE_CTF_RATE_LIMIT_SCOPE, activeUser.id);
  const d1 = makeSolvableD1({
    existingRow: null,
    insertSucceeds: true,
    rateLimits: [
      [
        rateLimitKey,
        {
          attempts: 2,
          reset_at: utc8TextFromNow(60),
          updated_at: utc8TextFromNow(0),
        },
      ],
    ],
  });
  const { app } = createTestApp(d1);
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: CORRECT_PASSWORD }),
  });

  assert.equal(response.status, 201);
  assert.equal(d1.rateLimits.has(rateLimitKey), false);
});

test('POST solve returns 422 for wrong password', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: 'wrong' }),
  });

  assert.equal(response.status, 422);
  const body = await response.json<{ error: { code: string } }>();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('POST solve returns 429 with retry metadata when attempts are exhausted', async () => {
  const { app } = createTestApp(
    makeSolvableD1({
      existingRow: null,
      rateLimits: [
        [
          scopedUserRateLimitKey(GARAGE_CTF_RATE_LIMIT_SCOPE, activeUser.id),
          {
            attempts: 3,
            reset_at: utc8TextFromNow(60),
            updated_at: utc8TextFromNow(0),
          },
        ],
      ],
    }),
  );
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: 'wrong' }),
  });

  assert.equal(response.status, 429);
  const body = (await response.json()) as ApiErrorBody;
  const retryAfterHeader = Number(response.headers.get('Retry-After'));
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.equal(body.error.message, '車庫 CTF 嘗試太頻繁，請稍後再試。');
  assert.equal(body.error.details.retryAfterSeconds, retryAfterHeader);
  assert.equal(body.error.details.limit, 3);
  assert.equal(body.error.details.windowSeconds, 60);
  assert.equal(retryAfterHeader > 0, true);
});

test('POST solve returns 409 when already solved', async () => {
  const d1 = makeSolvableD1({
    existingRow: {
      id: 1,
      user_id: 'usr_bob',
      display_name: 'Bob',
      solved_at: '2026-06-01 10:00:00',
    },
  });
  const { app } = createTestApp(d1);
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: CORRECT_PASSWORD }),
  });

  assert.equal(response.status, 409);
  const body = await response.json<{ error: { code: string } }>();
  assert.equal(body.error.code, 'CONFLICT');
});

test('POST solve returns 422 for missing body', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 422);
});

test('POST solve requires authentication', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN,
    },
    body: JSON.stringify({ password: CORRECT_PASSWORD }),
  });

  assert.equal(response.status, 401);
});

test('POST solve blocked by Origin validation for mutations', async () => {
  const { app } = createTestApp(makeSolvableD1({ existingRow: null }));
  const token = await createSessionToken(activeUser, SESSION_SECRET);

  const response = await app.request('/api/easter-eggs/garage-ctf/solve', {
    method: 'POST',
    headers: {
      Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
      Origin: 'https://evil.example.com',
    },
    body: JSON.stringify({ password: CORRECT_PASSWORD }),
  });

  assert.equal(response.status, 403);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExistingRow = {
  id: number;
  user_id: string;
  display_name: string;
  solved_at: string;
} | null;

function makeSolvableD1(opts: {
  existingRow: ExistingRow;
  insertSucceeds?: boolean;
  rateLimits?: readonly (readonly [string, StoredRateLimitRow])[];
}): GarageTestD1 {
  const { existingRow, insertSucceeds = true } = opts;

  let firstSolveInserted = false;
  const rateLimits = new Map((opts.rateLimits ?? []).map(([key, row]) => [key, { ...row }]));

  return {
    rateLimits,
    prepare: (sql: string) => {
      if (sql.includes('rate_limits')) {
        return makeRateLimitStatement(sql, rateLimits);
      }

      // User lookup for requireAuth middleware
      if (sql.includes('FROM users')) {
        return {
          bind: () => ({
            first: async () => ({
              id: activeUser.id,
              email: activeUser.email ?? null,
              display_name: activeUser.displayName,
              avatar_url: activeUser.avatarUrl ?? null,
              role: activeUser.role,
              status: activeUser.status,
            }),
          }),
        };
      }

      if (sql.includes('FROM garage_ctf_config')) {
        return {
          bind: () => ({
            first: async () => GARAGE_CTF_CONFIG_ROW,
          }),
        };
      }

      // Easter egg code lookup — always return null in tests
      if (sql.includes('FROM easter_eggs')) {
        return {
          first: async () => null,
          bind: () => ({ first: async () => null }),
        };
      }

      // Per-user unlock insert — noop
      if (sql.includes('user_easter_egg_unlocks')) {
        return {
          bind: () => ({ run: async () => undefined }),
        };
      }

      // Garage CTF first-solve table
      if (sql.includes('garage_ctf_first_solve')) {
        if (sql.trimStart().toUpperCase().startsWith('INSERT')) {
          return {
            bind: () => ({
              run: async () => {
                if (!insertSucceeds) {
                  return { meta: { changes: 0 } };
                }
                firstSolveInserted = true;
                return { meta: { changes: 1 } };
              },
            }),
          };
        }

        // SELECT queries — resolve based on insertions and initial state
        const resolvedRow = (): ExistingRow =>
          firstSolveInserted
            ? {
                id: 1,
                user_id: activeUser.id,
                display_name: activeUser.displayName,
                solved_at: '2026-06-15 10:00:00',
              }
            : existingRow;

        return {
          first: async () => resolvedRow(),
          bind: () => ({ first: async () => resolvedRow() }),
        };
      }

      // Fallback
      return {
        first: async () => null,
        bind: () => ({
          first: async () => null,
          run: async () => ({ meta: { changes: 0 } }),
        }),
      };
    },
  } as unknown as GarageTestD1;
}

function makeRateLimitStatement(
  sql: string,
  rows: Map<string, StoredRateLimitRow>,
  values: readonly unknown[] = [],
) {
  return {
    bind: (...nextValues: readonly unknown[]) => makeRateLimitStatement(sql, rows, nextValues),
    first: async <T>(): Promise<T | null> => {
      const row = rows.get(String(values[0]));
      return row ? ({ attempts: row.attempts, reset_at: row.reset_at } as T) : null;
    },
    run: async () => {
      if (sql.includes('INSERT INTO rate_limits')) {
        const [keyValue, resetAtValue, updatedAtValue] = values;
        const key = String(keyValue);

        if (!rows.has(key)) {
          rows.set(key, {
            attempts: 1,
            reset_at: String(resetAtValue),
            updated_at: String(updatedAtValue),
          });
        }

        return { meta: { changes: 1 } };
      }

      if (sql.includes('SET attempts = 1')) {
        const [resetAtValue, updatedAtValue, keyValue] = values;
        rows.set(String(keyValue), {
          attempts: 1,
          reset_at: String(resetAtValue),
          updated_at: String(updatedAtValue),
        });
        return { meta: { changes: 1 } };
      }

      if (sql.includes('SET attempts = attempts + 1')) {
        const [updatedAtValue, keyValue] = values;
        const key = String(keyValue);
        const row = rows.get(key);

        if (row) {
          rows.set(key, {
            ...row,
            attempts: row.attempts + 1,
            updated_at: String(updatedAtValue),
          });
        }

        return { meta: { changes: row ? 1 : 0 } };
      }

      if (sql.includes('DELETE FROM rate_limits')) {
        const deleted = rows.delete(String(values[0]));
        return { meta: { changes: deleted ? 1 : 0 } };
      }

      throw new Error(`Unsupported rate-limit SQL: ${sql}`);
    },
  };
}

function scopedUserRateLimitKey(scope: string, userId: string): string {
  return `${scope}:${userId}`;
}

function utc8TextFromNow(offsetSeconds: number): string {
  const date = new Date(Date.now() + offsetSeconds * 1000 + 8 * 60 * 60 * 1000);

  return (
    [
      date.getUTCFullYear(),
      padDatePart(date.getUTCMonth() + 1),
      padDatePart(date.getUTCDate()),
    ].join('-') +
    ` ${padDatePart(date.getUTCHours())}:${padDatePart(date.getUTCMinutes())}:${padDatePart(
      date.getUTCSeconds(),
    )}`
  );
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function createTestApp(db: D1Database) {
  const app = new Hono<AppBindings>();
  app.use('/api/*', validateOrigin);
  app.route('/api/easter-eggs', easterEggRoutes);

  return {
    app: {
      request: (path: string, init?: RequestInit) =>
        app.request(path, init, { DB: db, SESSION_SECRET, APP_BASE_URL: ALLOWED_ORIGIN }),
    },
  };
}
