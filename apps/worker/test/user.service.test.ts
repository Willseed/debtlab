import assert from 'node:assert/strict';
import test from 'node:test';

import { findOrCreateGoogleUser, findCurrentUserById } from '../src/services/user.service';

type UserRow = {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly role: 'member' | 'admin';
  readonly status: 'active' | 'disabled' | 'pending';
};

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
      const subject = String(this.values[0]);
      const userId = this.db.identities.get(subject);
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
        status: status === 'active' ? 'active' : 'pending',
      });
    }

    if (this.sql.includes('INSERT INTO user_identities')) {
      const [, userId, subject] = this.values;
      this.db.identities.set(String(subject), String(userId));
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
        });
      }
    }

    return { success: true };
  }
}

test('first Google user bootstraps as active admin in an empty database', async () => {
  const db = new FakeD1Database();

  const user = await findOrCreateGoogleUser(db as unknown as D1Database, {
    subject: 'google-subject',
    email: 'new-user@example.com',
    displayName: 'New User',
  });

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'admin');
});

test('later new Google users are pending until approved', async () => {
  const db = new FakeD1Database();
  db.users.set('usr_existing', {
    id: 'usr_existing',
    email: 'existing@example.com',
    display_name: 'Existing User',
    avatar_url: null,
    role: 'admin',
    status: 'active',
  });

  const user = await findOrCreateGoogleUser(db as unknown as D1Database, {
    subject: 'google-subject',
    email: 'new-user@example.com',
    displayName: 'New User',
  });

  assert.equal(user.status, 'pending');
  assert.equal(user.role, 'member');
});

test('current user lookup reads current role and status from D1', async () => {
  const db = new FakeD1Database();
  db.users.set('usr_1', {
    id: 'usr_1',
    email: 'admin@example.com',
    display_name: 'Admin',
    avatar_url: null,
    role: 'admin',
    status: 'disabled',
  });

  assert.deepEqual(await findCurrentUserById(db as unknown as D1Database, 'usr_1'), {
    id: 'usr_1',
    email: 'admin@example.com',
    displayName: 'Admin',
    avatarUrl: null,
    role: 'admin',
    status: 'disabled',
  });
});

test('existing Google users keep active approval while profile data updates', async () => {
  const db = new FakeD1Database();
  db.users.set('usr_existing', {
    id: 'usr_existing',
    email: 'old@example.com',
    display_name: null,
    avatar_url: null,
    role: 'admin',
    status: 'active',
  });
  db.identities.set('google-subject', 'usr_existing');

  const user = await findOrCreateGoogleUser(db as unknown as D1Database, {
    subject: 'google-subject',
    displayName: 'Updated Name',
    avatarUrl: 'https://example.com/avatar.png',
  });

  assert.deepEqual(user, {
    id: 'usr_existing',
    email: 'old@example.com',
    displayName: 'Updated Name',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'admin',
    status: 'active',
  });
});

test('existing Google users update verified email and keep existing display fields when missing', async () => {
  const db = new FakeD1Database();
  db.users.set('usr_existing', {
    id: 'usr_existing',
    email: 'old@example.com',
    display_name: 'Existing Name',
    avatar_url: 'https://example.com/old.png',
    role: 'member',
    status: 'active',
  });
  db.identities.set('google-subject', 'usr_existing');

  const user = await findOrCreateGoogleUser(db as unknown as D1Database, {
    subject: 'google-subject',
    email: 'new@example.com',
  });

  assert.deepEqual(user, {
    id: 'usr_existing',
    email: 'new@example.com',
    displayName: 'Existing Name',
    avatarUrl: 'https://example.com/old.png',
    role: 'member',
    status: 'active',
  });
});

test('new Google users fall back to email or subject for display name', async () => {
  const emailDb = new FakeD1Database();
  const subjectDb = new FakeD1Database();
  emailDb.users.set('usr_existing', {
    id: 'usr_existing',
    email: 'existing@example.com',
    display_name: 'Existing User',
    avatar_url: null,
    role: 'admin',
    status: 'active',
  });
  subjectDb.users.set('usr_existing', {
    id: 'usr_existing',
    email: 'existing@example.com',
    display_name: 'Existing User',
    avatar_url: null,
    role: 'admin',
    status: 'active',
  });

  const emailUser = await findOrCreateGoogleUser(emailDb as unknown as D1Database, {
    subject: 'email-subject',
    email: 'email-only@example.com',
  });
  const subjectUser = await findOrCreateGoogleUser(subjectDb as unknown as D1Database, {
    subject: 'subject-only',
  });

  assert.equal(emailUser.displayName, 'email-only@example.com');
  assert.equal(subjectUser.displayName, 'Google user subject-only');
  assert.equal(subjectUser.email, undefined);
  assert.equal(subjectUser.avatarUrl, undefined);
});

test('current user lookup falls back to email or ID for display name', async () => {
  const db = new FakeD1Database();
  db.users.set('usr_email', {
    id: 'usr_email',
    email: 'email-fallback@example.com',
    display_name: null,
    avatar_url: null,
    role: 'member',
    status: 'active',
  });
  db.users.set('usr_id', {
    id: 'usr_id',
    email: null,
    display_name: null,
    avatar_url: null,
    role: 'member',
    status: 'active',
  });

  assert.equal(
    (await findCurrentUserById(db as unknown as D1Database, 'usr_email'))?.displayName,
    'email-fallback@example.com',
  );
  assert.deepEqual(await findCurrentUserById(db as unknown as D1Database, 'usr_id'), {
    id: 'usr_id',
    email: undefined,
    displayName: 'usr_id',
    avatarUrl: null,
    role: 'member',
    status: 'active',
  });
});

test('current user lookup returns null for missing users', async () => {
  const db = new FakeD1Database();

  assert.equal(await findCurrentUserById(db as unknown as D1Database, 'missing'), null);
});

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
