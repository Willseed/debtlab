# LabSplit Black Gold API

All API routes live under `/api`.

All request bodies must be validated with strict Zod allowlists; unknown fields
are rejected rather than silently assigned. Authenticated routes require a valid
`labsplit_session` cookie and a current active user record in D1. Admin routes
also require current D1 admin authorization; role and status must not be trusted
from stale session claims alone.

D1 timestamp defaults and Worker-managed timestamp updates use `datetime('now', '+8 hours')` so stored operational timestamps are UTC+8 text values.

## Standard Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount must be greater than zero",
    "details": {}
  }
}
```

## Error Codes

```txt
UNAUTHORIZED
FORBIDDEN
VALIDATION_ERROR
NOT_FOUND
CONFLICT
OAUTH_VERIFICATION_FAILED
UNSUPPORTED_MEDIA_TYPE
SPLIT_TOTAL_MISMATCH
INTERNAL_ERROR
NOT_IMPLEMENTED
```

## Security Headers

The Angular static deployment ships `apps/web/src/_headers` for Cloudflare
Pages / Workers Assets. Production traffic for `lab.buy2330.cc/*` is handled by
the Worker route, which serves Angular through Workers Assets and applies the
same posture to static and `/api/*` responses through security header
middleware. Required response headers include:

```txt
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy
Cross-Origin-Opener-Policy: same-origin
```

The web CSP intentionally keeps Google OAuth, Apple OAuth, and Cloudflare
analytics/beacon origins available while blocking framing, object embeds, and
inline styles. GitHub Pages does not apply `_headers`; it must not be the
production header enforcement path. The `/api/health` browser HTML response
keeps its stricter route-specific CSP for the CTF clue page by using a
per-response style nonce, and the security middleware must not overwrite it.

All `/api/*` responses are `Cache-Control: no-store` and vary on `Cookie`.
API preflight requests from allowed origins return CORS credentials headers so
browser clients can call same-site and configured local development APIs without
being blocked by preflight. Unsafe mutation methods still require an allowed
`Origin` header, reject browser `Sec-Fetch-Site: cross-site`, and require JSON
request bodies to use `application/json` or an `+json` media type. Production
`APP_BASE_URL=https://lab.buy2330.cc` must not allow localhost origins; local
development origins are allowed only when `APP_BASE_URL` itself is local.

Production static serving must not expose JavaScript or CSS source maps. The
Angular production build disables source maps and the Worker returns 404 for
static `.map` requests.

## Auth

Production traffic is served by the Cloudflare Worker route `lab.buy2330.cc/*`;
non-API paths are forwarded to Workers Assets, and `/api/*` paths are handled by
the Hono API routes.
Run the `Deploy Cloudflare Worker` workflow manually after `CLOUDFLARE_API_TOKEN` has Workers, D1, and route-management permissions.

### GET `/api/auth/google/start`

Starts the backend Google OAuth authorization-code flow. The Worker sets a short-lived, per-state HttpOnly OAuth state cookie and redirects the browser to Google without forcing account selection, so Google can reuse an existing Google session when possible.

### GET `/api/auth/google/callback`

Google redirects back to this endpoint with `code` and `state`. The Worker validates state, exchanges the code for tokens, verifies the Google ID token, creates or updates the local `provider + provider_subject` identity, issues `labsplit_session`, and redirects to `/dashboard`.

### POST `/api/auth/google`

Request:

```json
{
  "credential": "GOOGLE_ID_TOKEN"
}
```

The Worker must verify the token with Google before creating a local session. Unknown Google identities are created as active users immediately: the first user in an empty reset database bootstraps as active admin, and later users are active members. Active users are joined to the default group during verified login, and migrations backfill existing active users into that group. Existing pending Google users are activated on their next verified login. Disabled users remain disabled and must not receive a new session.

### POST `/api/auth/apple`

Sign in with Apple is enabled. The Worker must read `APPLE_TEAM_ID`,
`APPLE_CLIENT_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` from GitHub Secrets /
Worker secrets and must never expose those values to the client.

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

The Worker must verify the Apple identity token before creating a local session.
Apple identities are keyed by provider subject, not email. Unknown Apple
identities follow the same activation behavior as Google identities: the first
user in an empty reset database bootstraps as active admin, later users are
active members, active users are joined to the default group during verified
login, migrations backfill existing active users into that group, existing
pending users are activated on their next verified login, and disabled users
must not receive a new session.

### GET `/api/auth/me`

Returns the current authenticated user.

### POST `/api/auth/logout`

Clears `labsplit_session`.

## Members

### GET `/api/members`

Authenticated. Returns active and historical default-group members visible to
the group. If the caller has not yet been persisted in `group_members`, the
response includes the active caller as a selectable default-group member fallback
for legacy sessions.

### PATCH `/api/members/:userId`

Admin only. Updates role or status and writes audit logs for role/status changes.

## Expenses

### GET `/api/expenses`

Authenticated. Returns expenses the caller may view as creator, active group
member, or participant. Each expense includes `canEdit` and `canDelete`
permissions; only the payer (`paidBy.id`) receives `true`. Supports filters:

```txt
from
to
category
paidBy
limit
cursor
```

Accepted expense categories are `ingredients`, `prize`, `lodging`, and `other`.

### POST `/api/expenses`

Any authenticated active member may create an expense and participant shares in
D1. `paidByUserId` and every participant must be an active default-group member;
the authenticated caller is accepted as an active member and is also repaired
into the default group on first expense creation for legacy sessions. The sum of
shares must equal `amount`.
The UI supports choosing the payer and one or more active members for equal
splits.

Required split methods:

```txt
equal
custom
ratio
```

### GET `/api/expenses/:expenseId`

Authenticated. Returns the expense detail with participant shares for callers
authorized as creator, active group member, or participant.

### PUT `/api/expenses/:expenseId/participants/me`

Authenticated active default-group member or admin only. Joins the current user
to an existing non-deleted equal-split expense and deterministically recalculates
all participant shares so the sum remains exactly equal to `amount`. The request
body is ignored; callers cannot add another user. If the caller is already a
participant, the endpoint returns the current expense without adding duplicates.
Custom or ratio splits return `409 CONFLICT`.

Response:

```json
{
  "expense": {
    "id": "exp_1",
    "title": "Lab coffee",
    "amount": 1280,
    "currency": "TWD",
    "participants": [{ "userId": "usr_alice", "displayName": "Alice", "shareAmount": 640 }]
  }
}
```

### DELETE `/api/expenses/:expenseId/participants/me`

Authenticated active default-group member or admin only. Removes the current
user from a non-deleted equal-split expense and recalculates the remaining
participant shares. The endpoint rejects callers who are not participants,
custom or ratio splits, and attempts to remove the final participant with
`409 CONFLICT`. The request body is ignored; callers cannot remove another user.
Successful joins and leaves write expense audit logs.

### PATCH `/api/expenses/:expenseId`

Only the expense payer may edit default-group expenses. Deleted expenses cannot
be edited. Editing an amount preserves split correctness by recalculating the
existing participant shares according to the stored split method.

### DELETE `/api/expenses/:expenseId`

Only the expense payer may soft-delete default-group expenses by setting
`deleted_at`.

## Settlements

### GET `/api/settlements/summary`

Authenticated. Returns balances, simplified suggested transfers, and pending
payments:

```json
{
  "currency": "TWD",
  "balances": [{ "userId": "usr_alice", "displayName": "Alice", "net": 300 }],
  "suggestedTransfers": [
    {
      "fromUserId": "usr_bob",
      "fromDisplayName": "Bob",
      "toUserId": "usr_alice",
      "toDisplayName": "Alice",
      "amount": 300
    }
  ],
  "pendingPayments": [
    {
      "id": "pay_1",
      "fromUserId": "usr_bob",
      "fromDisplayName": "Bob",
      "toUserId": "usr_alice",
      "toDisplayName": "Alice",
      "amount": 300,
      "currency": "TWD",
      "note": null,
      "createdAt": "2026-06-15 10:00:00"
    }
  ]
}
```

Soft-deleted expenses are ignored. Pending payments do not reduce balances. Confirmed payments reduce outstanding balances.

### POST `/api/payments`

Authenticated active default-group member or admin only. The sender and receiver
must be different active default-group members, and the payment must match an
outstanding suggested transfer direction with an amount no greater than the
suggested transfer amount. Payments created by the receiver or admin are
recorded as confirmed immediately; payments created by any other joined member
remain pending until the receiver or admin confirms them. Duplicate pending
payments for the same sender/receiver pair are rejected with `409 CONFLICT`.
Payment creation writes an audit log; immediate confirmation also writes a
confirmation audit log.

Response (`status` is `pending` or `confirmed`):

```json
{
  "payment": { "id": "pay_1", "status": "pending" }
}
```

### PATCH `/api/payments/:paymentId/confirm`

Receiver or admin only. Confirms a pending payment and writes an audit log.

## Easter eggs

### GET `/api/health`

Public health endpoint. JSON clients receive `{"ok": true}` plus the harmless
hidden garage CTF password in the `ctf` field; browser HTML responses expose the
same password in a small details panel. The password is loaded from D1
`garage_ctf_config`, where it is stored as a P-256 ECDH/HKDF/AES-GCM ciphertext
rather than plaintext. The response must remain `no-store`.

### GET `/api/easter-eggs/garage-ctf`

Authenticated. Returns whether the hidden garage CTF has already been solved and
the first solver display name when present.

### POST `/api/easter-eggs/garage-ctf/solve`

Authenticated. Accepts `{ "password": "..." }`. The first correct submission
writes the global first-solver row and the user's hidden garage unlock. After the
first solve exists, all submissions return `409 CONFLICT`; the garage UI must not
allow further password entry.

## Admin

### GET `/api/admin/audit-logs`

Admin only.

### GET `/api/admin/export.csv`

Admin only. Must write an `admin_csv_export` audit log.

### PATCH `/api/admin/easter-eggs/:eggId`

Admin only. Enables or disables an Easter egg and writes an audit log.
