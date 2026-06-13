DROP TABLE IF EXISTS migration_backup_users;
DROP TABLE IF EXISTS migration_backup_user_identities;
DROP TABLE IF EXISTS migration_backup_groups;
DROP TABLE IF EXISTS migration_backup_group_members;
DROP TABLE IF EXISTS migration_backup_expenses;
DROP TABLE IF EXISTS migration_backup_expense_participants;
DROP TABLE IF EXISTS migration_backup_payments;
DROP TABLE IF EXISTS migration_backup_audit_logs;
DROP TABLE IF EXISTS migration_backup_easter_eggs;
DROP TABLE IF EXISTS migration_backup_user_easter_egg_unlocks;

CREATE TABLE migration_backup_users AS SELECT * FROM users;
CREATE TABLE migration_backup_user_identities AS SELECT * FROM user_identities;
CREATE TABLE migration_backup_groups AS SELECT * FROM groups;
CREATE TABLE migration_backup_group_members AS SELECT * FROM group_members;
CREATE TABLE migration_backup_expenses AS SELECT * FROM expenses;
CREATE TABLE migration_backup_expense_participants AS SELECT * FROM expense_participants;
CREATE TABLE migration_backup_payments AS SELECT * FROM payments;
CREATE TABLE migration_backup_audit_logs AS SELECT * FROM audit_logs;
CREATE TABLE migration_backup_easter_eggs AS SELECT * FROM easter_eggs;
CREATE TABLE migration_backup_user_easter_egg_unlocks AS SELECT * FROM user_easter_egg_unlocks;

DROP TABLE user_easter_egg_unlocks;
DROP TABLE expense_participants;
DROP TABLE payments;
DROP TABLE audit_logs;
DROP TABLE expenses;
DROP TABLE group_members;
DROP TABLE user_identities;
DROP TABLE easter_eggs;
DROP TABLE groups;
DROP TABLE users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (provider, provider_subject)
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (group_id, user_id)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  paid_by_user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('food', 'coffee', 'equipment', 'reagent', 'travel', 'meeting', 'other')),
  expense_date TEXT NOT NULL,
  split_method TEXT NOT NULL DEFAULT 'equal' CHECK (split_method IN ('equal', 'custom', 'ratio')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  deleted_at TEXT,

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE expense_participants (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  share_amount INTEGER NOT NULL CHECK (share_amount >= 0),
  share_ratio REAL CHECK (share_ratio IS NULL OR share_ratio > 0),
  is_settled INTEGER NOT NULL DEFAULT 0 CHECK (is_settled IN (0, 1)),
  settled_at TEXT,

  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (expense_id, user_id)
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  confirmed_at TEXT,

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE easter_eggs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL
    CHECK (
      trigger_type IN (
        'konami_code',
        'keyword',
        'amount_pattern',
        'date_pattern',
        'click_sequence',
        'balance_pattern',
        'hidden_route',
        'time_window'
      )
    ),
  trigger_value TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE user_easter_egg_unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  easter_egg_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (easter_egg_id) REFERENCES easter_eggs(id),
  UNIQUE (user_id, easter_egg_id)
);

INSERT INTO users (id, email, display_name, avatar_url, role, status, created_at, updated_at)
SELECT id, email, display_name, avatar_url, role, status, created_at, updated_at
FROM migration_backup_users;

INSERT INTO user_identities (id, user_id, provider, provider_subject, provider_email, created_at)
SELECT id, user_id, provider, provider_subject, provider_email, created_at
FROM migration_backup_user_identities
WHERE user_id IN (SELECT id FROM users);

INSERT INTO groups (id, name, description, currency, created_by, created_at, updated_at)
SELECT id, name, description, currency, created_by, created_at, updated_at
FROM migration_backup_groups
WHERE created_by IN (SELECT id FROM users);

INSERT INTO group_members (id, group_id, user_id, role, status, joined_at)
SELECT id, group_id, user_id, role, status, joined_at
FROM migration_backup_group_members
WHERE group_id IN (SELECT id FROM groups) AND user_id IN (SELECT id FROM users);

INSERT INTO expenses (
  id,
  group_id,
  title,
  description,
  amount,
  currency,
  paid_by_user_id,
  category,
  expense_date,
  split_method,
  created_by,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  id,
  group_id,
  title,
  description,
  amount,
  currency,
  paid_by_user_id,
  category,
  expense_date,
  split_method,
  created_by,
  created_at,
  updated_at,
  deleted_at
FROM migration_backup_expenses
WHERE
  group_id IN (SELECT id FROM groups)
  AND paid_by_user_id IN (SELECT id FROM users)
  AND created_by IN (SELECT id FROM users);

INSERT INTO expense_participants (
  id,
  expense_id,
  user_id,
  share_amount,
  share_ratio,
  is_settled,
  settled_at
)
SELECT id, expense_id, user_id, share_amount, share_ratio, is_settled, settled_at
FROM migration_backup_expense_participants
WHERE expense_id IN (SELECT id FROM expenses) AND user_id IN (SELECT id FROM users);

INSERT INTO payments (
  id,
  group_id,
  from_user_id,
  to_user_id,
  amount,
  currency,
  note,
  status,
  created_by,
  created_at,
  confirmed_at
)
SELECT
  id,
  group_id,
  from_user_id,
  to_user_id,
  amount,
  currency,
  note,
  status,
  created_by,
  created_at,
  confirmed_at
FROM migration_backup_payments
WHERE
  group_id IN (SELECT id FROM groups)
  AND from_user_id IN (SELECT id FROM users)
  AND to_user_id IN (SELECT id FROM users)
  AND created_by IN (SELECT id FROM users);

INSERT INTO audit_logs (
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  ip_address,
  user_agent,
  created_at
)
SELECT
  id,
  user_id,
  action,
  entity_type,
  entity_id,
  before_json,
  after_json,
  ip_address,
  user_agent,
  created_at
FROM migration_backup_audit_logs
WHERE user_id IS NULL OR user_id IN (SELECT id FROM users);

INSERT INTO easter_eggs (
  id,
  code,
  name,
  description,
  trigger_type,
  trigger_value,
  is_enabled,
  created_at
)
SELECT id, code, name, description, trigger_type, trigger_value, is_enabled, created_at
FROM migration_backup_easter_eggs;

INSERT INTO user_easter_egg_unlocks (id, user_id, easter_egg_id, unlocked_at)
SELECT id, user_id, easter_egg_id, unlocked_at
FROM migration_backup_user_easter_egg_unlocks
WHERE user_id IN (SELECT id FROM users) AND easter_egg_id IN (SELECT id FROM easter_eggs);

DROP TABLE migration_backup_user_easter_egg_unlocks;
DROP TABLE migration_backup_easter_eggs;
DROP TABLE migration_backup_audit_logs;
DROP TABLE migration_backup_payments;
DROP TABLE migration_backup_expense_participants;
DROP TABLE migration_backup_expenses;
DROP TABLE migration_backup_group_members;
DROP TABLE migration_backup_groups;
DROP TABLE migration_backup_user_identities;
DROP TABLE migration_backup_users;

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);
CREATE INDEX idx_user_identities_provider_subject ON user_identities(provider, provider_subject);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_status ON group_members(status);
CREATE INDEX idx_expenses_group_date ON expenses(group_id, expense_date);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_user_id);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_expense_participants_user ON expense_participants(user_id);
CREATE INDEX idx_payments_group ON payments(group_id);
CREATE INDEX idx_payments_from_user ON payments(from_user_id);
CREATE INDEX idx_payments_to_user ON payments(to_user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_easter_eggs_code ON easter_eggs(code);
CREATE INDEX idx_user_easter_egg_unlocks_user ON user_easter_egg_unlocks(user_id);
