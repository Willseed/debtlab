PRAGMA foreign_keys = OFF;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

INSERT INTO users_new (id, email, display_name, avatar_url, role, status, created_at, updated_at)
SELECT id, email, display_name, avatar_url, role, status, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE user_identities_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_subject TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (provider, provider_subject)
);

INSERT INTO user_identities_new (id, user_id, provider, provider_subject, provider_email, created_at)
SELECT id, user_id, provider, provider_subject, provider_email, created_at FROM user_identities;

DROP TABLE user_identities;
ALTER TABLE user_identities_new RENAME TO user_identities;

CREATE TABLE groups_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT INTO groups_new (id, name, description, currency, created_by, created_at, updated_at)
SELECT id, name, description, currency, created_by, created_at, updated_at FROM groups;

DROP TABLE groups;
ALTER TABLE groups_new RENAME TO groups;

CREATE TABLE group_members_new (
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

INSERT INTO group_members_new (id, group_id, user_id, role, status, joined_at)
SELECT id, group_id, user_id, role, status, joined_at FROM group_members;

DROP TABLE group_members;
ALTER TABLE group_members_new RENAME TO group_members;

CREATE TABLE expenses_new (
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

INSERT INTO expenses_new (
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
FROM expenses;

DROP TABLE expenses;
ALTER TABLE expenses_new RENAME TO expenses;

CREATE TABLE payments_new (
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

INSERT INTO payments_new (
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
FROM payments;

DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;

CREATE TABLE audit_logs_new (
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

INSERT INTO audit_logs_new (
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
FROM audit_logs;

DROP TABLE audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

CREATE TABLE easter_eggs_new (
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

INSERT INTO easter_eggs_new (
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
FROM easter_eggs;

DROP TABLE easter_eggs;
ALTER TABLE easter_eggs_new RENAME TO easter_eggs;

CREATE TABLE user_easter_egg_unlocks_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  easter_egg_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (easter_egg_id) REFERENCES easter_eggs(id),
  UNIQUE (user_id, easter_egg_id)
);

INSERT INTO user_easter_egg_unlocks_new (id, user_id, easter_egg_id, unlocked_at)
SELECT id, user_id, easter_egg_id, unlocked_at FROM user_easter_egg_unlocks;

DROP TABLE user_easter_egg_unlocks;
ALTER TABLE user_easter_egg_unlocks_new RENAME TO user_easter_egg_unlocks;

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
CREATE INDEX idx_payments_group ON payments(group_id);
CREATE INDEX idx_payments_from_user ON payments(from_user_id);
CREATE INDEX idx_payments_to_user ON payments(to_user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_easter_eggs_code ON easter_eggs(code);
CREATE INDEX idx_user_easter_egg_unlocks_user ON user_easter_egg_unlocks(user_id);

PRAGMA foreign_keys = ON;
