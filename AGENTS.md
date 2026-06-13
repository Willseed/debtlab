# AGENTS.md

# Codex Agent Instructions for DebtLab / LabSplit Black Gold

## 1. Purpose

This file is the first file Codex or any coding agent must read before implementing, modifying, refactoring, or testing this repository.

The goal is to keep all AI-assisted development aligned with the product SDD, design system, security policy, test policy, and deployment requirements.

This file does not replace the SDD. It defines the working rules for agents.

---

## 2. Required Reading Order

Before making code changes, read the following files in this exact order:

1. `AGENTS.md`
2. `docs/SDD.md`
3. `docs/DESIGN.md`
4. `docs/API.md`
5. `docs/I18N.md`
6. `docs/TESTING.md`
7. `docs/LIGHTHOUSE.md`
8. `README.md`

If any of these files do not exist yet, create them when relevant to the current task.

`docs/SDD.md` defines product behavior and architecture.

`docs/DESIGN.md` is the single source of truth for all UI, UX, visual design, design tokens, typography, spacing, layout, motion, and component styling.

If `docs/SDD.md` and `docs/DESIGN.md` conflict on visual style, `docs/DESIGN.md` wins.

---

## 3. Project Identity

Repository name candidate:

```txt
debtlab
```

Product name:

```txt
LabSplit Black Gold
```

Production domain:

```txt
lab.buy2330.cc
```

Canonical production URL:

```txt
https://lab.buy2330.cc
```

Default product locale:

```txt
zh-TW
```

Secondary product locale:

```txt
en-US
```

---

## 4. Absolute Technical Requirements

The frontend must use:

1. Angular 22.
2. Angular CLI.
3. TypeScript.
4. Standalone Components.
5. Angular Router.
6. Reactive Forms.
7. Angular i18n.
8. Angular unit tests through `ng test`.

The backend must use:

1. Cloudflare Workers.
2. TypeScript.
3. Hono.
4. Cloudflare D1.
5. Zod validation.

E2E tests must use:

```txt
Playwright
```

Do not use Cypress.

---

## 5. Strictly Forbidden Technologies

Do not introduce:

1. React.
2. Vite as the primary frontend framework.
3. TanStack Query.
4. shadcn/ui.
5. Cypress.
6. Large charting libraries for MVP.
7. Heavy UI kits that risk Lighthouse failure.
8. Any unapproved CSS framework that conflicts with `docs/DESIGN.md`.
9. Any external font that harms Lighthouse unless explicitly approved.
10. Any client-side secret handling.

---

## 6. Design Rules

All UI and UX implementation must follow `docs/DESIGN.md`.

Do not create new visual patterns unless they are documented in `docs/DESIGN.md`.

All of the following must be defined or approved by `docs/DESIGN.md` before implementation:

1. Color tokens.
2. Typography.
3. Spacing.
4. Layout rules.
5. Component variants.
6. Button styles.
7. Form styles.
8. Table styles.
9. Modal styles.
10. Motion and animation.
11. Easter egg visual effects.
12. Responsive behavior.

The application style is black-and-gold luxury dashboard inspired by a supercar cockpit.

Do not use:

1. Lamborghini logos.
2. Lamborghini trademarks.
3. Copied Lamborghini assets.
4. Protected brand trade dress.
5. Any copyrighted visual asset without permission.

---

## 7. i18n Rules

The default locale is:

```txt
zh-TW
```

The MVP must also support:

```txt
en-US
```

All visible UI text must be localizable.

Angular templates must use `i18n` markers.

TypeScript user-facing strings must use `$localize`.

Do not hard-code visible UI strings without i18n support.

Required locale files:

```txt
apps/web/src/locale/messages.xlf
apps/web/src/locale/messages.zh-TW.xlf
apps/web/src/locale/messages.en-US.xlf
```

Required command:

```bash
ng extract-i18n --output-path src/locale
```

---

## 8. Secret Management Rules

All private keys, credentials, deployment tokens, OAuth secrets, signing secrets, and production credentials must be stored in GitHub Secrets.

Never commit:

1. `.env`
2. `.env.local`
3. `.dev.vars`
4. private keys
5. credential JSON files
6. production tokens
7. real OAuth secrets
8. Cloudflare API tokens

The repository may include `.env.example`, but all values must be placeholders.

GitHub Actions must read secrets using:

```yaml
${{ secrets.SECRET_NAME }}
```

Cloudflare Worker secrets must be populated from GitHub Secrets during deployment.

Do not print secrets in logs.

Do not hard-code secrets in tests.

Use mock or test-only values for tests.

---

## 9. Required Secrets

The following must be configured as GitHub Secrets before production deployment:

```txt
SESSION_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APPLE_CLIENT_ID
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
APP_BASE_URL
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID
LHCI_GITHUB_APP_TOKEN
```

Production value:

```txt
APP_BASE_URL=https://lab.buy2330.cc
```

---

## 10. Authentication Rules

Authentication must support:

1. Google OAuth.
2. Sign in with Apple.

Never trust frontend OAuth claims directly.

OAuth tokens must be verified by the Cloudflare Worker backend.

Application identity must be based on:

```txt
provider + provider_subject
```

Do not use email as the only identity key.

Session cookies must be:

```txt
HttpOnly
Secure
SameSite=Lax
Path=/
```

Disabled users must not be able to create new sessions.

---

## 11. Money and Accounting Rules

All money values must be stored as integers.

For TWD:

```txt
1280 means NT$1,280
```

Never store money as floating point.

Every split must satisfy:

```txt
sum(participant.share_amount) === expense.amount
```

Easter eggs must never affect accounting correctness.

Soft-deleted expenses must be ignored in active settlement calculations.

Pending payments must not reduce confirmed balance.

Confirmed payments must reduce outstanding balance.

---

## 12. Testing Requirements

The following commands must pass before a task is considered complete:

```bash
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
```

Angular-specific commands that must pass:

```bash
ng test --watch=false --code-coverage
ng lint
ng build --configuration production
```

Coverage minimum:

```txt
Statements: 95%
Branches: 95%
Functions: 95%
Lines: 95%
```

Do not lower coverage thresholds.

Do not skip tests to make CI pass.

Do not mark broken tests as pending.

Do not delete tests unless they are replaced by stronger tests.

---

## 13. E2E Requirements

E2E must use Playwright.

Required browser coverage:

1. Chromium.
2. Firefox.
3. WebKit.
4. Mobile Chrome emulation.
5. Mobile Safari emulation.

Required E2E flows:

1. Auth flow.
2. Dashboard flow.
3. Expense create/edit flow.
4. Settlement flow.
5. Admin authorization flow.
6. Easter egg flow.
7. i18n smoke flow.

---

## 14. ESLint Requirements

Use ESLint flat config:

```txt
eslint.config.js
```

Do not use:

```txt
.eslintrc.json
```

Lint acceptance:

```txt
0 errors
0 warnings
```

Do not use whole-file `eslint-disable`.

Single-line disables require a clear reason.

Do not use `any` unless there is a documented reason and no better typed alternative.

---

## 15. Lighthouse Requirements

Mobile Lighthouse minimum:

```txt
Performance: 90
Accessibility: 100
Best Practices: 100
SEO: 100
```

Short form:

```txt
90 / 100 / 100 / 100
```

Do not add dependencies, fonts, images, charts, or animations that make Lighthouse fail.

Prefer:

1. Route-level lazy loading.
2. Minimal CSS.
3. Native HTML and CSS where possible.
4. Angular deferrable views for non-critical content.
5. Accessible semantic markup.
6. Explicit image dimensions.
7. No unnecessary third-party scripts.

---

## 16. Database Rules

Use Cloudflare D1.

All schema changes must be done through SQL migrations.

Do not modify production database schema manually.

Migration files must be reproducible and stored in:

```txt
migrations/
```

D1 must include tables for:

1. users
2. user_identities
3. groups
4. group_members
5. expenses
6. expense_participants
7. payments
8. audit_logs
9. easter_eggs
10. user_easter_egg_unlocks

---

## 17. API Rules

All API routes must live under:

```txt
/api
```

All request bodies must be validated with Zod.

All private API routes must require authentication.

Admin-only routes must use admin authorization middleware.

Use the standard error response format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

Do not expose stack traces to users.

---

## 18. Security Rules

Required security behavior:

1. Verify OAuth tokens on backend.
2. Use HttpOnly secure cookies.
3. Validate Origin header for mutation APIs.
4. Keep all secrets in GitHub Secrets.
5. Do not log secrets.
6. Do not expose private user data to guests.
7. Use role-based authorization.
8. Add audit logs for sensitive actions.
9. Do not trust client-side role claims.
10. Do not implement unsafe debug endpoints.

---

## 19. Audit Log Requirements

Create audit logs for:

1. Expense created.
2. Expense updated.
3. Expense deleted.
4. Payment created.
5. Payment confirmed.
6. Member role changed.
7. Member disabled.
8. Member reactivated.
9. Easter egg unlocked.
10. Easter egg enabled or disabled.
11. Admin CSV export.

---

## 20. Easter Egg Rules

MVP Easter eggs:

1. Konami Code.
2. Midnight Lab Mode.
3. Hidden `/garage` route.

Easter eggs must:

1. Be optional.
2. Be admin-configurable.
3. Be tracked per user.
4. Be tested.
5. Follow `docs/DESIGN.md`.
6. Never modify accounting results.

---

## 21. Development Workflow for Codex

For every task:

1. Read relevant docs first.
2. Identify affected files.
3. Make the smallest safe change.
4. Add or update tests.
5. Run relevant tests.
6. Run lint.
7. Update docs if behavior changes.
8. Summarize changed files and commands run.

Do not:

1. Rewrite unrelated code.
2. Introduce unrequested dependencies.
3. Ignore failing tests.
4. Change quality gates.
5. Commit generated secrets.
6. Implement UI outside `docs/DESIGN.md`.

---

## 22. Required Completion Checklist

Before reporting a task as complete, verify:

```txt
[ ] Angular 22 is still used
[ ] No forbidden frontend framework was introduced
[ ] All visible UI strings are i18n-ready
[ ] DESIGN.md was followed
[ ] No secrets were committed
[ ] Tests were added or updated
[ ] ng test passes
[ ] ng lint passes
[ ] Playwright tests pass when relevant
[ ] Coverage remains >= 95%
[ ] Lighthouse threshold is preserved when UI changes
[ ] D1 migrations are reproducible when schema changes
[ ] SDD/API/DESIGN docs are updated when behavior changes
```

---

## 23. Preferred Implementation Order

When starting from an empty repository, implement in this order:

1. Repository scaffolding.
2. Angular 22 app skeleton.
3. Cloudflare Worker skeleton.
4. D1 migrations.
5. ESLint flat config.
6. Karma coverage config.
7. Playwright config.
8. Lighthouse CI config.
9. Angular i18n setup.
10. DESIGN.md tokens and base components.
11. Auth APIs and frontend auth shell.
12. Expense CRUD.
13. Split logic.
14. Settlement logic.
15. Admin functions.
16. Easter eggs.
17. Performance and accessibility polish.

---

## 24. Final Reminder

The project is a private lab expense splitter with black humor and black-and-gold luxury styling.

However, correctness, privacy, accessibility, security, i18n, and tests are more important than visual flair.

When uncertain, preserve accounting correctness and security first.
