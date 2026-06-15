import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { createAuthRoutes } from '../src/routes/auth';
import { SESSION_COOKIE_NAME } from '../src/services/auth.service';
import {
  AppleOAuthVerificationError,
  getAppleOAuthStateCookieName,
} from '../src/services/apple-oauth.service';
import { ApiErrorCode, AppBindings, SessionUser } from '../src/types';

const TEST_ENV: AppBindings['Bindings'] = {
  DB: {} as D1Database,
  SESSION_SECRET: 'test-session-secret-at-least-long-enough',
  APPLE_TEAM_ID: 'APPLETEAMID',
  APPLE_CLIENT_ID: 'cc.buy2330.lab.web',
  APPLE_KEY_ID: 'APPLEKEYID',
  APPLE_PRIVATE_KEY: 'test-private-key',
  APP_BASE_URL: 'https://lab.buy2330.cc',
};
const VALID_APPLE_STATE = 'b'.repeat(64);
const VALID_APPLE_NONCE = 'c'.repeat(64);

test('Apple OAuth start sets a nonce-backed state cookie and redirects to Apple', async () => {
  const response = await requestAuth('/api/auth/apple/start');

  assert.equal(response.status, 302);

  const location = response.headers.get('Location');
  assert.ok(location);

  const redirectUrl = new URL(location);
  const state = redirectUrl.searchParams.get('state');
  const nonce = redirectUrl.searchParams.get('nonce');

  assert.equal(redirectUrl.origin, 'https://appleid.apple.com');
  assert.equal(redirectUrl.pathname, '/auth/authorize');
  assert.equal(redirectUrl.searchParams.get('client_id'), 'cc.buy2330.lab.web');
  assert.equal(
    redirectUrl.searchParams.get('redirect_uri'),
    'https://lab.buy2330.cc/api/auth/apple/callback',
  );
  assert.equal(redirectUrl.searchParams.get('response_type'), 'code');
  assert.equal(redirectUrl.searchParams.get('response_mode'), 'form_post');
  assert.equal(redirectUrl.searchParams.get('scope'), 'name email');
  assert.match(state ?? '', /^[0-9a-f]{64}$/u);
  assert.match(nonce ?? '', /^[0-9a-f]{64}$/u);

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${getAppleOAuthStateCookieName(state ?? '')}=${nonce}`));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=600/u);
  assert.match(setCookie, /Path=\/api\/auth\/apple/u);
  assert.match(setCookie, /SameSite=None/u);
  assert.match(setCookie, /Secure/u);
});

test('Apple OAuth start reports missing Worker secrets before redirecting', async () => {
  const response = await requestAuth('/api/auth/apple/start', undefined, {
    APPLE_PRIVATE_KEY: undefined,
  });

  const details = await assertApiError(
    response,
    500,
    'INTERNAL_ERROR',
    'Apple OAuth is not configured.',
  );

  assert.deepEqual(details, {});
});

test('Apple OAuth callback rejects requests without the matching state cookie', async () => {
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit({
      state: VALID_APPLE_STATE,
      code: 'authorization-code',
    }),
  );

  assertAuthRedirect(response, 'apple_state_invalid');
});

test('Apple OAuth callback rejects malformed state values before touching cookies', async () => {
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit({
      state: 'invalid=state',
      code: 'code',
    }),
  );

  assertAuthRedirect(response, 'apple_state_invalid');
});

test('Apple OAuth callback rejects a valid state when the authorization code is missing', async () => {
  const state = VALID_APPLE_STATE;
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
  );

  assertAuthRedirect(response, 'apple_code_missing');

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${getAppleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, /Max-Age=0/u);
});

test('Apple OAuth callback exchanges the code, verifies the ID token, creates a session, and redirects', async () => {
  const state = VALID_APPLE_STATE;
  const calls: string[] = [];
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser(), calls, {}, 'Pony Lab'),
  );
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
        user: JSON.stringify({
          name: {
            firstName: 'Pony',
            lastName: 'Lab',
          },
        }),
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
    {},
    routes,
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://lab.buy2330.cc/dashboard');
  assert.deepEqual(calls, ['exchange', 'verify', 'find-or-create']);

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${getAppleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, /Max-Age=0/u);
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=86400/u);
  assert.match(setCookie, /(?:^|;\s*)Path=\/(?:;|$)/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

test('Apple OAuth callback ignores malformed Apple user display-name payloads', async () => {
  const malformedUserPayloads = ['not-json', JSON.stringify('Pony Lab'), JSON.stringify({})];

  for (const userPayload of malformedUserPayloads) {
    const routes = createAuthRoutes(createAppleDependencies(createSessionUser()));
    const response = await requestAuth(
      '/api/auth/apple/callback',
      createAppleCallbackInit(
        {
          state: VALID_APPLE_STATE,
          code: 'authorization-code',
          user: userPayload,
        },
        `${getAppleOAuthStateCookieName(VALID_APPLE_STATE)}=${VALID_APPLE_NONCE}`,
      ),
      {},
      routes,
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('Location'), 'https://lab.buy2330.cc/dashboard');
  }
});

test('Apple OAuth callback refuses disabled identities and clears any existing app session', async () => {
  const state = VALID_APPLE_STATE;
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser({ status: 'disabled' })),
  );
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
      },
      [
        `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
        `${SESSION_COOKIE_NAME}=stale-session`,
      ].join('; '),
    ),
    {},
    routes,
  );

  assertAuthRedirect(response, 'user_not_active');

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${getAppleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=; Max-Age=0`));
});

test('Apple OAuth callback redirects Apple verification failures back to the app', async () => {
  const state = VALID_APPLE_STATE;
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser(), [], {
      verifyAppleIdToken: async () => {
        throw new AppleOAuthVerificationError('Apple ID token rejected.');
      },
    }),
  );
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
    {},
    routes,
  );

  assertAuthRedirect(response, 'apple_verification_failed');
});

test('Apple OAuth callback redirects configuration failures back to the app', async () => {
  const state = VALID_APPLE_STATE;
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
    {
      APPLE_PRIVATE_KEY: undefined,
    },
  );

  assertAuthRedirect(response, 'apple_oauth_not_configured');
});

test('Apple OAuth callback redirects session creation failures back to the app', async () => {
  const state = VALID_APPLE_STATE;
  const routes = createAuthRoutes(createAppleDependencies(createSessionUser()));
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
    {
      SESSION_SECRET: '',
    },
    routes,
  );

  assertAuthRedirect(response, 'session_unavailable');
});

test('Apple OAuth callback redirects unexpected backend failures back to the app', async () => {
  const state = VALID_APPLE_STATE;
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser(), [], {
      findOrCreateAppleUser: async () => {
        throw new Error('D1 is unavailable.');
      },
    }),
  );
  const response = await requestAuth(
    '/api/auth/apple/callback',
    createAppleCallbackInit(
      {
        state,
        code: 'authorization-code',
      },
      `${getAppleOAuthStateCookieName(state)}=${VALID_APPLE_NONCE}`,
    ),
    {},
    routes,
  );

  assertAuthRedirect(response, 'apple_callback_failed');
});

test('Apple identity-token endpoint reports missing Worker secrets before verification', async () => {
  const routes = createAuthRoutes(createAppleDependencies(createSessionUser()));
  const response = await requestAuth(
    '/api/auth/apple',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identityToken: 'signed-apple-id-token' }),
    },
    {
      APPLE_PRIVATE_KEY: undefined,
    },
    routes,
  );

  await assertApiError(response, 500, 'INTERNAL_ERROR', 'Apple OAuth is not configured.');
});

test('Origin middleware allows only the Apple form_post callback bypass', async () => {
  const routeApp = createOriginProtectedAuthApp();
  const callbackResponse = await routeApp.request(
    '/api/auth/apple/callback',
    createAppleCallbackInit({
      state: VALID_APPLE_STATE,
      code: 'authorization-code',
    }),
    TEST_ENV,
  );
  assertAuthRedirect(callbackResponse, 'apple_state_invalid');

  const blockedResponse = await routeApp.request(
    '/api/auth/apple',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identityToken: 'signed-apple-id-token' }),
    },
    TEST_ENV,
  );
  await assertApiError(blockedResponse, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
});

test('Apple identity-token endpoint verifies credentials before issuing a session cookie', async () => {
  const calls: string[] = [];
  const routes = createAuthRoutes(createAppleDependencies(createSessionUser(), calls));
  const response = await requestAuth(
    '/api/auth/apple',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identityToken: 'signed-apple-id-token' }),
    },
    {},
    routes,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: createSessionUser() });
  assert.deepEqual(calls, ['verify', 'find-or-create']);

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=86400/u);
  assert.match(setCookie, /(?:^|;\s*)Path=\/(?:;|$)/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

test('Apple identity-token endpoint keeps the standard API error shape for verification failures', async () => {
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser(), [], {
      verifyAppleIdToken: async () => {
        throw new AppleOAuthVerificationError('Apple ID token rejected.');
      },
    }),
  );
  const response = await requestAuth(
    '/api/auth/apple',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identityToken: 'signed-apple-id-token' }),
    },
    {},
    routes,
  );

  await assertApiError(response, 401, 'OAUTH_VERIFICATION_FAILED', 'Apple ID token rejected.');
});

test('Apple identity-token endpoint refuses disabled identities without issuing a new session', async () => {
  const routes = createAuthRoutes(
    createAppleDependencies(createSessionUser({ status: 'disabled' })),
  );
  const response = await requestAuth(
    '/api/auth/apple',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=stale-session`,
      },
      body: JSON.stringify({ identityToken: 'signed-apple-id-token' }),
    },
    {},
    routes,
  );

  await assertApiError(response, 403, 'FORBIDDEN', 'User is not active.');

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=; Max-Age=0`));
});

function requestAuth(
  path: string,
  init?: RequestInit,
  envOverrides: Partial<AppBindings['Bindings']> = {},
  routes: Hono<AppBindings> = createAuthRoutes(),
): Promise<Response> {
  const routeApp = new Hono<AppBindings>();
  routeApp.route('/api/auth', routes);

  return Promise.resolve(
    routeApp.request(path, init, {
      ...TEST_ENV,
      ...envOverrides,
    }),
  );
}

function createOriginProtectedAuthApp(): Hono<AppBindings> {
  const routeApp = new Hono<AppBindings>();
  routeApp.use('/api/*', validateOrigin);
  routeApp.route('/api/auth', createAuthRoutes());

  return routeApp;
}

function createAppleCallbackInit(
  fields: Readonly<Record<string, string>>,
  cookie?: string,
): RequestInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields),
  };
}

async function assertApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): Promise<unknown> {
  assert.equal(response.status, status);
  const body = (await response.json()) as {
    readonly error: {
      readonly code: ApiErrorCode;
      readonly message: string;
      readonly details: unknown;
    };
  };

  assert.equal(body.error.code, code);
  assert.equal(body.error.message, message);

  return body.error.details;
}

function assertAuthRedirect(response: Response, errorCode: string): void {
  const redirectUrl = new URL('/', TEST_ENV.APP_BASE_URL);
  redirectUrl.searchParams.set('auth_error', errorCode);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), redirectUrl.toString());
}

function createSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'usr_apple_member',
    email: 'member@example.com',
    displayName: 'Apple Member',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    ...overrides,
  };
}

type AuthTestDependencies = NonNullable<Parameters<typeof createAuthRoutes>[0]>;

function createAppleDependencies(
  user: SessionUser,
  calls: string[] = [],
  overrides: AuthTestDependencies = {},
  expectedDisplayName: string | undefined = undefined,
): AuthTestDependencies {
  return {
    exchangeAppleAuthorizationCode: async (code, config) => {
      calls.push('exchange');
      assert.equal(code, 'authorization-code');
      assert.equal(config.clientId, TEST_ENV.APPLE_CLIENT_ID);
      assert.equal(config.teamId, TEST_ENV.APPLE_TEAM_ID);
      assert.equal(config.keyId, TEST_ENV.APPLE_KEY_ID);
      assert.equal(config.privateKey, TEST_ENV.APPLE_PRIVATE_KEY);
      assert.equal(config.appBaseUrl, TEST_ENV.APP_BASE_URL);

      return 'signed-apple-id-token';
    },
    verifyAppleIdToken: async (idToken, clientId, expectedNonce) => {
      calls.push('verify');
      assert.equal(idToken, 'signed-apple-id-token');
      assert.equal(clientId, TEST_ENV.APPLE_CLIENT_ID);
      if (expectedNonce !== undefined) {
        assert.equal(expectedNonce, VALID_APPLE_NONCE);
      }

      return {
        subject: 'apple-subject',
        email: 'member@example.com',
        displayName: undefined,
      };
    },
    findOrCreateAppleUser: async (db, profile) => {
      calls.push('find-or-create');
      assert.equal(db, TEST_ENV.DB);
      assert.deepEqual(profile, {
        subject: 'apple-subject',
        email: 'member@example.com',
        displayName: expectedDisplayName,
      });

      return user;
    },
    ...overrides,
  };
}

function readSetCookie(response: Response): string {
  if (hasGetSetCookie(response.headers)) {
    return response.headers.getSetCookie().join('\n');
  }

  return response.headers.get('Set-Cookie') ?? '';
}

function hasGetSetCookie(headers: Headers): headers is Headers & {
  readonly getSetCookie: () => string[];
} {
  const maybeHeaders = headers as Headers & {
    readonly getSetCookie?: unknown;
  };

  return typeof maybeHeaders.getSetCookie === 'function';
}
