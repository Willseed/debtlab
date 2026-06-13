# LabSplit Black Gold

Private lab expense splitter for `https://lab.buy2330.cc`.

## Stack

- Angular 22 standalone frontend.
- Cloudflare Workers backend with Hono.
- Cloudflare D1 database migrations.
- Angular i18n with `zh-TW` source locale and `en-US` secondary locale.
- Playwright E2E tests.
- Lighthouse CI quality gate.

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
