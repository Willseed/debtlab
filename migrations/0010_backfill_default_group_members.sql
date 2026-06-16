-- Backfill the default group membership expected by shared settlements.
--
-- Older OAuth users were active but not persisted in group_members, which made
-- settlement payment creation reject them as non-members.
PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO groups (id, name, description, currency, created_by)
SELECT
  'grp_default',
  'Default Lab',
  'Default lab expense group',
  'TWD',
  u.id
FROM users u
WHERE u.status = 'active'
ORDER BY
  CASE u.role WHEN 'admin' THEN 0 ELSE 1 END,
  u.created_at ASC,
  u.id ASC
LIMIT 1;

INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, status)
SELECT
  'gm_default_' || u.id,
  'grp_default',
  u.id,
  u.role,
  'active'
FROM users u
WHERE u.status = 'active'
  AND EXISTS (SELECT 1 FROM groups WHERE id = 'grp_default');
