import { MiddlewareHandler } from 'hono';

import { AppBindings } from '../types';

const BASE_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "connect-src 'self' https://lab.buy2330.cc https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://appleid.apple.com https://cloudflareinsights.com",
  "img-src 'self' data: https://www.gstatic.com https://lh3.googleusercontent.com",
  "font-src 'self'",
  "frame-src 'self' https://accounts.google.com https://appleid.apple.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  'upgrade-insecure-requests',
] as const;

const SCRIPT_SRC_SOURCES = [
  "'self'",
  'https://accounts.google.com',
  'https://appleid.cdn-apple.com',
  'https://static.cloudflareinsights.com',
] as const;

const STYLE_SRC_SOURCES = ["'self'"] as const;

export const CONTENT_SECURITY_POLICY = [
  ...BASE_CSP_DIRECTIVES,
  `script-src ${SCRIPT_SRC_SOURCES.join(' ')}`,
  `style-src ${STYLE_SRC_SOURCES.join(' ')}`,
].join('; ');

/**
 * Builds a per-request nonce-enhanced CSP for HTML page responses.
 * Adds the nonce to script-src and style-src so Angular can inject
 * component styles via ngCspNonce without needing 'unsafe-inline'.
 */
export function buildPageCsp(nonce: string): string {
  return [
    ...BASE_CSP_DIRECTIVES,
    `script-src ${[...SCRIPT_SRC_SOURCES, `'nonce-${nonce}'`].join(' ')}`,
    `style-src ${[...STYLE_SRC_SOURCES, `'nonce-${nonce}'`].join(' ')}`,
  ].join('; ');
}

/** Generates a cryptographically random base64 nonce (128 bits). */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

/**
 * Injects the CSP nonce into the HTML shell:
 * - Sets ngCspNonce on <app-root> so Angular uses the nonce for runtime style injection.
 * - Sets nonce attribute on <script> tags.
 */
export function injectCspNonce(html: string, nonce: string): string {
  return html
    .replace(/<app-root(\s[^>]*)?>/, `<app-root$1 ngCspNonce="${nonce}">`)
    .replace(/<script\b/g, `<script nonce="${nonce}"`);
}

export const PERMISSIONS_POLICY = [
  'accelerometer=()',
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
