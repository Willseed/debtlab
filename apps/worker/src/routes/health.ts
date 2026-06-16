import { Hono } from 'hono';

import { readGarageCtfPassword } from '../services/garage-ctf.service';
import { readMysteryChallengeClues } from '../services/mystery-challenge.service';
import { AppBindings } from '../types';

function renderHealthPageHtml(styleNonce: string): string {
  const mysteryClueCards = renderMysteryClueCards();

  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>LabSplit API Health</title>
    <style nonce="${styleNonce}">
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
        padding: 2rem 0;
        background:
          radial-gradient(circle at 50% 0%, rgba(220, 166, 58, 0.24), transparent 42%),
          linear-gradient(145deg, #090705 0%, #15100a 48%, #050403 100%);
      }

      main {
        width: min(92vw, 74rem);
        padding: 2.5rem;
        border: 1px solid rgba(248, 216, 137, 0.32);
        border-radius: 1.5rem;
        box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 246, 215, 0.12);
        background: linear-gradient(180deg, rgba(30, 23, 14, 0.92), rgba(11, 8, 5, 0.96));
      }

      .health-summary {
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

      .mystery-clues {
        margin-top: 2rem;
        text-align: left;
      }

      .mystery-clues h2 {
        margin: 0;
        color: #ffe39a;
        font-size: clamp(1.55rem, 4vw, 2rem);
      }

      .mystery-clues__intro {
        margin-top: 0.85rem;
      }

      .mystery-clues__grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
        margin-top: 1.35rem;
      }

      .mystery-clue-card {
        border: 1px solid rgba(248, 216, 137, 0.2);
        border-radius: 0.8rem;
        padding: 1.25rem;
        background: rgba(255, 255, 255, 0.035);
      }

      .mystery-clue-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .mystery-clue-card h3,
      .mystery-clue-card__hint-title {
        margin: 0;
        color: #d7af48;
      }

      .mystery-clue-card code {
        display: block;
        margin-top: 1rem;
        color: #f9f2de;
        font-size: 1rem;
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .mystery-clue-card__hint-title {
        margin-top: 1rem;
        font-weight: 800;
      }

      .mystery-clue-card__badge {
        border: 1px solid #86f48b;
        border-radius: 999px;
        color: #98ff9d;
        font-size: 0.86rem;
        font-weight: 800;
        padding: 0.35rem 0.65rem;
        white-space: nowrap;
      }

      .mystery-clues__hint {
        margin-top: 1.5rem;
        border: 1px solid rgba(248, 216, 137, 0.2);
        border-radius: 0.8rem;
        padding: 1.25rem;
        background: rgba(255, 255, 255, 0.035);
      }

      .mystery-clues__hint h3 {
        margin: 0;
        color: #ffe39a;
        font-size: 1.25rem;
      }
    </style>
  </head>
  <body>
    <main aria-label="LabSplit API health status">
      <section class="health-summary" aria-labelledby="health-title">
        <p class="eyebrow">LabSplit Black Gold</p>
        <h1 id="health-title">API Health</h1>
        <div class="status"><span class="dot" aria-hidden="true"></span>Operational</div>
        <p>The health endpoint is responding normally.</p>
        <p>API clients can request JSON from <code>/api/health</code>.</p>
      </section>
      <section class="mystery-clues" aria-labelledby="mystery-clues-title">
        <h2 id="mystery-clues-title">編碼線索序列</h2>
        <p class="mystery-clues__intro">以下三組數字序列是編碼後的線索；請還原其中一組並提交原始密碼。</p>
        <div class="mystery-clues__grid">${mysteryClueCards}</div>
        <aside class="mystery-clues__hint" aria-labelledby="mystery-clues-hint-title">
          <h3 id="mystery-clues-hint-title">提示</h3>
          <p>這道題的靈感來自 OpenAI 風格招募謎題：別急著暴力猜測，先觀察編碼線索如何切開單字，再把序列帶回原文。</p>
        </aside>
      </section>
    </main>
  </body>
</html>`;
}

function renderMysteryClueCards(): string {
  return readMysteryChallengeClues()
    .map(
      (clue) => `<article class="mystery-clue-card">
          <div class="mystery-clue-card__header">
            <h3>編碼線索 ${clue.displayOrder}</h3>
            <span class="mystery-clue-card__badge">可解碼</span>
          </div>
          <code>${escapeHtml(formatTokenSequence(clue.tokens))}</code>
          <p class="mystery-clue-card__hint-title">${escapeHtml(clue.hint.title)}</p>
          <p>${escapeHtml(clue.hint.body)}</p>
        </article>`,
    )
    .join('');
}

function formatTokenSequence(tokens: readonly number[]): string {
  return `[${tokens.join(', ')}]`;
}

const HEALTH_JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

export const healthRoutes = new Hono<AppBindings>();

healthRoutes.get('/', async (c) => {
  if (acceptsHtml(c.req.header('Accept'))) {
    const styleNonce = createCspNonce();

    return new Response(renderHealthPageHtml(styleNonce), {
      headers: createHealthHtmlHeaders(styleNonce),
    });
  }

  const ctfPassword = await readGarageCtfPassword(c.env.DB);

  return new Response(JSON.stringify({ ok: true, ctf: ctfPassword }), {
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createHealthHtmlHeaders(styleNonce: string): HeadersInit {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': [
      "default-src 'none'",
      `style-src 'nonce-${styleNonce}'`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return btoa(Array.from(bytes, (byte) => String.fromCodePoint(byte)).join(''));
}
