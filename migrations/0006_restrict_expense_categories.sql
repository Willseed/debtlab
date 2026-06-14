-- Restrict expense categories to ingredients / prize / other.
--
-- SQLite cannot alter a CHECK constraint in place, so the expenses table is
-- rebuilt with the new constraint and existing rows are migrated:
--   * food and coffee are remapped to ingredients
--   * every other legacy category collapses to other
-- expense_participants foreign keys are preserved by keeping the same primary
-- key values and re-enabling foreign_keys after the swap.
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE expenses_new (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'TWD' CHECK (currency = 'TWD'),
  paid_by_user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' -- NOSONAR
    CHECK (category IN ('ingredients', 'prize', 'other')), -- NOSONAR
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
    WHEN category IN ('food', 'coffee') THEN 'ingredients'
    ELSE 'other'
  END,
  expense_date, split_method,
  created_by, created_at, updated_at, deleted_at
FROM expenses;

DROP TABLE expenses;

ALTER TABLE expenses_new RENAME TO expenses;

CREATE INDEX idx_expenses_group_date ON expenses(group_id, expense_date);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_user_id);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at);

COMMIT;

PRAGMA foreign_keys = ON;
