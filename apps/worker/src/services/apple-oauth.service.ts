import { createRemoteJWKSet, importPKCS8, jwtVerify, JWTPayload, SignJWT } from 'jose';
import { z } from 'zod';

import { Env } from '../types';

export const APPLE_OAUTH_STATE_COOKIE_PREFIX = 'labsplit_apple_oauth_state_';

const APPLE_AUTHORIZATION_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_CLIENT_SECRET_AUDIENCE = 'https://appleid.apple.com';
const APPLE_CLIENT_SECRET_TTL_SECONDS = 300;
const STATE_BYTE_LENGTH = 32;
type AppleJwtVerifier = (
  idToken: string,
  keySet: typeof APPLE_JWKS,
  options: {
    readonly audience: string;
    readonly issuer: string;
  },
) => Promise<{ readonly payload: JWTPayload }>;

const appleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
});

const appleIdTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  exp: z.number().int().positive(),
  email: z.string().email().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
});

export type AppleOAuthConfig = {
  readonly teamId: string;
  readonly clientId: string;
  readonly keyId: string;
  readonly privateKey: string;
  readonly appBaseUrl: string;
};

export type AppleUserProfile = {
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
};

export class AppleOAuthConfigurationError extends Error {}

export class AppleOAuthVerificationError extends Error {}

export function readAppleOAuthConfig(env: Env, requestUrl: string): AppleOAuthConfig {
  if (!env.APPLE_TEAM_ID || !env.APPLE_CLIENT_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) {
    throw new AppleOAuthConfigurationError('Apple OAuth is not configured.');
  }

  return {
    teamId: env.APPLE_TEAM_ID,
    clientId: env.APPLE_CLIENT_ID,
    keyId: env.APPLE_KEY_ID,
    privateKey: normalizeApplePrivateKey(env.APPLE_PRIVATE_KEY),
    appBaseUrl: env.APP_BASE_URL ?? new URL(requestUrl).origin,
  };
}

export function createAppleOAuthState(): string {
  return createRandomHexString();
}

export function createAppleOAuthNonce(): string {
  return createRandomHexString();
}

export function getAppleOAuthStateCookieName(state: string): string {
  return `${APPLE_OAUTH_STATE_COOKIE_PREFIX}${state}`;
}

export function buildAppleAuthorizationUrl(
  config: AppleOAuthConfig,
  state: string,
  nonce: string,
): string {
  const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', buildAppleRedirectUri(config.appBaseUrl));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('scope', 'name email');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);

  return url.toString();
}

export async function exchangeAppleAuthorizationCode(
  code: string,
  config: AppleOAuthConfig,
  tokenFetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await tokenFetcher(APPLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: await createAppleClientSecret(config),
      code,
      grant_type: 'authorization_code',
      redirect_uri: buildAppleRedirectUri(config.appBaseUrl),
    }),
  });

  if (!response.ok) {
    throw new AppleOAuthVerificationError('Apple authorization code exchange failed.');
  }

  const parsed = appleTokenResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new AppleOAuthVerificationError('Apple token response is invalid.');
  }

  return parsed.data.id_token;
}

export async function verifyAppleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce?: string,
  verifier: AppleJwtVerifier = verifyAppleJwt,
): Promise<AppleUserProfile> {
  let result: { readonly payload: JWTPayload };

  try {
    result = await verifier(idToken, APPLE_JWKS, {
      audience: clientId,
      issuer: APPLE_ISSUER,
    });
  } catch (error) {
    if (error instanceof AppleOAuthVerificationError) {
      throw error;
    }

    throw new AppleOAuthVerificationError('Apple ID token verification failed.');
  }

  if (expectedNonce !== undefined && result.payload['nonce'] !== expectedNonce) {
    throw new AppleOAuthVerificationError('Apple ID token nonce is invalid.');
  }

  return readAppleUserProfile(result.payload);
}

export async function createAppleClientSecret(config: AppleOAuthConfig): Promise<string> {
  try {
    const privateKey = await importPKCS8(config.privateKey, 'ES256');

    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setAudience(APPLE_CLIENT_SECRET_AUDIENCE)
      .setSubject(config.clientId)
      .setIssuedAt()
      .setExpirationTime(`${APPLE_CLIENT_SECRET_TTL_SECONDS}s`)
      .sign(privateKey);
  } catch {
    throw new AppleOAuthConfigurationError('Apple private key is invalid.');
  }
}

/* c8 ignore start -- network-backed jose JWKS verification is exercised through dependency injection in tests. */
async function verifyAppleJwt(
  idToken: string,
  keySet: typeof APPLE_JWKS,
  options: {
    readonly audience: string;
    readonly issuer: string;
  },
): Promise<{ readonly payload: JWTPayload }> {
  return jwtVerify(idToken, keySet, {
    audience: options.audience,
    issuer: options.issuer,
  });
}
/* c8 ignore stop */

export function readAppleUserProfile(payload: JWTPayload): AppleUserProfile {
  const parsed = appleIdTokenPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new AppleOAuthVerificationError('Apple ID token payload is invalid.');
  }

  if (parsed.data.exp <= Math.floor(Date.now() / 1000)) {
    throw new AppleOAuthVerificationError('Apple ID token has expired.');
  }

  const isEmailVerified =
    parsed.data.email_verified === true || parsed.data.email_verified === 'true';

  return {
    subject: parsed.data.sub,
    email: isEmailVerified ? parsed.data.email : undefined,
  };
}

export function buildAppleRedirectUri(appBaseUrl: string): string {
  return new URL('/api/auth/apple/callback', appBaseUrl).toString();
}

function createRandomHexString(): string {
  const bytes = new Uint8Array(STATE_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeApplePrivateKey(privateKey: string): string {
  return privateKey.trim().replaceAll(String.raw`\n`, '\n');
}
