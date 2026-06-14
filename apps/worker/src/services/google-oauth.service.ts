import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { z } from 'zod';

import { Env } from '../types';

export const GOOGLE_OAUTH_STATE_COOKIE_PREFIX = 'labsplit_google_oauth_state_';

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
const STATE_BYTE_LENGTH = 32;
type GoogleJwtVerifier = (
  idToken: string,
  keySet: typeof GOOGLE_JWKS,
  options: {
    readonly audience: string;
    readonly issuer: readonly string[];
  },
) => Promise<{ readonly payload: JWTPayload }>;

const googleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
});

const googleIdTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  name: z.string().min(1).optional(),
  picture: z.string().url().optional(),
});

export type GoogleOAuthConfig = {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly appBaseUrl: string;
};

export type GoogleUserProfile = {
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly avatarUrl?: string;
};

export class GoogleOAuthConfigurationError extends Error {}

export class GoogleOAuthVerificationError extends Error {}

export function readGoogleOAuthConfig(env: Env, requestUrl: string): GoogleOAuthConfig {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleOAuthConfigurationError('Google OAuth is not configured.');
  }

  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    appBaseUrl: env.APP_BASE_URL ?? new URL(requestUrl).origin,
  };
}

export function createGoogleOAuthState(): string {
  const bytes = new Uint8Array(STATE_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getGoogleOAuthStateCookieName(state: string): string {
  return `${GOOGLE_OAUTH_STATE_COOKIE_PREFIX}${state}`;
}

export function buildGoogleAuthorizationUrl(config: GoogleOAuthConfig, state: string): string {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', buildGoogleRedirectUri(config.appBaseUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);

  return url.toString();
}

export async function exchangeGoogleAuthorizationCode(
  code: string,
  config: GoogleOAuthConfig,
  tokenFetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await tokenFetcher(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: buildGoogleRedirectUri(config.appBaseUrl),
    }),
  });

  if (!response.ok) {
    throw new GoogleOAuthVerificationError('Google authorization code exchange failed.');
  }

  const parsed = googleTokenResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new GoogleOAuthVerificationError('Google token response is invalid.');
  }

  return parsed.data.id_token;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  verifier: GoogleJwtVerifier = verifyGoogleJwt,
): Promise<GoogleUserProfile> {
  let result: { readonly payload: JWTPayload };

  try {
    result = await verifier(idToken, GOOGLE_JWKS, {
      audience: clientId,
      issuer: GOOGLE_ISSUERS,
    });
  } catch (error) {
    if (error instanceof GoogleOAuthVerificationError) {
      throw error;
    }

    throw new GoogleOAuthVerificationError('Google ID token verification failed.');
  }

  return readGoogleUserProfile(result.payload);
}

/* c8 ignore next 12 -- network-backed jose JWKS verification is exercised through dependency injection in tests. */
async function verifyGoogleJwt(
  idToken: string,
  keySet: typeof GOOGLE_JWKS,
  options: {
    readonly audience: string;
    readonly issuer: readonly string[];
  },
): Promise<{ readonly payload: JWTPayload }> {
  return jwtVerify(idToken, keySet, {
    audience: options.audience,
    issuer: [...options.issuer],
  });
}

export function readGoogleUserProfile(payload: JWTPayload): GoogleUserProfile {
  const parsed = googleIdTokenPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new GoogleOAuthVerificationError('Google ID token payload is invalid.');
  }

  const isEmailVerified =
    parsed.data.email_verified === true || parsed.data.email_verified === 'true';

  return {
    subject: parsed.data.sub,
    email: isEmailVerified ? parsed.data.email : undefined,
    displayName: parsed.data.name,
    avatarUrl: parsed.data.picture,
  };
}

export function buildGoogleRedirectUri(appBaseUrl: string): string {
  return new URL('/api/auth/google/callback', appBaseUrl).toString();
}
