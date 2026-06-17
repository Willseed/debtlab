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
  buildPageCsp,
  generateCspNonce,
  injectCspNonce,
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

test('Worker assets run worker first so SPA HTML receives CSP nonces', () => {
  assert.match(readWorkerWranglerConfig(), /run_worker_first\s*=\s*true/u);
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
  assert.equal(
    response.headers.get('Strict-Transport-Security'),
    'max-age=31536000; includeSubDomains',
  );
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');

  const csp = response.headers.get('Content-Security-Policy') ?? '';
  assertDirectiveHasNonce(csp, 'style-src');
  assertDirectiveHasNonce(csp, 'script-src');
  assert.doesNotMatch(csp, /'unsafe-inline'/u);
  assertProductionCspInvariants('HTML page', csp);
});

test('index injects ngCspNonce attribute into app-root for HTML assets', async () => {
  const response = await app.request('/', undefined, {
    ...createTestEnv(),
    ASSETS: createStaticAssetsWithAppRoot(),
  });

  const html = await response.text();
  assert.match(html, /ngCspNonce="[A-Za-z0-9+/=]+"/u);
});

test('index injects nonce attribute into script tags for HTML assets', async () => {
  const response = await app.request('/', undefined, {
    ...createTestEnv(),
    ASSETS: createStaticAssetsWithAppRoot(),
  });

  const html = await response.text();
  assert.match(html, /<script nonce="[A-Za-z0-9+/=]+" /u);
});

test('index nonce in HTML body matches nonce in CSP header', async () => {
  const response = await app.request('/', undefined, {
    ...createTestEnv(),
    ASSETS: createStaticAssetsWithAppRoot(),
  });

  const html = await response.text();
  const nonceMatch = html.match(/ngCspNonce="([A-Za-z0-9+/=]+)"/u);
  assert.ok(nonceMatch, 'ngCspNonce attribute must be present in HTML');
  const nonce = nonceMatch[1];
  const csp = response.headers.get('Content-Security-Policy') ?? '';
  assertDirectiveHasNonce(csp, 'style-src', nonce);
  assertDirectiveHasNonce(csp, 'script-src', nonce);
});

test('index generates different nonces for successive HTML requests', async () => {
  const env = { ...createTestEnv(), ASSETS: createStaticAssets() };
  const [r1, r2] = await Promise.all([
    app.request('/', undefined, env),
    app.request('/', undefined, env),
  ]);

  const csp1 = r1.headers.get('Content-Security-Policy') ?? '';
  const csp2 = r2.headers.get('Content-Security-Policy') ?? '';
  const nonceMatch1 = csp1.match(/'nonce-([A-Za-z0-9+/=]+)'/u);
  const nonceMatch2 = csp2.match(/'nonce-([A-Za-z0-9+/=]+)'/u);
  assert.ok(nonceMatch1, 'first response must have a nonce');
  assert.ok(nonceMatch2, 'second response must have a nonce');
  assert.notEqual(nonceMatch1[1], nonceMatch2[1], 'nonces must differ per request');
});

test('index does not modify non-HTML assets (no nonce in CSP)', async () => {
  const response = await app.request('/styles.css', undefined, {
    ...createTestEnv(),
    ASSETS: createStaticCssAssets(),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Security-Policy'), CONTENT_SECURITY_POLICY);
});

test('buildPageCsp adds nonce to script-src and style-src', () => {
  const nonce = 'test-nonce-value';
  const csp = buildPageCsp(nonce);

  assert.match(csp, /script-src[^;]*'nonce-test-nonce-value'/u);
  assert.match(csp, /style-src[^;]*'nonce-test-nonce-value'/u);
  assert.doesNotMatch(csp, /'unsafe-inline'/u);
  assertProductionCspInvariants('buildPageCsp', csp);
});

test('buildPageCsp preserves all required CSP origins', () => {
  const csp = buildPageCsp('any-nonce');

  assert.match(csp, /accounts\.google\.com/u);
  assert.match(csp, /appleid\.apple\.com/u);
  assert.match(csp, /cloudflareinsights\.com/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /upgrade-insecure-requests/u);
});

test('generateCspNonce returns a valid base64 string with 128 bits of entropy', () => {
  const nonce = generateCspNonce();
  assert.match(nonce, /^[A-Za-z0-9+/=]{24}$/u);
});

test('generateCspNonce returns unique values on repeated calls', () => {
  const nonces = new Set(Array.from({ length: 20 }, () => generateCspNonce()));
  assert.equal(nonces.size, 20, 'all generated nonces must be unique');
});

test('injectCspNonce adds ngCspNonce to app-root', () => {
  const html = '<html><body><app-root></app-root></body></html>';
  const result = injectCspNonce(html, 'abc123');
  assert.match(result, /<app-root ngCspNonce="abc123">/u);
});

test('injectCspNonce adds nonce to script tags', () => {
  const html = '<html><body><script src="main.js" type="module"></script></body></html>';
  const result = injectCspNonce(html, 'abc123');
  assert.match(result, /<script nonce="abc123" src="main.js"/u);
});

test('injectCspNonce handles app-root with existing attributes', () => {
  const html = '<app-root class="themed"></app-root>';
  const result = injectCspNonce(html, 'abc123');
  assert.match(result, /<app-root class="themed" ngCspNonce="abc123">/u);
});

test('PERMISSIONS_POLICY does not include ambient-light-sensor', () => {
  assert.doesNotMatch(PERMISSIONS_POLICY, /ambient-light-sensor/u);
});

test('PERMISSIONS_POLICY includes core privacy-sensitive features restricted', () => {
  assert.match(PERMISSIONS_POLICY, /camera=\(\)/u);
  assert.match(PERMISSIONS_POLICY, /geolocation=\(\)/u);
  assert.match(PERMISSIONS_POLICY, /microphone=\(\)/u);
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

function readWorkerWranglerConfig(): string {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const wranglerPath = resolve(currentDirectory, '../wrangler.toml');

  return readFileSync(wranglerPath, 'utf8');
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

function assertDirectiveHasNonce(
  policy: string,
  directiveName: string,
  expectedNonce?: string,
): void {
  const sources = parseCsp(policy).get(directiveName) ?? [];
  const noncePattern = expectedNonce
    ? new RegExp(`^'nonce-${escapeRegExp(expectedNonce)}'$`, 'u')
    : /^'nonce-[A-Za-z0-9+/=]+'$/u;

  assert.ok(
    sources.some((source) => noncePattern.test(source)),
    `${directiveName} must include the expected nonce source`,
  );
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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

function createStaticAssetsWithAppRoot(): NonNullable<AppBindings['Bindings']['ASSETS']> {
  return {
    fetch: async () =>
      new Response(
        '<!doctype html><html><body><app-root></app-root>' +
          '<script src="main.js" type="module"></script></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      ),
  };
}

function createStaticCssAssets(): NonNullable<AppBindings['Bindings']['ASSETS']> {
  return {
    fetch: async () =>
      new Response('body { margin: 0; }', {
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
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
