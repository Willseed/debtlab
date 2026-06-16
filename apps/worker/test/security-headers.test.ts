import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { Hono } from 'hono';

import { SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE } from '../src/http/configuration-error-response';
import app from '../src/index';
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  securityHeaders,
} from '../src/middleware/security-headers';
import { AppBindings } from '../src/types';
import {
  assertNoInternalConfigurationLeak,
  captureConsoleError,
} from './configuration-error-test-helpers';

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
  assertProductionCspInvariants('worker middleware', CONTENT_SECURITY_POLICY);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Vary') ?? '', /Cookie/u);
});

test('Cloudflare Pages _headers matches Worker security header sources', () => {
  const headers = readCloudflarePagesHeaders();

  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(headers['Content-Security-Policy'], CONTENT_SECURITY_POLICY);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], PERMISSIONS_POLICY);
  assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin');
  assertProductionCspInvariants(
    'Cloudflare Pages _headers',
    headers['Content-Security-Policy'] ?? '',
  );
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
  assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
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
  const { result: response, output } = await captureConsoleError(() =>
    Promise.resolve(app.request('/', undefined, createTestEnv())),
  );

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Static asset binding is not configured.',
      details: {},
    },
  });
  assert.match(output, /Static asset binding is not configured\./u);
});

test('index hides missing static asset binding details in production', async () => {
  const { result: response, output } = await captureConsoleError(() =>
    Promise.resolve(
      app.request('/', undefined, {
        ...createTestEnv(),
        ENVIRONMENT: 'production',
      }),
    ),
  );
  const bodyText = await response.clone().text();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INTERNAL_ERROR',
      message: SERVICE_TEMPORARILY_UNAVAILABLE_MESSAGE,
      details: {},
    },
  });
  assertNoInternalConfigurationLeak(bodyText);
  assert.match(output, /Static asset binding is not configured\./u);
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

function readCloudflarePagesHeaders(): Record<string, string> {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const headersPath = resolve(currentDirectory, '../../web/src/_headers');
  const headers: Record<string, string> = {};

  for (const line of readFileSync(headersPath, 'utf8').split(/\r?\n/u)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith('#') || trimmedLine === '/*') {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    headers[trimmedLine.slice(0, separatorIndex)] = trimmedLine.slice(separatorIndex + 1).trim();
  }

  return headers;
}

function assertProductionCspInvariants(label: string, policy: string): void {
  assert.notEqual(policy, '', `${label} CSP must be present`);

  const directives = parseCsp(policy);
  const executableSourceDirectiveNames = ['script-src', 'style-src'] as const;

  for (const [directiveName, sources] of directives.entries()) {
    for (const source of sources) {
      assert.notEqual(source, "'unsafe-inline'", `${label} must not allow inline sources`);
      assert.notEqual(source, "'unsafe-eval'", `${label} must not allow eval sources`);
      assert.notEqual(source, '*', `${label} must not allow wildcard sources`);
      assert.notEqual(source, 'http:', `${label} must not allow broad HTTP scheme sources`);
      assert.notEqual(source, 'https:', `${label} must not allow broad HTTPS scheme sources`);
      assert.doesNotMatch(source, /^https?:\/\/\*\./u, `${label} must not allow host wildcards`);

      if (source === 'data:') {
        assert.equal(directiveName, 'img-src', `${label} must only allow data: for images`);
      }
    }
  }

  for (const directiveName of executableSourceDirectiveNames) {
    const sources = directives.get(directiveName) ?? [];

    assert.ok(sources.length > 0, `${label} must define ${directiveName}`);
    assert.ok(!sources.includes('data:'), `${label} ${directiveName} must not allow data:`);
    assert.ok(!sources.includes('blob:'), `${label} ${directiveName} must not allow blob:`);
    assert.ok(
      !sources.includes('filesystem:'),
      `${label} ${directiveName} must not allow filesystem:`,
    );
  }
}

function parseCsp(policy: string): Map<string, readonly string[]> {
  const directives = new Map<string, readonly string[]>();

  for (const directive of policy.split(';')) {
    const parts = directive.trim().split(/\s+/u);
    const [name, ...sources] = parts;

    if (name !== undefined && name.length > 0) {
      directives.set(name, sources);
    }
  }

  return directives;
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
