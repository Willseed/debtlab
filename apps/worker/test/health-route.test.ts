import assert from 'node:assert/strict';
import test from 'node:test';

import { Hono } from 'hono';

import app from '../src/index';
import { healthRoutes } from '../src/routes/health';
import { AppBindings } from '../src/types';

test('health returns JSON when no Accept header is provided', async () => {
  const response = await requestHealth();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.deepEqual(await response.json(), { ok: true });
});

test('health keeps JSON for curl-style wildcard Accept headers', async () => {
  const response = await requestHealth({
    headers: {
      Accept: '*/*',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true });
});

test('health keeps JSON for explicit API client Accept headers', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'application/json',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true });
});

test('health keeps JSON when HTML is explicitly unacceptable', async () => {
  const response = await requestHealth({
    headers: {
      Accept: 'text/html;q=0,application/json',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.deepEqual(await response.json(), { ok: true });
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
  assert.match(response.headers.get('Content-Security-Policy') ?? '', /default-src 'none'/u);
  assert.match(body, /^<!doctype html>/u);
  assert.match(body, /LabSplit Black Gold/u);
  assert.match(body, /Operational/u);
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

test('index mounts health under /api/health', async () => {
  const response = await app.request('/api/health', {
    headers: {
      Accept: 'text/html',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.match(await response.text(), /LabSplit API health status/u);
});

async function requestHealth(init?: RequestInit): Promise<Response> {
  const app = new Hono<AppBindings>();
  app.route('/api/health', healthRoutes);

  return await app.request('/api/health', init);
}
