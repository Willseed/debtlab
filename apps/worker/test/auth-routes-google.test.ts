import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { authRoutes, createAuthRoutes } from '../src/routes/auth';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import {
  getGoogleOAuthStateCookieName,
  GoogleOAuthVerificationError,
} from '../src/services/google-oauth.service';
import { AppBindings, ApiErrorCode, SessionUser } from '../src/types';

const TEST_ENV: AppBindings['Bindings'] = {
  DB: {} as D1Database,
  SESSION_SECRET: 'test-session-secret-at-least-long-enough',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  APP_BASE_URL: 'https://lab.buy2330.cc',
};
const VALID_GOOGLE_STATE = 'a'.repeat(64);

test('Google OAuth start sets a state cookie and redirects to Google', async () => {
  const response = await requestAuth('/api/auth/google/start');

  assert.equal(response.status, 302);

  const location = response.headers.get('Location');
  assert.ok(location);

  const redirectUrl = new URL(location);
  const state = redirectUrl.searchParams.get('state');

  assert.equal(redirectUrl.origin, 'https://accounts.google.com');
  assert.equal(redirectUrl.pathname, '/o/oauth2/v2/auth');
  assert.equal(redirectUrl.searchParams.get('client_id'), 'google-client-id');
  assert.equal(
    redirectUrl.searchParams.get('redirect_uri'),
    'https://lab.buy2330.cc/api/auth/google/callback',
  );
  assert.equal(redirectUrl.searchParams.get('response_type'), 'code');
  assert.equal(redirectUrl.searchParams.get('scope'), 'openid email profile');
  assert.equal(redirectUrl.searchParams.get('prompt'), null);
  assert.match(state ?? '', /^[0-9a-f]{64}$/u);

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${getGoogleOAuthStateCookieName(state ?? '')}=${state}`));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=600/u);
  assert.match(setCookie, /Path=\/api\/auth\/google/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

test('Google OAuth start reports missing Worker secrets before redirecting', async () => {
  const response = await requestAuth('/api/auth/google/start', undefined, {
    GOOGLE_CLIENT_SECRET: undefined,
  });

  const details = await assertApiError(
    response,
    500,
    'INTERNAL_ERROR',
    'Google OAuth is not configured.',
  );

  assert.deepEqual(details, {});
});

test('Google OAuth callback rejects requests without the matching state cookie', async () => {
  const response = await requestAuth(
    `/api/auth/google/callback?state=${VALID_GOOGLE_STATE}&code=code`,
  );

  assertAuthRedirect(response, 'google_state_invalid');
});

test('Google OAuth callback rejects malformed state values before touching cookies', async () => {
  const response = await requestAuth('/api/auth/google/callback?state=invalid%3Dstate&code=code');

  assertAuthRedirect(response, 'google_state_invalid');
});

test('Google OAuth callback rejects a valid state when the authorization code is missing', async () => {
  const state = VALID_GOOGLE_STATE;
  const response = await requestAuth(`/api/auth/google/callback?state=${state}`, {
    headers: {
      Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
    },
  });

  assertAuthRedirect(response, 'google_code_missing');

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${getGoogleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, /Max-Age=0/u);
});

test('Google OAuth callback exchanges the code, verifies the ID token, creates a session, and redirects', async () => {
  const state = VALID_GOOGLE_STATE;
  const calls: string[] = [];
  const routes = createAuthRoutes(createGoogleDependencies(createSessionUser(), calls));
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
      },
    },
    {},
    routes,
  );

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://lab.buy2330.cc/dashboard');
  assert.deepEqual(calls, ['exchange', 'verify', 'find-or-create']);

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${getGoogleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, /Max-Age=0/u);
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/u);
  assert.match(setCookie, /Max-Age=604800/u);
  assert.match(setCookie, /(?:^|;\s*)Path=\/(?:;|$)/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

test('Google OAuth callback refuses disabled identities and clears any existing app session', async () => {
  const state = VALID_GOOGLE_STATE;
  const routes = createAuthRoutes(
    createGoogleDependencies(createSessionUser({ status: 'disabled' })),
  );
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: [
          `${getGoogleOAuthStateCookieName(state)}=${state}`,
          `${SESSION_COOKIE_NAME}=stale-session`,
        ].join('; '),
      },
    },
    {},
    routes,
  );

  assertAuthRedirect(response, 'user_not_active');

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${getGoogleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=; Max-Age=0`));
});

test('Google OAuth callback redirects Google verification failures back to the app', async () => {
  const state = VALID_GOOGLE_STATE;
  const routes = createAuthRoutes(
    createGoogleDependencies(createSessionUser(), [], {
      verifyGoogleIdToken: async () => {
        throw new GoogleOAuthVerificationError('Google ID token rejected.');
      },
    }),
  );
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
      },
    },
    {},
    routes,
  );

  assertAuthRedirect(response, 'google_verification_failed');
});

test('Google OAuth callback redirects configuration failures back to the app', async () => {
  const state = VALID_GOOGLE_STATE;
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
      },
    },
    {
      GOOGLE_CLIENT_SECRET: undefined,
    },
  );

  assertAuthRedirect(response, 'google_oauth_not_configured');
});

test('Google OAuth callback redirects session creation failures back to the app', async () => {
  const state = VALID_GOOGLE_STATE;
  const routes = createAuthRoutes(createGoogleDependencies(createSessionUser()));
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
      },
    },
    {
      SESSION_SECRET: '',
    },
    routes,
  );

  assertAuthRedirect(response, 'session_unavailable');
});

test('Google OAuth callback redirects unexpected backend failures back to the app', async () => {
  const state = VALID_GOOGLE_STATE;
  const routes = createAuthRoutes(
    createGoogleDependencies(createSessionUser(), [], {
      findOrCreateGoogleUser: async () => {
        throw new Error('D1 is unavailable.');
      },
    }),
  );
  const response = await requestAuth(
    `/api/auth/google/callback?state=${state}&code=authorization-code`,
    {
      headers: {
        Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
      },
    },
    {},
    routes,
  );

  assertAuthRedirect(response, 'google_callback_failed');
});

test('Google one-tap endpoint rejects malformed credential bodies before OAuth verification', async () => {
  const response = await requestAuth('/api/auth/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ credential: '' }),
  });

  const details = await assertApiError(
    response,
    422,
    'VALIDATION_ERROR',
    'Google credential is invalid.',
  );

  assert.deepEqual(details, {
    fieldErrors: {
      credential: ['String must contain at least 1 character(s)'],
    },
    formErrors: [],
  });
});

test('Google one-tap endpoint verifies credentials before issuing a session cookie', async () => {
  const calls: string[] = [];
  const routes = createAuthRoutes(createGoogleDependencies(createSessionUser(), calls));
  const response = await requestAuth(
    '/api/auth/google',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credential: 'signed-google-id-token' }),
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
  assert.match(setCookie, /Max-Age=604800/u);
  assert.match(setCookie, /(?:^|;\s*)Path=\/(?:;|$)/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

test('Google one-tap endpoint keeps the standard API error shape for verification failures', async () => {
  const routes = createAuthRoutes(
    createGoogleDependencies(createSessionUser(), [], {
      verifyGoogleIdToken: async () => {
        throw new GoogleOAuthVerificationError('Google ID token rejected.');
      },
    }),
  );
  const response = await requestAuth(
    '/api/auth/google',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credential: 'signed-google-id-token' }),
    },
    {},
    routes,
  );

  await assertApiError(response, 401, 'OAUTH_VERIFICATION_FAILED', 'Google ID token rejected.');
});

test('Google one-tap endpoint refuses disabled identities without issuing a new session', async () => {
  const routes = createAuthRoutes(
    createGoogleDependencies(createSessionUser({ status: 'disabled' })),
  );
  const response = await requestAuth(
    '/api/auth/google',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=stale-session`,
      },
      body: JSON.stringify({ credential: 'signed-google-id-token' }),
    },
    {},
    routes,
  );

  await assertApiError(response, 403, 'FORBIDDEN', 'User is not active.');

  const setCookie = readSetCookie(response);
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=; Max-Age=0`));
});

test('auth routes validate Origin before Google one-tap mutations', async () => {
  const routeApp = createOriginProtectedAuthApp();
  const startResponse = await routeApp.request('/api/auth/google/start', undefined, TEST_ENV);
  assert.equal(startResponse.status, 302);

  const blockedResponse = await routeApp.request(
    '/api/auth/google',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ credential: '' }),
    },
    TEST_ENV,
  );
  await assertApiError(blockedResponse, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');

  const allowedResponse = await routeApp.request(
    '/api/auth/google',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://lab.buy2330.cc',
      },
      body: JSON.stringify({ credential: '' }),
    },
    TEST_ENV,
  );
  await assertApiError(allowedResponse, 422, 'VALIDATION_ERROR', 'Google credential is invalid.');
});

test('Apple auth route stays disabled without requiring Apple OAuth secrets', async () => {
  const response = await requestAuth('/api/auth/apple', {
    method: 'POST',
  });

  const details = await assertApiError(
    response,
    403,
    'FORBIDDEN',
    'Sign in with Apple is temporarily disabled.',
  );

  assert.deepEqual(details, {});
});

test('current user route returns the D1-backed authenticated session user', async () => {
  const user = createSessionUser();
  const token = await createSessionToken(user, TEST_ENV.SESSION_SECRET);
  const response = await requestAuth(
    '/api/auth/me',
    {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    },
    {
      DB: createCurrentUserD1(user),
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user });
});

test('logout route clears the application session cookie', async () => {
  const response = await requestAuth('/api/auth/logout', {
    method: 'POST',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(setCookie, /Max-Age=0/u);
  assert.match(setCookie, /(?:^|;\s*)Path=\/(?:;|$)/u);
  assert.match(setCookie, /SameSite=Lax/u);
  assert.match(setCookie, /Secure/u);
});

function requestAuth(
  path: string,
  init?: RequestInit,
  envOverrides: Partial<AppBindings['Bindings']> = {},
  routes: Hono<AppBindings> = authRoutes,
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
  routeApp.route('/api/auth', authRoutes);

  return routeApp;
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

function createCurrentUserD1(user: SessionUser): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => ({
          id: user.id,
          email: user.email ?? null,
          display_name: user.displayName,
          avatar_url: user.avatarUrl ?? null,
          role: user.role,
          status: user.status,
        }),
      }),
    }),
  } as unknown as D1Database;
}

function createSessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'usr_google_member',
    email: 'member@example.com',
    displayName: 'Google Member',
    avatarUrl: null,
    role: 'member',
    status: 'active',
    ...overrides,
  };
}

type GoogleAuthTestDependencies = NonNullable<Parameters<typeof createAuthRoutes>[0]>;

function createGoogleDependencies(
  user: SessionUser,
  calls: string[] = [],
  overrides: Partial<GoogleAuthTestDependencies> = {},
): GoogleAuthTestDependencies {
  return {
    exchangeGoogleAuthorizationCode: async (code, config) => {
      calls.push('exchange');
      assert.equal(code, 'authorization-code');
      assert.equal(config.clientId, TEST_ENV.GOOGLE_CLIENT_ID);
      assert.equal(config.clientSecret, TEST_ENV.GOOGLE_CLIENT_SECRET);
      assert.equal(config.appBaseUrl, TEST_ENV.APP_BASE_URL);

      return 'signed-google-id-token';
    },
    verifyGoogleIdToken: async (idToken, clientId) => {
      calls.push('verify');
      assert.equal(idToken, 'signed-google-id-token');
      assert.equal(clientId, TEST_ENV.GOOGLE_CLIENT_ID);

      return {
        subject: 'google-subject',
        email: 'member@example.com',
        displayName: 'Google Member',
        avatarUrl: undefined,
      };
    },
    findOrCreateGoogleUser: async (db, profile) => {
      calls.push('find-or-create');
      assert.equal(db, TEST_ENV.DB);
      assert.deepEqual(profile, {
        subject: 'google-subject',
        email: 'member@example.com',
        displayName: 'Google Member',
        avatarUrl: undefined,
      });

      return user;
    },
    ...overrides,
  };
}

function readSetCookie(response: Response): string {
  const headersWithSetCookie = response.headers as Headers & {
    readonly getSetCookie?: () => string[];
  };

  return (
    headersWithSetCookie.getSetCookie?.().join('\n') ?? response.headers.get('Set-Cookie') ?? ''
  );
}
