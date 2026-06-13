# Testing Policy

Required commands before MVP completion:

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

Coverage minimums:

```txt
Statements: 95%
Branches: 95%
Functions: 95%
Lines: 95%
```

Do not lower coverage thresholds, skip broken tests, or delete tests unless they are replaced by stronger tests.

## Frontend Unit Coverage

Required targets:

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

## Worker Tests

Worker tests must cover:

1. Split calculations.
2. Settlement calculations.
3. Request validation.
4. Auth/session behavior.
5. Authorization behavior.
6. Audit logging behavior.

## E2E

E2E must use Playwright, not Cypress.

Required browser projects:

1. Chromium.
2. Firefox.
3. WebKit.
4. Mobile Chrome.
5. Mobile Safari.

Required flows:

1. Auth.
2. Dashboard.
3. Expense create/edit.
4. Settlement.
5. Admin authorization.
6. Easter eggs.
7. i18n smoke.
