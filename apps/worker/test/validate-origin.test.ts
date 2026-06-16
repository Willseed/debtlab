import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { AppBindings } from '../src/types';

test('validateOrigin answers allowed API preflight requests', async () => {
  const app = createOriginApp();
  const response = await app.request(
    '/api/ping',
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://lab.buy2330.cc',
        'Access-Control-Request-Headers': 'Content-Type, X-Test-Header',
        'Access-Control-Request-Method': 'POST',
      },
    },
    createEnv(),
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://lab.buy2330.cc');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.match(response.headers.get('Access-Control-Allow-Methods') ?? '', /POST/u);
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type, X-Test-Header');
});

test('validateOrigin rejects disallowed API preflight requests', async () => {
  const app = createOriginApp();
  const response = await app.request(
    '/api/ping',
    {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    },
    createEnv(),
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('validateOrigin attaches CORS headers to allowed actual API responses', async () => {
  const app = createOriginApp();
  const response = await app.request(
    '/api/ping',
    {
      headers: {
        Origin: 'https://lab.buy2330.cc',
      },
    },
    createEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://lab.buy2330.cc');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.match(response.headers.get('Vary') ?? '', /Origin/u);
});

test('validateOrigin keeps mutation origin checks for unsafe methods', async () => {
  const app = createOriginApp();
  const response = await app.request(
    '/api/ping',
    {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
      },
    },
    createEnv(),
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

function createOriginApp(): Hono<AppBindings> {
  const app = new Hono<AppBindings>();
  app.use('/api/*', validateOrigin);
  app.get('/api/ping', (c) => c.json({ ok: true }));
  app.post('/api/ping', (c) => c.json({ ok: true }));
  return app;
}

function createEnv(): AppBindings['Bindings'] {
  return {
    DB: createUnusedD1(),
    SESSION_SECRET: 'test-session-secret-at-least-long-enough',
    APP_BASE_URL: 'https://lab.buy2330.cc',
  };
}

function createUnusedD1(): D1Database {
  return {
    prepare: () => {
      throw new Error('D1 should not be used by validateOrigin tests.');
    },
  } as unknown as D1Database;
}
