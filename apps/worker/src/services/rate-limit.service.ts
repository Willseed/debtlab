const UTC8_OFFSET_MILLISECONDS = 8 * 60 * 60 * 1000;
const TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/u;

export type RateLimitOptions = {
  readonly scope: string;
  readonly userId: string;
  readonly limit: number;
  readonly windowSeconds: number;
};

type RateLimitRow = {
  readonly attempts: number;
  readonly reset_at: string;
};

export class RateLimitExceededError extends Error {
  readonly retryAfterSeconds: number;
  readonly limit: number;
  readonly windowSeconds: number;

  constructor(options: {
    readonly retryAfterSeconds: number;
    readonly limit: number;
    readonly windowSeconds: number;
  }) {
    super('Rate limit exceeded.');
    this.name = 'RateLimitExceededError';
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.limit = options.limit;
    this.windowSeconds = options.windowSeconds;
  }
}

export async function consumeRateLimit(db: D1Database, options: RateLimitOptions): Promise<void> {
  const key = rateLimitKey(options.scope, options.userId);
  const now = new Date();
  const nowText = formatUtc8Timestamp(now);
  const nextResetAt = formatUtc8Timestamp(new Date(now.getTime() + options.windowSeconds * 1000));
  const row = await db
    .prepare(
      `SELECT attempts, reset_at
       FROM rate_limits
       WHERE key = ?`,
    )
    .bind(key)
    .first<RateLimitRow>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO rate_limits (key, attempts, reset_at, updated_at)
         VALUES (?, 1, ?, ?)`,
      )
      .bind(key, nextResetAt, nowText)
      .run();
    return;
  }

  const resetAt = parseUtc8Timestamp(row.reset_at);

  if (!resetAt || resetAt.getTime() <= now.getTime()) {
    await db
      .prepare(
        `UPDATE rate_limits
         SET attempts = 1,
             reset_at = ?,
             updated_at = ?
         WHERE key = ?`,
      )
      .bind(nextResetAt, nowText, key)
      .run();
    return;
  }

  if (row.attempts >= options.limit) {
    throw new RateLimitExceededError({
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)),
      limit: options.limit,
      windowSeconds: options.windowSeconds,
    });
  }

  await db
    .prepare(
      `UPDATE rate_limits
       SET attempts = attempts + 1,
           updated_at = ?
       WHERE key = ?`,
    )
    .bind(nowText, key)
    .run();
}

export async function clearRateLimit(db: D1Database, scope: string, userId: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM rate_limits
       WHERE key = ?`,
    )
    .bind(rateLimitKey(scope, userId))
    .run();
}

function rateLimitKey(scope: string, userId: string): string {
  return `${scope}:${userId}`;
}

function parseUtc8Timestamp(value: string): Date | null {
  const match = TIMESTAMP_PATTERN.exec(value);

  if (!match) {
    return null;
  }

  const parsed = new Date(`${match[1]}T${match[2]}${match[3] ?? ''}+08:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatUtc8Timestamp(date: Date): string {
  const utc8Date = new Date(date.getTime() + UTC8_OFFSET_MILLISECONDS);

  return (
    [
      utc8Date.getUTCFullYear(),
      padDatePart(utc8Date.getUTCMonth() + 1),
      padDatePart(utc8Date.getUTCDate()),
    ].join('-') +
    ` ${padDatePart(utc8Date.getUTCHours())}:${padDatePart(
      utc8Date.getUTCMinutes(),
    )}:${padDatePart(utc8Date.getUTCSeconds())}`
  );
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}
