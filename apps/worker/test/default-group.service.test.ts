import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listActiveDefaultGroupMemberIds,
  listActiveDefaultGroupMemberIdsForUsers,
  listDefaultGroupMembers,
} from '../src/services/default-group.service';
import { SessionUser } from '../src/types';

const sessionUser: SessionUser = {
  id: 'usr_alice',
  email: 'alice@example.test',
  displayName: 'Alice',
  role: 'member',
  status: 'active',
};

class FakeDefaultGroupD1 {
  readonly statements: readonly FakeDefaultGroupStatement[] = [];

  constructor(
    private readonly options: {
      readonly memberRows?:
        | readonly {
            readonly user_id: string;
            readonly display_name: string;
            readonly role: 'member' | 'admin';
            readonly status: 'active' | 'disabled' | 'pending';
            readonly user_status?: 'active' | 'disabled' | 'pending';
            readonly joined_at: string | null;
          }[]
        | null;
      readonly activeRows?: readonly { readonly user_id: string }[] | null;
    } = {},
  ) {}

  prepare(sql: string): FakeDefaultGroupStatement {
    const statement = new FakeDefaultGroupStatement(this, sql);
    (this.statements as FakeDefaultGroupStatement[]).push(statement);
    return statement;
  }

  readMemberRows() {
    return this.options.memberRows;
  }

  readActiveRows() {
    return this.options.activeRows;
  }
}

class FakeDefaultGroupStatement {
  readonly values: readonly unknown[] = [];

  constructor(
    private readonly db: FakeDefaultGroupD1,
    readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]): FakeDefaultGroupStatement {
    return Object.assign(new FakeDefaultGroupStatement(this.db, this.sql), { values });
  }

  async all<T>(): Promise<{ readonly results: readonly T[] | null }> {
    if (this.sql.includes('gm.role')) {
      return { results: this.db.readMemberRows() as readonly T[] | null };
    }

    return { results: this.db.readActiveRows() as readonly T[] | null };
  }
}

test('listDefaultGroupMembers handles null D1 results and falls back to the current user', async () => {
  const db = new FakeDefaultGroupD1({ memberRows: null });

  const members = await listDefaultGroupMembers(db as unknown as D1Database, sessionUser);

  assert.deepEqual(members, [
    {
      userId: sessionUser.id,
      displayName: sessionUser.displayName,
      role: sessionUser.role,
      status: sessionUser.status,
      joinedAt: null,
    },
  ]);
});

test('listDefaultGroupMembers exposes effective inactive status from users and memberships', async () => {
  const db = new FakeDefaultGroupD1({
    memberRows: [
      {
        user_id: 'usr_disabled_user',
        display_name: 'Disabled User',
        role: 'member',
        status: 'active',
        user_status: 'disabled',
        joined_at: '2026-06-16 09:00:00',
      },
      {
        user_id: 'usr_pending_member',
        display_name: 'Pending Member',
        role: 'member',
        status: 'pending',
        user_status: 'active',
        joined_at: '2026-06-16 09:01:00',
      },
    ],
  });

  const members = await listDefaultGroupMembers(db as unknown as D1Database);

  assert.deepEqual(members, [
    {
      userId: 'usr_disabled_user',
      displayName: 'Disabled User',
      role: 'member',
      status: 'disabled',
      joinedAt: '2026-06-16 09:00:00',
    },
    {
      userId: 'usr_pending_member',
      displayName: 'Pending Member',
      role: 'member',
      status: 'pending',
      joinedAt: '2026-06-16 09:01:00',
    },
  ]);
});

test('listActiveDefaultGroupMemberIds handles null D1 results', async () => {
  const db = new FakeDefaultGroupD1({ activeRows: null });

  const memberIds = await listActiveDefaultGroupMemberIds(db as unknown as D1Database);

  assert.deepEqual([...memberIds], []);
});

test('listActiveDefaultGroupMemberIdsForUsers returns early for empty input', async () => {
  const db = new FakeDefaultGroupD1();

  const memberIds = await listActiveDefaultGroupMemberIdsForUsers(db as unknown as D1Database, []);

  assert.deepEqual([...memberIds], []);
  assert.equal(db.statements.length, 0);
});

test('listActiveDefaultGroupMemberIdsForUsers handles null D1 results', async () => {
  const db = new FakeDefaultGroupD1({ activeRows: null });

  const memberIds = await listActiveDefaultGroupMemberIdsForUsers(db as unknown as D1Database, [
    'usr_alice',
  ]);

  assert.deepEqual([...memberIds], []);
});
