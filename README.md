# LabSplit Black Gold

Private lab expense splitter for `https://lab.buy2330.cc`.

## Stack

- Angular 22 standalone frontend.
- Cloudflare Workers backend with Hono.
- Cloudflare D1 database migrations.
- Angular i18n with `zh-TW` source locale and `en-US` secondary locale.
- Playwright E2E tests.
- Lighthouse CI quality gate.

Production `/api/*` requests are served by the Cloudflare Worker route `lab.buy2330.cc/api/*`.
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

Production secrets must be stored in GitHub Secrets.

Sign in with Apple is currently visible in the login screen but disabled while Apple review is pending. Apple secrets are optional until that feature is enabled.
