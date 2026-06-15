import {
  decryptEcdhEncryptedPassword,
  EcdhEncryptedPasswordConfig,
  verifyEcdhEncryptedPassword,
} from './encrypted-password.service';

const GARAGE_CTF_CODE = 'hidden_garage';
const GARAGE_CTF_KEY_INFO = 'debtlab-garage-ctf-password:v1';

type GarageCtfConfigRow = EcdhEncryptedPasswordConfig & {
  readonly code: string;
};

export class GarageCtfConfigNotFoundError extends Error {
  constructor() {
    super('Garage CTF password configuration is missing.');
    this.name = 'GarageCtfConfigNotFoundError';
  }
}

export async function readGarageCtfPassword(db: D1Database): Promise<string> {
  const config = await readGarageCtfConfig(db);
  return await decryptEcdhEncryptedPassword(config, {
    keyInfo: GARAGE_CTF_KEY_INFO,
    additionalData: config.code,
  });
}

export async function verifyGarageCtfPassword(
  db: D1Database,
  candidatePassword: string,
): Promise<boolean> {
  const config = await readGarageCtfConfig(db);
  return await verifyEcdhEncryptedPassword(config, candidatePassword, {
    keyInfo: GARAGE_CTF_KEY_INFO,
    additionalData: config.code,
  });
}

async function readGarageCtfConfig(db: D1Database): Promise<GarageCtfConfigRow> {
  const row = await db
    .prepare(
      `SELECT
         code,
         password_ciphertext,
         password_iv,
         password_salt,
         ec_private_jwk,
         ec_public_jwk
       FROM garage_ctf_config
       WHERE code = ?`,
    )
    .bind(GARAGE_CTF_CODE)
    .first<GarageCtfConfigRow>();

  if (!row) {
    throw new GarageCtfConfigNotFoundError();
  }

  return row;
}
