import { MiddlewareHandler } from 'hono';

import { AppBindings } from '../types';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "connect-src 'self' https://lab.buy2330.cc https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://appleid.apple.com https://cloudflareinsights.com",
  "script-src 'self' https://accounts.google.com https://appleid.cdn-apple.com https://static.cloudflareinsights.com",
  "style-src 'self'",
  "img-src 'self' data: https://www.gstatic.com https://lh3.googleusercontent.com",
  "font-src 'self'",
  "frame-src 'self' https://accounts.google.com https://appleid.apple.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'camera=()',
  'display-capture=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'publickey-credentials-get=()',
  'screen-wake-lock=()',
  'sync-xhr=()',
  'usb=()',
  'xr-spatial-tracking=()',
].join(', ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': PERMISSIONS_POLICY,
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} as const;

const API_CACHE_CONTROL = 'no-store';
const API_VARY_HEADER = 'Cookie';

export const securityHeaders: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();

  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    c.res.headers.set('Cache-Control', API_CACHE_CONTROL);
    appendVaryHeader(c.res.headers, API_VARY_HEADER);
  }

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!c.res.headers.has(name)) {
      c.res.headers.set(name, value);
    }
  }
};

function appendVaryHeader(headers: Headers, value: string): void {
  const currentValue = headers.get('Vary');

  if (!currentValue) {
    headers.set('Vary', value);
    return;
  }

  const existingValues = currentValue.split(',').map((entry) => entry.trim().toLowerCase());

  if (!existingValues.includes(value.toLowerCase())) {
    headers.set('Vary', `${currentValue}, ${value}`);
  }
}
