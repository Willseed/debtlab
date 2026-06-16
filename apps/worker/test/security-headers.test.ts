import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import app from '../src/index';
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  securityHeaders,
} from '../src/middleware/security-headers';
import { AppBindings } from '../src/types';

test('securityHeaders adds project security headers to API responses', async () => {
  const app = new Hono<AppBindings>();
  app.use('/api/*', securityHeaders);
  app.get('/api/ping', (c) => c.json({ ok: true }));

  const response = await app.request('/api/ping', undefined, createTestEnv());

  assert.equal(
    response.headers.get('Strict-Transport-Security'),
    'max-age=31536000; includeSubDomains',
  );
  assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('Permissions-Policy'), PERMISSIONS_POLICY);
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /accounts\.google\.com/u);
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /appleid\.apple\.com/u);
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /cloudflareinsights\.com/u);
});

test('securityHeaders preserves route-specific Content-Security-Policy values', async () => {
  const app = new Hono<AppBindings>();
  const routeCsp = "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
  app.use('/api/*', securityHeaders);
  app.get(
    '/api/html',
    () => new Response('<!doctype html>', { headers: { 'Content-Security-Policy': routeCsp } }),
  );

  const response = await app.request('/api/html', undefined, createTestEnv());

  assert.equal(response.headers.get('Content-Security-Policy'), routeCsp);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

test('index applies security headers to origin validation failures', async () => {
  const response = await app.request('/api/auth/logout', { method: 'POST' }, createTestEnv());

  assert.equal(response.status, 403);
  assert.equal(
    response.headers.get('Strict-Transport-Security'),
    'max-age=31536000; includeSubDomains',
  );
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

function createTestEnv(): AppBindings['Bindings'] {
  return {
    DB: createUnusedD1(),
    SESSION_SECRET: 'test-session-secret-at-least-long-enough',
  };
}

function createUnusedD1(): D1Database {
  return {
    prepare: () => {
      throw new Error('D1 should not be used by security header tests.');
    },
  } as unknown as D1Database;
}
