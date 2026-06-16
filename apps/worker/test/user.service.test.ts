import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findOrCreateAppleUser,
  findOrCreateGoogleUser,
  findCurrentUserById,
} from '../src/services/user.service';
import { DEFAULT_GROUP_ID } from '../src/services/default-group.service';
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
type GroupMemberRow = {
  readonly group_id: string;
  readonly user_id: string;
  readonly role: 'member' | 'admin';
  readonly status: 'active' | 'disabled' | 'pending';
};
type GoogleProfile = Parameters<typeof findOrCreateGoogleUser>[1];
type AppleProfile = Parameters<typeof findOrCreateAppleUser>[1];
type ActivationOptions = NonNullable<Parameters<typeof findOrCreateGoogleUser>[2]>;

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
  readonly groups = new Set<string>();
  readonly groupMembers = new Map<string, GroupMemberRow>();
  readonly groupMemberInsertUserIds: string[] = [];

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
    this.insertUser();
    this.insertIdentity();
    this.insertDefaultGroup();
    this.insertDefaultGroupMember();
    this.upsertActiveDefaultGroupMember();
    this.activatePendingUser();
    this.updateUserProfile();

    return { success: true };
  }

  private insertUser(): void {
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
  }

  private insertIdentity(): void {
    if (this.sql.includes('INSERT INTO user_identities')) {
      const [, userId, provider, subject] = this.values;
      this.db.identities.set(identityKey(String(provider), String(subject)), String(userId));
    }
  }

  private insertDefaultGroup(): void {
    if (this.sql.includes('INSERT OR IGNORE INTO groups')) {
      const [groupId] = this.values;
      this.db.groups.add(String(groupId));
    }
  }

  private insertDefaultGroupMember(): void {
    if (this.sql.includes('INSERT OR IGNORE INTO group_members')) {
      const [, groupId, userId, role, status] = this.values;
      this.db.groupMemberInsertUserIds.push(String(userId));
      const groupMember: GroupMemberRow = {
        group_id: String(groupId),
        user_id: String(userId),
        role: role === 'admin' ? 'admin' : 'member',
        status: readUserStatus(status),
      };
      this.db.groupMembers.set(
        groupMemberKey(groupMember.group_id, groupMember.user_id),
        groupMember,
      );
    }
  }

  private upsertActiveDefaultGroupMember(): void {
    if (this.sql.includes('INSERT INTO group_members')) {
      const [, groupId, userId, role] = this.values;
      this.db.groupMemberInsertUserIds.push(String(userId));
      const groupMember: GroupMemberRow = {
        group_id: String(groupId),
        user_id: String(userId),
        role: role === 'admin' ? 'admin' : 'member',
        status: 'active',
      };
      this.db.groupMembers.set(
        groupMemberKey(groupMember.group_id, groupMember.user_id),
        groupMember,
      );
    }
  }

  private activatePendingUser(): void {
    if (this.sql.includes("SET status = 'active'")) {
      const [userId] = this.values;
      const existing = this.db.users.get(String(userId));

      if (existing?.status === 'pending') {
        this.db.users.set(existing.id, {
          ...existing,
          status: 'active',
        });
      }
    }
  }

  private updateUserProfile(): void {
    if (this.sql.includes("SET status = 'active'") || !this.sql.includes('UPDATE users')) {
      return;
    }

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
}

test('first Google user bootstraps as active admin in an empty database', async () => {
  const db = new FakeD1Database();
  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'admin');
  assertDefaultGroupMembership(db, user.id, 'admin');
});

test('second Google user defaults to pending without joining the default group', async () => {
  const db = new FakeD1Database();
  const bootstrapUser = await createGoogleUser(db, {
    subject: 'bootstrap-google-subject',
    email: 'bootstrap@example.com',
    displayName: 'Bootstrap User',
  });

  assertDefaultGroupMembership(db, bootstrapUser.id, 'admin');
  db.groupMemberInsertUserIds.length = 0;

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'pending');
  assert.equal(user.role, 'member');
  assertNoDefaultGroupMembership(db, user.id);
});

test('allowlisted new Google users become active members and join the default group', async () => {
  const db = createDbWithExistingUser();
  const user = await createGoogleUser(
    db,
    {
      subject: 'allowlisted-google-subject',
      email: 'Allowed.Member@Example.Test',
      displayName: 'Allowed Member',
    },
    {
      allowedEmails: 'other@example.test, allowed.member@example.test ',
    },
  );

  assert.equal(user.status, 'active');
  assert.equal(user.role, 'member');
  assertDefaultGroupMembership(db, user.id, 'member');
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
  assertDefaultGroupMembership(db, existing.id, 'admin');
});

test('existing pending Google users remain pending on their next verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'pending',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE);

  assert.equal(user.status, 'pending');
  assert.equal(db.users.get(existing.id)?.status, 'pending');
  assertNoDefaultGroupMembership(db, existing.id);
});

test('existing pending Google users activate on verified allowlisted login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    email: 'old@example.test',
    status: 'pending',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE, {
    allowedEmails: 'new-user@example.com',
  });

  assert.equal(user.status, 'active');
  assert.equal(db.users.get(existing.id)?.status, 'active');
  assertDefaultGroupMembership(db, existing.id, 'member');
});

test('existing disabled Google users stay disabled on verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'disabled',
  });
  seedGoogleIdentity(db, existing.id);

  const user = await createGoogleUser(db, NEW_GOOGLE_PROFILE, {
    allowedEmails: NEW_GOOGLE_PROFILE.email,
  });

  assert.equal(user.status, 'disabled');
  assert.equal(db.users.get(existing.id)?.status, 'disabled');
  assertNoDefaultGroupMembership(db, existing.id);
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
  const db = createDbWithExistingUser();
  const user = await createAppleUser(db, NEW_APPLE_PROFILE);

  assert.equal(user.status, 'pending');
  assert.equal(user.role, 'member');
  assert.equal(user.email, 'apple-user@example.com');
  assert.equal(user.displayName, 'apple-user@example.com');
  assertNoDefaultGroupMembership(db, user.id);
});

test('new Apple users fall back to provider subject when Apple omits email', async () => {
  const user = await createAppleUser(createDbWithExistingUser(), {
    subject: 'apple-subject-only',
  });

  assert.equal(user.displayName, 'Apple user apple-subject-only');
  assert.equal(user.email, undefined);
});

test('existing pending Apple users remain pending on verified login', async () => {
  const db = new FakeD1Database();
  const existing = seedUser(db, {
    id: 'usr_existing',
    status: 'pending',
  });
  seedAppleIdentity(db, existing.id);

  const user = await createAppleUser(db, NEW_APPLE_PROFILE);

  assert.equal(user.status, 'pending');
  assert.equal(db.users.get(existing.id)?.status, 'pending');
  assertNoDefaultGroupMembership(db, existing.id);
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
  assertNoDefaultGroupMembership(db, existing.id);
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

function createGoogleUser(
  db: FakeD1Database,
  profile: GoogleProfile,
  activationOptions: ActivationOptions = {},
): Promise<SessionUser> {
  return findOrCreateGoogleUser(asD1(db), profile, activationOptions);
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

function assertDefaultGroupMembership(
  db: FakeD1Database,
  userId: string,
  role: GroupMemberRow['role'],
  status: GroupMemberRow['status'] = 'active',
): void {
  assert.equal(db.groups.has(DEFAULT_GROUP_ID), true);
  assert.deepEqual(db.groupMembers.get(groupMemberKey(DEFAULT_GROUP_ID, userId)), {
    group_id: DEFAULT_GROUP_ID,
    user_id: userId,
    role,
    status,
  });
}

function assertNoDefaultGroupMembership(db: FakeD1Database, userId: string): void {
  assert.equal(db.groupMemberInsertUserIds.includes(userId), false);
  assert.equal(db.groupMembers.has(groupMemberKey(DEFAULT_GROUP_ID, userId)), false);
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

function groupMemberKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}
