import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { Hono } from 'hono';

import { errorResponse } from '../http/error-response';
import { requireAuth } from '../middleware/require-auth';
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
import { findOrCreateGoogleUser } from '../services/user.service';
import { AppBindings, SessionUser } from '../types';
import { googleAuthSchema } from '../validation/schemas';

const OAUTH_STATE_TTL_SECONDS = 600;
const GOOGLE_OAUTH_STATE_PATTERN = /^[0-9a-f]{64}$/u;

type GoogleAuthDependencies = {
  readonly exchangeGoogleAuthorizationCode: typeof exchangeGoogleAuthorizationCode;
  readonly findOrCreateGoogleUser: typeof findOrCreateGoogleUser;
  readonly verifyGoogleIdToken: typeof verifyGoogleIdToken;
};

const defaultGoogleAuthDependencies: GoogleAuthDependencies = {
  exchangeGoogleAuthorizationCode,
  findOrCreateGoogleUser,
  verifyGoogleIdToken,
};

export function createAuthRoutes(
  dependencies: GoogleAuthDependencies = defaultGoogleAuthDependencies,
): Hono<AppBindings> {
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

    if (!isValidGoogleOAuthState(returnedState)) {
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
          user.status === 'active' ? 'session_unavailable' : 'user_not_active',
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
      const profile = await dependencies.verifyGoogleIdToken(parsed.data.credential, config.clientId);
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

  routes.post('/apple', (c) => {
    return errorResponse(c, 403, 'FORBIDDEN', 'Sign in with Apple is temporarily disabled.');
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

function clearSessionCookie(c: Parameters<typeof deleteCookie>[0]): void {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });
}

function setGoogleStateCookie(c: Parameters<typeof setCookie>[0], state: string): void {
  setCookie(c, getGoogleOAuthStateCookieName(state), state, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth/google',
    secure: true,
    sameSite: 'Lax',
  });
}

function isValidGoogleOAuthState(state: string | undefined): state is string {
  return typeof state === 'string' && GOOGLE_OAUTH_STATE_PATTERN.test(state);
}

async function issueSession(
  c: Parameters<typeof setCookie>[0],
  user: SessionUser,
): Promise<Response | null> {
  if (!c.env.SESSION_SECRET) {
    return errorResponse(c, 500, 'INTERNAL_ERROR', 'Session secret is not configured.');
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

function handleGoogleOAuthError(c: Parameters<typeof setCookie>[0], error: unknown): Response {
  if (error instanceof GoogleOAuthConfigurationError) {
    return errorResponse(c, 500, 'INTERNAL_ERROR', error.message);
  }

  if (error instanceof GoogleOAuthVerificationError) {
    return errorResponse(c, 401, 'OAUTH_VERIFICATION_FAILED', error.message);
  }

  throw error;
}

function handleGoogleOAuthCallbackError(
  c: Parameters<typeof setCookie>[0],
  error: unknown,
): Response {
  if (error instanceof GoogleOAuthConfigurationError) {
    return redirectGoogleCallbackError(c, 'google_oauth_not_configured');
  }

  if (error instanceof GoogleOAuthVerificationError) {
    return redirectGoogleCallbackError(c, 'google_verification_failed');
  }

  return redirectGoogleCallbackError(c, 'google_callback_failed');
}

function redirectGoogleCallbackError(
  c: Parameters<typeof setCookie>[0],
  errorCode: string,
): Response {
  const redirectUrl = new URL('/', c.env.APP_BASE_URL ?? new URL(c.req.url).origin);
  redirectUrl.searchParams.set('auth_error', errorCode);

  return c.redirect(redirectUrl.toString(), 302);
}
