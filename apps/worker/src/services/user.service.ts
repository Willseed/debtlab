import { AppleUserProfile } from './apple-oauth.service';
import {
  createActiveDefaultGroupMembershipStatements,
  createDefaultGroupMembershipStatements,
} from './default-group.service';
import { GoogleUserProfile } from './google-oauth.service';
import { SessionUser, UserRole, UserStatus } from '../types';

type UserRow = {
  readonly id: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly avatar_url: string | null;
  readonly role: UserRole;
  readonly status: UserStatus;
};

type AuthProvider = 'google' | 'apple';
type OAuthUserProfile = {
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
};
export type OAuthUserActivationOptions = {
  readonly allowedEmails?: string;
};

export async function findOrCreateGoogleUser(
  db: D1Database,
  profile: GoogleUserProfile,
  activationOptions: OAuthUserActivationOptions = {},
): Promise<SessionUser> {
  return findOrCreateOAuthUser(db, 'google', profile, 'Google', activationOptions);
}

export async function findOrCreateAppleUser(
  db: D1Database,
  profile: AppleUserProfile,
  activationOptions: OAuthUserActivationOptions = {},
): Promise<SessionUser> {
  return findOrCreateOAuthUser(db, 'apple', profile, 'Apple', activationOptions);
}

async function findOrCreateOAuthUser(
  db: D1Database,
  provider: AuthProvider,
  profile: OAuthUserProfile,
  providerDisplayName: string,
  activationOptions: OAuthUserActivationOptions,
): Promise<SessionUser> {
  const existingUser = await findUserByProviderSubject(db, provider, profile.subject);

  if (existingUser) {
    await updateOAuthUserProfile(db, provider, existingUser.id, profile);
    const user = {
      ...existingUser,
      email: profile.email ?? existingUser.email,
      displayName: profile.displayName ?? existingUser.displayName,
      avatarUrl: profile.avatarUrl ?? existingUser.avatarUrl,
    };

    if (
      user.status === 'pending' &&
      isEmailAllowlisted(profile.email, activationOptions.allowedEmails)
    ) {
      return activateUserAndJoinDefaultGroup(db, user);
    }

    if (user.status === 'active') {
      await db.batch([...createDefaultGroupMembershipStatements(db, user)]);
    }

    return user;
  }

  const userId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const displayName =
    profile.displayName ?? profile.email ?? `${providerDisplayName} user ${profile.subject}`;
  const shouldBootstrapFirstUser = (await countUsers(db)) === 0;
  const shouldActivateByAllowlist = isEmailAllowlisted(
    profile.email,
    activationOptions.allowedEmails,
  );
  const role: UserRole = shouldBootstrapFirstUser ? 'admin' : 'member';
  const status: UserStatus =
    shouldBootstrapFirstUser || shouldActivateByAllowlist ? 'active' : 'pending';

  const user: SessionUser = {
    id: userId,
    email: profile.email,
    displayName,
    avatarUrl: profile.avatarUrl,
    role,
    status,
  };

  const createUserStatements = [
    db
      .prepare(
        `INSERT INTO users (id, email, display_name, avatar_url, role, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(userId, profile.email ?? null, displayName, profile.avatarUrl ?? null, role, status),
    db
      .prepare(
        `INSERT INTO user_identities (id, user_id, provider, provider_subject, provider_email)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(identityId, userId, provider, profile.subject, profile.email ?? null),
  ];

  await db.batch(
    status === 'active'
      ? [...createUserStatements, ...createDefaultGroupMembershipStatements(db, user)]
      : createUserStatements,
  );

  return user;
}

export async function activateUserAndJoinDefaultGroup(
  db: D1Database,
  user: SessionUser,
): Promise<SessionUser> {
  const activeUser: SessionUser = { ...user, status: 'active' };

  await db.batch([
    db
      .prepare(
        `UPDATE users
         SET status = 'active',
             updated_at = datetime('now', '+8 hours')
         WHERE id = ? AND status = 'pending'`,
      )
      .bind(user.id),
    ...createActiveDefaultGroupMembershipStatements(db, activeUser),
  ]);

  return activeUser;
}

async function countUsers(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM users')
    .first<{ readonly count: number }>();

  return row?.count ?? 0;
}

export async function findCurrentUserById(
  db: D1Database,
  userId: string,
): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT id, email, display_name, avatar_url, role, status
       FROM users
       WHERE id = ?`,
    )
    .bind(userId)
    .first<UserRow>();

  return row ? mapUserRow(row) : null;
}

async function findUserByProviderSubject(
  db: D1Database,
  provider: AuthProvider,
  providerSubject: string,
): Promise<SessionUser | null> {
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, u.avatar_url, u.role, u.status
       FROM user_identities ui
       INNER JOIN users u ON u.id = ui.user_id
       WHERE ui.provider = ? AND ui.provider_subject = ?`,
    )
    .bind(provider, providerSubject)
    .first<UserRow>();

  return row ? mapUserRow(row) : null;
}

async function updateOAuthUserProfile(
  db: D1Database,
  provider: AuthProvider,
  userId: string,
  profile: OAuthUserProfile,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE users
         SET email = COALESCE(?, email),
            display_name = COALESCE(?, display_name),
            avatar_url = COALESCE(?, avatar_url),
            updated_at = datetime('now', '+8 hours')
         WHERE id = ?`,
      )
      .bind(profile.email ?? null, profile.displayName ?? null, profile.avatarUrl ?? null, userId),
    db
      .prepare(
        `UPDATE user_identities
         SET provider_email = COALESCE(?, provider_email)
         WHERE provider = ? AND user_id = ?`,
      )
      .bind(profile.email ?? null, provider, userId),
  ]);
}

function mapUserRow(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email ?? undefined,
    displayName: row.display_name ?? row.email ?? row.id,
    avatarUrl: row.avatar_url,
    role: row.role,
    status: row.status,
  };
}

function isEmailAllowlisted(email: string | undefined, allowedEmails: string | undefined): boolean {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return false;
  }

  return parseAllowedEmails(allowedEmails).has(normalizedEmail);
}

function parseAllowedEmails(allowedEmails: string | undefined): ReadonlySet<string> {
  if (!allowedEmails) {
    return new Set();
  }

  return new Set(
    allowedEmails
      .split(',')
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => email !== null),
  );
}

function normalizeEmail(email: string | undefined): string | null {
  const normalizedEmail = email?.trim().toLowerCase();

  return normalizedEmail ? normalizedEmail : null;
}
