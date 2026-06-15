import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findOrCreateAppleUser,
  findOrCreateGoogleUser,
  findCurrentUserById,
} from '../src/services/user.service';
import type { SessionUser } from '../src/types';

type UserRow = {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly role: 'member' | 'admin';
  readonly status: 'active' | 'disabled' | 'pending';
};

type UserRowSeed = Partial<UserRow> & Pick<UserRow, 'id'>;
type GoogleProfile = Parameters<typeof findOrCreateGoogleUser>[1];
type AppleProfile = Parameters<typeof findOrCreateAppleUser>[1];

const GOOGLE_SUBJECT = 'google-subject';
const APPLE_SUBJECT = 'apple-subject';
const NEW_GOOGLE_PROFILE: GoogleProfile = {
  subject: GOOGLE_SUBJECT,
  email: 'new-user@example.com',
  displayName: 'New User',
};
const NEW_APPLE_PROFILE: AppleProfile = {
  subject: APPLE_SUBJECT,
  email: 'apple-user@example.com',
};
const DEFAULT_EXISTING_USER_SEED: UserRowSeed = { id: 'usr_existing' };

class FakeD1Database {
  readonly users = new Map<string, UserRow>();
  readonly identities = new Map<string, string>();

  prepare(sql: string) {
    return new FakeD1PreparedStatement(this, sql);
  }

  async batch(statements: FakeD1PreparedStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

class FakeD1PreparedStatement {
  private values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    if (this.sql.includes('COUNT(*) AS count')) {
      return { count: this.db.users.size } as T;
    }

    if (this.sql.includes('FROM user_identities')) {
      const provider = String(this.values[0]);
      const subject = String(this.values[1]);
      const userId = this.db.identities.get(identityKey(provider, subject));
      return (userId ? this.db.users.get(userId) : null) as T | null;
    }

    if (this.sql.includes('FROM users')) {
      return (this.db.users.get(String(this.values[0])) ?? null) as T | null;
    }

    return null;
  }

  async run() {
    if (this.sql.includes('INSERT INTO users')) {
      const [id, email, displayName, avatarUrl, role, status] = this.values;
      this.db.users.set(String(id), {
        id: String(id),
        email: readNullableString(email),
        display_name: readNullableString(displayName),
        avatar_url: readNullableString(avatarUrl),
        role: role === 'admin' ? 'admin' : 'member',
        status: readUserStatus(status),
      });
    }

    if (this.sql.includes('INSERT INTO user_identities')) {
      const [, userId, provider, subject] = this.values;
      this.db.identities.set(identityKey(String(provider), String(subject)), String(userId));
    }

    if (this.sql.includes('UPDATE users')) {
      const [email, displayName, avatarUrl, userId] = this.values;
      const existing = this.db.users.get(String(userId));

      if (existing) {
        this.db.users.set(existing.id, {
          ...existing,
          email: readNullableString(email) ?? existing.email,
          display_name: readNullableString(displayName) ?? existing.display_name,
          avatar_url: readNullableString(avatarUrl) ?? existing.avatar_url,
          status: existing.status === 'pending' ? 'active' : existing.status,
        });
      }
    }

    return { success: true };
  }
}

test('first Google user bootstraps as active admin in an empty database', async () => {
  const user = await createGoogleUser(new FakeD1Database(), NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'admin');
});

test('later new Google users activate immediately as members', async () => {
  const user = await createGoogleUser(
    createDbWithExistingUser({ id: 'usr_existing', role: 'admin' }),
    NEW_GOOGLE_PROFILE,
  );

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'member');
});

test('current user lookup reads current role and status from D1', async () => {
  const db = new FakeD1Database();
  const admin = seedUser(db, {
    id: 'usr_1',
    email: 'admin@example.com',
    display_name: 'Admin',
    role: 'admin',
    status: 'disabled',
  });

  assert.deepEqual(await findCurrentUser(db, admin.id), sessionFromRow(admin));
});

test('existing Google users keep active approval while profile data updates', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    email: 'old@example.com',
    display_name: null,
    role: 'admin',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, {
    subject: GOOGLE_SUBJECT,
    displayName: 'Updated Name',
    avatarUrl: 'https://example.com/avatar.png',
  });

  assert.deepEqual(
    user,
    sessionFromRow(existing, {
      displayName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.png',
    }),
  );
});

test('existing pending Google users activate on their next verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'pending',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'active');
  assert.equal(db.users.get(existing.id)?.status, 'active');
});

test('existing disabled Google users stay disabled on verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'disabled',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'disabled');
  assert.equal(db.users.get(existing.id)?.status, 'disabled');
});

test('existing Google users update verified email and keep existing display fields when missing', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    email: 'old@example.com',
    display_name: 'Existing Name',
    avatar_url: 'https://example.com/old.png',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, {
    subject: GOOGLE_SUBJECT,
    email: 'new@example.com',
  });

  assert.deepEqual(user, sessionFromRow(existing, { email: 'new@example.com' }));
});

test('new Google users fall back to email or subject for display name', async () => {
  const emailUser = await createGoogleUser(createDbWithExistingUser(), {
    subject: 'email-subject',
    email: 'email-only@example.com',
  });
  const subjectUser = await createGoogleUser(createDbWithExistingUser(), {
    subject: 'subject-only',
  });

  assert.equal(emailUser.displayName, 'email-only@example.com');
  assert.equal(subjectUser.displayName, 'Google user subject-only');
  assert.equal(subjectUser.email, undefined);
  assert.equal(subjectUser.avatarUrl, undefined);
});

test('new Apple users reuse OAuth user creation patterns', async () => {
  const user = await createAppleUser(createDbWithExistingUser(), NEW_APPLE_PROFILE);

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'member');
  assert.equal(user.email, 'apple-user@example.com');
  assert.equal(user.displayName, 'apple-user@example.com');
});

test('new Apple users fall back to provider subject when Apple omits email', async () => {
  const user = await createAppleUser(createDbWithExistingUser(), {
    subject: 'apple-subject-only',
  });

  assert.equal(user.displayName, 'Apple user apple-subject-only');
  assert.equal(user.email, undefined);
});

test('existing disabled Apple users stay disabled on verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'disabled',
  });
  seedAppleIdentity(db, existing.id);

  const user = await createAppleUser(db, NEW_APPLE_PROFILE);

  assert.equal(user.status, 'disabled');
  assert.equal(db.users.get(existing.id)?.status, 'disabled');
});

test('current user lookup falls back to email or ID for display name', async () => {
  const db = new FakeD1Database();
  const emailFallback = seedUser(db, {
    id: 'usr_email',
    email: 'email-fallback@example.com',
    display_name: null,
  });
  const idFallback = seedUser(db, {
    id: 'usr_id',
    email: null,
    display_name: null,
  });

  assert.equal((await findCurrentUser(db, emailFallback.id))?.displayName, emailFallback.email);
  assert.deepEqual(await findCurrentUser(db, idFallback.id), sessionFromRow(idFallback));
});

test('current user lookup returns null for missing users', async () => {
  assert.equal(await findCurrentUser(new FakeD1Database(), 'missing'), null);
});

function asD1(db: FakeD1Database): D1Database {
  return db as unknown as D1Database;
}

function createGoogleUser(db: FakeD1Database, profile: GoogleProfile): Promise<SessionUser> {
  return findOrCreateGoogleUser(asD1(db), profile);
}

function createAppleUser(db: FakeD1Database, profile: AppleProfile): Promise<SessionUser> {
  return findOrCreateAppleUser(asD1(db), profile);
}

function findCurrentUser(db: FakeD1Database, userId: string): Promise<SessionUser | null> {
  return findCurrentUserById(asD1(db), userId);
}

function createDbWithExistingUser(seed: UserRowSeed = DEFAULT_EXISTING_USER_SEED): FakeD1Database {
  const db = new FakeD1Database();
  seedUser(db, seed);
  return db;
}

function seedUser(db: FakeD1Database, seed: UserRowSeed): UserRow {
  const user = makeUserRow(seed);
  db.users.set(user.id, user);
  return user;
}

function makeUserRow(seed: UserRowSeed): UserRow {
  return {
    email: 'existing@example.com',
    display_name: 'Existing User',
    avatar_url: null,
    role: 'member',
    status: 'active',
    ...seed,
  };
}

function seedGoogleIdentity(db: FakeD1Database, userId: string, subject = GOOGLE_SUBJECT): void {
  db.identities.set(identityKey('google', subject), userId);
}

function seedAppleIdentity(db: FakeD1Database, userId: string, subject = APPLE_SUBJECT): void {
  db.identities.set(identityKey('apple', subject), userId);
}

function sessionFromRow(row: UserRow, overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: row.id,
    email: row.email ?? undefined,
    displayName: row.display_name ?? row.email ?? row.id,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
    ...overrides,
  };
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readUserStatus(value: unknown): UserRow['status'] {
  if (value === 'active' || value === 'disabled' || value === 'pending') {
    return value;
  }

  return 'pending';
}

function identityKey(provider: string, subject: string): string {
  return `${provider}:${subject}`;
}
