-- Allow lodging as a first-class expense category.
--
-- SQLite cannot alter a CHECK constraint in place, so rebuild expenses with
-- the expanded category constraint while preserving existing rows. D1 enforces
-- child foreign keys while dropping parent tables, so temporarily store
-- expense_participants in a backup table without foreign keys before swapping
-- expenses, then recreate expense_participants against the rebuilt table.
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS expense_participants_backup;
DROP TABLE IF EXISTS expense_participants_new;
DROP TABLE IF EXISTS expenses_new;

CREATE TABLE expense_participants_backup (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  share_amount INTEGER NOT NULL CHECK (share_amount >= 0),
  share_ratio REAL CHECK (share_ratio IS NULL OR share_ratio > 0),
  is_settled INTEGER NOT NULL DEFAULT 0 CHECK (is_settled IN (0, 1)),
  settled_at TEXT,

  UNIQUE (expense_id, user_id)
);

INSERT INTO expense_participants_backup (
  id, expense_id, user_id, share_amount, share_ratio, is_settled, settled_at
)
SELECT id, expense_id, user_id, share_amount, share_ratio, is_settled, settled_at
FROM expense_participants;

DROP TABLE expense_participants;

CREATE TABLE expenses_new (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  paid_by_user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' -- NOSONAR
    CHECK (category IN ('ingredients', 'prize', 'lodging', 'other')), -- NOSONAR
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
  id, group_id, title, description, amount, currency,
  paid_by_user_id, category, expense_date, split_method,
  created_by, created_at, updated_at, deleted_at
)
SELECT
  id, group_id, title, description, amount, currency,
  paid_by_user_id,
  CASE
    WHEN category IN ('ingredients', 'prize', 'lodging', 'other') THEN category
    ELSE 'other'
  END,
  expense_date, split_method,
  created_by, created_at, updated_at, deleted_at
FROM expenses;

DROP TABLE expenses;

ALTER TABLE expenses_new RENAME TO expenses;

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

INSERT INTO expense_participants (
  id, expense_id, user_id, share_amount, share_ratio, is_settled, settled_at
)
SELECT id, expense_id, user_id, share_amount, share_ratio, is_settled, settled_at
FROM expense_participants_backup;

DROP TABLE expense_participants_backup;

CREATE INDEX idx_expenses_group_date ON expenses(group_id, expense_date);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_user_id);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_expense_participants_user ON expense_participants(user_id);

PRAGMA foreign_keys = ON;
