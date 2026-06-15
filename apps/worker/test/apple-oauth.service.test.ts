import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';

import {
  AppleOAuthConfigurationError,
  AppleOAuthVerificationError,
  buildAppleAuthorizationUrl,
  buildAppleRedirectUri,
  createAppleClientSecret,
  createAppleOAuthNonce,
  createAppleOAuthState,
  exchangeAppleAuthorizationCode,
  getAppleOAuthStateCookieName,
  readAppleOAuthConfig,
  readAppleUserProfile,
  verifyAppleIdToken,
  type AppleOAuthConfig,
} from '../src/services/apple-oauth.service';

const appleOAuthConfig = {
  teamId: 'APPLETEAMID',
  clientId: 'cc.buy2330.lab.web',
  keyId: 'APPLEKEYID',
  privateKey: 'invalid-test-key',
  appBaseUrl: 'https://lab.buy2330.cc',
} as const;

test('builds an Apple authorization URL with backend callback, state, and nonce', () => {
  const url = new URL(buildAppleAuthorizationUrl(appleOAuthConfig, 'csrf-state', 'nonce-value'));

  assert.equal(url.origin, 'https://appleid.apple.com');
  assert.equal(url.pathname, '/auth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'cc.buy2330.lab.web');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://lab.buy2330.cc/api/auth/apple/callback',
  );
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('response_mode'), 'form_post');
  assert.equal(url.searchParams.get('scope'), 'name email');
  assert.equal(url.searchParams.get('state'), 'csrf-state');
  assert.equal(url.searchParams.get('nonce'), 'nonce-value');
});

test('reads Apple OAuth config from Worker bindings and normalizes escaped private-key newlines', () => {
  assert.deepEqual(
    readAppleOAuthConfig(
      {
        DB: {} as D1Database,
        SESSION_SECRET: 'session-secret',
        APPLE_TEAM_ID: 'APPLETEAMID',
        APPLE_CLIENT_ID: 'cc.buy2330.lab.web',
        APPLE_KEY_ID: 'APPLEKEYID',
        APPLE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      },
      'https://worker.example.test/api/auth/apple/start',
    ),
    {
      teamId: 'APPLETEAMID',
      clientId: 'cc.buy2330.lab.web',
      keyId: 'APPLEKEYID',
      privateKey: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      appBaseUrl: 'https://worker.example.test',
    },
  );
});

test('rejects incomplete Apple OAuth config', () => {
  assert.throws(
    () =>
      readAppleOAuthConfig(
        {
          DB: {} as D1Database,
          SESSION_SECRET: 'session-secret',
          APPLE_TEAM_ID: 'APPLETEAMID',
          APPLE_CLIENT_ID: 'cc.buy2330.lab.web',
          APPLE_KEY_ID: 'APPLEKEYID',
        },
        'https://lab.buy2330.cc/api/auth/apple/start',
      ),
    AppleOAuthConfigurationError,
  );
});

test('creates high-entropy Apple OAuth states and nonces', () => {
  const firstState = createAppleOAuthState();
  const secondState = createAppleOAuthState();
  const nonce = createAppleOAuthNonce();

  assert.match(firstState, /^[0-9a-f]{64}$/u);
  assert.notEqual(firstState, secondState);
  assert.match(nonce, /^[0-9a-f]{64}$/u);
});

test('builds distinct Apple OAuth state cookie names', () => {
  assert.equal(getAppleOAuthStateCookieName('csrf-state'), 'labsplit_apple_oauth_state_csrf-state');
});

test('generates an ES256 Apple client_secret JWT with configured claims', async () => {
  const { config, publicKey } = await createSignedAppleOAuthConfig();
  const clientSecret = await createAppleClientSecret(config);
  const header = decodeProtectedHeader(clientSecret);

  assert.equal(header.alg, 'ES256');
  assert.equal(header.kid, 'APPLEKEYID');

  const result = await jwtVerify(clientSecret, publicKey, {
    issuer: 'APPLETEAMID',
    audience: 'https://appleid.apple.com',
    subject: 'cc.buy2330.lab.web',
  });

  assert.equal(result.payload.iss, 'APPLETEAMID');
  assert.equal(result.payload.aud, 'https://appleid.apple.com');
  assert.equal(result.payload.sub, 'cc.buy2330.lab.web');
  assert.equal(typeof result.payload.iat, 'number');
  assert.equal(typeof result.payload.exp, 'number');
});

test('rejects malformed Apple private keys before token exchange', async () => {
  await assert.rejects(
    () => createAppleClientSecret(appleOAuthConfig),
    AppleOAuthConfigurationError,
  );
});

test('exchanges an Apple authorization code for an ID token', async () => {
  const { config } = await createSignedAppleOAuthConfig();
  const idToken = await exchangeAppleAuthorizationCode(
    'authorization-code',
    config,
    async (input, init) => {
      assert.equal(input, 'https://appleid.apple.com/auth/token');
      assert.equal(init?.method, 'POST');
      assert.equal(
        new Headers(init?.headers).get('Content-Type'),
        'application/x-www-form-urlencoded',
      );
      assert.ok(init?.body instanceof URLSearchParams);
      assert.equal(init.body.get('client_id'), 'cc.buy2330.lab.web');
      assert.match(init.body.get('client_secret') ?? '', /^ey/u);
      assert.equal(init.body.get('code'), 'authorization-code');
      assert.equal(init.body.get('grant_type'), 'authorization_code');
      assert.equal(init.body.get('redirect_uri'), 'https://lab.buy2330.cc/api/auth/apple/callback');

      return Response.json({ id_token: 'verified-id-token' });
    },
  );

  assert.equal(idToken, 'verified-id-token');
});

test('rejects failed Apple authorization code exchanges', async () => {
  const { config } = await createSignedAppleOAuthConfig();

  await assert.rejects(
    () =>
      exchangeAppleAuthorizationCode('authorization-code', config, async () =>
        Response.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    AppleOAuthVerificationError,
  );
});

test('rejects invalid Apple token responses', async () => {
  const { config } = await createSignedAppleOAuthConfig();

  await assert.rejects(
    () =>
      exchangeAppleAuthorizationCode('authorization-code', config, async () =>
        Response.json({ access_token: 'missing-id-token' }),
      ),
    AppleOAuthVerificationError,
  );
});

test('verifies Apple ID token payloads through the configured verifier', async () => {
  const profile = await verifyAppleIdToken(
    'signed-id-token',
    'cc.buy2330.lab.web',
    'expected-nonce',
    async (idToken, _keySet, options) => {
      assert.equal(idToken, 'signed-id-token');
      assert.equal(options.audience, 'cc.buy2330.lab.web');
      assert.equal(options.issuer, 'https://appleid.apple.com');

      return {
        payload: {
          sub: 'apple-subject',
          exp: futureJwtExpiration(),
          email: 'pony@example.com',
          email_verified: 'true',
          nonce: 'expected-nonce',
        },
      };
    },
  );

  assert.deepEqual(profile, {
    subject: 'apple-subject',
    email: 'pony@example.com',
  });
});

test('rejects Apple ID tokens whose nonce does not match the state cookie', async () => {
  await assert.rejects(
    () =>
      verifyAppleIdToken('signed-id-token', 'cc.buy2330.lab.web', 'expected-nonce', async () => ({
        payload: {
          sub: 'apple-subject',
          exp: futureJwtExpiration(),
          nonce: 'different-nonce',
        },
      })),
    AppleOAuthVerificationError,
  );
});

test('wraps lower-level Apple JWT verification failures as OAuth verification failures', async () => {
  await assert.rejects(
    () =>
      verifyAppleIdToken('signed-id-token', 'cc.buy2330.lab.web', undefined, async () => {
        throw new Error('jose rejected the token');
      }),
    (error: unknown) =>
      error instanceof AppleOAuthVerificationError &&
      error.message === 'Apple ID token verification failed.',
  );
});

test('rethrows explicit Apple OAuth verification errors from custom verifiers', async () => {
  await assert.rejects(
    () =>
      verifyAppleIdToken('signed-id-token', 'cc.buy2330.lab.web', undefined, async () => {
        throw new AppleOAuthVerificationError('Apple JWKS rejected the token.');
      }),
    (error: unknown) =>
      error instanceof AppleOAuthVerificationError &&
      error.message === 'Apple JWKS rejected the token.',
  );
});

test('reads verified Apple user profile payloads', () => {
  assert.deepEqual(
    readAppleUserProfile({
      sub: 'apple-subject',
      exp: futureJwtExpiration(),
      email: 'pony@example.com',
      email_verified: true,
    }),
    {
      subject: 'apple-subject',
      email: 'pony@example.com',
    },
  );
});

test('does not trust unverified Apple email claims', () => {
  assert.deepEqual(
    readAppleUserProfile({
      sub: 'apple-subject',
      exp: futureJwtExpiration(),
      email: 'pony@example.com',
      email_verified: false,
    }),
    {
      subject: 'apple-subject',
      email: undefined,
    },
  );
});

test('rejects expired Apple ID token payloads', () => {
  assert.throws(
    () =>
      readAppleUserProfile({
        sub: 'apple-subject',
        exp: Math.floor(Date.now() / 1000) - 1,
      }),
    AppleOAuthVerificationError,
  );
});

test('rejects invalid Apple token payloads', () => {
  assert.throws(
    () => readAppleUserProfile({ email: 'pony@example.com', exp: futureJwtExpiration() }),
    AppleOAuthVerificationError,
  );
});

test('builds the backend Apple callback URL', () => {
  assert.equal(
    buildAppleRedirectUri('https://lab.buy2330.cc'),
    'https://lab.buy2330.cc/api/auth/apple/callback',
  );
});

async function createSignedAppleOAuthConfig(): Promise<{
  readonly config: AppleOAuthConfig;
  readonly publicKey: CryptoKey;
}> {
  const keyPair = await generateKeyPair('ES256', { extractable: true });

  return {
    config: {
      ...appleOAuthConfig,
      privateKey: await exportPKCS8(keyPair.privateKey),
    },
    publicKey: keyPair.publicKey,
  };
}

function futureJwtExpiration(): number {
  return Math.floor(Date.now() / 1000) + 300;
}
