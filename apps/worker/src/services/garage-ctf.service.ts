const GARAGE_CTF_CODE = 'hidden_garage';
const GARAGE_CTF_KEY_INFO = 'debtlab-garage-ctf-password:v1';

type GarageCtfConfigRow = {
  readonly code: string;
  readonly password_ciphertext: string;
  readonly password_iv: string;
  readonly password_salt: string;
  readonly ec_private_jwk: string;
  readonly ec_public_jwk: string;
};

export class GarageCtfConfigNotFoundError extends Error {
  constructor() {
    super('Garage CTF password configuration is missing.');
    this.name = 'GarageCtfConfigNotFoundError';
  }
}

export async function readGarageCtfPassword(db: D1Database): Promise<string> {
  const config = await readGarageCtfConfig(db);
  const key = await deriveGarageCtfAesKey(config);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(config.password_iv),
      additionalData: new TextEncoder().encode(config.code),
    },
    key,
    base64ToBytes(config.password_ciphertext),
  );

  return new TextDecoder().decode(decrypted);
}

export async function verifyGarageCtfPassword(
  db: D1Database,
  candidatePassword: string,
): Promise<boolean> {
  const password = await readGarageCtfPassword(db);
  return constantTimeEqual(candidatePassword, password);
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

async function deriveGarageCtfAesKey(config: GarageCtfConfigRow): Promise<CryptoKey> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(config.ec_private_jwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(config.ec_public_jwk) as JsonWebKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey } as unknown as Parameters<SubtleCrypto['deriveBits']>[0],
    privateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: base64ToBytes(config.password_salt),
      info: new TextEncoder().encode(GARAGE_CTF_KEY_INFO),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}
