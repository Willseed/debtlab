import { SessionUser, UserRole, UserStatus } from '../types';

export const DEFAULT_GROUP_ID = 'grp_default';
export const DEFAULT_GROUP_NAME = 'Default Lab';

export type DefaultGroupMember = {
  readonly userId: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly joinedAt: string | null;
};

type DefaultGroupMemberRow = {
  readonly user_id: string;
  readonly display_name: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly joined_at: string | null;
};

type ActiveGroupMemberRow = {
  readonly user_id: string;
};

export function createDefaultGroupMembershipStatements(
  db: D1Database,
  user: SessionUser,
): readonly D1PreparedStatement[] {
  return [
    db
      .prepare(
        `INSERT OR IGNORE INTO groups (id, name, description, currency, created_by)
         VALUES (?, ?, ?, 'TWD', ?)`,
      )
      .bind(DEFAULT_GROUP_ID, DEFAULT_GROUP_NAME, 'Default lab expense group', user.id),
    db
      .prepare(
        `INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, status)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), DEFAULT_GROUP_ID, user.id, user.role, user.status),
  ];
}

export async function listDefaultGroupMembers(
  db: D1Database,
  currentUser?: SessionUser,
): Promise<readonly DefaultGroupMember[]> {
  const result = await db
    .prepare(
      `SELECT
         gm.user_id,
         COALESCE(u.display_name, u.email, gm.user_id) AS display_name,
         gm.role,
         gm.status,
         gm.joined_at
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
       ORDER BY
         CASE gm.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         display_name ASC,
         gm.user_id ASC`,
    )
    .bind(DEFAULT_GROUP_ID)
    .all<DefaultGroupMemberRow>();

  const members = (result.results ?? []).map(mapDefaultGroupMemberRow);

  if (!currentUser || members.some((member) => member.userId === currentUser.id)) {
    return members;
  }

  return [
    ...members,
    {
      userId: currentUser.id,
      displayName: currentUser.displayName,
      role: currentUser.role,
      status: currentUser.status,
      joinedAt: null,
    },
  ];
}

export async function listActiveDefaultGroupMemberIds(
  db: D1Database,
): Promise<ReadonlySet<string>> {
  const result = await db
    .prepare(
      `SELECT gm.user_id
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
         AND gm.status = 'active'
         AND u.status = 'active'`,
    )
    .bind(DEFAULT_GROUP_ID)
    .all<ActiveGroupMemberRow>();

  return new Set((result.results ?? []).map((row) => row.user_id));
}

export async function listActiveDefaultGroupMemberIdsForUsers(
  db: D1Database,
  userIds: readonly string[],
): Promise<ReadonlySet<string>> {
  const uniqueUserIds = [...new Set(userIds)];

  if (uniqueUserIds.length === 0) {
    return new Set();
  }

  const placeholders = uniqueUserIds.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `SELECT gm.user_id
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = ?
         AND gm.status = 'active'
         AND u.status = 'active'
         AND gm.user_id IN (${placeholders})`,
    )
    .bind(DEFAULT_GROUP_ID, ...uniqueUserIds)
    .all<ActiveGroupMemberRow>();

  return new Set((result.results ?? []).map((row) => row.user_id));
}

function mapDefaultGroupMemberRow(row: DefaultGroupMemberRow): DefaultGroupMember {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    joinedAt: row.joined_at,
  };
}
