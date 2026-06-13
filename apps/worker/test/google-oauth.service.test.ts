import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGoogleAuthorizationUrl,
  buildGoogleRedirectUri,
  createGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  readGoogleOAuthConfig,
  readGoogleUserProfile,
  verifyGoogleIdToken,
  GoogleOAuthConfigurationError,
  GoogleOAuthVerificationError,
} from '../src/services/google-oauth.service';

const googleOAuthConfig = {
  clientId: 'google-client-id',
  clientSecret: 'google-client-secret',
  appBaseUrl: 'https://lab.buy2330.cc',
} as const;

test('builds a Google authorization URL with backend callback and state', () => {
  const url = new URL(buildGoogleAuthorizationUrl(googleOAuthConfig, 'csrf-state'));

  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'google-client-id');
  assert.equal(
    url.searchParams.get('redirect_uri'),
    'https://lab.buy2330.cc/api/auth/google/callback',
  );
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('state'), 'csrf-state');
  assert.equal(url.searchParams.get('prompt'), null);
});

test('reads Google OAuth config from Worker bindings', () => {
  assert.deepEqual(
    readGoogleOAuthConfig(
      {
        DB: {} as D1Database,
        SESSION_SECRET: 'session-secret',
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
      },
      'https://worker.example.test/api/auth/google/start',
    ),
    {
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
      appBaseUrl: 'https://worker.example.test',
    },
  );
});

test('rejects incomplete Google OAuth config', () => {
  assert.throws(
    () =>
      readGoogleOAuthConfig(
        {
          DB: {} as D1Database,
          SESSION_SECRET: 'session-secret',
          GOOGLE_CLIENT_ID: 'google-client-id',
        },
        'https://lab.buy2330.cc/api/auth/google/start',
      ),
    GoogleOAuthConfigurationError,
  );
});

test('creates high-entropy OAuth states', () => {
  const firstState = createGoogleOAuthState();
  const secondState = createGoogleOAuthState();

  assert.match(firstState, /^[0-9a-f]{64}$/u);
  assert.notEqual(firstState, secondState);
});

test('exchanges a Google authorization code for an ID token', async () => {
  const idToken = await exchangeGoogleAuthorizationCode(
    'authorization-code',
    googleOAuthConfig,
    async (input, init) => {
      assert.equal(input, 'https://oauth2.googleapis.com/token');
      assert.equal(init?.method, 'POST');
      assert.equal(
        new Headers(init?.headers).get('Content-Type'),
        'application/x-www-form-urlencoded',
      );
      assert.ok(init?.body instanceof URLSearchParams);
      assert.equal(init.body.get('client_id'), 'google-client-id');
      assert.equal(init.body.get('client_secret'), 'google-client-secret');
      assert.equal(init.body.get('code'), 'authorization-code');
      assert.equal(init.body.get('grant_type'), 'authorization_code');
      assert.equal(
        init.body.get('redirect_uri'),
        'https://lab.buy2330.cc/api/auth/google/callback',
      );

      return Response.json({ id_token: 'verified-id-token' });
    },
  );

  assert.equal(idToken, 'verified-id-token');
});

test('rejects failed Google authorization code exchanges', async () => {
  await assert.rejects(
    () =>
      exchangeGoogleAuthorizationCode('authorization-code', googleOAuthConfig, async () =>
        Response.json({ error: 'invalid_grant' }, { status: 400 }),
      ),
    GoogleOAuthVerificationError,
  );
});

test('rejects invalid Google token responses', async () => {
  await assert.rejects(
    () =>
      exchangeGoogleAuthorizationCode('authorization-code', googleOAuthConfig, async () =>
        Response.json({ access_token: 'missing-id-token' }),
      ),
    GoogleOAuthVerificationError,
  );
});

test('verifies Google ID token payloads through the configured verifier', async () => {
  const profile = await verifyGoogleIdToken(
    'signed-id-token',
    'google-client-id',
    async (idToken, _keySet, options) => {
      assert.equal(idToken, 'signed-id-token');
      assert.equal(options.audience, 'google-client-id');
      assert.deepEqual(options.issuer, ['https://accounts.google.com', 'accounts.google.com']);

      return {
        payload: {
          sub: 'google-subject',
          email: 'pony@example.com',
          email_verified: 'true',
          name: 'Pony Lab',
        },
      };
    },
  );

  assert.deepEqual(profile, {
    subject: 'google-subject',
    email: 'pony@example.com',
    displayName: 'Pony Lab',
    avatarUrl: undefined,
  });
});

test('reads verified Google user profile payloads', () => {
  assert.deepEqual(
    readGoogleUserProfile({
      sub: 'google-subject',
      email: 'pony@example.com',
      email_verified: true,
      name: 'Pony Lab',
      picture: 'https://example.com/avatar.png',
    }),
    {
      subject: 'google-subject',
      email: 'pony@example.com',
      displayName: 'Pony Lab',
      avatarUrl: 'https://example.com/avatar.png',
    },
  );
});

test('does not trust unverified Google email claims', () => {
  assert.deepEqual(
    readGoogleUserProfile({
      sub: 'google-subject',
      email: 'pony@example.com',
      email_verified: false,
    }),
    {
      subject: 'google-subject',
      email: undefined,
      displayName: undefined,
      avatarUrl: undefined,
    },
  );
});

test('rejects invalid Google token payloads', () => {
  assert.throws(
    () => readGoogleUserProfile({ email: 'pony@example.com' }),
    GoogleOAuthVerificationError,
  );
});

test('builds the backend Google callback URL', () => {
  assert.equal(
    buildGoogleRedirectUri('https://lab.buy2330.cc'),
    'https://lab.buy2330.cc/api/auth/google/callback',
  );
});
