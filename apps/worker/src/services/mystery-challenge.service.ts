import { SessionUser } from '../types';

const MAX_LEADERBOARD_ENTRIES = 100;

type PromptDefinition = {
  readonly id: string;
  readonly displayOrder: number;
  readonly encoding: 'o200k_base';
  readonly tokens: readonly number[];
  readonly hint: {
    readonly locale: 'zh-TW';
    readonly title: string;
    readonly body: string;
  };
};

type MysteryChallengePasswordRow = {
  readonly id: string;
  readonly display_order: number;
  readonly password_hash: string;
  readonly password_hash_salt: string;
};

type MysteryChallengeClaimRow = {
  readonly password_id: string;
};

type MysteryChallengeCompletionRow = {
  readonly completed_at: string;
};

type MysteryChallengeLeaderboardRow = {
  readonly display_name: string;
  readonly completed_at: string;
};

export type MysteryChallengePrompt = Omit<PromptDefinition, 'encoding'> & {
  readonly claimed: boolean;
};

export type MysteryChallengeState = {
  readonly status: 'active' | 'completed';
  readonly completed: boolean;
  readonly completedAt: string | null;
  readonly encodedPasswords: readonly MysteryChallengePrompt[];
  readonly claimedCount: number;
  readonly availableCount: number;
};

export type MysteryChallengeLeaderboardEntry = {
  readonly rank: number;
  readonly displayName: string;
  readonly completedAt: string;
};

export type MysteryChallengeSubmissionResult = {
  readonly completedAt: string;
  readonly leaderboard: readonly MysteryChallengeLeaderboardEntry[];
};

export class MysteryChallengeInvalidPasswordError extends Error {
  constructor() {
    super('Password is invalid or unavailable.');
    this.name = 'MysteryChallengeInvalidPasswordError';
  }
}

export class MysteryChallengeUnavailableError extends Error {
  constructor() {
    super('Challenge already completed or password is unavailable.');
    this.name = 'MysteryChallengeUnavailableError';
  }
}

export class MysteryChallengeConfigurationError extends Error {
  constructor() {
    super('Mystery challenge password configuration is incomplete.');
    this.name = 'MysteryChallengeConfigurationError';
  }
}

const PROMPTS: readonly PromptDefinition[] = [
  {
    id: 'signal_alpha',
    displayOrder: 1,
    encoding: 'o200k_base',
    tokens: [50, 783, 1047, 34048, 41957, 24],
    hint: {
      locale: 'zh-TW',
      title: '訊號一',
      body: '前段像系統實驗室，但少了一個母音；尾碼藏在六月的四位數日期裡。',
    },
  },
  {
    id: 'signal_beta',
    displayOrder: 2,
    encoding: 'o200k_base',
    tokens: [50, 783, 1047, 34048, 30652, 23],
    hint: {
      locale: 'zh-TW',
      title: '訊號二',
      body: '延續少一個母音的拼法，尾碼要保留前導零，像一個冬末日期。',
    },
  },
  {
    id: 'signal_gamma',
    displayOrder: 3,
    encoding: 'o200k_base',
    tokens: [3320, 34048, 39660, 22],
    hint: {
      locale: 'zh-TW',
      title: '訊號三',
      body: '這組拼字回到完整的系統實驗室，尾碼同樣是四位數日期。',
    },
  },
];

export async function readMysteryChallengeState(
  db: D1Database,
  user: SessionUser,
): Promise<MysteryChallengeState> {
  const [, claimedPasswordIds, userCompletion] = await Promise.all([
    ensurePasswordConfig(db),
    readClaimedPasswordIds(db),
    readUserCompletion(db, user.id),
  ]);
  const claimedSet = new Set(claimedPasswordIds);
  const encodedPasswords = PROMPTS.map((prompt) => ({
    id: prompt.id,
    displayOrder: prompt.displayOrder,
    tokens: prompt.tokens,
    hint: prompt.hint,
    claimed: claimedSet.has(prompt.id),
  }));
  const claimedCount = encodedPasswords.filter((prompt) => prompt.claimed).length;
  const availableCount = encodedPasswords.length - claimedCount;

  return {
    status: availableCount > 0 ? 'active' : 'completed',
    completed: userCompletion !== null,
    completedAt: userCompletion?.completed_at ?? null,
    encodedPasswords,
    claimedCount,
    availableCount,
  };
}

export async function readMysteryChallengeLeaderboard(
  db: D1Database,
): Promise<readonly MysteryChallengeLeaderboardEntry[]> {
  const result = await db
    .prepare(
      `SELECT display_name, completed_at
       FROM mystery_challenge_completions
       ORDER BY completed_at ASC, sequence ASC
       LIMIT ?`,
    )
    .bind(MAX_LEADERBOARD_ENTRIES)
    .all<MysteryChallengeLeaderboardRow>();

  return (result.results ?? []).map((row, index) => ({
    rank: index + 1,
    displayName: row.display_name,
    completedAt: row.completed_at,
  }));
}

export async function submitMysteryChallengePassword(
  db: D1Database,
  user: SessionUser,
  candidatePassword: string,
): Promise<MysteryChallengeSubmissionResult> {
  const existingCompletion = await readUserCompletion(db, user.id);

  if (existingCompletion) {
    throw new MysteryChallengeUnavailableError();
  }

  const matchedPassword = await findMatchingPassword(db, candidatePassword);

  if (!matchedPassword) {
    throw new MysteryChallengeInvalidPasswordError();
  }

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO mystery_challenge_completions
         (id, password_id, user_id, display_name)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), matchedPassword.id, user.id, user.displayName)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new MysteryChallengeUnavailableError();
  }

  const completion = await readUserCompletion(db, user.id);

  if (!completion) {
    throw new MysteryChallengeUnavailableError();
  }

  return {
    completedAt: completion.completed_at,
    leaderboard: await readMysteryChallengeLeaderboard(db),
  };
}

async function readClaimedPasswordIds(db: D1Database): Promise<readonly string[]> {
  const result = await db
    .prepare(
      `SELECT password_id
       FROM mystery_challenge_completions`,
    )
    .all<MysteryChallengeClaimRow>();

  return (result.results ?? []).map((row) => row.password_id);
}

async function readUserCompletion(
  db: D1Database,
  userId: string,
): Promise<MysteryChallengeCompletionRow | null> {
  return await db
    .prepare(
      `SELECT completed_at
       FROM mystery_challenge_completions
       WHERE user_id = ?`,
    )
    .bind(userId)
    .first<MysteryChallengeCompletionRow>();
}

async function findMatchingPassword(
  db: D1Database,
  candidatePassword: string,
): Promise<MysteryChallengePasswordRow | null> {
  const result = await db
    .prepare(
      `SELECT
        id,
         display_order,
         password_hash,
         password_hash_salt
       FROM mystery_challenge_passwords
       ORDER BY display_order ASC`,
    )
    .all<MysteryChallengePasswordRow>();
  const rows = result.results ?? [];

  assertPasswordConfigComplete(rows);

  let matchedPassword: MysteryChallengePasswordRow | null = null;

  for (const row of rows) {
    const isMatch = await verifySaltedPasswordHash(row, candidatePassword);

    if (isMatch && matchedPassword === null) {
      matchedPassword = row;
    }
  }

  return matchedPassword;
}

async function ensurePasswordConfig(db: D1Database): Promise<readonly string[]> {
  const result = await db
    .prepare(
      `SELECT id, display_order
       FROM mystery_challenge_passwords
       ORDER BY display_order ASC`,
    )
    .all<Pick<MysteryChallengePasswordRow, 'id' | 'display_order'>>();
  const rows = result.results ?? [];

  assertPasswordConfigComplete(rows);

  return rows.map((row) => row.id);
}

function assertPasswordConfigComplete(
  rows: readonly Pick<MysteryChallengePasswordRow, 'id' | 'display_order'>[],
): void {
  const expectedIds = PROMPTS.map((prompt) => prompt.id);
  const actualIds = rows.map((row) => row.id);
  const hasExpectedIds =
    actualIds.length === expectedIds.length &&
    expectedIds.every((expectedId, index) => actualIds[index] === expectedId);

  if (!hasExpectedIds) {
    throw new MysteryChallengeConfigurationError();
  }
}

async function verifySaltedPasswordHash(
  row: MysteryChallengePasswordRow,
  candidatePassword: string,
): Promise<boolean> {
  const salt = base64ToBytes(row.password_hash_salt);
  const passwordBytes = new TextEncoder().encode(candidatePassword);
  const input = new Uint8Array(salt.length + passwordBytes.length);
  input.set(salt, 0);
  input.set(passwordBytes, salt.length);
  const digest = await crypto.subtle.digest('SHA-256', input);

  return constantTimeEqualBytes(new Uint8Array(digest), base64ToBytes(row.password_hash));
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    const byte = binary.codePointAt(index);
    if (byte === undefined) {
      throw new RangeError('Invalid byte index while decoding base64 value.');
    }
    bytes[index] = byte;
  }

  return bytes;
}

function constantTimeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}
