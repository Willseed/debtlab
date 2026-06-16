-- Add payer-controlled participant join locking metadata to expenses.
ALTER TABLE expenses ADD COLUMN participant_locked_at TEXT;
ALTER TABLE expenses ADD COLUMN participant_locked_by TEXT;

