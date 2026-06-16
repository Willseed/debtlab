import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import app from '../src/index';
import { healthRoutes } from '../src/routes/health';
import { AppBindings } from '../src/types';

const GARAGE_CTF_CONFIG_ROW = {
  code: 'hidden_garage',
  password_ciphertext: 'x2VGtRvJNtzm3B1oc+zoEl/mNF+KLy9zlw==',
  password_iv: 'MhrxOR7KxjPubuMx',
  password_salt: 'E2vhKEiWw2pWjmzJlEri2g==',
  ec_private_jwk:
    '{"key_ops":["deriveBits"],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256","d":"LiV8vdtWfMXlthS3h6afHsln6npr5KtnOoZWA-7ADDU"}',
  ec_public_jwk:
    '{"key_ops":[],"ext":true,"kty":"EC","x":"djGsUm8g_i18RqPEoPsrsfiMR_ZMEsq5WnFhKP5ttEQ","y":"ltv5PJvsre-c09usFitNG5QtKk58IbhQqFFFB0t2q9o","crv":"P-256"}',
};

test('health returns JSON when no Accept header is provided', async () => {
  const response = await requestHealth();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  const body = await response.text();
  assert.deepEqual(JSON.parse(body), { ok: true, ctf: 'SystmeLab' });
  assert.doesNotMatch(body, /編碼線索序列|OpenAI|34048/u);
});

test('health keeps JSON for curl-style wildcard Accept headers', async () => {
  const response = await requestHealth({
    headers: {
      Accept: '*/*',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true, ctf: 'SystmeLab' });
});

test('health keeps JSON for explicit API client Accept headers', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'application/json',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true, ctf: 'SystmeLab' });
});

test('health keeps JSON when HTML is explicitly unacceptable', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'text/html;q=0,application/json',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true, ctf: 'SystmeLab' });
});

test('health returns HTML for browser navigation Accept headers', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'text/html;q=1,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  const contentSecurityPolicy = response.headers.get('Content-Security-Policy') ?? '';
  const styleNonce = readStyleNonce(body);

  assert.match(contentSecurityPolicy, /default-src 'none'/u);
  assert.ok(contentSecurityPolicy.includes(`style-src 'nonce-${styleNonce}'`));
  assert.doesNotMatch(contentSecurityPolicy, /unsafe-inline/u);
  assert.ok(styleNonce.length > 0);
  assert.match(body, /^<!doctype html>/u);
  assert.match(body, /LabSplit Black Gold/u);
  assert.match(body, /Operational/u);
  assert.match(body, /編碼線索序列/u);
  assert.match(body, /\[50, 783, 1047, 34048, 41957, 24\]/u);
  assert.match(body, /\[50, 783, 1047, 34048, 30652, 23\]/u);
  assert.match(body, /\[3320, 34048, 39660, 22\]/u);
  assert.match(body, /OpenAI 風格招募謎題/u);
  assert.doesNotMatch(body, /o200k/iu);
  assert.doesNotMatch(body, /🏁 Hidden Garage CTF/u);
  assert.doesNotMatch(body, /The key to the hidden garage/u);
  assert.doesNotMatch(body, /SystmeLab/u);
});

test('health returns HTML when text/html is accepted without a quality value', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'text/html',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.match(await response.text(), /API Health/u);
});

test('health HTML does not require the hidden garage CTF config', async () => {
  const response = await requestHealth(
    {
      headers: {
        Accept: 'text/html',
      },
    },
    {
      ...createTestEnv(),
      DB: createThrowingD1(),
    },
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /API Health/u);
  assert.match(body, /編碼線索序列/u);
  assert.doesNotMatch(body, /🏁 Hidden Garage CTF/u);
});

test('index mounts health under /api/health', async () => {
  const response = await app.request(
    '/api/health',
    {
      headers: {
        Accept: 'text/html',
      },
    },
    createTestEnv(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.match(await response.text(), /LabSplit API health status/u);
});

async function requestHealth(
  init?: RequestInit,
  env: AppBindings['Bindings'] = createTestEnv(),
): Promise<Response> {
  const app = new Hono<AppBindings>();
  app.route('/api/health', healthRoutes);

  return await app.request('/api/health', init, env);
}

function createTestEnv(): AppBindings['Bindings'] {
  return {
    DB: createGarageCtfConfigD1(),
    SESSION_SECRET: 'test-session-secret-at-least-long-enough',
  };
}

function createGarageCtfConfigD1(): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => GARAGE_CTF_CONFIG_ROW,
      }),
    }),
  } as unknown as D1Database;
}

function createThrowingD1(): D1Database {
  return {
    prepare: () => {
      throw new Error('Hidden garage CTF config should not be read for HTML health responses.');
    },
  } as unknown as D1Database;
}

function readStyleNonce(body: string): string {
  const match = body.match(/<style nonce="([^"]+)">/u);
  assert.ok(match?.[1]);
  return match[1];
}
