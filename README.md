# LabSplit Black Gold

OAuth-gated expense splitter for `https://lab.buy2330.cc`, available to anyone with a supported sign-in.

## Stack

- Angular 22 standalone frontend.
- Cloudflare Workers backend with Hono.
- Cloudflare D1 database migrations.
- Angular i18n with `zh-TW` source locale and `en-US` secondary locale.
- Playwright E2E tests.
- Lighthouse CI quality gate.

Production `/api/*` requests are served by the Cloudflare Worker route `lab.buy2330.cc/api/*`.

<!-- Maintainer reminder: `/api/health` is important for uptime checks and deployment verification. Keep it available, but never include secrets or private diagnostics in this README note. -->

Run the `Deploy Cloudflare Worker` workflow manually after `CLOUDFLARE_API_TOKEN` has Workers, D1, and route-management permissions.

## Local Setup

Enable pnpm with Corepack, then install dependencies:

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
pnpm install
```

Start the web app:

```bash
pnpm dev
```

Run quality gates:

```bash
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
```

## Secrets

Copy `.env.example` for local development only. Do not commit `.env`, `.env.local`, `.dev.vars`, private keys, credential JSON files, or production tokens.

Production secrets must be stored in GitHub Secrets and synced to Worker
secrets when required by the backend.

Sign in with Apple is enabled. Configure `APPLE_TEAM_ID`,
`APPLE_CLIENT_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` as GitHub Secrets and
Cloudflare Worker secrets; documentation and examples must use placeholders
only.

Invite activation uses backend-only `LAB_INVITE_CODE` and optional
comma-separated `ALLOWED_EMAILS` Worker secrets. Never expose these values to the
frontend bundle.
