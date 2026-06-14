# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading

Before implementing, modifying, refactoring, or testing anything, read these files in order:

1. `AGENTS.md` — agent behavior policy, forbidden tech, quality gates, secret rules
2. `docs/SDD.md` — source of truth for product behavior and architecture
3. `docs/DESIGN.md` — source of truth for all UI/UX decisions (wins over SDD on visual style)
4. `docs/API.md` — API contracts
5. `docs/I18N.md` — i18n rules
6. `docs/TESTING.md` — test targets and coverage requirements
7. `docs/LIGHTHOUSE.md` — performance budget

## Commands

```bash
# Setup
corepack enable && corepack prepare pnpm@10.14.0 --activate
pnpm install

# Dev
pnpm dev                    # Angular dev server (localhost:4200)

# Quality gates (all must pass before completion)
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci

# Run a single Angular test file
cd apps/web && ng test --watch=false --include='**/auth.service.spec.ts'

# Run worker tests
cd apps/worker && pnpm test

# Type check
pnpm typecheck

# Extract i18n strings
cd apps/web && pnpm extract-i18n

# Check SonarCloud open issues
pnpm sonar:open-issues
```

## Architecture

This is a pnpm monorepo with three packages: `apps/web`, `apps/worker`, and `e2e`.

### Frontend (`apps/web`) — Angular 22

- **Standalone components** only; no NgModules.
- Route-level lazy loading via `loadComponent` in `app.routes.ts`.
- Three guards: `authGuard` (requires login), `guestGuard` (redirects logged-in users), `adminGuard` (requires admin role).
- `AuthService` (`core/auth/`) holds auth state via Angular `signal()`s — `currentUser`, `isAuthenticated`, `isAdmin`. Auth state is initialized at startup by calling `refresh()` against `/api/auth/me`.
- API calls go through `HttpClient` with `api-credentials.interceptor.ts` (`core/http/`), which adds `withCredentials: true` for cookie-based sessions.
- `environment.apiBaseUrl` is `/api` (relative), so the Angular dev server proxies API calls to the worker via `angular.json` proxy config.
- i18n: source locale `zh-TW`, secondary `en-US`. Templates use `i18n` attributes; TypeScript uses `$localize`. Locale files live in `apps/web/src/locale/`.
- CSS design tokens are in `apps/web/src/styles/tokens.css`. Do not invent new tokens.

### Backend (`apps/worker`) — Cloudflare Workers + Hono

- Entry point: `src/index.ts`. All routes mount under `/api`.
- Route modules: `auth`, `members`, `expenses`, `settlements`, `payments`, `admin`.
- `validateOrigin` middleware runs on all `/api/*` requests (CSRF protection for cookie sessions).
- Auth middleware: `require-auth.ts` sets `c.var.currentUser` (type `SessionUser`); `require-admin.ts` enforces admin role.
- All request bodies validated with Zod. Error responses use `errorResponse()` from `http/error-response.ts` with shape `{ error: { code, message, details } }`.
- Worker environment bindings are typed in `types.ts` (`Env`, `AppBindings`). D1 database is accessed via `c.env.DB`.
- Worker tests use Node's built-in test runner via `tsx --test`.

### Database — Cloudflare D1

- SQL migrations in `migrations/` — numbered sequentially (`0001_`, `0002_`, …). Never modify applied migrations; always add new ones.
- Core tables: `users`, `user_identities`, `groups`, `group_members`, `expenses`, `expense_participants`, `payments`, `audit_logs`, `easter_eggs`, `user_easter_egg_unlocks`.
- Dev seed data: `apps/worker/src/db/seed-dev.sql`.

### E2E (`e2e/`) — Playwright

- Tests run across Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- Run with `pnpm e2e` from root.

## Key invariants

**Money:** All amounts are stored as integers (TWD cents = whole NT dollars, e.g. `1280` = NT$1,280). Never use floating point. Every split must satisfy `sum(participant.share_amount) === expense.amount`. Remainders from equal/ratio splits are assigned deterministically (first participants get +1).

**Identity:** Users are identified by `provider + provider_subject`, not email alone.

**Session cookies:** Must be `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Mutation APIs validate the `Origin` header.

**OAuth:** Backend verifies all OAuth tokens — never trust frontend claims. Apple auth UI stays visible but disabled while Apple review is pending; backend returns a disabled error without requiring Apple credentials.

**SonarCloud:** Zero open issues and zero unreviewed Security Hotspots is a hard deployment gate. Do not merge or deploy while issues exist.

**Coverage:** 95% minimum for statements, branches, functions, and lines across both `web` and `worker`.

**Lighthouse:** Mobile scores must be ≥ 90 Performance, 100 Accessibility, 100 Best Practices, 100 SEO.

**i18n:** All visible user-facing strings must use `i18n` markers (templates) or `$localize` (TypeScript). No hard-coded visible strings.
