import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { AppBindings } from '../types';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_ALLOWED_ORIGINS = [
  'https://lab.buy2330.cc',
  'http://localhost:4200',
  'http://localhost:8787',
];
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type';
const PREFLIGHT_MAX_AGE_SECONDS = '600';

export const validateOrigin: MiddlewareHandler<AppBindings> = async (c, next) => {
  const origin = c.req.header('Origin');
  const allowedOrigins = readAllowedOrigins(c.env.APP_BASE_URL);

  if (c.req.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.has(origin)) {
      return errorResponse(c, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
    }

    return new Response(null, {
      status: 204,
      headers: createCorsHeaders(origin, c.req.header('Access-Control-Request-Headers')),
    });
  }

  if (!MUTATION_METHODS.has(c.req.method)) {
    await next();
    applyCorsHeaders(c.res.headers, origin, allowedOrigins);
    return;
  }

  // Sign in with Apple uses a cross-site form_post callback; the OAuth state cookie
  // on that route is the CSRF protection instead of the browser Origin header.
  if (c.req.method === 'POST' && new URL(c.req.url).pathname === '/api/auth/apple/callback') {
    return next();
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
  }

  await next();
  applyCorsHeaders(c.res.headers, origin, allowedOrigins);
};

function readAllowedOrigins(appBaseUrl: string | undefined): ReadonlySet<string> {
  return new Set(appBaseUrl ? [...DEFAULT_ALLOWED_ORIGINS, appBaseUrl] : DEFAULT_ALLOWED_ORIGINS);
}

function createCorsHeaders(origin: string, requestedHeaders: string | undefined): Headers {
  const headers = new Headers();
  applyCorsHeaders(headers, origin, new Set([origin]), requestedHeaders);
  return headers;
}

function applyCorsHeaders(
  headers: Headers,
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
  requestedHeaders?: string,
): void {
  if (!origin || !allowedOrigins.has(origin)) {
    return;
  }

  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', requestedHeaders ?? DEFAULT_ALLOWED_HEADERS);
  headers.set('Access-Control-Max-Age', PREFLIGHT_MAX_AGE_SECONDS);
  headers.append('Vary', 'Origin');
}
