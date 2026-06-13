import assert from 'node:assert/strict';
import test from 'node:test';

import { SignJWT } from 'jose';

import { notImplemented } from '../src/http/error-response';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../src/services/auth.service';

const SESSION_SECRET = 'test-session-secret-at-least-long-enough';
const encoder = new TextEncoder();

test('verifySessionToken rejects missing credentials and invalid tokens', async () => {
  assert.equal(await verifySessionToken(undefined, SESSION_SECRET), null);
  assert.equal(await verifySessionToken('token', ''), null);
  assert.equal(await verifySessionToken('not-a-jwt', SESSION_SECRET), null);
});

test('verifySessionToken defaults missing status to active', async () => {
  const token = await signClaims({
    userId: 'usr_1',
    role: 'member',
    email: 'member@example.com',
    name: 'Member',
  });

  assert.deepEqual(await verifySessionToken(token, SESSION_SECRET), {
    id: 'usr_1',
    email: 'member@example.com',
    displayName: 'Member',
    avatarUrl: null,
    role: 'member',
    status: 'active',
  });
});

test('verifySessionToken uses email or user ID as display-name fallback', async () => {
  const emailFallback = await signClaims({
    userId: 'usr_email',
    role: 'member',
    email: 'member@example.com',
  });
  const idFallback = await signClaims({
    userId: 'usr_id',
    role: 'member',
  });

  assert.equal(
    (await verifySessionToken(emailFallback, SESSION_SECRET))?.displayName,
    'member@example.com',
  );
  assert.equal((await verifySessionToken(idFallback, SESSION_SECRET))?.displayName, 'usr_id');
});

test('verifySessionToken rejects malformed session claims', async () => {
  await assertInvalidClaims({ role: 'member' });
  await assertInvalidClaims({ userId: 'usr_1', role: 'owner' });
  await assertInvalidClaims({ userId: 'usr_1', role: 'member', email: 123 });
  await assertInvalidClaims({ userId: 'usr_1', role: 'member', name: 123 });
  await assertInvalidClaims({ userId: 'usr_1', role: 'member', avatarUrl: 123 });
  await assertInvalidClaims({ userId: 'usr_1', role: 'member', status: 'archived' });
});

test('notImplemented returns the standard 501 API error', async () => {
  const response = notImplemented(
    {
      json: (body: unknown, status: number) => Response.json(body, { status }),
    } as Parameters<typeof notImplemented>[0],
    'Feature is not implemented yet.',
  );

  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Feature is not implemented yet.',
      details: {},
    },
  });
});

async function assertInvalidClaims(claims: Record<string, unknown>): Promise<void> {
  const token = await signClaims(claims);

  assert.equal(await verifySessionToken(token, SESSION_SECRET), null);
}

async function signClaims(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(encoder.encode(SESSION_SECRET));
}

test('session cookie name remains stable', () => {
  assert.equal(SESSION_COOKIE_NAME, 'labsplit_session');
});
