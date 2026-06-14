import { jwtVerify, SignJWT } from 'jose';

import { SessionUser, UserRole, UserStatus } from '../types';

export const SESSION_COOKIE_NAME = 'labsplit_session';
export const SESSION_TTL_SECONDS = 86_400;

type SessionClaims = {
  readonly userId: string;
  readonly role: UserRole;
  readonly email?: string;
  readonly name?: string;
  readonly avatarUrl?: string | null;
  readonly status?: UserStatus;
};

const textEncoder = new TextEncoder();

export async function createSessionToken(user: SessionUser, secret: string): Promise<string> {
  return new SignJWT({
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.displayName,
    avatarUrl: user.avatarUrl,
    status: user.status,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(textEncoder.encode(secret));
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionUser | null> {
  if (!token || !secret) {
    return null;
  }

  try {
    const result = await jwtVerify(token, textEncoder.encode(secret));
    const claims = readSessionClaims(result.payload);

    if (!claims) {
      return null;
    }

    return {
      id: claims.userId,
      email: claims.email,
      displayName: claims.name ?? claims.email ?? claims.userId,
      avatarUrl: claims.avatarUrl,
      role: claims.role,
      status: claims.status ?? 'active',
    };
  } catch {
    return null;
  }
}

function readSessionClaims(payload: Readonly<Record<string, unknown>>): SessionClaims | null {
  const userId = payload['userId'];
  const role = payload['role'];
  const email = payload['email'];
  const name = payload['name'];
  const avatarUrl = payload['avatarUrl'];
  const status = payload['status'];

  if (typeof userId !== 'string' || !isUserRole(role)) {
    return null;
  }

  if (email !== undefined && typeof email !== 'string') {
    return null;
  }

  if (name !== undefined && typeof name !== 'string') {
    return null;
  }

  if (avatarUrl !== undefined && avatarUrl !== null && typeof avatarUrl !== 'string') {
    return null;
  }

  if (status !== undefined && !isUserStatus(status)) {
    return null;
  }

  return {
    userId,
    role,
    email,
    name,
    avatarUrl: avatarUrl ?? null,
    status,
  };
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'member' || value === 'admin';
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === 'active' || value === 'disabled' || value === 'pending';
}
