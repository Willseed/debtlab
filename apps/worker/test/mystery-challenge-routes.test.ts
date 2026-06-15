import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { easterEggRoutes } from '../src/routes/easter-eggs';
import { mysteryChallengeRoutes } from '../src/routes/mystery-challenge';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { AppBindings, SessionUser } from '../src/types';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const ALLOWED_ORIGIN = 'http://localhost:4200';

const alice: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

const bob: SessionUser = {
  id: 'usr_bob',
  email: 'bob@example.test',
  displayName: 'Bob',
  role: 'member',
  status: 'active',
};

const carol: SessionUser = {
  id: 'usr_carol',
  email: 'carol@example.test',
  displayName: 'Carol',
  role: 'member',
  status: 'active',
};

const alphaPassword = 'test-alpha-passphrase';
const betaPassword = 'test-beta-passphrase';
const wrongPassword = 'test-wrong-passphrase';

type MysteryChallengePromptBody = {
  readonly id: string;
  readonly displayOrder: number;
  readonly tokens: readonly number[];
  readonly claimed: boolean;
  readonly hint: {
    readonly locale: 'zh-TW';
    readonly title: string;
    readonly body: string;
  };
};

type MysteryChallengeStateBody = {
  readonly status: 'active' | 'completed';
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly encodedPasswords: readonly MysteryChallengePromptBody[];
  readonly claimedCount: number;
  readonly availableCount: number;
};

type MysteryChallengeLeaderboardEntryBody = {
  readonly rank: number;
  readonly displayName: string;
  readonly completedAt: string;
};

type MysteryChallengeLeaderboardBody = {
  readonly leaderboard: readonly MysteryChallengeLeaderboardEntryBody[];
};

type MysteryChallengeSubmissionBody = {
  readonly completed: true;
  readonly completedAt: string;
  readonly leaderboard: readonly MysteryChallengeLeaderboardEntryBody[];
};

type ApiErrorBody = {
  readonly error: {
    readonly code: string;
    readonly details: {
      readonly reason?: string;
    };
  };
};

type MysteryPasswordRow = {
  readonly id: string;
  readonly display_order: number;
  readonly password_hash: string;
  readonly password_hash_salt: string;
};

const MYSTERY_PASSWORD_ROWS: readonly MysteryPasswordRow[] = [
  {
    id: 'signal_alpha',
    display_order: 1,
    password_hash: '97zvaDQXuZ7MGR8Oi0OX97zoDIGJdn+6ydW6GpRjYV8=',
    password_hash_salt: 'dGVzdC1hbHBoYS1zYWx0IQ==',
  },
  {
    id: 'signal_beta',
    display_order: 2,
    password_hash: 'k05U64edWMQ601hpbXwXpBzWlQrvid7D+w8KI6ArNiA=',
    password_hash_salt: 'dGVzdC1iZXRhLXNhbHQhIQ==',
  },
  {
    id: 'signal_gamma',
    display_order: 3,
    password_hash: 'Xbi1EdAzhZGfQ8YZPBQBWgKNrxZyWoYOqE9M/5uh11o=',
    password_hash_salt: 'dGVzdC1nYW1tYS1zYWx0',
  },
];

type CompletionRow = {
  sequence: number;
  id: string;
  password_id: string;
  user_id: string;
  display_name: string;
  completed_at: string;
};

test('GET /api/mystery-challenge returns active state with encoded clue sequences', async () => {
  const db = new FakeMysteryD1();
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge',
    {
      headers: { Cookie: cookie },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as MysteryChallengeStateBody;
  assert.equal(body.status, 'active');
  assert.equal(body.completed, false);
  assert.equal(body.claimedCount, 0);
  assert.equal(body.availableCount, 3);
  assert.deepEqual(
    body.encodedPasswords.map((prompt) => prompt.tokens),
    [
      [50, 783, 1047, 34048, 41957, 24],
      [50, 783, 1047, 34048, 30652, 23],
      [3320, 34048, 39660, 22],
    ],
  );
  assert.equal(body.encodedPasswords.every((prompt) => prompt.hint.locale === 'zh-TW'), true);
  assert.doesNotMatch(JSON.stringify(body), /o200k/iu);
});

test('GET /api/mystery-challenge returns completed state after every password is claimed', async () => {
  const db = new FakeMysteryD1({
    completions: [
      completionSeed({
        sequence: 1,
        passwordId: 'signal_alpha',
        user: alice,
        completedAt: '2026-06-15 12:00:00.000',
      }),
      completionSeed({
        sequence: 2,
        passwordId: 'signal_beta',
        user: bob,
        completedAt: '2026-06-15 12:01:00.000',
      }),
      completionSeed({
        sequence: 3,
        passwordId: 'signal_gamma',
        user: carol,
        completedAt: '2026-06-15 12:02:00.000',
      }),
    ],
  });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge',
    {
      headers: { Cookie: cookie },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as MysteryChallengeStateBody;
  assert.equal(body.status, 'completed');
  assert.equal(body.completed, true);
  assert.equal(body.completedAt, '2026-06-15 12:00:00.000');
  assert.equal(body.claimedCount, 3);
  assert.equal(body.availableCount, 0);
  assert.equal(body.encodedPasswords.every((prompt) => prompt.claimed), true);
});

test('GET /api/mystery-challenge handles null D1 claimed rows as empty state', async () => {
  const db = new FakeMysteryD1({ nullClaimResults: true });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge',
    {
      headers: { Cookie: cookie },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as MysteryChallengeStateBody;
  assert.equal(body.claimedCount, 0);
  assert.equal(body.availableCount, 3);
});

test('POST /api/mystery-challenge/submissions accepts one unclaimed password once', async () => {
  const db = new FakeMysteryD1({
    completionTimestamps: ['2026-06-15 14:00:00.100'],
  });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 201);
  const body = (await response.json()) as MysteryChallengeSubmissionBody;
  assert.equal(body.completed, true);
  assert.equal(body.completedAt, '2026-06-15 14:00:00.100');
  assert.deepEqual(body.leaderboard, [
    { rank: 1, displayName: alice.displayName, completedAt: '2026-06-15 14:00:00.100' },
  ]);
  assert.equal(db.completions.length, 1);
  assert.equal(db.completions[0]?.password_id, 'signal_alpha');
});

test('POST /api/mystery-challenge/submissions rejects malformed bodies with standard errors', async () => {
  const db = new FakeMysteryD1();
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: '' }),
    },
    env(db),
  );

  assert.equal(response.status, 422);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(db.completions.length, 0);
});

test('POST /api/mystery-challenge/submissions rejects invalid passwords without completion', async () => {
  const db = new FakeMysteryD1();
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: wrongPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 422);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.details.reason, 'PASSWORD_INVALID');
  assert.equal(db.completions.length, 0);
});

test('POST /api/mystery-challenge/submissions reports configuration errors when D1 password rows are unavailable', async () => {
  const db = new FakeMysteryD1({ nullPasswordResults: true });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 500);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.code, 'INTERNAL_ERROR');
  assert.equal(db.completions.length, 0);
});

test('POST /api/mystery-challenge/submissions rejects retry after the user completed', async () => {
  const db = new FakeMysteryD1({
    completions: [
      completionSeed({
        sequence: 1,
        passwordId: 'signal_alpha',
        user: alice,
        completedAt: '2026-06-15 13:00:00.000',
      }),
    ],
  });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: betaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.details.reason, 'ALREADY_COMPLETED_OR_UNAVAILABLE');
  assert.equal(db.completions.length, 1);
});

test('POST /api/mystery-challenge/submissions rejects a password claimed by another user', async () => {
  const db = new FakeMysteryD1({
    completions: [
      completionSeed({
        sequence: 1,
        passwordId: 'signal_alpha',
        user: bob,
        completedAt: '2026-06-15 13:00:00.000',
      }),
    ],
  });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.code, 'CONFLICT');
  assert.equal(body.error.details.reason, 'ALREADY_COMPLETED_OR_UNAVAILABLE');
  assert.equal(db.completions.length, 1);
});

test('POST /api/mystery-challenge/submissions treats missing D1 change metadata as unavailable', async () => {
  const db = new FakeMysteryD1({ forceNullInsertChanges: true });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.details.reason, 'ALREADY_COMPLETED_OR_UNAVAILABLE');
});

test('POST /api/mystery-challenge/submissions rejects if completion disappears after insert', async () => {
  const db = new FakeMysteryD1({ hideInsertedCompletion: true });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );

  assert.equal(response.status, 409);
  const body = (await response.json()) as ApiErrorBody;
  assert.equal(body.error.details.reason, 'ALREADY_COMPLETED_OR_UNAVAILABLE');
});

test('GET /api/mystery-challenge/leaderboard orders completions by completion time', async () => {
  const db = new FakeMysteryD1({
    completions: [
      completionSeed({
        sequence: 1,
        passwordId: 'signal_alpha',
        user: bob,
        completedAt: '2026-06-15 13:00:00.000',
      }),
      completionSeed({
        sequence: 2,
        passwordId: 'signal_beta',
        user: carol,
        completedAt: '2026-06-15 12:59:59.999',
      }),
    ],
  });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/leaderboard',
    {
      headers: { Cookie: cookie },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as MysteryChallengeLeaderboardBody;
  assert.deepEqual(body.leaderboard, [
    { rank: 1, displayName: carol.displayName, completedAt: '2026-06-15 12:59:59.999' },
    { rank: 2, displayName: bob.displayName, completedAt: '2026-06-15 13:00:00.000' },
  ]);
});

test('GET /api/mystery-challenge/leaderboard handles null D1 results as empty list', async () => {
  const db = new FakeMysteryD1({ nullLeaderboardResults: true });
  const app = makeApp();
  const cookie = await authCookie(alice);

  const response = await app.request(
    '/api/mystery-challenge/leaderboard',
    {
      headers: { Cookie: cookie },
    },
    env(db),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as MysteryChallengeLeaderboardBody;
  assert.deepEqual(body.leaderboard, []);
});

test('mystery challenge APIs require authentication and mutation Origin validation', async () => {
  const db = new FakeMysteryD1();
  const app = makeApp();
  const cookie = await authCookie(alice);

  const unauthenticatedState = await app.request('/api/mystery-challenge', undefined, env(db));
  assert.equal(unauthenticatedState.status, 401);

  const unauthenticatedSubmission = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );
  assert.equal(unauthenticatedSubmission.status, 401);

  const badOriginSubmission = await app.request(
    '/api/mystery-challenge/submissions',
    {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
      },
      body: JSON.stringify({ password: alphaPassword }),
    },
    env(db),
  );
  assert.equal(badOriginSubmission.status, 403);
});

class FakeMysteryD1 {
  readonly users = new Map<string, SessionUser>([
    [alice.id, alice],
    [bob.id, bob],
    [carol.id, carol],
  ]);
  readonly completionTimestamps: string[];
  readonly completions: CompletionRow[];
  readonly forceNullInsertChanges: boolean;
  readonly hideInsertedCompletion: boolean;
  readonly nullClaimResults: boolean;
  readonly nullLeaderboardResults: boolean;
  readonly nullPasswordResults: boolean;
  private nextSequence: number;

  constructor(
    opts: {
      readonly completions?: readonly CompletionRow[];
      readonly completionTimestamps?: readonly string[];
      readonly forceNullInsertChanges?: boolean;
      readonly hideInsertedCompletion?: boolean;
      readonly nullClaimResults?: boolean;
      readonly nullLeaderboardResults?: boolean;
      readonly nullPasswordResults?: boolean;
    } = {},
  ) {
    this.completions = [...(opts.completions ?? [])];
    this.completionTimestamps = [...(opts.completionTimestamps ?? [])];
    this.forceNullInsertChanges = opts.forceNullInsertChanges ?? false;
    this.hideInsertedCompletion = opts.hideInsertedCompletion ?? false;
    this.nullClaimResults = opts.nullClaimResults ?? false;
    this.nullLeaderboardResults = opts.nullLeaderboardResults ?? false;
    this.nullPasswordResults = opts.nullPasswordResults ?? false;
    this.nextSequence =
      Math.max(0, ...this.completions.map((completion) => completion.sequence)) + 1;
  }

  prepare(sql: string) {
    return new FakeMysteryStatement(this, sql);
  }

  insertCompletion(id: string, passwordId: string, userId: string, displayName: string) {
    if (
      this.completions.some(
        (completion) => completion.user_id === userId || completion.password_id === passwordId,
      )
    ) {
      return { meta: { changes: 0 } };
    }

    if (this.forceNullInsertChanges) {
      return { meta: { changes: undefined } };
    }

    const sequence = this.nextSequence;
    this.nextSequence += 1;
    this.completions.push({
      sequence,
      id,
      password_id: passwordId,
      user_id: userId,
      display_name: displayName,
      completed_at:
        this.completionTimestamps.shift() ??
        `2026-06-15 14:00:${String(sequence).padStart(2, '0')}.000`,
    });

    return { meta: { changes: 1 } };
  }
}

class FakeMysteryStatement {
  readonly values: readonly unknown[];

  constructor(
    private readonly db: FakeMysteryD1,
    readonly sql: string,
    values: readonly unknown[] = [],
  ) {
    this.values = values;
  }

  bind(...values: readonly unknown[]) {
    return new FakeMysteryStatement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    if (this.sql.includes('FROM users')) {
      const userId = String(this.values[0]);
      const user = this.db.users.get(userId);
      return user
        ? ({
            id: user.id,
            email: user.email ?? null,
            display_name: user.displayName,
            avatar_url: user.avatarUrl ?? null,
            role: user.role,
            status: user.status,
          } as T)
        : null;
    }

    if (
      this.sql.includes('FROM mystery_challenge_completions') &&
      this.sql.includes('WHERE user_id = ?')
    ) {
      const userId = String(this.values[0]);
      if (this.db.hideInsertedCompletion) {
        return null;
      }
      const completion = this.db.completions.find((row) => row.user_id === userId);
      return completion ? ({ completed_at: completion.completed_at } as T) : null;
    }

    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    if (this.sql.includes('FROM mystery_challenge_passwords')) {
      if (this.db.nullPasswordResults) {
        return { results: null as unknown as T[] };
      }
      return { results: [...MYSTERY_PASSWORD_ROWS] as T[] };
    }

    if (
      this.sql.includes('SELECT password_id') &&
      this.sql.includes('FROM mystery_challenge_completions')
    ) {
      if (this.db.nullClaimResults) {
        return { results: null as unknown as T[] };
      }
      return {
        results: this.db.completions.map((completion) => ({
          password_id: completion.password_id,
        })) as T[],
      };
    }

    if (
      this.sql.includes('SELECT display_name, completed_at') &&
      this.sql.includes('FROM mystery_challenge_completions')
    ) {
      if (this.db.nullLeaderboardResults) {
        return { results: null as unknown as T[] };
      }
      return {
        results: [...this.db.completions]
          .sort(
            (left, right) =>
              left.completed_at.localeCompare(right.completed_at) || left.sequence - right.sequence,
          )
          .map((completion) => ({
            display_name: completion.display_name,
            completed_at: completion.completed_at,
          })) as T[],
      };
    }

    return { results: [] };
  }

  async run() {
    if (this.sql.includes('INSERT OR IGNORE INTO mystery_challenge_completions')) {
      const [id, passwordId, userId, displayName] = this.values.map((value) => String(value));
      return this.db.insertCompletion(id, passwordId, userId, displayName);
    }

    return { meta: { changes: 0 } };
  }
}

function makeApp() {
  const app = new Hono<AppBindings>();
  app.use('/api/*', validateOrigin);
  app.route('/api/easter-eggs', easterEggRoutes);
  app.route('/api/mystery-challenge', mysteryChallengeRoutes);
  return app;
}

function env(db: FakeMysteryD1) {
  return { DB: db as unknown as D1Database, SESSION_SECRET };
}

async function authCookie(user: SessionUser): Promise<string> {
  const token = await createSessionToken(user, SESSION_SECRET);
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function completionSeed(opts: {
  readonly sequence: number;
  readonly passwordId: string;
  readonly user: SessionUser;
  readonly completedAt: string;
}): CompletionRow {
  return {
    sequence: opts.sequence,
    id: `mystery_completion_${opts.sequence}`,
    password_id: opts.passwordId,
    user_id: opts.user.id,
    display_name: opts.user.displayName,
    completed_at: opts.completedAt,
  };
}
