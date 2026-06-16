# Software Design Document (SDD)

# LabSplit Black Gold

This is the product and architecture source of truth for DebtLab / LabSplit
Black Gold. Use `docs/DESIGN.md` as the source of truth for UI/UX, visual
tokens, component variants, spacing, typography, layout, and motion; it wins
over this SDD for visual conflicts.

## 1. Project identity

| Field            | Value                                |
| ---------------- | ------------------------------------ |
| Repository       | `debtlab`                            |
| Product          | LabSplit Black Gold                  |
| Production URL   | `https://lab.buy2330.cc`             |
| Default locale   | `zh-TW`                              |
| Secondary locale | `en-US`                              |
| Frontend         | Angular 22, Angular CLI, TypeScript  |
| Backend          | Cloudflare Workers, Hono, TypeScript |
| Database         | Cloudflare D1                        |
| Validation       | Zod                                  |
| E2E              | Playwright                           |
| Package manager  | pnpm                                 |

LabSplit Black Gold is a public OAuth-gated expense-splitting application for
shared spending. Authenticated active members can record expenses, split costs,
calculate balances, suggest optimized settlements, track payments, and unlock
safe optional Easter eggs. Admins can manage users, audit logs, exports, and
Easter egg configuration.

## 2. Required stack and forbidden technology

Frontend work must use Angular 22, standalone components, Angular Router,
Reactive Forms, Angular i18n, strict TypeScript, and Angular tests.

Backend work must use Cloudflare Workers, Hono, TypeScript, Cloudflare D1, and
Zod request validation. E2E tests must use Playwright.

Do not introduce React, Vite as the primary frontend framework, TanStack Query,
shadcn/ui, Cypress, heavy UI kits, large MVP charting libraries, unapproved CSS
frameworks, external fonts that break Lighthouse, or client-side secret
handling.

## 3. Architecture summary

```txt
Browser
  -> Cloudflare Pages / Workers Assets
  -> Angular 22 SPA
  -> /api/* Cloudflare Worker API
  -> Cloudflare D1
```

Repository layout:

- `apps/web`: Angular frontend.
- `apps/worker`: Cloudflare Worker API.
- `e2e`: Playwright tests.
- `migrations`: reproducible D1 SQL migrations.
- `docs`: product, design, API, i18n, testing, and Lighthouse guidance.

Frontend essentials:

- Standalone components; no NgModule-heavy feature architecture.
- Route-level lazy loading, accessible semantic HTML, visible focus states,
  native controls where practical, explicit image dimensions, and minimal
  third-party scripts.
- Use Angular signals/computed signals where helpful, OnPush where useful, and
  strongly typed models/forms.
- All visible strings are localizable: templates use `i18n`; TypeScript uses
  `$localize`.

Backend essentials:

- All API routes live under `/api`.
- Request bodies use Zod validation.
- Errors use `{ error: { code, message, details } }`.
- Private routes require authentication; admin routes require admin
  authorization middleware.
- Mutation routes validate `Origin` because sessions use cookies.

## 4. Product scope

Supported roles:

- Guest: can view the landing page and start OAuth login; cannot access
  authenticated data.
- Active authenticated member: can view dashboard, expenses, settlements,
  balances, create expenses for active default-group members, edit and
  soft-delete expenses they paid, record suggested-transfer payments, confirm
  received payments, and unlock enabled Easter eggs.
- Admin: can perform active member actions plus manage roles/status, view audit
  logs, export CSV, and configure Easter eggs.

MVP features:

- Google OAuth works for active public users.
- Sign in with Apple works for active public users; backend Apple auth verifies
  Apple identity tokens and requires Apple OAuth secrets.
- Expense CRUD, equal/custom/ratio splits, settlement summaries, payment
  recording/confirmation, admin member and audit tools, CSV export, and three
  Easter eggs: Konami Code, Midnight Lab Mode, hidden `/garage`.

MVP non-goals include receipt OCR, bank integration, automatic money transfer,
password/email-only self-registration, multi-currency conversion, native mobile
apps, complex approvals, multi-lab hierarchy, and heavy analytics/charting.

## 5. Design, assets, and i18n

- Follow `docs/DESIGN.md` for all UI decisions. Do not create new colors,
  typography, spacing, layouts, component variants, button/form/table/modal
  styles, motion, animations, Easter egg visuals, or responsive patterns unless
  documented or approved there.
- The style is an original black-and-gold luxury dashboard inspired by a
  precision supercar cockpit. Do not use Lamborghini logos, trademarks, copied
  assets, protected trade dress, or copyrighted visual assets.
- Source/default locale is `zh-TW`; MVP also supports `en-US`.
- Required locale files:
  - `apps/web/src/locale/messages.xlf`
  - `apps/web/src/locale/messages.zh-TW.xlf`
  - `apps/web/src/locale/messages.en-US.xlf`
- Use the existing extraction script or Angular i18n extraction when UI strings
  change. Use Angular pipes or tested custom formatters for money, dates, and
  numbers.

## 6. Authentication, sessions, and security

- Backend verifies all OAuth tokens; frontend OAuth claims are never authority.
- Application identity is `provider + provider_subject`, never email alone.
- Disabled users cannot create new sessions.
- The first Google user in an empty reset database bootstraps as active admin;
  later unknown verified Google users become active members. Existing pending
  Google users activate on next verified login.
- Authenticated/admin authorization must consult current D1 user role/status,
  not stale client claims.
- Session cookie name: `labsplit_session`.
- Session cookies must be `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and
  time-limited.
- Do not expose stack traces to users, private data to guests, unsafe debug
  endpoints, or client-side role claims as authority.

Allowed production origin:

```txt
https://lab.buy2330.cc
```

Allowed local development origins:

```txt
http://localhost:4200
http://localhost:8787
```

## 7. Secrets and configuration

All private keys, credentials, deployment tokens, OAuth secrets, signing
secrets, production values, and Cloudflare tokens must be stored in GitHub
Secrets and/or Cloudflare Worker secrets. GitHub Actions must read them through
`${{ secrets.SECRET_NAME }}`.

Never commit `.env`, `.env.local`, `.dev.vars`, private keys, credential JSON,
production tokens, real OAuth secrets, or Cloudflare API tokens. `.env.example`
may contain placeholders only. Do not print secrets in logs; tests use mock or
test-only values.

Required production secrets:

- `SESSION_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_CLIENT_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APP_BASE_URL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `LHCI_GITHUB_APP_TOKEN`

Apple secrets are required because Sign in with Apple is enabled and must be
available as GitHub Secrets and Cloudflare Worker secrets.
Production `APP_BASE_URL` is `https://lab.buy2330.cc`.

## 8. Money, splits, settlements, and payments

- Store all money as integers. For TWD, `1280` means `NT$1,280`; never use
  floating point for money.
- Every expense split must satisfy
  `sum(expense_participants.share_amount) === expenses.amount`.
- Equal and ratio split remainders are assigned deterministically using stable
  participant order.
- Reject empty participant lists, duplicate participants, zero/negative
  amounts, invalid users, and custom splits whose total does not equal the
  expense amount.
- Soft-deleted expenses are ignored in active settlement calculations.
- Pending payments do not reduce confirmed balances; confirmed payments reduce
  outstanding balances.
- Disabled users remain in historical settlement data but cannot create new
  expenses.
- Easter eggs must never affect accounting correctness.

Balance model:

```txt
net = paid_total - owed_total - confirmed_outgoing_payments + confirmed_incoming_payments
```

`net > 0` means others owe this user; `net < 0` means this user owes others.

## 9. API and D1 essentials

Standard error shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

Core API areas:

- Auth: Google start/callback, Apple auth, logout, current user.
- Members: list and admin status/role management.
- Expenses: list/detail/create for authenticated active members; update and
  soft-delete are payer-only.
- Settlements/payments: summary, active-member suggested-transfer payment create,
  receiver/admin confirmation.
- Admin: audit log view, member administration, CSV export, Easter egg
  configuration.

Use Cloudflare D1. All schema changes must be reproducible SQL migrations in
`migrations/`; never modify production database schema manually or rewrite
applied migrations.

Core tables:

- `users`
- `user_identities`
- `groups`
- `group_members`
- `expenses`
- `expense_participants`
- `payments`
- `audit_logs`
- `easter_eggs`
- `user_easter_egg_unlocks`

Audit logs are required for expense create/update/delete, payment
create/confirm, member role changes, member disable/reactivate, Easter egg
unlock, Easter egg enable/disable, and admin CSV export.

## 10. Easter eggs

MVP Easter eggs are Konami Code, Midnight Lab Mode, and hidden `/garage`.

Easter eggs must be optional, admin-configurable, tracked per user, tested,
implemented with original assets/styles from `docs/DESIGN.md`, accessible where
applicable, and unable to modify accounting or settlement results.

## 11. Testing and quality gates

Run the relevant checks for changed files. Before MVP completion and deployment
readiness, these commands must pass:

```bash
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
pnpm sonar:open-issues
```

Additional useful commands:

```bash
pnpm typecheck
pnpm format:check
pnpm --dir apps/web exec ng test --watch=false --code-coverage
pnpm --dir apps/web exec ng lint
pnpm --dir apps/web exec ng build --configuration production
pnpm --dir apps/worker test
```

Non-negotiable thresholds:

- Coverage: at least 95% for statements, branches, functions, and lines.
- ESLint: flat config `eslint.config.js`, 0 errors, 0 warnings, no whole-file
  disables; single-line disables need justification.
- E2E: Playwright across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile
  Safari, covering auth, dashboard, expenses, settlements, admin authorization,
  Easter eggs, and i18n smoke flows.
- Lighthouse mobile: Performance 90, Accessibility 100, Best Practices 100,
  SEO 100.
- SonarCloud: zero open issues and zero unreviewed Security Hotspots.

Do not lower thresholds, skip tests, mark broken tests pending, delete tests
without stronger replacements, or bypass quality gates.

## 12. Development workflow

- Make precise, minimal, complete changes.
- Reuse existing helpers and patterns before adding abstractions.
- Keep TypeScript strict and avoid unnecessary casts.
- Add/update tests when behavior changes.
- Update SDD/API/DESIGN/I18N/TESTING/LIGHTHOUSE docs when behavior, contracts,
  UI, i18n, testing, or performance rules change.
- Do not rewrite unrelated code, introduce unrequested dependencies, ignore
  failing tests, change quality gates, commit generated secrets, or implement UI
  outside `docs/DESIGN.md`.
- Default repository workflow is a single `main` branch unless a human
  coordinator explicitly asks otherwise.

Before reporting completion, confirm Angular 22 remains in use, no forbidden
frontend framework was introduced, visible strings are i18n-ready, design rules
were followed, no secrets were committed, relevant checks passed, coverage and
Lighthouse gates remain intact, D1 migrations are reproducible when schema
changes exist, audit/security/accounting invariants are preserved, and related
docs are updated.

Correctness, privacy, accessibility, security, i18n, and tests are more
important than visual flair. When uncertain, preserve accounting correctness and
security first.
