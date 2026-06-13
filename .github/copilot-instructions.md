# GitHub Copilot Instructions for DebtLab / LabSplit Black Gold

These repository instructions apply to GitHub Copilot and any AI coding agent working on this project. Keep this file in sync with `AGENTS.md` whenever agent policy changes.

## Required context

Before implementing, modifying, refactoring, or testing, read these files in order:

1. `AGENTS.md`
2. `docs/SDD.md`
3. `docs/DESIGN.md`
4. `docs/API.md`
5. `docs/I18N.md`
6. `docs/TESTING.md`
7. `docs/LIGHTHOUSE.md`
8. `README.md`

If a required file does not exist, create it only when it is relevant to the current task.

Use `docs/SDD.md` as the source of truth for product behavior and architecture. Use `docs/DESIGN.md` as the source of truth for UI, UX, visual design, tokens, typography, spacing, layout, motion, and component styling. When `docs/SDD.md` and `docs/DESIGN.md` conflict on visual style, `docs/DESIGN.md` wins.

## Project identity

- Repository: `debtlab`
- Product: `LabSplit Black Gold`
- Production domain: `lab.buy2330.cc`
- Canonical URL: `https://lab.buy2330.cc`
- Default locale: `zh-TW`
- Secondary locale: `en-US`

## Required stack

Frontend work must use Angular 22, Angular CLI, TypeScript, Standalone Components, Angular Router, Reactive Forms, Angular i18n, and Angular unit tests through `ng test`.

Backend work must use Cloudflare Workers, TypeScript, Hono, Cloudflare D1, and Zod validation. E2E tests must use Playwright.

Do not introduce React, Vite as the primary frontend framework, TanStack Query, shadcn/ui, Cypress, large MVP charting libraries, heavy UI kits, unapproved CSS frameworks, external fonts that harm Lighthouse, or client-side secret handling.

## Design and UX

Follow `docs/DESIGN.md` for all UI decisions. Do not create new colors, typography, spacing, layouts, component variants, button styles, form styles, table styles, modal styles, motion, animations, Easter egg visuals, or responsive patterns unless they are documented or approved there.

The product style is an original black-and-gold luxury dashboard inspired by a precision supercar cockpit. Do not use Lamborghini logos, trademarks, copied assets, protected trade dress, or copyrighted visual assets without permission.

Prefer accessible semantic HTML, visible focus states, native controls where possible, route-level lazy loading, minimal CSS, explicit image dimensions, Angular deferrable views for non-critical content, and minimal third-party scripts.

## Internationalization

The source/default locale is `zh-TW`; the MVP also supports `en-US`.

All visible UI text must be localizable. Angular templates must use `i18n` markers, and TypeScript user-facing strings must use `$localize`. Do not hard-code visible user-facing strings without i18n support.

Required locale files:

- `apps/web/src/locale/messages.xlf`
- `apps/web/src/locale/messages.zh-TW.xlf`
- `apps/web/src/locale/messages.en-US.xlf`

Use the existing extraction script, or run `ng extract-i18n --output-path src/locale` from the Angular app when appropriate. Use Angular pipes or tested custom formatters for money, dates, and numbers.

## Secrets and configuration

Store all private keys, credentials, deployment tokens, OAuth secrets, signing secrets, production credentials, and Cloudflare tokens in GitHub Secrets. GitHub Actions must read them through `${{ secrets.SECRET_NAME }}` and Cloudflare Worker secrets must be populated from GitHub Secrets during deployment.

Never commit `.env`, `.env.local`, `.dev.vars`, private keys, credential JSON files, production tokens, real OAuth secrets, or Cloudflare API tokens. `.env.example` may exist only with placeholder values. Do not print secrets in logs. Do not hard-code secrets in tests; use mock or test-only values.

Required production secrets:

- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APP_BASE_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `LHCI_GITHUB_APP_TOKEN`

Apple secrets are required only when Sign in with Apple is enabled. While Apple review is pending, the Apple login UI must remain visible but disabled, backend Apple auth must return a disabled error without attempting Apple token verification, and CI must not require Apple secrets. Production `APP_BASE_URL` is `https://lab.buy2330.cc`.

## Authentication, authorization, and security

Authentication must support Google OAuth and Sign in with Apple once approved. Never trust frontend OAuth claims directly; OAuth tokens must be verified by the Cloudflare Worker backend.

Application identity must be based on `provider + provider_subject`, never email alone. Disabled users must not be able to create new sessions.

Session cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`, and `Path=/`. Private API routes require authentication. Admin-only routes require admin authorization middleware. Mutation APIs must validate the `Origin` header because the app uses cookie sessions.

Do not expose stack traces to users, private user data to guests, client-side role claims as authority, or unsafe debug endpoints.

## Money, accounting, and settlements

All money values must be stored as integers. For TWD, `1280` means `NT$1,280`. Never use floating point for money.

Every expense split must satisfy `sum(participant.share_amount) === expense.amount`. Equal and ratio split remainders must be assigned deterministically. Soft-deleted expenses are ignored in active settlement calculations. Pending payments do not reduce confirmed balances; confirmed payments do reduce outstanding balances.

Easter eggs must never affect accounting correctness.

## API and database rules

All API routes must live under `/api`. Validate all request bodies with Zod. Use the standard error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

Use Cloudflare D1. All schema changes must be reproducible SQL migrations stored in `migrations/`; never modify production database schema manually.

D1 must include these core tables: `users`, `user_identities`, `groups`, `group_members`, `expenses`, `expense_participants`, `payments`, `audit_logs`, `easter_eggs`, and `user_easter_egg_unlocks`.

## Audit logs

Create audit logs for expense create/update/delete, payment create/confirm, member role changes, member disable/reactivate, Easter egg unlock, Easter egg enable/disable, and admin CSV export.

## Easter eggs

MVP Easter eggs are Konami Code, Midnight Lab Mode, and hidden `/garage`.

Easter eggs must be optional, admin-configurable, tracked per user, tested, follow `docs/DESIGN.md`, and never modify accounting results.

## Testing and quality gates

Run the relevant existing checks for the files changed. Before MVP completion, these commands must pass:

```bash
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
```

Angular-specific gates:

```bash
ng test --watch=false --code-coverage
ng lint
ng build --configuration production
```

Coverage must remain at least 95% for statements, branches, functions, and lines. Do not lower coverage thresholds, skip tests, mark broken tests pending, or delete tests unless replaced by stronger tests.

E2E must use Playwright across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari, covering auth, dashboard, expense create/edit, settlement, admin authorization, Easter eggs, and i18n smoke flows.

ESLint must use flat config `eslint.config.js`, not `.eslintrc.json`. Lint acceptance is 0 errors and 0 warnings. Do not use whole-file `eslint-disable`; single-line disables require clear justification. Avoid `any` unless documented and no better typed alternative exists.

Mobile Lighthouse minimums are Performance 90, Accessibility 100, Best Practices 100, and SEO 100 (`90 / 100 / 100 / 100`). Do not add dependencies, fonts, images, charts, or animations that make Lighthouse fail.

## Development workflow

Make precise, minimal, complete changes. Reuse existing helpers and patterns before adding new abstractions. Keep TypeScript strict and avoid unnecessary casts. Add or update tests when behavior changes. Update SDD/API/DESIGN/I18N/TESTING/LIGHTHOUSE docs when behavior changes. Do not rewrite unrelated code, introduce unrequested dependencies, ignore failing tests, change quality gates, commit generated secrets, or implement UI outside `docs/DESIGN.md`.

When starting from an empty repository, implement in this order: repository scaffolding, Angular 22 app skeleton, Cloudflare Worker skeleton, D1 migrations, ESLint flat config, Karma coverage config, Playwright config, Lighthouse CI config, Angular i18n setup, design tokens/base components, auth shell/APIs, expense CRUD, split logic, settlement logic, admin functions, Easter eggs, then performance and accessibility polish.

Before reporting completion, ensure Angular 22 is still used, no forbidden frontend framework was introduced, visible UI strings are i18n-ready, `docs/DESIGN.md` was followed, no secrets were committed, relevant tests/checks passed, coverage and Lighthouse gates are preserved when applicable, D1 migrations are reproducible when schema changes, and related docs are updated.

Correctness, privacy, accessibility, security, i18n, and tests are more important than visual flair. When uncertain, preserve accounting correctness and security first.
