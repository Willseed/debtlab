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
  assert.doesNotMatch(response.headers.get('Content-Security-Policy') ?? '', /unsafe-inline/u);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Vary') ?? '', /Cookie/u);
});

test('securityHeaders preserves route-specific Content-Security-Policy values', async () => {
  const app = new Hono<AppBindings>();
  const routeCsp = "default-src 'none'; style-src 'nonce-route'; frame-ancestors 'none'";
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

test('index serves static assets with security headers outside /api', async () => {
  const response = await app.request('/', undefined, {
    ...createTestEnv(),
    ASSETS: createStaticAssets(),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(await response.text(), '<!doctype html><title>LabSplit</title>');
  assert.equal(
    response.headers.get('Strict-Transport-Security'),
    'max-age=31536000; includeSubDomains',
  );
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

test('index blocks production source map disclosure from static assets', async () => {
  const response = await app.request('/main.abc123.js.map', undefined, {
    ...createTestEnv(),
    ASSETS: createThrowingAssets(),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
      details: {},
    },
  });
});

test('index does not fall back API misses to static assets', async () => {
  const response = await app.request('/api/not-found', undefined, {
    ...createTestEnv(),
    ASSETS: createThrowingAssets(),
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
      details: {},
    },
  });
});

test('index rejects non-GET static route requests before assets', async () => {
  const response = await app.request(
    '/',
    {
      method: 'POST',
      headers: {
        Origin: 'https://lab.buy2330.cc',
      },
    },
    {
      ...createTestEnv(),
      ASSETS: createThrowingAssets(),
    },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
      details: {},
    },
  });
});

test('index reports missing static asset binding explicitly', async () => {
  const response = await app.request('/', undefined, createTestEnv());

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Static asset binding is not configured.',
      details: {},
    },
  });
});

test('index maps unexpected static asset failures to internal errors', async () => {
  const response = await app.request('/', undefined, {
    ...createTestEnv(),
    ASSETS: createThrowingAssets(),
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected server error.',
      details: {},
    },
  });
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

function createStaticAssets(): NonNullable<AppBindings['Bindings']['ASSETS']> {
  return {
    fetch: async () =>
      new Response('<!doctype html><title>LabSplit</title>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }),
  };
}

function createThrowingAssets(): NonNullable<AppBindings['Bindings']['ASSETS']> {
  return {
    fetch: () => {
      throw new Error('Static assets should not be requested.');
    },
  };
}
