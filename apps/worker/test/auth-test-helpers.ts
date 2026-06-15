import assert from 'node:assert/strict';

import { Hono } from 'hono';

import { validateOrigin } from '../src/middleware/validate-origin';
import { AppBindings, ApiErrorCode } from '../src/types';

export function requestAuthRoute(
  path: string,
  init: RequestInit | undefined,
  env: AppBindings['Bindings'],
  envOverrides: Partial<AppBindings['Bindings']>,
  routes: Hono<AppBindings>,
): Promise<Response> {
  const routeApp = new Hono<AppBindings>();
  routeApp.route('/api/auth', routes);

  return Promise.resolve(
    routeApp.request(path, init, {
      ...env,
      ...envOverrides,
    }),
  );
}

export function createOriginProtectedAuthApp(routes: Hono<AppBindings>): Hono<AppBindings> {
  const routeApp = new Hono<AppBindings>();
  routeApp.use('/api/*', validateOrigin);
  routeApp.route('/api/auth', routes);

  return routeApp;
}

export async function assertApiError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
): Promise<unknown> {
  assert.equal(response.status, status);
  const body = (await response.json()) as {
    readonly error: {
      readonly code: ApiErrorCode;
      readonly message: string;
      readonly details: unknown;
    };
  };

  assert.equal(body.error.code, code);
  assert.equal(body.error.message, message);

  return body.error.details;
}

export function assertOAuthRedirect(
  response: Response,
  appBaseUrl: string | undefined,
  errorCode: string,
): void {
  assert.ok(appBaseUrl);
  const redirectUrl = new URL('/', appBaseUrl);
  redirectUrl.searchParams.set('auth_error', errorCode);

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), redirectUrl.toString());
}

export function readSetCookie(response: Response): string {
  if (hasGetSetCookie(response.headers)) {
    return response.headers.getSetCookie().join('\n');
  }

  return response.headers.get('Set-Cookie') ?? '';
}

function hasGetSetCookie(headers: Headers): headers is Headers & {
  readonly getSetCookie: () => string[];
} {
  const maybeHeaders = headers as Headers & {
    readonly getSetCookie?: unknown;
  };

  return typeof maybeHeaders.getSetCookie === 'function';
}
