-- Activate any users still in the legacy `pending` approval state.
--
-- The product no longer gates Google sign-in behind admin approval, so users
-- carried over from the previous policy should not have to log in again to
-- receive an active session.
PRAGMA foreign_keys = ON;

UPDATE users
SET status = 'active',
    updated_at = datetime('now', '+8 hours')
WHERE status = 'pending';
