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
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
  GoogleOAuthConfigurationError,
  GoogleOAuthVerificationError,
  readGoogleOAuthConfig,
  verifyGoogleIdToken,
} from '../services/google-oauth.service';
import { findOrCreateGoogleUser } from '../services/user.service';
import { AppBindings, SessionUser } from '../types';
import { googleAuthSchema } from '../validation/schemas';

export const authRoutes = new Hono<AppBindings>();

const OAUTH_STATE_TTL_SECONDS = 600;

authRoutes.get('/google/start', (c) => {
  try {
    const config = readGoogleOAuthConfig(c.env, c.req.url);
    const state = createGoogleOAuthState();

    setGoogleStateCookie(c, state);

    return c.redirect(buildGoogleAuthorizationUrl(config, state), 302);
  } catch (error) {
    return handleGoogleOAuthError(c, error);
  }
});

authRoutes.get('/google/callback', async (c) => {
  const expectedState = getCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME);
  const returnedState = c.req.query('state');
  const code = c.req.query('code');

  deleteCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME, {
    path: '/api/auth/google',
    secure: true,
    sameSite: 'Lax',
  });

  if (!expectedState || !returnedState || returnedState !== expectedState) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Google OAuth state is invalid.');
  }

  if (!code) {
    return errorResponse(c, 422, 'VALIDATION_ERROR', 'Google authorization code is missing.');
  }

  try {
    const config = readGoogleOAuthConfig(c.env, c.req.url);
    const idToken = await exchangeGoogleAuthorizationCode(code, config);
    const profile = await verifyGoogleIdToken(idToken, config.clientId);
    const user = await findOrCreateGoogleUser(c.env.DB, profile);
    const sessionResult = await issueSession(c, user);

    if (sessionResult) {
      return sessionResult;
    }

    return c.redirect(new URL('/dashboard', config.appBaseUrl).toString(), 302);
  } catch (error) {
    return handleGoogleOAuthError(c, error);
  }
});

authRoutes.post('/google', async (c) => {
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
    const profile = await verifyGoogleIdToken(parsed.data.credential, config.clientId);
    const user = await findOrCreateGoogleUser(c.env.DB, profile);
    const sessionResult = await issueSession(c, user);

    if (sessionResult) {
      return sessionResult;
    }

    return c.json({ user });
  } catch (error) {
    return handleGoogleOAuthError(c, error);
  }
});

authRoutes.post('/apple', (c) => {
  return errorResponse(c, 403, 'FORBIDDEN', 'Sign in with Apple is temporarily disabled.');
});

authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ user: c.get('currentUser') });
});

authRoutes.post('/logout', (c) => {
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: '/',
    secure: true,
    sameSite: 'Lax',
  });

  return c.json({ ok: true });
});

function setGoogleStateCookie(c: Parameters<typeof setCookie>[0], state: string): void {
  setCookie(c, GOOGLE_OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: '/api/auth/google',
    secure: true,
    sameSite: 'Lax',
  });
}

async function issueSession(
  c: Parameters<typeof setCookie>[0],
  user: SessionUser,
): Promise<Response | null> {
  if (!c.env.SESSION_SECRET) {
    return errorResponse(c, 500, 'INTERNAL_ERROR', 'Session secret is not configured.');
  }

  if (user.status !== 'active') {
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
