# Repository Agent Instructions

Applies to all AI coding agents in `debtlab`. Keep `AGENTS.md` and
`.github/copilot-instructions.md` synchronized in substance.

## Context and source of truth

Read only what is relevant to the task, but prefer this order when context is
needed:

1. `AGENTS.md` / `.github/copilot-instructions.md` — agent policy.
2. `docs/SDD.md` — product behavior and architecture.
3. `docs/DESIGN.md` — UI/UX, tokens, layout, typography, motion, components.
4. `docs/API.md`, `docs/I18N.md`, `docs/TESTING.md`, `docs/LIGHTHOUSE.md` —
   detailed contracts and gates.

`docs/DESIGN.md` wins over `docs/SDD.md` for visual design conflicts.

## Project identity and stack

- Product: LabSplit Black Gold (`https://lab.buy2330.cc`).
- Locale: source/default `zh-TW`; secondary `en-US`.
- Frontend: Angular 22, Angular CLI, TypeScript, standalone components,
  Angular Router, Reactive Forms, Angular i18n, Angular tests.
- Backend: Cloudflare Workers, Hono, TypeScript, Cloudflare D1, Zod.
- E2E: Playwright. Package manager: pnpm.

Do not introduce React, Vite as the primary frontend framework, TanStack Query,
shadcn/ui, Cypress, heavy UI kits, large MVP charting libraries, unapproved CSS
frameworks, external fonts that break Lighthouse, or client-side secret
handling.

## Design, i18n, and assets

- Follow `docs/DESIGN.md`; do not invent visual tokens, component variants,
  spacing, typography, layouts, or motion without updating/approving the design
  source.
- The style is original black-and-gold luxury dashboard / supercar cockpit
  inspiration only. Do not use Lamborghini logos, trademarks, copied assets,
  protected trade dress, or copyrighted visual assets.
- All visible UI strings must be localizable: Angular templates use `i18n`,
  TypeScript user-facing strings use `$localize`.
- Locale files live in `apps/web/src/locale/`. Use Angular pipes or tested
  custom formatters for money, dates, and numbers.

## Security and auth

- Store credentials, OAuth secrets, signing secrets, deployment tokens,
  production values, and Cloudflare tokens in GitHub Secrets / Worker secrets.
  Never commit `.env`, `.env.local`, `.dev.vars`, private keys, credential JSON,
  real tokens, or production secrets. `.env.example` may contain placeholders.
- Backend must verify OAuth tokens; never trust frontend OAuth claims.
- User identity is `provider + provider_subject`, never email alone.
- Disabled users cannot create new sessions. Private APIs require auth; admin
  APIs require admin middleware.
- Session cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`.
  Mutation APIs must validate `Origin` because sessions are cookie-based.
- Do not expose stack traces, unsafe debug endpoints, private user data to
  guests, or client-side role claims as authority.
- Apple login remains visible but disabled until approved; backend Apple auth
  returns a disabled error without requiring Apple secrets while disabled.

## Money, API, D1, and audit invariants

- Store money as integers. For TWD, `1280` means `NT$1,280`; never use floating
  point for money.
- Every split must satisfy
  `sum(expense_participants.share_amount) === expenses.amount`. Equal/ratio
  remainders are assigned deterministically.
- Soft-deleted expenses are ignored in active settlement calculations. Pending
  payments do not reduce balances; confirmed payments do.
- Easter eggs must never affect accounting correctness.
- All API routes live under `/api`, request bodies use Zod validation, and
  errors use `{ error: { code, message, details } }`.
- Use Cloudflare D1. Schema changes must be reproducible SQL migrations in
  `migrations/`; never modify production schema manually or rewrite applied
  migrations.
- Core tables include `users`, `user_identities`, `groups`, `group_members`,
  `expenses`, `expense_participants`, `payments`, `audit_logs`, `easter_eggs`,
  and `user_easter_egg_unlocks`.
- Audit expense create/update/delete, payment create/confirm, member role or
  status changes, Easter egg unlock/enable/disable, and admin CSV export.

## Quality gates

Run the relevant checks for the files changed. Before reporting completion or
deployment readiness, the applicable gates must pass:

```bash
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
pnpm sonar:open-issues
```

Non-negotiables:

- Coverage stays at least 95% for statements, branches, functions, and lines.
- ESLint has 0 errors and 0 warnings; use flat config `eslint.config.js`.
- Playwright covers Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- Mobile Lighthouse minimums are 90 Performance, 100 Accessibility, 100 Best
  Practices, and 100 SEO.
- SonarCloud must have zero open issues and zero unreviewed Security Hotspots.
- Do not lower thresholds, skip/delete tests without stronger replacements,
  bypass gates, or add dependencies that break performance/accessibility.

## Workflow

- Prefer minimal, precise changes that reuse existing helpers and patterns.
- Keep TypeScript strict; avoid `any` and unnecessary casts.
- Add or update tests when behavior changes; update docs when behavior,
  contracts, design, i18n, testing, or deployment rules change.
- Do not rewrite unrelated code, commit generated secrets, or implement UI
  outside `docs/DESIGN.md`.
- Default repository workflow is a single `main` branch unless a human
  coordinator explicitly asks otherwise.
- When uncertain, preserve accounting correctness and security first.
