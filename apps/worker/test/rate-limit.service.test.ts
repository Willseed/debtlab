import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearRateLimit,
  consumeRateLimit,
  RateLimitExceededError,
} from '../src/services/rate-limit.service';

const RATE_LIMIT_KEY = 'challenge:usr_alice';
const DEFAULT_OPTIONS = {
  scope: 'challenge',
  userId: 'usr_alice',
  limit: 3,
  windowSeconds: 60,
} as const;

type StoredRateLimitRow = {
  attempts: number;
  reset_at: string;
  updated_at: string;
};

test('consumeRateLimit starts and increments an active user window', async () => {
  const db = new FakeRateLimitD1();

  await consumeRateLimit(db as unknown as D1Database, DEFAULT_OPTIONS);
  const firstRow = db.rows.get(RATE_LIMIT_KEY);
  assert.equal(firstRow?.attempts, 1);

  await consumeRateLimit(db as unknown as D1Database, DEFAULT_OPTIONS);
  const secondRow = db.rows.get(RATE_LIMIT_KEY);
  assert.equal(secondRow?.attempts, 2);
  assert.equal(secondRow?.reset_at, firstRow?.reset_at);
});

test('consumeRateLimit throws with retry metadata when the active window is exhausted', async () => {
  const db = new FakeRateLimitD1([
    [
      RATE_LIMIT_KEY,
      {
        attempts: 3,
        reset_at: utc8TextFromNow(60),
        updated_at: utc8TextFromNow(0),
      },
    ],
  ]);

  await assert.rejects(
    () => consumeRateLimit(db as unknown as D1Database, DEFAULT_OPTIONS),
    (error) => {
      assert.ok(error instanceof RateLimitExceededError);
      assert.equal(error.limit, 3);
      assert.equal(error.windowSeconds, 60);
      assert.equal(error.retryAfterSeconds > 0, true);
      assert.equal(error.retryAfterSeconds <= 60, true);
      assert.equal(db.rows.get(RATE_LIMIT_KEY)?.attempts, 3);
      return true;
    },
  );
});

test('consumeRateLimit resets an expired window before counting the new attempt', async () => {
  const expiredResetAt = utc8TextFromNow(-1);
  const db = new FakeRateLimitD1([
    [
      RATE_LIMIT_KEY,
      {
        attempts: 3,
        reset_at: expiredResetAt,
        updated_at: expiredResetAt,
      },
    ],
  ]);

  await consumeRateLimit(db as unknown as D1Database, DEFAULT_OPTIONS);

  const row = db.rows.get(RATE_LIMIT_KEY);
  assert.equal(row?.attempts, 1);
  assert.notEqual(row?.reset_at, expiredResetAt);
});

test('consumeRateLimit safely resets malformed reset_at timestamps', async () => {
  const db = new FakeRateLimitD1([
    [
      RATE_LIMIT_KEY,
      {
        attempts: 3,
        reset_at: 'malformed',
        updated_at: utc8TextFromNow(0),
      },
    ],
  ]);

  await consumeRateLimit(db as unknown as D1Database, DEFAULT_OPTIONS);

  const row = db.rows.get(RATE_LIMIT_KEY);
  assert.equal(row?.attempts, 1);
  assert.notEqual(row?.reset_at, 'malformed');
});

test('clearRateLimit removes the scoped user window', async () => {
  const db = new FakeRateLimitD1([
    [
      RATE_LIMIT_KEY,
      {
        attempts: 2,
        reset_at: utc8TextFromNow(60),
        updated_at: utc8TextFromNow(0),
      },
    ],
  ]);

  await clearRateLimit(db as unknown as D1Database, 'challenge', 'usr_alice');

  assert.equal(db.rows.has(RATE_LIMIT_KEY), false);
});

class FakeRateLimitD1 {
  readonly rows: Map<string, StoredRateLimitRow>;

  constructor(seed: readonly (readonly [string, StoredRateLimitRow])[] = []) {
    this.rows = new Map(seed.map(([key, row]) => [key, { ...row }]));
  }

  prepare(sql: string) {
    return new FakeRateLimitStatement(this, sql);
  }
}

class FakeRateLimitStatement {
  constructor(
    private readonly db: FakeRateLimitD1,
    private readonly sql: string,
    private readonly values: readonly unknown[] = [],
  ) {}

  bind(...values: readonly unknown[]) {
    return new FakeRateLimitStatement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    const key = String(this.values[0]);
    const row = this.db.rows.get(key);
    return row ? ({ attempts: row.attempts, reset_at: row.reset_at } as T) : null;
  }

  async run() {
    if (this.sql.includes('INSERT INTO rate_limits')) {
      const [keyValue, resetAtValue, updatedAtValue] = this.values;
      const key = String(keyValue);

      if (!this.db.rows.has(key)) {
        this.db.rows.set(key, {
          attempts: 1,
          reset_at: String(resetAtValue),
          updated_at: String(updatedAtValue),
        });
        return { meta: { changes: 1 } };
      }

      return { meta: { changes: 0 } };
    }

    if (this.sql.includes('SET attempts = 1')) {
      const [resetAtValue, updatedAtValue, keyValue] = this.values;
      this.db.rows.set(String(keyValue), {
        attempts: 1,
        reset_at: String(resetAtValue),
        updated_at: String(updatedAtValue),
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes('SET attempts = attempts + 1')) {
      const [updatedAtValue, keyValue] = this.values;
      const key = String(keyValue);
      const row = this.db.rows.get(key);

      if (!row) {
        return { meta: { changes: 0 } };
      }

      this.db.rows.set(key, {
        ...row,
        attempts: row.attempts + 1,
        updated_at: String(updatedAtValue),
      });
      return { meta: { changes: 1 } };
    }

    if (this.sql.includes('DELETE FROM rate_limits')) {
      const deleted = this.db.rows.delete(String(this.values[0]));
      return { meta: { changes: deleted ? 1 : 0 } };
    }

    throw new Error(`Unsupported rate-limit SQL: ${this.sql}`);
  }
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
