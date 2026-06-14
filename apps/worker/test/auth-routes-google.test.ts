import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { authRoutes } from '../src/routes/auth';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/services/auth.service';
import { getGoogleOAuthStateCookieName } from '../src/services/google-oauth.service';
import { AppBindings, ApiErrorCode, SessionUser } from '../src/types';

const TEST_ENV: AppBindings['Bindings'] = {
  DB: {} as D1Database,
  SESSION_SECRET: 'test-session-secret-at-least-long-enough',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  APP_BASE_URL: 'https://lab.buy2330.cc',
};

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
  const response = await requestAuth('/api/auth/google/callback?state=returned-state&code=code');

  const details = await assertApiError(
    response,
    403,
    'FORBIDDEN',
    'Google OAuth state is invalid.',
  );

  assert.deepEqual(details, {});
});

test('Google OAuth callback rejects a valid state when the authorization code is missing', async () => {
  const state = 'returned-state';
  const response = await requestAuth(`/api/auth/google/callback?state=${state}`, {
    headers: {
      Cookie: `${getGoogleOAuthStateCookieName(state)}=${state}`,
    },
  });

  const details = await assertApiError(
    response,
    422,
    'VALIDATION_ERROR',
    'Google authorization code is missing.',
  );

  assert.deepEqual(details, {});

  const setCookie = response.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${getGoogleOAuthStateCookieName(state)}=`));
  assert.match(setCookie, /Max-Age=0/u);
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
): Promise<Response> {
  const app = new Hono<AppBindings>();
  app.route('/api/auth', authRoutes);

  return Promise.resolve(
    app.request(path, init, {
      ...TEST_ENV,
      ...envOverrides,
    }),
  );
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

function createSessionUser(): SessionUser {
  return {
    id: 'usr_google_member',
    email: 'member@example.com',
    displayName: 'Google Member',
    avatarUrl: null,
    role: 'member',
    status: 'active',
  };
}
