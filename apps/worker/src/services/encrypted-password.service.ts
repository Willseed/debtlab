export type EcdhEncryptedPasswordConfig = {
  readonly password_ciphertext: string;
  readonly password_iv: string;
  readonly password_salt: string;
  readonly ec_private_jwk: string;
  readonly ec_public_jwk: string;
};

export type EcdhEncryptedPasswordOptions = {
  readonly keyInfo: string;
  readonly additionalData: string;
};

const MAX_VALIDATED_PASSWORD_BYTES = 1024;

type EcdhDeriveBitsParams = SubtleCryptoDeriveKeyAlgorithm & {
  readonly public: CryptoKey;
};

export async function decryptEcdhEncryptedPassword(
  config: EcdhEncryptedPasswordConfig,
  options: EcdhEncryptedPasswordOptions,
): Promise<string> {
  const key = await deriveAesKey(config, options.keyInfo);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: base64ToBytes(config.password_iv),
      additionalData: new TextEncoder().encode(options.additionalData),
    },
    key,
    base64ToBytes(config.password_ciphertext),
  );

  return new TextDecoder().decode(decrypted);
}

export async function verifyEcdhEncryptedPassword(
  config: EcdhEncryptedPasswordConfig,
  candidatePassword: string,
  options: EcdhEncryptedPasswordOptions,
): Promise<boolean> {
  const password = await decryptEcdhEncryptedPassword(config, options);
  return constantTimeEqual(candidatePassword, password);
}

async function deriveAesKey(
  config: EcdhEncryptedPasswordConfig,
  keyInfo: string,
): Promise<CryptoKey> {
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
  const ecdhParams: EcdhDeriveBitsParams = {
    name: 'ECDH',
    $public: publicKey,
    public: publicKey,
  };
  const sharedSecret = await crypto.subtle.deriveBits(ecdhParams, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: base64ToBytes(config.password_salt),
      info: new TextEncoder().encode(keyInfo),
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
    const byte = binary.codePointAt(index);
    if (byte === undefined) {
      throw new RangeError('Invalid byte index while decoding base64 value.');
    }
    bytes[index] = byte;
  }

  return bytes;
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(MAX_VALIDATED_PASSWORD_BYTES, leftBytes.length, rightBytes.length);
  const leftPadded = new Uint8Array(length);
  const rightPadded = new Uint8Array(length);

  leftPadded.set(leftBytes);
  rightPadded.set(rightBytes);

  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= leftPadded[index] ^ rightPadded[index];
  }

  return difference === 0;
}
