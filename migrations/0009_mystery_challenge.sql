-- Migration: mysterious challenge encrypted password set and completion leaderboard.
-- Passwords are stored as P-256 ECDH/HKDF/AES-GCM ciphertext rows, not plaintext.
CREATE TABLE IF NOT EXISTS mystery_challenge_passwords (
  id TEXT PRIMARY KEY,
  display_order INTEGER NOT NULL UNIQUE CHECK (display_order BETWEEN 1 AND 3),
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  ec_public_jwk TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_hash_salt TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

INSERT INTO mystery_challenge_passwords (
  id,
  display_order,
  password_ciphertext,
  password_iv,
  password_salt,
  ec_public_jwk,
  password_hash,
  password_hash_salt
)
VALUES
  (
    'signal_alpha',
    1,
    'h/tiY3/aXXzpud9Dej2GARxU7hJ0xPGg2RIy6IE=',
    'buwgsLKpg/rPg2DU',
    'h8iPfToVbhFKkUTV36tppg==',
    '{"key_ops":[],"ext":true,"kty":"EC","x":"Iq-AZeGl-4s_s_WP5s12sLz2h2v4jGjY-u9epTNnmn8","y":"XPX86HwQp51tko6ODLJWohkTY6FhaOgxXdacv_eSOPk","crv":"P-256"}',
    'S2LkBtrcN55Bqm/lQOG/PaMOgUgP1LjtlnfhdxzHG6M=',
    '1bvH3gV6SHGO1zEpKJD+gQ=='
  ),
  (
    'signal_beta',
    2,
    'DaeKoSuBuZKJGucAalMKDvu13ulossgZxonXcmM=',
    'cIEUhRJX9VtBapva',
    '4UxB9KB8Ep/Y9JUOmAONxw==',
    '{"key_ops":[],"ext":true,"kty":"EC","x":"zJuI_PzTcRIqh2HPxD4QVAWJPySgyJfBUer-w9qA8T0","y":"AaLLaU5mZuKV80C8eR9-IskynU80QRRF7YDtTYZlz8U","crv":"P-256"}',
    'VOaLwlvZzSO2G4e1FZ8JNehpeEjjjKQbULuSOKIiGkQ=',
    'uicXrfXAYZp/fqiudMU9GQ=='
  ),
  (
    'signal_gamma',
    3,
    'uxHxqOnMrHOowNBL1T6ihQP8mrFYy2iKIJTKLhg=',
    '1/LajkjFmw6GTBAl',
    'oUYbisnVXN8IMjInT42UJA==',
    '{"key_ops":[],"ext":true,"kty":"EC","x":"Hj6EqHap57B5EWqhi9NZKzPvfzcrTZfoztbNyK3eJkY","y":"IRAusQFQMbB-t-s7yhjFXiZzt2oPni9HuBNUTgk70eg","crv":"P-256"}',
    'ca5jA4XF7USIlnnXpN5wjFwMnA4rbJHt6PTnzK5iYBs=',
    'C6NHJzmhT6W2BXOHCM/S8Q=='
  )
ON CONFLICT(id) DO UPDATE SET
  display_order = excluded.display_order,
  password_ciphertext = excluded.password_ciphertext,
  password_iv = excluded.password_iv,
  password_salt = excluded.password_salt,
  ec_public_jwk = excluded.ec_public_jwk,
  password_hash = excluded.password_hash,
  password_hash_salt = excluded.password_hash_salt,
  updated_at = datetime('now', '+480 minutes');

CREATE TABLE IF NOT EXISTS mystery_challenge_completions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  password_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now', '+8 hours')),

  FOREIGN KEY (password_id) REFERENCES mystery_challenge_passwords(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_mystery_challenge_completed_at
  ON mystery_challenge_completions(completed_at, sequence);
