# Software Design Document (SDD)

# LabSplit Black Gold

## 0. Agent Configuration

Before using Codex or any AI coding agent, place `AGENTS.md` at the repository root.

`AGENTS.md` must be read before this SDD.

Required reading order for Codex:

1. `AGENTS.md`
2. `docs/SDD.md`
3. `docs/DESIGN.md`
4. `docs/API.md`
5. `docs/I18N.md`
6. `docs/TESTING.md`
7. `docs/LIGHTHOUSE.md`
8. `README.md`

`AGENTS.md` defines agent behavior, forbidden technologies, test requirements, secret handling rules, and implementation workflow.

This SDD defines product and system design.

## 1. Document Control

| Field                    | Value                         |
| ------------------------ | ----------------------------- |
| Project Name             | LabSplit Black Gold           |
| Document Type            | Software Design Document      |
| Version                  | 1.0.0                         |
| Primary Language         | English                       |
| Default Product Locale   | zh-TW                         |
| Secondary Product Locale | en-US                         |
| Target Platform          | Cloudflare                    |
| Production Domain        | lab.buy2330.cc                |
| Canonical URL            | https://lab.buy2330.cc        |
| Frontend Framework       | Angular 22                    |
| Backend Runtime          | Cloudflare Workers            |
| Database                 | Cloudflare D1                 |
| E2E Framework            | Playwright                    |
| Unit Test Framework      | Angular Test Runner / Karma   |
| CI Quality Target        | Enterprise-grade quality gate |

---

## 2. Executive Summary

LabSplit Black Gold is a private expense-splitting web application for a laboratory. It allows lab members to record shared expenses, split costs among participants, calculate balances, suggest optimized settlements, and track payments. The application will be deployed on Cloudflare infrastructure and will use Cloudflare Workers for backend APIs, Cloudflare D1 for persistent relational storage, and Angular 22 for the frontend.

The product must support Google OAuth and Sign in with Apple. Authentication must be verified on the backend, and local application authorization must be managed independently through local users, roles, and group membership records.

The visual style should be inspired by a luxury black-and-gold supercar dashboard aesthetic, referencing the provided Lamborghini-style design inspiration only as a mood reference. The application must not use Lamborghini logos, trademarks, copyrighted visual assets, or any copied brand identity.

The product must also include an extensible Easter egg system that can be enabled, disabled, tracked, and expanded without affecting accounting correctness.

This SDD is intended to be directly usable by Codex or another AI coding agent as an implementation guide.

---

## 3. Goals

## 3.1 Product Goals

1. Provide a private web application for laboratory expense tracking.
2. Allow members to record shared expenses.
3. Support equal split, custom amount split, and ratio-based split.
4. Calculate member balances accurately.
5. Suggest simplified settlement transfers.
6. Allow payment records and confirmations.
7. Provide admin-level member and audit management.
8. Support Google OAuth and Sign in with Apple.
9. Provide a premium black-and-gold user interface.
10. Include safe and optional Easter eggs.
11. Support Traditional Chinese Taiwan as the default locale.
12. Maintain high engineering quality through strict testing and CI gates.

## 3.2 Engineering Goals

1. Use Angular 22 for the frontend.
2. Use Cloudflare Workers for backend APIs.
3. Use Cloudflare D1 for database persistence.
4. Use reproducible SQL migrations.
5. Use TypeScript throughout the system.
6. Use backend-verified OAuth identity.
7. Use HttpOnly cookie sessions.
8. Use Angular i18n for all visible UI strings.
9. Use Playwright for E2E testing.
10. Enforce ESLint with zero warnings.
11. Enforce at least 95% test coverage.
12. Enforce Lighthouse mobile score of at least 90 / 100 / 100 / 100.

---

## 4. Non-goals for MVP

The MVP will not include:

1. Receipt OCR.
2. Bank integration.
3. LINE Pay, Apple Pay, or automatic money transfer.
4. Public self-registration without OAuth.
5. Multi-currency exchange rate conversion.
6. Native mobile applications.
7. Complex approval workflows.
8. Multi-lab hierarchy beyond a single default group.
9. Advanced analytics beyond basic dashboard summaries.
10. Large charting libraries that may harm Lighthouse performance.

---

## 5. Target Users and Roles

## 5.1 Guest

A guest is an unauthenticated visitor.

Guests can:

1. View the landing page.
2. Use Google login.
3. Use Apple login.

Guests cannot:

1. Access private expense data.
2. View members.
3. Create expenses.
4. View settlements.
5. Access admin pages.

## 5.2 Member

A member is an authenticated active lab user.

Members can:

1. View the dashboard.
2. View expenses.
3. Create expenses.
4. Edit expenses they created.
5. View settlement summaries.
6. Record payments.
7. Confirm payments when they are the receiver.
8. Unlock enabled Easter eggs.
9. View their own balance and payment status.

Members cannot:

1. Delete other users' expenses.
2. Manage member roles.
3. Disable users.
4. Access admin audit tools.
5. Modify other users' payment confirmations unless explicitly authorized.

## 5.3 Admin

An admin is an authenticated user with elevated privileges.

Admins can:

1. Perform all member actions.
2. Edit any expense.
3. Soft-delete expenses.
4. Manage member roles.
5. Disable members.
6. View audit logs.
7. Export CSV data.
8. Enable or disable Easter eggs.
9. View system-level summaries.

---

## 6. System Architecture

## 6.1 High-Level Architecture

```txt
Browser
  |
  | HTTPS
  v
Cloudflare Pages / Workers Assets
  |
  | Serves Angular 22 frontend
  v
Angular 22 SPA
  |
  | /api/*
  v
Cloudflare Worker API
  |
  | D1 Binding
  v
Cloudflare D1
```

## 6.2 Technology Stack

## Frontend

1. Angular 22.
2. Angular CLI.
3. TypeScript.
4. Standalone Components.
5. Angular Router.
6. Reactive Forms.
7. Angular i18n.
8. Angular built-in testing via `ng test`.
9. ESLint latest flat config.
10. CSS custom properties.
11. Optional Angular Service Worker only if it does not harm Lighthouse.

## Backend

1. Cloudflare Workers.
2. TypeScript.
3. Hono router.
4. Zod validation.
5. jose for JWT and OAuth token validation.
6. Cloudflare D1.
7. Optional Cloudflare KV for feature flags or session metadata.
8. Wrangler for local development and deployment.

## Database

1. Cloudflare D1.
2. SQLite-compatible SQL.
3. Reproducible migration files.
4. No manual production schema changes.

## Testing

1. Angular unit tests through `ng test`.
2. Coverage threshold at 95% for statements, branches, functions, and lines.
3. Playwright for E2E.
4. API and service-level tests for backend logic.
5. Lighthouse CI for quality gates.

---

## 7. Repository Structure

```txt
lab-split/
├── AGENTS.md
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/
│   │   │   │   │   ├── auth/
│   │   │   │   │   ├── guards/
│   │   │   │   │   ├── interceptors/
│   │   │   │   │   ├── layout/
│   │   │   │   │   └── services/
│   │   │   │   ├── features/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── expenses/
│   │   │   │   │   ├── members/
│   │   │   │   │   ├── settlements/
│   │   │   │   │   ├── admin/
│   │   │   │   │   └── easter-eggs/
│   │   │   │   ├── shared/
│   │   │   │   │   ├── components/
│   │   │   │   │   ├── pipes/
│   │   │   │   │   ├── directives/
│   │   │   │   │   └── models/
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── app.routes.ts
│   │   │   │   └── app.component.ts
│   │   │   ├── assets/
│   │   │   ├── environments/
│   │   │   ├── locale/
│   │   │   │   ├── messages.xlf
│   │   │   │   ├── messages.zh-TW.xlf
│   │   │   │   └── messages.en-US.xlf
│   │   │   ├── styles/
│   │   │   │   ├── tokens.css
│   │   │   │   ├── components.css
│   │   │   │   └── global.css
│   │   │   ├── index.html
│   │   │   └── main.ts
│   │   ├── angular.json
│   │   ├── eslint.config.js
│   │   ├── karma.conf.js
│   │   ├── tsconfig.app.json
│   │   ├── tsconfig.spec.json
│   │   └── package.json
│   │
│   └── worker/
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── expenses.ts
│       │   │   ├── members.ts
│       │   │   ├── settlements.ts
│       │   │   └── admin.ts
│       │   ├── services/
│       │   │   ├── auth.service.ts
│       │   │   ├── expense.service.ts
│       │   │   ├── settlement.service.ts
│       │   │   ├── audit.service.ts
│       │   │   └── easter-egg.service.ts
│       │   ├── db/
│       │   │   ├── queries.ts
│       │   │   └── schema.ts
│       │   ├── middleware/
│       │   │   ├── require-auth.ts
│       │   │   └── require-admin.ts
│       │   ├── validation/
│       │   └── types.ts
│       ├── wrangler.toml
│       └── package.json
│
├── e2e/
│   ├── playwright.config.ts
│   ├── tests/
│   │   ├── auth.spec.ts
│   │   ├── dashboard.spec.ts
│   │   ├── expenses.spec.ts
│   │   ├── settlements.spec.ts
│   │   ├── admin.spec.ts
│   │   └── easter-eggs.spec.ts
│   └── fixtures/
│
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_indexes.sql
│   └── 0003_seed_easter_eggs.sql
│
├── docs/
│   ├── SDD.md
│   ├── API.md
│   ├── DESIGN.md
│   ├── I18N.md
│   ├── TESTING.md
│   ├── LIGHTHOUSE.md
│   └── CODEX_TASKS.md
│
├── lighthouserc.cjs
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

---

## 8. Frontend Design

## 8.1 Angular 22 Requirements

The frontend must use Angular 22.

The implementation must use:

1. Standalone Components.
2. Angular Router.
3. Route-level lazy loading.
4. Reactive Forms.
5. Angular i18n.
6. Signals where suitable.
7. Computed signals for derived view state where suitable.
8. `inject()` where practical.
9. OnPush change detection where suitable.
10. Strongly typed models.
11. Strict TypeScript configuration.

The implementation must avoid:

1. React.
2. Vite as the primary frontend framework.
3. TanStack Query.
4. shadcn/ui.
5. Cypress.
6. NgModule-heavy feature architecture.
7. Untyped forms.
8. `any` unless explicitly justified.
9. Business logic in templates.
10. Large client-side dependencies that harm Lighthouse scores.

## 8.2 Angular Application Layers

## Core Layer

The `core/` directory contains singleton application-level services:

1. `AuthService`.
2. `CurrentUserService`.
3. `ApiClient`.
4. `ErrorHandlerService`.
5. `ToastService`.
6. `I18nService`.
7. `FeatureFlagService`.

## Feature Layer

Each feature must own its routes, pages, components, services, models, and tests.

Example:

```txt
features/expenses/
├── expenses.routes.ts
├── pages/
│   ├── expense-list-page.component.ts
│   ├── expense-detail-page.component.ts
│   └── expense-create-page.component.ts
├── components/
│   ├── expense-form.component.ts
│   ├── expense-table.component.ts
│   └── split-editor.component.ts
├── services/
│   └── expense-api.service.ts
├── models/
│   └── expense.model.ts
└── *.spec.ts
```

## Shared Layer

The `shared/` directory contains reusable presentational components, pipes, directives, and models.

Shared code must not contain feature-specific business rules unless the abstraction is deliberate and tested.

---

## 9. User Interface Pages

## 9.1 Landing Page

Route:

```txt
/
```

Purpose:

1. Public entry page.
2. Product introduction.
3. Google login button.
4. Apple login button.

Required hero copy in zh-TW:

```txt
實驗室花費，精準拆帳
```

Required hero copy in en-US:

```txt
Lab Expenses. Split With Precision.
```

Required subtitle in zh-TW:

```txt
給實驗室共同支出使用的私有拆帳儀表板。
```

Required subtitle in en-US:

```txt
A private expense cockpit for shared lab spending.
```

## 9.2 Dashboard Page

Route:

```txt
/dashboard
```

Sections:

1. Monthly total spent.
2. Current user's net balance.
3. Amount the current user owes.
4. Amount others owe the current user.
5. Recent expenses.
6. Settlement suggestions.
7. Easter egg badge area.

Required cards:

1. This Month.
2. Your Balance.
3. Action Required.
4. Recent Activity.

## 9.3 Expense List Page

Route:

```txt
/expenses
```

Features:

1. List all group expenses.
2. Search by title.
3. Filter by date range.
4. Filter by category.
5. Filter by payer.
6. Pagination or cursor loading.
7. Add expense button.

Columns:

1. Date.
2. Title.
3. Category.
4. Paid By.
5. Amount.
6. Participants.
7. Actions.

## 9.4 Add Expense Page

Route:

```txt
/expenses/new
```

Fields:

1. Title.
2. Description.
3. Amount.
4. Currency.
5. Paid by.
6. Expense date.
7. Category.
8. Split method.
9. Participants.

Split methods:

1. Equal split.
2. Custom amount split.
3. Ratio split.

Validation:

1. Title is required.
2. Amount must be a positive integer.
3. At least one participant is required.
4. Paid-by user must be an active member.
5. Custom split total must equal expense amount.
6. Ratio split must resolve to the exact total amount after rounding.

## 9.5 Expense Detail Page

Route:

```txt
/expenses/:expenseId
```

Display:

1. Expense title.
2. Amount.
3. Date.
4. Category.
5. Payer.
6. Description.
7. Participants.
8. Share amount per participant.
9. Creator.
10. Created time.
11. Updated time.
12. Edit button if authorized.
13. Delete button if admin.

## 9.6 Members Page

Route:

```txt
/members
```

Display:

1. Member name.
2. Email.
3. Role.
4. Status.
5. Total paid.
6. Total owed.
7. Net balance.

Admin actions:

1. Promote to admin.
2. Demote to member.
3. Disable member.
4. Reactivate member.

## 9.7 Settlements Page

Route:

```txt
/settlements
```

Display:

1. Balance summary.
2. Suggested transfers.
3. Payment status.
4. Record payment button.
5. Confirm payment button.

## 9.8 Admin Page

Route:

```txt
/admin
```

Admin only.

Sections:

1. User management.
2. System statistics.
3. Audit logs.
4. Easter egg settings.
5. CSV export.

## 9.9 Hidden Garage Page

Route:

```txt
/garage
```

The `/garage` route is part of the Easter egg system.

Display:

1. Lab spending leaderboard.
2. Coffee expense counter.
3. Most balanced member.
4. Weirdest amount.
5. Easter egg badges.

The route may be hidden from navigation until unlocked.

---

## 10. Visual Design System

## 10.0 DESIGN.md Governance

All visual, interaction, layout, typography, color, spacing, motion, and component styling decisions must follow the repository-level `DESIGN.md`.

`DESIGN.md` is the single source of truth for product style.

If this SDD and `DESIGN.md` conflict on visual design, `DESIGN.md` takes precedence.

The implementation must not introduce UI styles, color tokens, component variants, animations, layouts, or typography rules that are not defined or approved in `DESIGN.md`.

Every major UI component must be traceable to a design rule, token, or component guideline in `DESIGN.md`.

Required implementation rules:

1. All design tokens must be defined in `DESIGN.md` first.
2. CSS variables in the application must match `DESIGN.md`.
3. Angular components must not define one-off visual styles unless the pattern is documented in `DESIGN.md`.
4. Easter egg visual effects must also follow `DESIGN.md`, unless explicitly documented as an approved exception.
5. Lighthouse and accessibility requirements must not be sacrificed for visual styling.
6. No Lamborghini trademarks, logos, copied brand assets, or protected trade dress may be used.
7. The black-and-gold luxury dashboard style must be implemented only through original design tokens and components documented in `DESIGN.md`.

Codex must read and follow `DESIGN.md` before implementing any frontend UI.

## 10.1 Design Direction

The visual style should feel like:

1. Luxury dashboard.
2. Supercar cockpit.
3. True black background.
4. Gold accent lines.
5. Sharp geometry.
6. High-contrast typography.
7. Dramatic uppercase headings.
8. Subtle motion.
9. Precise numeric displays.

The implementation must not copy or use Lamborghini logos, typography, trademarks, or brand assets.

## 10.2 Color Tokens

```css
:root {
  --color-bg: #050505;
  --color-surface: #0b0b0b;
  --color-surface-elevated: #121212;
  --color-border: #2a2418;

  --color-gold: #d6a84f;
  --color-gold-soft: #f0d38a;
  --color-gold-muted: #8c7038;

  --color-text: #f7f3ea;
  --color-text-muted: #aaa397;
  --color-text-dim: #6f6a61;

  --color-danger: #ff4d4d;
  --color-success: #7ee787;
  --color-warning: #f2cc60;
}
```

## 10.3 Typography

Rules:

1. Hero headings must be large, bold, and uppercase in English.
2. zh-TW headings should remain readable and not be forced into unnatural uppercase styling.
3. Numbers must use tabular numeric formatting where possible.
4. Body text must prioritize readability.
5. Avoid external web fonts unless Lighthouse remains compliant.

Suggested CSS:

```css
.heading-hero {
  font-size: clamp(3rem, 9vw, 8rem);
  line-height: 0.9;
  letter-spacing: -0.06em;
  font-weight: 900;
}

.heading-section {
  letter-spacing: 0.12em;
  font-size: 0.85rem;
  color: var(--color-gold);
}

.money {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}
```

## 10.4 Components

## Primary Button

Style:

1. Black background.
2. Gold border.
3. Gold text.
4. Sharp edges.
5. Visible focus ring.
6. Subtle hover glow.

## Dashboard Card

Style:

1. Dark elevated surface.
2. Thin gold border.
3. Subtle gradient.
4. Large numeric value.
5. Small descriptive label.
6. Accessible contrast.

## Table

Style:

1. Dark rows.
2. Minimal borders.
3. Gold hover line.
4. Semantic table headers.
5. Keyboard accessible controls.

## Modal

Style:

1. Black glass-like panel.
2. Gold top border.
3. Large title.
4. Clear action buttons.
5. Accessible focus trap.

## 10.5 Motion

Allowed motion:

1. Button hover glow.
2. Card lift of up to 2px.
3. Page fade-in.
4. Number count-up.
5. Easter egg animations.

Avoid:

1. Excessive bouncing.
2. Cartoon-like motion.
3. Bright neon overload.
4. Motion that harms accessibility.

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

---

## 11. Internationalization

## 11.1 Locale Requirements

Default locale:

```txt
zh-TW
```

Supported locales for MVP:

```txt
zh-TW
en-US
```

All visible UI strings must support Angular i18n.

Hard-coded user-facing strings are not allowed unless wrapped with Angular i18n or `$localize`.

## 11.2 Template i18n

Example:

```html
<h1 i18n="Landing hero title@@landingHeroTitle">實驗室花費，精準拆帳</h1>

<p i18n="Landing hero subtitle@@landingHeroSubtitle">給實驗室共同支出使用的私有拆帳儀表板。</p>
```

## 11.3 TypeScript i18n

Example:

```ts
const message = $localize`:Expense created toast@@expenseCreatedToast:支出已建立`;
```

## 11.4 Locale Files

Required files:

```txt
src/locale/messages.xlf
src/locale/messages.zh-TW.xlf
src/locale/messages.en-US.xlf
```

Required command:

```bash
ng extract-i18n --output-path src/locale
```

## 11.5 Formatting

Use Angular pipes or tested custom pipes.

Money:

```txt
NT$1,280
```

Date:

```txt
2026/06/13
```

Number:

```txt
1,280
```

Do not manually format date, number, or currency strings unless the custom formatter is fully tested.

---

## 12. Authentication and Session Design

## 12.1 Supported Providers

The system must support:

1. Google OAuth.
2. Sign in with Apple.

## 12.2 Identity Model

The application must not rely on email alone as the user identity.

The stable identity key is:

```txt
provider + provider_subject
```

Examples:

```txt
google + Google sub claim
apple + Apple sub claim
```

## 12.3 Google Login Flow

1. User clicks "Continue with Google".
2. Frontend obtains Google credential or authorization code.
3. Frontend sends token data to `POST /api/auth/google`.
4. Worker verifies the token with Google.
5. Worker extracts provider subject, email, name, and picture.
6. Worker creates or updates local user identity.
7. Worker issues app session cookie.
8. Frontend receives current user profile.

## 12.4 Apple Login Flow

1. User clicks "Continue with Apple".
2. Frontend obtains identity token and optional authorization code.
3. Frontend sends token data to `POST /api/auth/apple`.
4. Worker verifies Apple identity token.
5. Worker extracts provider subject and email if available.
6. Worker creates or updates local user identity.
7. Worker issues app session cookie.
8. Frontend receives current user profile.

Apple-specific notes:

1. Apple may only provide name during the first authorization.
2. Apple email may be a private relay address.
3. The system must not assume Apple email is permanent.
4. Apple identity must be matched by provider subject.

## 12.5 Session Cookie

Cookie name:

```txt
labsplit_session
```

Cookie properties:

```txt
HttpOnly
Secure
SameSite=Lax
Path=/
Max-Age=604800
```

Session payload:

```ts
type AppSessionPayload = {
  userId: string;
  role: 'member' | 'admin';
  email?: string;
  name?: string;
  iat: number;
  exp: number;
};
```

Session signing secret:

```txt
SESSION_SECRET
```

---

## 13. Backend API Design

Base path:

```txt
/api
```

## 13.1 Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

## 13.2 Error Codes

```txt
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
CONFLICT
OAUTH_VERIFICATION_FAILED
SPLIT_TOTAL_MISMATCH
INTERNAL_ERROR
```

## 13.3 Auth APIs

## POST /api/auth/google

Request:

```json
{
  "credential": "GOOGLE_ID_TOKEN"
}
```

Response:

```json
{
  "user": {
    "id": "usr_xxx",
    "email": "pony@example.com",
    "displayName": "Pony",
    "avatarUrl": "https://example.com/avatar.png",
    "role": "member"
  }
}
```

## POST /api/auth/apple

Request:

```json
{
  "identityToken": "APPLE_ID_TOKEN",
  "authorizationCode": "AUTH_CODE",
  "user": {
    "name": {
      "firstName": "Pony",
      "lastName": "Lab"
    },
    "email": "pony@example.com"
  }
}
```

Response:

```json
{
  "user": {
    "id": "usr_xxx",
    "email": "pony@example.com",
    "displayName": "Pony Lab",
    "avatarUrl": null,
    "role": "member"
  }
}
```

## POST /api/auth/logout

Response:

```json
{
  "ok": true
}
```

## GET /api/auth/me

Response:

```json
{
  "user": {
    "id": "usr_xxx",
    "email": "pony@example.com",
    "displayName": "Pony",
    "role": "admin"
  }
}
```

## 13.4 Member APIs

## GET /api/members

Response:

```json
{
  "members": [
    {
      "id": "usr_001",
      "displayName": "Alice",
      "email": "alice@example.com",
      "role": "member",
      "status": "active"
    }
  ]
}
```

## PATCH /api/members/:userId

Admin only.

Request:

```json
{
  "role": "admin",
  "status": "active"
}
```

Response:

```json
{
  "ok": true
}
```

## 13.5 Expense APIs

## GET /api/expenses

Query parameters:

```txt
from
to
category
paidBy
limit
cursor
```

Response:

```json
{
  "expenses": [
    {
      "id": "exp_001",
      "title": "Lab Coffee Beans",
      "description": "Costco coffee for meeting room",
      "amount": 1280,
      "currency": "TWD",
      "category": "coffee",
      "expenseDate": "2026-06-13",
      "paidBy": {
        "id": "usr_001",
        "displayName": "Alice"
      },
      "participants": [
        {
          "userId": "usr_001",
          "displayName": "Alice",
          "shareAmount": 320
        }
      ]
    }
  ],
  "nextCursor": null
}
```

## POST /api/expenses

Request:

```json
{
  "title": "Lab Coffee Beans",
  "description": "Costco coffee for meeting room",
  "amount": 1280,
  "currency": "TWD",
  "paidByUserId": "usr_001",
  "category": "coffee",
  "expenseDate": "2026-06-13",
  "splitMethod": "equal",
  "participants": [
    {
      "userId": "usr_001"
    },
    {
      "userId": "usr_002"
    },
    {
      "userId": "usr_003"
    },
    {
      "userId": "usr_004"
    }
  ]
}
```

Response:

```json
{
  "expense": {
    "id": "exp_001"
  }
}
```

## GET /api/expenses/:expenseId

Response:

```json
{
  "expense": {
    "id": "exp_001",
    "title": "Lab Coffee Beans",
    "amount": 1280,
    "participants": []
  }
}
```

## PATCH /api/expenses/:expenseId

Rules:

1. Creator can edit their own expense.
2. Admin can edit any expense.
3. Deleted expense cannot be edited.

Request:

```json
{
  "title": "Updated title",
  "amount": 1500,
  "participants": [
    {
      "userId": "usr_001",
      "shareAmount": 500
    },
    {
      "userId": "usr_002",
      "shareAmount": 1000
    }
  ]
}
```

Response:

```json
{
  "ok": true
}
```

## DELETE /api/expenses/:expenseId

Soft delete.

Admin only for MVP.

Response:

```json
{
  "ok": true
}
```

## 13.6 Settlement APIs

## GET /api/settlements/summary

Response:

```json
{
  "currency": "TWD",
  "balances": [
    {
      "userId": "usr_001",
      "displayName": "Alice",
      "net": 600
    },
    {
      "userId": "usr_002",
      "displayName": "Bob",
      "net": -300
    }
  ],
  "suggestedTransfers": [
    {
      "fromUserId": "usr_002",
      "fromDisplayName": "Bob",
      "toUserId": "usr_001",
      "toDisplayName": "Alice",
      "amount": 300
    }
  ]
}
```

## POST /api/payments

Request:

```json
{
  "fromUserId": "usr_002",
  "toUserId": "usr_001",
  "amount": 300,
  "note": "Coffee split settlement"
}
```

Response:

```json
{
  "payment": {
    "id": "pay_001",
    "status": "pending"
  }
}
```

## PATCH /api/payments/:paymentId/confirm

Only receiver or admin can confirm.

Response:

```json
{
  "ok": true
}
```

---

## 14. Database Design

## 14.1 users

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Allowed role values:

```txt
member
admin
```

Allowed status values:

```txt
active
disabled
pending
```

## 14.2 user_identities

```sql
CREATE TABLE user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  provider_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(provider, provider_subject)
);
```

Allowed provider values:

```txt
google
apple
```

## 14.3 groups

```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  currency TEXT NOT NULL DEFAULT 'TWD',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

## 14.4 group_members

```sql
CREATE TABLE group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(group_id, user_id)
);
```

## 14.5 expenses

```sql
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  paid_by_user_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  expense_date TEXT NOT NULL,
  split_method TEXT NOT NULL DEFAULT 'equal',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

Money must be stored as integer minor units.

For TWD:

```txt
1280 means NT$1,280
```

## 14.6 expense_participants

```sql
CREATE TABLE expense_participants (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  share_amount INTEGER NOT NULL,
  share_ratio REAL,
  is_settled INTEGER NOT NULL DEFAULT 0,
  settled_at TEXT,

  FOREIGN KEY (expense_id) REFERENCES expenses(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(expense_id, user_id)
);
```

## 14.7 payments

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TWD',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,

  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
```

Payment statuses:

```txt
pending
confirmed
cancelled
```

## 14.8 audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## 14.9 easter_eggs

```sql
CREATE TABLE easter_eggs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_value TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 14.10 user_easter_egg_unlocks

```sql
CREATE TABLE user_easter_egg_unlocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  easter_egg_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (easter_egg_id) REFERENCES easter_eggs(id),
  UNIQUE(user_id, easter_egg_id)
);
```

## 14.11 Indexes

```sql
CREATE INDEX idx_expenses_group_date ON expenses(group_id, expense_date);
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by_user_id);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_expense_participants_user ON expense_participants(user_id);
CREATE INDEX idx_payments_group ON payments(group_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_user_identities_provider_subject ON user_identities(provider, provider_subject);
```

---

## 15. Split Logic

## 15.1 Equal Split

Input:

```txt
amount = 1000
participants = [A, B, C]
```

Calculation:

```txt
base = floor(1000 / 3) = 333
remainder = 1
```

Result:

```txt
A = 334
B = 333
C = 333
```

Rules:

1. Total share amount must equal expense amount.
2. Remainder is assigned to participants in stable order.
3. Stable order should be frontend input order or deterministic user ID order.
4. No participant can have a negative share.

## 15.2 Custom Amount Split

Users manually enter each share amount.

Validation:

```txt
sum(participant.share_amount) === expense.amount
```

If the sum does not match, reject the request.

## 15.3 Ratio Split

Example:

```txt
A: 2
B: 1
C: 1
```

Expected distribution:

```txt
A = 50%
B = 25%
C = 25%
```

Rules:

1. Ratio must be greater than 0.
2. Calculated shares must sum to total amount.
3. Remainder must be assigned deterministically.
4. Ratio split must be unit tested with rounding edge cases.

---

## 16. Settlement Logic

## 16.1 Balance Model

For each member:

```txt
net = paid_total - owed_total - confirmed_outgoing_payments + confirmed_incoming_payments
```

Interpretation:

1. `net > 0`: others owe this user.
2. `net < 0`: this user owes others.
3. `net = 0`: this user is balanced.

## 16.2 Example

Expense:

```txt
A paid 900, split among A, B, C
```

Each participant owes:

```txt
A = 300
B = 300
C = 300
```

Balances before payments:

```txt
A = +600
B = -300
C = -300
```

Suggested settlement:

```txt
B pays A 300
C pays A 300
```

## 16.3 Simplified Settlement Algorithm

```ts
function calculateSettlements(balances) {
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ ...b, amount: -b.net }));

  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ ...b, amount: b.net }));

  const transfers = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);

    transfers.push({
      fromUserId: debtors[i].userId,
      toUserId: creditors[j].userId,
      amount,
    });

    debtors[i].amount -= amount;
    creditors[j].amount -= amount;

    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return transfers;
}
```

Requirements:

1. Soft-deleted expenses must be ignored.
2. Pending payments must not reduce outstanding balances.
3. Confirmed payments must reduce outstanding balances.
4. Disabled users must remain in historical settlement data.
5. Disabled users cannot create new expenses.

---

## 17. Easter Egg System

## 17.1 Goals

The Easter egg system must:

1. Be optional.
2. Be admin-configurable.
3. Track user unlocks.
4. Never affect accounting correctness.
5. Be extensible.
6. Support multiple trigger types.

## 17.2 Trigger Types

```txt
konami_code
keyword
amount_pattern
date_pattern
click_sequence
balance_pattern
hidden_route
time_window
```

## 17.3 MVP Easter Eggs

## Konami Code

Trigger:

```txt
↑ ↑ ↓ ↓ ← → ← → B A
```

Effect:

1. Unlock "Gold Cockpit Mode".
2. Apply enhanced gold dashboard border.
3. Display localized toast.

zh-TW toast:

```txt
黃金駕駛艙模式已啟動
```

en-US toast:

```txt
Gold Cockpit Mode activated.
```

## Midnight Lab Mode

Trigger:

A user creates an expense between 00:00 and 03:59 local time.

Effect:

Unlock badge:

```txt
Night Shift Survivor
```

Localized message:

zh-TW:

```txt
偵測到深夜實驗室生存支出。
```

en-US:

```txt
Late-night lab survival expense detected.
```

## Hidden Garage

Route:

```txt
/garage
```

Effect:

1. Display hidden lab dashboard.
2. Show playful spending statistics.
3. Show unlocked Easter egg badges.

## 17.4 Future Easter Egg Candidates

## Coffee Singularity

Trigger:

More than 10 coffee expenses in the same month.

Badge:

```txt
Coffee Singularity
```

## Zero Balance Zen

Trigger:

User balance reaches exactly zero.

Badge:

```txt
Zero Balance Zen
```

## Suspicious Amount

Trigger:

Expense amount equals 87.

Badge:

```txt
Precision Rookie
```

---

## 18. Security Requirements

## 18.1 Authentication

1. All private APIs must require valid session.
2. OAuth credentials must be verified by the backend.
3. Frontend OAuth claims must not be trusted.
4. JWT session must verify signature, expiration, and issued-at values.
5. Disabled users must not be able to create new sessions.

## 18.2 Authorization

Rules:

```txt
Guest: no private data access
Member: group data access
Admin: full group administration access
```

Specific rules:

```txt
Expense create: active member
Expense update: creator or admin
Expense delete: admin only for MVP
Payment create: active member
Payment confirm: receiver or admin
Member management: admin only
Audit log view: admin only
Easter egg setting update: admin only
```

## 18.3 Input Validation

All API request bodies must use Zod validation.

Validate:

1. Amount is integer.
2. Amount is greater than 0.
3. Title length is between 1 and 120.
4. Description length is less than or equal to 1000.
5. Participants are not empty.
6. Participant users exist.
7. No duplicate participants.
8. Split total equals amount.
9. Date is valid ISO date.
10. Category is in allowed enum.
11. User IDs are valid known users.
12. Auth provider is known.

## 18.4 CSRF

Because the app uses cookie sessions:

1. Cookie must use SameSite=Lax.
2. Mutation APIs must validate Origin header.
3. CSRF token may be added for additional protection.
4. Allowed origins must be configured.

Allowed origins:

```txt
https://lab.buy2330.cc
http://localhost:4200
http://localhost:8787
```

## 18.5 Audit Logging

The system must log:

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

## 19. Cloudflare Configuration

## 19.0 Production URL

The production domain is:

```txt
lab.buy2330.cc
```

The canonical production URL is:

```txt
https://lab.buy2330.cc
```

All OAuth redirect URIs, CORS rules, CSRF Origin checks, production environment variables, sitemap URLs, canonical meta tags, Open Graph URLs, and Lighthouse CI production checks must use this domain.

Required production origins:

```txt
https://lab.buy2330.cc
```

Required local development origins:

```txt
http://localhost:4200
http://localhost:8787
```

## 19.1 Required Secrets

```txt
SESSION_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APPLE_CLIENT_ID
APPLE_TEAM_ID
APPLE_KEY_ID
APPLE_PRIVATE_KEY
APP_BASE_URL
```

Production value:

```txt
APP_BASE_URL=https://lab.buy2330.cc
```

## 19.2 Worker D1 Binding

Example `wrangler.toml`:

```toml
name = "labsplit-api"
main = "src/index.ts"
compatibility_date = "2026-06-13"

[[d1_databases]]
binding = "DB"
database_name = "labsplit"
database_id = "YOUR_D1_DATABASE_ID"
```

## 19.3 Optional KV Binding

```toml
[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_ID"
```

KV may be used for:

1. Feature flags.
2. Lightweight system settings.
3. Non-critical cache data.

Accounting data must remain in D1.

---

## 19.4 Secret Management Policy

All private keys, API keys, OAuth secrets, signing secrets, deployment tokens, and production credentials must be stored in GitHub Secrets.

No sensitive value may be committed to the repository.

This includes, but is not limited to:

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

Required rules:

1. All production secrets must be stored in GitHub Actions repository secrets or organization secrets.
2. Local development may use `.dev.vars` or `.env.local`, but these files must be ignored by Git.
3. `.env`, `.env.local`, `.dev.vars`, private keys, and credential files must never be committed.
4. The repository may include `.env.example`, but all values must be placeholders.
5. GitHub Actions must read secrets from `${{ secrets.SECRET_NAME }}`.
6. Cloudflare Worker secrets must be set from GitHub Actions during deployment.
7. The CI pipeline must fail if required secrets are missing.
8. The application must never print secrets in logs.
9. Tests must use mock secrets or test-only values.
10. Codex must not hard-code any secret, token, private key, or production credential.

Example `.env.example`:

```txt
SESSION_SECRET=replace-with-local-dev-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
APPLE_CLIENT_ID=replace-with-apple-client-id
APPLE_TEAM_ID=replace-with-apple-team-id
APPLE_KEY_ID=replace-with-apple-key-id
APPLE_PRIVATE_KEY=replace-with-apple-private-key
APP_BASE_URL=http://localhost:4200
```

Example GitHub Actions secret usage:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
  SESSION_SECRET: ${{ secrets.SESSION_SECRET }}
  GOOGLE_CLIENT_ID: ${{ secrets.GOOGLE_CLIENT_ID }}
  GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
  APPLE_CLIENT_ID: ${{ secrets.APPLE_CLIENT_ID }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  APPLE_KEY_ID: ${{ secrets.APPLE_KEY_ID }}
  APPLE_PRIVATE_KEY: ${{ secrets.APPLE_PRIVATE_KEY }}
  APP_BASE_URL: https://lab.buy2330.cc
```

Deployment must sync secrets to Cloudflare using Wrangler or Cloudflare-supported secret management.

Example Wrangler commands:

```bash
wrangler secret put SESSION_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put APPLE_CLIENT_ID
wrangler secret put APPLE_TEAM_ID
wrangler secret put APPLE_KEY_ID
wrangler secret put APPLE_PRIVATE_KEY
```

The value source for these commands in CI must be GitHub Secrets.

## 20. Testing Requirements

## 20.1 Required Commands

The following commands must pass:

```bash
pnpm install
pnpm lint
pnpm test
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
```

Angular-specific commands:

```bash
ng test --watch=false --code-coverage
ng lint
ng build --configuration production
```

## 20.2 Coverage Gate

Minimum required coverage:

```txt
Statements: 95%
Branches: 95%
Functions: 95%
Lines: 95%
```

If any category is below 95%, CI must fail.

## 20.3 Angular Unit Test Requirements

Must test:

1. `AuthService`.
2. `AuthGuard`.
3. `AdminGuard`.
4. API interceptor.
5. `ExpenseApiService`.
6. `ExpenseFormComponent`.
7. `SplitEditorComponent`.
8. `SettlementService`.
9. Money formatting pipe.
10. Date formatting.
11. i18n smoke rendering.
12. `ErrorHandlerService`.
13. `EasterEggService`.
14. `KonamiCodeDirective`.

## 20.4 Split Logic Tests

Must test:

1. Equal split with clean division.
2. Equal split with remainder.
3. Custom split valid total.
4. Custom split invalid total.
5. Ratio split valid.
6. Ratio split with remainder.
7. Empty participant list rejected.
8. Negative amount rejected.
9. Zero amount rejected.
10. Duplicate participant rejected.

## 20.5 Settlement Tests

Must test:

1. Single payer and multiple debtors.
2. Multiple creditors and multiple debtors.
3. Already balanced group.
4. Rounding edge cases.
5. Confirmed payments reduce outstanding balance.
6. Pending payments do not reduce outstanding balance.
7. Soft-deleted expenses are ignored.
8. Disabled users remain in historical settlement calculations.

---

## 21. Playwright E2E Requirements

## 21.1 Required Tool

E2E must use Playwright.

Cypress is not allowed.

## 21.2 Required Browser Projects

CI must test:

1. Chromium.
2. Firefox.
3. WebKit.
4. Mobile Chrome emulation.
5. Mobile Safari emulation.

## 21.3 Required E2E Flows

## Auth Flow

1. Guest lands on `/`.
2. Guest sees Google and Apple login buttons.
3. Mock login as member.
4. Member redirects to dashboard.
5. Logout clears session.
6. Private route redirects guest to landing page.

## Dashboard Flow

1. Member opens dashboard.
2. Dashboard displays monthly total.
3. Dashboard displays user balance.
4. Recent expenses are visible.
5. Settlement summary is visible.

## Expense Flow

1. Member creates equal split expense.
2. Expense appears in list.
3. Expense detail shows participants.
4. Creator edits expense title.
5. Non-creator cannot edit another user's expense.
6. Admin can edit any expense.

## Settlement Flow

1. Member opens settlement page.
2. Suggested transfer is visible.
3. Member records payment.
4. Receiver confirms payment.
5. Balance updates after confirmation.

## Admin Flow

1. Member cannot access `/admin`.
2. Admin can access `/admin`.
3. Admin can disable member.
4. Disabled member cannot create expense.
5. Audit log contains admin action.

## Easter Egg Flow

1. Konami code unlocks Gold Cockpit Mode.
2. `/garage` hidden route is accessible after unlock.
3. Midnight Lab Mode can be triggered with mocked time.
4. Unlock badge is displayed.
5. Disabled Easter egg does not trigger.

## 21.4 Playwright Config

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html'], ['github']] : [['list'], ['html']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'pnpm start:test',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## 22. ESLint Requirements

## 22.1 ESLint Configuration

The project must use the latest ESLint setup compatible with Angular 22 and `angular-eslint`.

Required config style:

```txt
eslint.config.js
```

Disallowed:

```txt
.eslintrc.json
```

## 22.2 Required Rules

ESLint must enforce:

1. Angular template accessibility rules.
2. Angular component selector naming.
3. No explicit `any`.
4. No unused variables.
5. No floating promises.
6. No `console.log` in production code.
7. Prefer readonly where practical.
8. Prefer const.
9. No unexplained magic numbers in business logic.
10. Maximum component complexity.
11. No business logic inside Angular templates.

## 22.3 Acceptance

The following commands must pass:

```bash
ng lint
pnpm lint
```

Acceptance condition:

```txt
0 errors
0 warnings
```

Do not use:

```txt
--force
--quiet
whole-file eslint-disable
```

Single-line disables are allowed only with justification.

Example:

```ts
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- DOM element is guaranteed by Angular lifecycle in this test.
```

---

## 23. Lighthouse Requirements

## 23.1 Required Mobile Scores

Mobile Lighthouse scores must be at least:

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

## 23.2 Lighthouse CI

Required command:

```bash
pnpm lhci
```

Example `lighthouserc.cjs`:

```js
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:4200/',
        'http://localhost:4200/dashboard',
        'http://localhost:4200/expenses',
        'http://localhost:4200/settlements',
      ],
      numberOfRuns: 3,
      settings: {
        preset: 'mobile',
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

## 23.3 Performance Budget

Target budget:

```txt
Initial JS <= 180KB gzip
Initial CSS <= 40KB gzip
Lazy route chunks <= 120KB gzip each
CLS <= 0.05
LCP <= 2.5s on mobile Lighthouse
TBT <= 200ms
```

## 23.4 Angular Performance Rules

Must use:

1. Route-level lazy loading.
2. Deferrable views for non-critical dashboard sections where useful.
3. Image width and height attributes.
4. Minimal third-party scripts.
5. OnPush change detection where useful.
6. Angular `@for` with tracking expression.
7. No heavy charting library in MVP.

---

## 24. CI Quality Gate

## 24.1 Pull Request Commands

Every PR must run:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm test:coverage
pnpm e2e
pnpm build
pnpm lhci
```

## 24.2 Required Passing Conditions

A PR can be merged only when:

1. TypeScript has no errors.
2. ESLint has 0 errors and 0 warnings.
3. Angular unit tests pass.
4. Coverage is at least 95% for statements, branches, functions, and lines.
5. Playwright E2E passes on all configured browsers.
6. Production build passes.
7. Lighthouse mobile score is at least 90 / 100 / 100 / 100.
8. D1 migrations apply successfully.
9. Worker tests pass.
10. No high or critical dependency vulnerabilities exist.
11. All sensitive keys are stored in GitHub Secrets.
12. No sensitive value is committed to the repository.

---

## 25. Package Scripts

## 25.1 Root package.json

```json
{
  "scripts": {
    "dev": "pnpm --filter web start",
    "build": "pnpm --filter web build && pnpm --filter worker build",
    "lint": "pnpm --filter web lint && pnpm --filter worker lint",
    "test": "pnpm --filter web test",
    "test:coverage": "pnpm --filter web test:coverage && pnpm --filter worker test:coverage",
    "e2e": "pnpm --dir e2e test",
    "lhci": "lhci autorun",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm --filter web typecheck && pnpm --filter worker typecheck"
  }
}
```

## 25.2 Angular web package.json

```json
{
  "scripts": {
    "start": "ng serve",
    "start:test": "ng serve --configuration test --port 4200",
    "build": "ng build --configuration production",
    "test": "ng test --watch=false",
    "test:coverage": "ng test --watch=false --code-coverage",
    "lint": "ng lint",
    "extract-i18n": "ng extract-i18n --output-path src/locale"
  }
}
```

---

## 26. Seed Data

Create a seed script with the following users:

```txt
Alice Admin
Bob Member
Carol Member
Dave Member
```

Seed expenses:

```txt
Coffee Beans - NT$1,280
Printer Paper - NT$420
Lab Dinner - NT$3,600
Reagent Shipping - NT$2,500
```

Seed categories:

```txt
food
coffee
equipment
reagent
travel
meeting
other
```

Seed Easter eggs:

```txt
konami_gold_cockpit
midnight_lab_mode
hidden_garage
```

---

## 27. Implementation Phases

## Phase 1: Project Setup

Tasks:

1. Create monorepo structure.
2. Set up pnpm workspace.
3. Create Angular 22 app.
4. Create Cloudflare Worker app.
5. Configure TypeScript strict mode.
6. Configure ESLint flat config.
7. Configure Prettier.
8. Configure Wrangler.
9. Add first sample unit test.
10. Add first sample Playwright test.

Acceptance:

1. `pnpm install` works.
2. `pnpm dev` starts the frontend.
3. Worker runs locally.
4. `ng test` passes.
5. `ng lint` passes.

## Phase 2: Database

Tasks:

1. Create initial D1 migration.
2. Add all core tables.
3. Add indexes.
4. Add seed script.
5. Add migration instructions.

Acceptance:

1. Local migration applies.
2. Remote migration applies.
3. Seed data can be loaded.
4. Schema is reproducible.

## Phase 3: Authentication

Tasks:

1. Implement Google login API.
2. Implement Apple login API.
3. Implement session cookie.
4. Implement `/api/auth/me`.
5. Implement logout.
6. Implement Angular AuthService.
7. Implement AuthGuard.
8. Implement AdminGuard.
9. Add auth unit tests.
10. Add auth E2E tests with mocked login.

Acceptance:

1. Google login works.
2. Apple login works.
3. Session persists after refresh.
4. Logout clears session.
5. Disabled user cannot login.

## Phase 4: Expenses

Tasks:

1. Implement expense create API.
2. Implement expense list API.
3. Implement expense detail API.
4. Implement expense update API.
5. Implement expense soft delete API.
6. Implement equal split.
7. Implement custom split.
8. Implement ratio split.
9. Build Angular expense pages.
10. Add tests.

Acceptance:

1. Member can create expense.
2. Creator can edit own expense.
3. Admin can delete expense.
4. Split sum always equals total.
5. Validation errors display clearly.

## Phase 5: Settlements

Tasks:

1. Implement balance calculation.
2. Implement suggested transfer calculation.
3. Implement payment create API.
4. Implement payment confirm API.
5. Build settlement page.
6. Build dashboard summary.
7. Add unit and E2E tests.

Acceptance:

1. Net balances are correct.
2. Suggested transfers settle balances.
3. Payment confirmation updates summary.
4. Pending payment does not affect confirmed balance.
5. UI clearly shows positive and negative balances.

## Phase 6: Members and Admin

Tasks:

1. Implement member list.
2. Implement member role update.
3. Implement member disable.
4. Implement member reactivation.
5. Implement admin dashboard.
6. Implement audit log viewer.
7. Implement CSV export.
8. Add tests.

Acceptance:

1. Admin can manage members.
2. Member cannot access admin page.
3. Audit logs are created for sensitive actions.

## Phase 7: i18n and Design Polish

Tasks:

1. Add zh-TW locale.
2. Add en-US locale.
3. Extract i18n messages.
4. Apply black-and-gold design tokens.
5. Build reusable card component.
6. Build reusable button component.
7. Build table component.
8. Add accessible focus states.
9. Optimize mobile layout.
10. Check Lighthouse.

Acceptance:

1. Default locale is zh-TW.
2. en-US build exists.
3. All visible strings are i18n-ready.
4. Mobile layout works.
5. Lighthouse threshold passes.

## Phase 8: Easter Eggs

Tasks:

1. Implement EasterEggService.
2. Implement unlock tracking API.
3. Implement Konami Code directive.
4. Implement Midnight Lab Mode.
5. Implement hidden `/garage` route.
6. Add admin toggle.
7. Add badge display.
8. Add tests.

Acceptance:

1. Unlocks are saved.
2. Same egg cannot be duplicated for same user.
3. Admin can disable egg.
4. Easter eggs do not affect accounting data.
5. E2E covers each MVP Easter egg.

---

## 28. Definition of Done

The MVP is complete when:

1. Angular 22 frontend is used.
2. Cloudflare Worker backend is used.
3. Cloudflare D1 database is used.
4. Google login works.
5. Apple login works.
6. User can logout.
7. Default locale is zh-TW.
8. en-US locale build exists.
9. All visible UI strings are i18n-ready.
10. User can see dashboard.
11. User can create expense.
12. User can split expense equally.
13. User can use custom amount split.
14. User can use ratio split.
15. User can view all expenses.
16. User can view expense details.
17. User can view settlement summary.
18. User can record payment.
19. Receiver can confirm payment.
20. Admin can manage members.
21. Admin can view audit logs.
22. UI follows black-and-gold premium style.
23. At least 3 Easter eggs are implemented.
24. D1 migrations are reproducible.
25. App deploys to Cloudflare.
26. No unauthenticated user can access private data.
27. `ng test` passes.
28. `ng lint` passes.
29. ESLint has 0 errors and 0 warnings.
30. Unit test coverage is at least 95%.
31. Playwright E2E passes.
32. Lighthouse mobile score is at least 90 / 100 / 100 / 100.
33. Production build passes.
34. No high or critical dependency vulnerabilities exist.
35. All visual design follows DESIGN.md.
36. Production configuration uses https://lab.buy2330.cc.
37. All secrets and private keys are stored in GitHub Secrets.
38. No secret or credential file is committed to the repository.

---

## 29. Codex Implementation Prompt

Use the following prompt when starting Codex:

```txt
You are building a full-stack Cloudflare web app called LabSplit Black Gold.

Read AGENTS.md first. Then read docs/SDD.md and docs/DESIGN.md before making changes.

Frontend must use Angular 22, not React.

Tech stack:
- Angular 22
- TypeScript
- Angular CLI
- Standalone Components
- Angular Router
- Reactive Forms
- Angular i18n
- Cloudflare Workers backend
- Hono router
- Cloudflare D1 database
- OAuth login with Google and Sign in with Apple
- HttpOnly cookie session
- Zod validation
- D1 SQL migrations
- Playwright E2E
- ESLint latest flat config
- Lighthouse CI

Production domain:
- lab.buy2330.cc
- https://lab.buy2330.cc

Main locale:
- zh-TW

Supported locales:
- zh-TW
- en-US

Design:
All visual design must follow repository-level DESIGN.md.
DESIGN.md is the single source of truth for UI style, design tokens, component variants, typography, spacing, layout, motion, and visual effects.
Use a luxury black and gold visual style inspired by supercar cockpit dashboards only through original rules documented in DESIGN.md.
Do not use any Lamborghini logo, trademark, copied asset, or protected trade dress.

Hard quality gates:
- ng test must pass
- ng lint must pass
- ESLint must have 0 errors and 0 warnings
- Unit test coverage must be at least 95% for statements, branches, functions, and lines
- E2E must use Playwright
- Playwright must test Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari
- Lighthouse mobile scores must be at least 90 / 100 / 100 / 100
- Production build must pass
- All visible UI strings must support Angular i18n
- Default language must be zh-TW
- D1 migrations must be reproducible
- All private keys and sensitive credentials must be stored in GitHub Secrets
- Do not commit .env, .dev.vars, private keys, or credential files

Important:
- All money is stored as integer amount.
- OAuth identity must use provider + provider_subject.
- Do not trust frontend OAuth claims without backend verification.
- All write APIs require auth.
- Admin-only APIs must use requireAdmin middleware.
- Expense split total must always equal total amount.
- Add audit logs for sensitive changes.
- Easter eggs must never affect accounting correctness.
- Do not use React, Vite, TanStack Query, shadcn/ui, or Cypress.

Start by creating:
1. Angular 22 app skeleton
2. Cloudflare Worker skeleton
3. D1 migration files
4. ESLint flat config
5. Karma coverage threshold config
6. Playwright config
7. Lighthouse CI config
8. zh-TW and en-US i18n setup
9. First passing sample unit test
10. First passing sample Playwright E2E test
```
