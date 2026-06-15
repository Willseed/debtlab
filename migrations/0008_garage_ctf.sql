-- Migration: garage CTF config and first-solve state.
-- The password is stored as a P-256 ECDH/HKDF/AES-GCM ciphertext, not plaintext.
CREATE TABLE IF NOT EXISTS garage_ctf_config (
  code TEXT PRIMARY KEY,
  password_ciphertext TEXT NOT NULL,
  password_iv TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  ec_private_jwk TEXT NOT NULL,
  ec_public_jwk TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

INSERT INTO garage_ctf_config (
  code,
  password_ciphertext,
  password_iv,
  password_salt,
  ec_private_jwk,
  ec_public_jwk,
  updated_at
)
VALUES (
  'hidden_garage',
  'x2VGtRvJNtzm3B1oc+zoEl/mNF+KLy9zlw==',
  'MhrxOR7KxjPubuMx',
  'E2vhKEiWw2pWjmzJlEri2g==',
  '{"key_ops":["deriveBits"],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256","d":"LiV8vdtWfMXlthS3h6afHsln6npr5KtnOoZWA-7ADDU"}',
  '{"key_ops":[],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256"}',
  datetime('now', '+8 hours')
)
ON CONFLICT(code) DO UPDATE SET
  password_ciphertext = excluded.password_ciphertext,
  password_iv = excluded.password_iv,
  password_salt = excluded.password_salt,
  ec_private_jwk = excluded.ec_private_jwk,
  ec_public_jwk = excluded.ec_public_jwk,
  updated_at = datetime('now', '+8 hours');

-- Stores at most one row (the global first solver) via primary key = 1 constraint.
CREATE TABLE IF NOT EXISTS garage_ctf_first_solve (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT    NOT NULL,
  display_name TEXT NOT NULL,
  solved_at TEXT  NOT NULL DEFAULT (datetime('now', '+8 hours')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
