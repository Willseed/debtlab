import { MiddlewareHandler } from 'hono';

import { errorResponse } from '../http/error-response';
import { AppBindings } from '../types';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const PRODUCTION_ORIGIN = 'https://lab.buy2330.cc';
const LOCAL_DEVELOPMENT_ORIGINS = ['http://localhost:4200', 'http://localhost:8787'];
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type';
const PREFLIGHT_MAX_AGE_SECONDS = '600';
const CROSS_SITE_FETCH_SITE = 'cross-site';

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

  if (c.req.header('Sec-Fetch-Site') === CROSS_SITE_FETCH_SITE) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Cross-site mutation requests are not allowed.');
  }

  if (!origin || !allowedOrigins.has(origin)) {
    return errorResponse(c, 403, 'FORBIDDEN', 'Mutation origin is not allowed.');
  }

  const contentType = c.req.header('Content-Type');

  if (contentType && !isJsonContentType(contentType)) {
    return errorResponse(
      c,
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Mutation request bodies must use application/json.',
    );
  }

  await next();
  applyCorsHeaders(c.res.headers, origin, allowedOrigins);
};

function readAllowedOrigins(appBaseUrl: string | undefined): ReadonlySet<string> {
  const appOrigin = readOrigin(appBaseUrl);

  if (appOrigin && isLocalDevelopmentOrigin(appOrigin)) {
    return new Set([...LOCAL_DEVELOPMENT_ORIGINS, appOrigin]);
  }

  return new Set([appOrigin ?? PRODUCTION_ORIGIN]);
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

function readOrigin(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalDevelopmentOrigin(origin: string): boolean {
  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
}

function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mediaType === 'application/json' || mediaType?.endsWith('+json') === true;
}
