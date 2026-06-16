import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { type Context, Hono } from 'hono';

import {
  configurationErrorResponse,
  logConfigurationError,
  productionSafeAuthErrorCode,
} from '../http/configuration-error-response';
import { errorResponse } from '../http/error-response';
import { logWorkerError } from '../logging/safe-log';
import { requireAuth } from '../middleware/require-auth';
import {
  AppleOAuthConfigurationError,
  AppleOAuthVerificationError,
  buildAppleAuthorizationUrl,
  createAppleOAuthNonce,
  createAppleOAuthState,
  exchangeAppleAuthorizationCode,
  getAppleOAuthStateCookieName,
  readAppleOAuthConfig,
  verifyAppleIdToken,
} from '../services/apple-oauth.service';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '../services/auth.service';
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  getGoogleOAuthStateCookieName,
  GoogleOAuthConfigurationError,
  GoogleOAuthVerificationError,
  readGoogleOAuthConfig,
  verifyGoogleIdToken,
} from '../services/google-oauth.service';
import { findOrCreateAppleUser, findOrCreateGoogleUser } from '../services/user.service';
import { AppBindings, SessionUser } from '../types';
import { appleAuthSchema, googleAuthSchema } from '../validation/schemas';

const OAUTH_STATE_TTL_SECONDS = 600;
const OAUTH_RANDOM_PATTERN = /^[0-9a-f]{64}$/u;
const SESSION_SECRET_CONFIGURATION_ERROR = new Error('Session secret is not configured.');

type AuthContext = Context<AppBindings>;

type AuthDependencies = {
  readonly exchangeGoogleAuthorizationCode: typeof exchangeGoogleAuthorizationCode;
  readonly exchangeAppleAuthorizationCode: typeof exchangeAppleAuthorizationCode;
  readonly findOrCreateAppleUser: typeof findOrCreateAppleUser;
  readonly findOrCreateGoogleUser: typeof findOrCreateGoogleUser;
  readonly verifyAppleIdToken: typeof verifyAppleIdToken;
  readonly verifyGoogleIdToken: typeof verifyGoogleIdToken;
};

const defaultAuthDependencies: AuthDependencies = {
  exchangeGoogleAuthorizationCode,
  exchangeAppleAuthorizationCode,
  findOrCreateAppleUser,
  findOrCreateGoogleUser,
  verifyAppleIdToken,
  verifyGoogleIdToken,
};

export function createAuthRoutes(
  dependencyOverrides: Partial<AuthDependencies> = {},
): Hono<AppBindings> {
  const dependencies = { ...defaultAuthDependencies, ...dependencyOverrides };
  const routes = new Hono<AppBindings>();

  routes.get('/google/start', (c) => {
    try {
      const config = readGoogleOAuthConfig(c.env, c.req.url);
      const state = createGoogleOAuthState();

      setGoogleStateCookie(c, state);

      return c.redirect(buildGoogleAuthorizationUrl(config, state), 302);
    } catch (error) {
      return handleGoogleOAuthError(c, error);
    }
  });

  routes.get('/google/callback', async (c) => {
    const returnedState = c.req.query('state');
    const code = c.req.query('code');

    if (!isValidOAuthRandom(returnedState)) {
      return redirectGoogleCallbackError(c, 'google_state_invalid');
    }

    const stateCookieName = getGoogleOAuthStateCookieName(returnedState);
    const expectedState = getCookie(c, stateCookieName);

    deleteCookie(c, stateCookieName, {
      path: '/api/auth/google',
      secure: true,
      sameSite: 'Lax',
    });

    if (!expectedState || returnedState !== expectedState) {
      return redirectGoogleCallbackError(c, 'google_state_invalid');
    }

    if (!code) {
      return redirectGoogleCallbackError(c, 'google_code_missing');
    }

    try {
      const config = readGoogleOAuthConfig(c.env, c.req.url);
      const idToken = await dependencies.exchangeGoogleAuthorizationCode(code, config);
      const profile = await dependencies.verifyGoogleIdToken(idToken, config.clientId);
      const user = await dependencies.findOrCreateGoogleUser(c.env.DB, profile);
      const sessionResult = await issueSession(c, user);

      if (sessionResult) {
        return redirectGoogleCallbackError(
          c,
          user.status === 'active'
            ? productionSafeAuthErrorCode(c.env, 'session_unavailable')
            : 'user_not_active',
        );
      }

      return c.redirect(new URL('/dashboard', config.appBaseUrl).toString(), 302);
    } catch (error) {
      return handleGoogleOAuthCallbackError(c, error);
    }
  });

  routes.post('/google', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = googleAuthSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        c,
        422,
        'VALIDATION_ERROR',
        'Google credential is invalid.',
        parsed.error.flatten(),
      );
    }

    try {
      const config = readGoogleOAuthConfig(c.env, c.req.url);
      const profile = await dependencies.verifyGoogleIdToken(
        parsed.data.credential,
        config.clientId,
      );
      const user = await dependencies.findOrCreateGoogleUser(c.env.DB, profile);
      const sessionResult = await issueSession(c, user);

      if (sessionResult) {
        return sessionResult;
      }

      return c.json({ user });
    } catch (error) {
      return handleGoogleOAuthError(c, error);
    }
  });

  routes.get('/apple/start', (c) => {
    try {
      const config = readAppleOAuthConfig(c.env, c.req.url);
      const state = createAppleOAuthState();
      const nonce = createAppleOAuthNonce();

      setAppleStateCookie(c, state, nonce);

      return c.redirect(buildAppleAuthorizationUrl(config, state, nonce), 302);
    } catch (error) {
      return handleAppleOAuthError(c, error);
    }
  });

  routes.post('/apple/callback', async (c) => {
    const body = await c.req.parseBody();
    const returnedState = readStringFormField(body['state']);
    const code = readStringFormField(body['code']);
    const displayName = readAppleCallbackDisplayName(readStringFormField(body['user']));

    if (!isValidOAuthRandom(returnedState)) {
      return redirectAppleCallbackError(c, 'apple_state_invalid');
    }

    const stateCookieName = getAppleOAuthStateCookieName(returnedState);
    const expectedNonce = getCookie(c, stateCookieName);

    deleteCookie(c, stateCookieName, {
      path: '/api/auth/apple',
      secure: true,
      sameSite: 'None',
    });

    if (!isValidOAuthRandom(expectedNonce)) {
      return redirectAppleCallbackError(c, 'apple_state_invalid');
    }

    if (!code) {
      return redirectAppleCallbackError(c, 'apple_code_missing');
    }

    try {
      const config = readAppleOAuthConfig(c.env, c.req.url);
      const idToken = await dependencies.exchangeAppleAuthorizationCode(code, config);
      const verifiedProfile = await dependencies.verifyAppleIdToken(
        idToken,
        config.clientId,
        expectedNonce,
      );
      const profile = {
        ...verifiedProfile,
        displayName: displayName ?? verifiedProfile.displayName,
      };
      const user = await dependencies.findOrCreateAppleUser(c.env.DB, profile);
      const sessionResult = await issueSession(c, user);

      if (sessionResult) {
        return redirectAppleCallbackError(
          c,
          user.status === 'active'
            ? productionSafeAuthErrorCode(c.env, 'session_unavailable')
            : 'user_not_active',
        );
      }

      return c.redirect(new URL('/dashboard', config.appBaseUrl).toString(), 302);
    } catch (error) {
      return handleAppleOAuthCallbackError(c, error);
    }
  });

  routes.post('/apple', async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const parsed = appleAuthSchema.safeParse(body);

    if (!parsed.success) {
      return errorResponse(
        c,
        422,
        'VALIDATION_ERROR',
        'Apple credential is invalid.',
        parsed.error.flatten(),
      );
    }

    try {
      const config = readAppleOAuthConfig(c.env, c.req.url);
      const profile = await dependencies.verifyAppleIdToken(
        parsed.data.identityToken,
        config.clientId,
      );
      const user = await dependencies.findOrCreateAppleUser(c.env.DB, profile);
      const sessionResult = await issueSession(c, user);

      if (sessionResult) {
        return sessionResult;
      }

      return c.json({ user });
    } catch (error) {
      return handleAppleOAuthError(c, error);
    }
  });

  routes.get('/me', requireAuth, (c) => {
    return c.json({ user: c.get('currentUser') });
  });

  routes.post('/logout', (c) => {
    clearSessionCookie(c);

    return c.json({ ok: true });
  });

  return routes;
}

export const authRoutes = createAuthRoutes();

function clearSessionCookie(c: AuthContext): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });
}

function setGoogleStateCookie(c: AuthContext, state: string): void {
  setCookie(c, getGoogleOAuthStateCookieName(state), state, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth/google',
    secure: true,
    sameSite: 'Lax',
  });
}

function setAppleStateCookie(c: AuthContext, state: string, nonce: string): void {
  setCookie(c, getAppleOAuthStateCookieName(state), nonce, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth/apple',
    secure: true,
    sameSite: 'None',
  });
}

function isValidOAuthRandom(value: string | undefined): value is string {
  return typeof value === 'string' && OAUTH_RANDOM_PATTERN.test(value);
}

function readStringFormField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readAppleCallbackDisplayName(userPayload: string | undefined): string | undefined {
  if (!userPayload) {
    return undefined;
  }

  try {
    const value: unknown = JSON.parse(userPayload);

    if (!isRecord(value)) {
      return undefined;
    }

    const name = value['name'];

    if (!isRecord(name)) {
      return undefined;
    }

    const firstName = readTrimmedString(name['firstName']);
    const lastName = readTrimmedString(name['lastName']);
    const displayName = [firstName, lastName].filter(Boolean).join(' ');

    return displayName || undefined;
  } catch {
    return undefined;
  }
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

async function issueSession(c: AuthContext, user: SessionUser): Promise<Response | null> {
  if (!c.env.SESSION_SECRET) {
    return configurationErrorResponse(c, SESSION_SECRET_CONFIGURATION_ERROR);
  }

  if (user.status !== 'active') {
    clearSessionCookie(c);
    return errorResponse(c, 403, 'FORBIDDEN', 'User is not active.');
  }

  const sessionToken = await createSessionToken(user, c.env.SESSION_SECRET);

  setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });

  return null;
}

function handleGoogleOAuthError(c: AuthContext, error: unknown): Response {
  if (error instanceof GoogleOAuthConfigurationError) {
    return configurationErrorResponse(c, error);
  }

  if (error instanceof GoogleOAuthVerificationError) {
    return errorResponse(c, 401, 'OAUTH_VERIFICATION_FAILED', error.message);
  }

  throw error;
}

function handleGoogleOAuthCallbackError(c: AuthContext, error: unknown): Response {
  if (error instanceof GoogleOAuthConfigurationError) {
    logConfigurationError(error);
    return redirectGoogleCallbackError(
      c,
      productionSafeAuthErrorCode(c.env, 'google_oauth_not_configured'),
    );
  }

  if (error instanceof GoogleOAuthVerificationError) {
    return redirectGoogleCallbackError(c, 'google_verification_failed');
  }

  return redirectGoogleCallbackError(c, 'google_callback_failed');
}

function handleAppleOAuthError(c: AuthContext, error: unknown): Response {
  if (error instanceof AppleOAuthConfigurationError) {
    return configurationErrorResponse(c, error);
  }

  if (error instanceof AppleOAuthVerificationError) {
    return errorResponse(c, 401, 'OAUTH_VERIFICATION_FAILED', error.message);
  }

  throw error;
}

function handleAppleOAuthCallbackError(c: AuthContext, error: unknown): Response {
  if (error instanceof AppleOAuthConfigurationError) {
    logConfigurationError(error);
    return redirectAppleCallbackError(
      c,
      productionSafeAuthErrorCode(c.env, 'apple_oauth_not_configured'),
    );
  }

  if (error instanceof AppleOAuthVerificationError) {
    return redirectAppleCallbackError(c, 'apple_verification_failed');
  }

  logWorkerError('Apple OAuth callback failed', error);
  return redirectAppleCallbackError(c, 'apple_callback_failed');
}

function redirectGoogleCallbackError(c: AuthContext, errorCode: string): Response {
  return redirectAuthCallbackError(c, errorCode);
}

function redirectAppleCallbackError(c: AuthContext, errorCode: string): Response {
  return redirectAuthCallbackError(c, errorCode);
}

function redirectAuthCallbackError(c: AuthContext, errorCode: string): Response {
  const redirectUrl = new URL('/', c.env.APP_BASE_URL ?? new URL(c.req.url).origin);
  redirectUrl.searchParams.set('auth_error', errorCode);

  return c.redirect(redirectUrl.toString(), 302);
}
