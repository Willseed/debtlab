import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GarageCtfConfigNotFoundError,
  readGarageCtfPassword,
  verifyGarageCtfPassword,
} from '../src/services/garage-ctf.service';

const GARAGE_CTF_CONFIG_ROW = {
  code: 'hidden_garage',
  password_ciphertext: 'x2VGtRvJNtzm3B1oc+zoEl/mNF+KLy9zlw==',
  password_iv: 'MhrxOR7KxjPubuMx',
  password_salt: 'E2vhKEiWw2pWjmzJlEri2g==',
  ec_private_jwk:
    '{"key_ops":["deriveBits"],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256","d":"LiV8vdtWfMXlthS3h6afHsln6npr5KtnOoZWA-7ADDU"}',
  ec_public_jwk:
    '{"key_ops":[],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256"}',
};

test('readGarageCtfPassword decrypts the D1 elliptic-curve password config', async () => {
  assert.equal(await readGarageCtfPassword(createGarageCtfConfigD1()), 'SystmeLab');
});

test('verifyGarageCtfPassword compares candidates without requiring plaintext storage', async () => {
  const db = createGarageCtfConfigD1();

  assert.equal(await verifyGarageCtfPassword(db, 'SystmeLab'), true);
  assert.equal(await verifyGarageCtfPassword(db, 'SystmeLabs'), false);
});

test('readGarageCtfPassword rejects missing D1 config', async () => {
  await assert.rejects(
    () => readGarageCtfPassword(createGarageCtfConfigD1(null)),
    GarageCtfConfigNotFoundError,
  );
});

function createGarageCtfConfigD1(
  row: typeof GARAGE_CTF_CONFIG_ROW | null = GARAGE_CTF_CONFIG_ROW,
): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
      }),
    }),
  } as unknown as D1Database;
}
