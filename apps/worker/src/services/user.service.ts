import { AppleUserProfile } from './apple-oauth.service';
import { createDefaultGroupMembershipStatements } from './default-group.service';
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

export async function findOrCreateGoogleUser(
  db: D1Database,
  profile: GoogleUserProfile,
): Promise<SessionUser> {
  return findOrCreateOAuthUser(db, 'google', profile, 'Google');
}

export async function findOrCreateAppleUser(
  db: D1Database,
  profile: AppleUserProfile,
): Promise<SessionUser> {
  return findOrCreateOAuthUser(db, 'apple', profile, 'Apple');
}

async function findOrCreateOAuthUser(
  db: D1Database,
  provider: AuthProvider,
  profile: OAuthUserProfile,
  providerDisplayName: string,
): Promise<SessionUser> {
  const existingUser = await findUserByProviderSubject(db, provider, profile.subject);

  if (existingUser) {
    await updateOAuthUserProfile(db, provider, existingUser.id, profile);
    const status: UserStatus = existingUser.status === 'pending' ? 'active' : existingUser.status;
    const user = {
      ...existingUser,
      email: profile.email ?? existingUser.email,
      displayName: profile.displayName ?? existingUser.displayName,
      avatarUrl: profile.avatarUrl ?? existingUser.avatarUrl,
      status,
    };

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
  const role: UserRole = shouldBootstrapFirstUser ? 'admin' : 'member';
  const status: UserStatus = 'active';

  const user: SessionUser = {
    id: userId,
    email: profile.email,
    displayName,
    avatarUrl: profile.avatarUrl,
    role,
    status,
  };

  await db.batch([
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
    ...createDefaultGroupMembershipStatements(db, user),
  ]);

  return user;
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
             status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
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
