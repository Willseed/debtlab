# CLAUDE.md

Guidance for Claude Code in this repository. Follow `AGENTS.md` for full agent
policy and `docs/SDD.md` / `docs/DESIGN.md` for product and UI source of truth.

## Commands

```bash
# Setup
corepack enable && corepack prepare pnpm@10.14.0 --activate
pnpm install

# Development
pnpm dev

# Quality gates
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
pnpm sonar:open-issues

# Targeted checks
pnpm --dir apps/web exec ng test --watch=false --include='**/auth.service.spec.ts'
pnpm --dir apps/worker test
pnpm --dir apps/web extract-i18n
pnpm format:check
```

## Architecture

- Monorepo packages: `apps/web` (Angular 22), `apps/worker` (Cloudflare Worker),
  and `e2e` (Playwright).
- Web app uses standalone components, route-level lazy loading, Reactive Forms,
  Angular Router, signals where useful, and Angular i18n (`zh-TW` source,
  `en-US` secondary).
- API calls use `HttpClient` with credentials for cookie sessions; local dev
  proxies `/api` to the worker.
- Worker entry point is `apps/worker/src/index.ts`; all routes mount under
  `/api` and use Hono, Zod validation, D1 via `c.env.DB`, and typed bindings.
- Auth uses backend-verified OAuth, `provider + provider_subject` identity,
  `HttpOnly`/`Secure`/`SameSite=Lax`/`Path=/` cookies, `Origin` validation for
  mutations, and admin middleware for admin routes.
- D1 migrations live in `migrations/`. Add new migrations; do not rewrite
  applied schema changes.

## Non-negotiable invariants

- Money is integer-only (`1280` = `NT$1,280`); splits must sum exactly to the
  expense amount; equal/ratio remainders are deterministic.
- Pending payments do not reduce balances; confirmed payments do; soft-deleted
  expenses are ignored in active settlement calculations.
- Visible UI strings require `i18n` or `$localize`.
- Follow `docs/DESIGN.md`; never use Lamborghini trademarks, copied assets, or
  copyrighted visual material.
- Never commit secrets or credential files. Production secrets belong in GitHub
  Secrets / Worker secrets.
- Coverage minimum is 95% across statements, branches, functions, and lines;
  ESLint must have 0 warnings; Lighthouse mobile target is 90/100/100/100;
  SonarCloud open issues and unreviewed Security Hotspots must be zero.
