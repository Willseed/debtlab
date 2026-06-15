import { Hono } from 'hono';

import { AppBindings } from '../types';

const HEALTH_JSON = JSON.stringify({ ok: true });
const HEALTH_PAGE_HTML = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LabSplit API Health</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #060403;
        color: #f8e7b0;
      }

      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 50% 0%, rgba(220, 166, 58, 0.24), transparent 42%),
          linear-gradient(145deg, #090705 0%, #15100a 48%, #050403 100%);
      }

      main {
        width: min(92vw, 34rem);
        padding: 2.5rem;
        border: 1px solid rgba(248, 216, 137, 0.32);
        border-radius: 1.5rem;
        box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 246, 215, 0.12);
        background: linear-gradient(180deg, rgba(30, 23, 14, 0.92), rgba(11, 8, 5, 0.96));
        text-align: center;
      }

      .eyebrow {
        margin: 0 0 0.75rem;
        color: #cfa74a;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        color: #fff3cf;
        font-size: clamp(2rem, 7vw, 3.25rem);
        line-height: 1;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        margin: 2rem 0 1rem;
        padding: 0.7rem 1rem;
        border: 1px solid rgba(109, 255, 188, 0.28);
        border-radius: 999px;
        background: rgba(30, 117, 77, 0.18);
        color: #a8ffd6;
        font-weight: 700;
      }

      .dot {
        width: 0.68rem;
        height: 0.68rem;
        border-radius: 999px;
        background: #66f0aa;
        box-shadow: 0 0 1rem rgba(102, 240, 170, 0.78);
      }

      p {
        margin: 0.75rem 0 0;
        color: #d5c08a;
        line-height: 1.6;
      }

      code {
        color: #ffe39a;
      }
    </style>
  </head>
  <body>
    <main aria-label="LabSplit API health status">
      <p class="eyebrow">LabSplit Black Gold</p>
      <h1>API Health</h1>
      <div class="status"><span class="dot" aria-hidden="true"></span>Operational</div>
      <p>The health endpoint is responding normally.</p>
      <p>API clients can request JSON from <code>/api/health</code>.</p>
    </main>
  </body>
</html>`;

const HEALTH_HTML_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const HEALTH_JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get('/', (c) => {
  if (acceptsHtml(c.req.header('Accept'))) {
    return new Response(HEALTH_PAGE_HTML, {
      headers: HEALTH_HTML_HEADERS,
    });
  }

  return new Response(HEALTH_JSON, {
    headers: HEALTH_JSON_HEADERS,
  });
});

function acceptsHtml(acceptHeader: string | undefined): boolean {
  if (acceptHeader === undefined) {
    return false;
  }

  return acceptHeader.split(',').some((entry) => {
    const [mediaRange, ...parameters] = entry.trim().toLowerCase().split(';');

    if (mediaRange !== 'text/html') {
      return false;
    }

    const quality = parameters.find((parameter) => parameter.trim().startsWith('q='));

    if (quality === undefined) {
      return true;
    }

    const qualityValue = Number.parseFloat(quality.trim().slice(2));
    return Number.isFinite(qualityValue) && qualityValue > 0;
  });
}
