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

function makeSolvableD1(opts: { existingRow: ExistingRow; insertSucceeds?: boolean }): D1Database {
  const { existingRow, insertSucceeds = true } = opts;

  let firstSolveInserted = false;

  return {
    prepare: (sql: string) => {
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
  } as unknown as D1Database;
}

function createTestApp(db: D1Database) {
  const app = new Hono<AppBindings>();
  app.use('/api/*', validateOrigin);
  app.route('/api/easter-eggs', easterEggRoutes);

  return {
    app: {
      request: (path: string, init?: RequestInit) =>
        app.request(path, init, { DB: db, SESSION_SECRET }),
    },
  };
}
