PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (id, email, display_name, role, status)
VALUES
  ('usr_alice', 'alice@example.test', 'Alice Admin', 'admin', 'active'), -- NOSONAR
  ('usr_bob', 'bob@example.test', 'Bob Member', 'member', 'active'), -- NOSONAR
  ('usr_carol', 'carol@example.test', 'Carol Member', 'member', 'active'), -- NOSONAR
  ('usr_dave', 'dave@example.test', 'Dave Member', 'member', 'active'); -- NOSONAR

INSERT OR IGNORE INTO groups (id, name, description, currency, created_by)
VALUES ('grp_default', 'Default Lab', 'Development seed lab group', 'TWD', 'usr_alice'); -- NOSONAR

INSERT OR IGNORE INTO group_members (id, group_id, user_id, role, status)
VALUES
  ('gm_alice', 'grp_default', 'usr_alice', 'admin', 'active'),
  ('gm_bob', 'grp_default', 'usr_bob', 'member', 'active'),
  ('gm_carol', 'grp_default', 'usr_carol', 'member', 'active'),
  ('gm_dave', 'grp_default', 'usr_dave', 'member', 'active');

INSERT OR IGNORE INTO expenses (
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
  created_by
)
VALUES
  (
    'exp_coffee_beans', -- NOSONAR
    'grp_default',
    'Coffee Beans',
    'Costco coffee for meeting room',
    1280,
    'TWD',
    'usr_alice',
    'coffee',
    '2026-06-13', -- NOSONAR
    'equal', -- NOSONAR
    'usr_alice'
  ),
  (
    'exp_printer_paper', -- NOSONAR
    'grp_default',
    'Printer Paper',
    'Shared printer paper',
    420,
    'TWD',
    'usr_bob',
    'equipment',
    '2026-06-13',
    'equal',
    'usr_bob'
  ),
  (
    'exp_lab_dinner', -- NOSONAR
    'grp_default',
    'Lab Dinner',
    'Dinner after lab meeting',
    3600,
    'TWD',
    'usr_carol',
    'food',
    '2026-06-13',
    'equal',
    'usr_carol'
  ),
  (
    'exp_reagent_shipping', -- NOSONAR
    'grp_default',
    'Reagent Shipping',
    'Shared reagent shipping fee',
    2500,
    'TWD',
    'usr_dave',
    'reagent',
    '2026-06-13',
    'equal',
    'usr_dave'
  );

INSERT OR IGNORE INTO expense_participants (id, expense_id, user_id, share_amount)
VALUES
  ('ep_coffee_alice', 'exp_coffee_beans', 'usr_alice', 320),
  ('ep_coffee_bob', 'exp_coffee_beans', 'usr_bob', 320),
  ('ep_coffee_carol', 'exp_coffee_beans', 'usr_carol', 320),
  ('ep_coffee_dave', 'exp_coffee_beans', 'usr_dave', 320),
  ('ep_paper_alice', 'exp_printer_paper', 'usr_alice', 105),
  ('ep_paper_bob', 'exp_printer_paper', 'usr_bob', 105),
  ('ep_paper_carol', 'exp_printer_paper', 'usr_carol', 105),
  ('ep_paper_dave', 'exp_printer_paper', 'usr_dave', 105),
  ('ep_dinner_alice', 'exp_lab_dinner', 'usr_alice', 900),
  ('ep_dinner_bob', 'exp_lab_dinner', 'usr_bob', 900),
  ('ep_dinner_carol', 'exp_lab_dinner', 'usr_carol', 900),
  ('ep_dinner_dave', 'exp_lab_dinner', 'usr_dave', 900),
  ('ep_reagent_alice', 'exp_reagent_shipping', 'usr_alice', 625),
  ('ep_reagent_bob', 'exp_reagent_shipping', 'usr_bob', 625),
  ('ep_reagent_carol', 'exp_reagent_shipping', 'usr_carol', 625),
  ('ep_reagent_dave', 'exp_reagent_shipping', 'usr_dave', 625);
