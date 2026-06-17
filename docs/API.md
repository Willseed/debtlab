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
RATE_LIMITED
OAUTH_VERIFICATION_FAILED
UNSUPPORTED_MEDIA_TYPE
SPLIT_TOTAL_MISMATCH
INTERNAL_ERROR
NOT_IMPLEMENTED
```

`RATE_LIMITED` uses HTTP `429 Too Many Requests`. Challenge submission
endpoints return it when the authenticated user exceeds 3 submissions in 60
seconds for the same endpoint. The response must include a `Retry-After` header
whose value matches `details.retryAfterSeconds`:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many challenge submissions.",
    "details": {
      "retryAfterSeconds": 42,
      "limit": 3,
      "windowSeconds": 60
    }
  }
}
```

Successful challenge solve/completion clears the limiter for that user and
endpoint.

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
analytics/beacon origins available while blocking framing, object embeds,
wildcard sources, and untrusted inline execution. SPA HTML responses are served
Worker-first so the Worker can inject a per-response nonce into the Angular app
shell and set matching `script-src` / `style-src` nonce sources for runtime
module scripts and Angular component styles. `data:` is only allowed for images
used by the static UI. GitHub Pages does not apply `_headers` and cannot inject
per-response nonces; it must not be the production header enforcement path. The
`/api/health` browser HTML response keeps its stricter route-specific CSP for
the CTF clue page by using a per-response style nonce, and the security
middleware must not overwrite it.

All `/api/*` responses are `Cache-Control: no-store` and vary on `Cookie`.
API preflight requests from allowed origins return CORS credentials headers so
browser clients can call same-site and configured local development APIs without
being blocked by preflight. Unsafe mutation methods still require an allowed
`Origin` header, reject browser `Sec-Fetch-Site: cross-site`, and require JSON
request bodies to use `application/json` or an `+json` media type. Production
`APP_BASE_URL=https://lab.buy2330.cc` must not allow localhost origins; local
development origins are allowed only when `APP_BASE_URL` itself is local.
Production configuration failures return the generic message
`Service temporarily unavailable.` while server logs keep diagnostics.

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

The Worker must verify the token with Google before creating a local session.
Unknown Google identities bootstrap the first user in an empty reset database as
active admin; later users are pending members and must not receive an active
application session until activated. If the verified OAuth profile includes an
email that matches backend-only `ALLOWED_EMAILS`, the user becomes active and
joins the default group during creation/login. Active users are joined to the
default group during verified login, while pending users are not inserted into
`group_members` until invite activation or an allowlist path joins them.
Migrations backfill existing active users into that group. Existing pending
Google users remain pending on later verified logins unless allowlisted.
Disabled users remain disabled and must not receive a new session.

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
pending members, active users are joined to the default group during verified
login, pending users are not inserted into `group_members` until an activation
or allowlist path joins them, verified allowlisted emails activate and join
users during creation/login, migrations backfill existing active users into that
group, existing pending users remain pending on later verified logins unless
allowlisted, and disabled users must not receive a new session.

### POST `/api/auth/activate`

Authenticated pending users only.

Request:

```json
{
  "inviteCode": "INVITE_CODE"
}
```

A correct backend-only `LAB_INVITE_CODE` activates the current pending user,
joins `grp_default`, clears the `auth-activate` rate-limit window, reissues
`labsplit_session`, and returns the active user. Incorrect or missing invite
configuration returns `422 INVITE_CODE_INVALID` with
`邀請碼不正確或已失效。`; active or disabled users receive `409 CONFLICT`.
Invite attempts are D1 rate-limited per user at 3 attempts per 60 seconds and
return `429 RATE_LIMITED` with `Retry-After` plus `retryAfterSeconds` details.
The invite code and `ALLOWED_EMAILS` are never returned to the frontend.

### GET `/api/auth/me`

Returns the current authenticated user.

### POST `/api/auth/logout`

Clears `labsplit_session`.

## Members

### GET `/api/members`

Authenticated active default-group member or active admin. Pending, disabled,
and non-member callers receive `403 FORBIDDEN` from auth/membership middleware
before any member list is generated.
Active non-admin members receive only selectable active members with minimal
fields:

```json
{ "members": [{ "userId": "usr_...", "displayName": "Alice" }] }
```

Admins receive the full administration list, including inactive default-group
members and the fields needed for role/status management:

```json
{
  "members": [
    {
      "userId": "usr_...",
      "displayName": "Alice",
      "role": "member",
      "status": "active",
      "joinedAt": "2026-06-16 09:00:00"
    }
  ]
}
```

### PATCH `/api/members/:userId`

Admin only. Reserved for role/status updates and audit logs. Until implemented,
auth/admin checks still run, then the route returns a generic `404 NOT_FOUND`.

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

Authenticated active default-group member or admin only. Returns balances,
simplified suggested transfers, and pending payments:

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

Authenticated active default-group member or admin only. Non-admin users may
only create payments where `fromUserId` is their own user ID. The sender and
receiver must be different active default-group members, and the payment must
match an outstanding suggested transfer direction with an amount no greater than
the suggested transfer amount. Payments created by admins are recorded as
confirmed immediately; member-created payments remain pending until the receiver
or admin confirms them. Duplicate pending payments for the same sender/receiver
pair are rejected with `409 CONFLICT`. Payment creation writes an audit log;
immediate confirmation also writes a confirmation audit log.

Response (`status` is `pending` or `confirmed`):

```json
{
  "payment": { "id": "pay_1", "status": "pending" }
}
```

### PATCH `/api/payments/:paymentId/confirm`

Receiver or admin only. Confirms a pending payment and writes an audit log.

## Mystery challenge

### GET `/api/mystery-challenge`

Authenticated. Returns the current user's challenge state, completion status, and
available encoded password prompts.

### GET `/api/mystery-challenge/leaderboard`

Authenticated. Returns the challenge leaderboard.

### POST `/api/mystery-challenge/submissions`

Authenticated. Accepts `{ "password": "..." }`. Correct submissions complete the
challenge, return `201 Created`, and clear that user's limiter for this endpoint.
The endpoint is rate-limited per authenticated user to 3 submissions per 60
seconds. Exceeding the limit returns `429 RATE_LIMITED` with `Retry-After` and
`details.retryAfterSeconds`, `details.limit`, and `details.windowSeconds` as
defined in Error Codes.

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
writes the global first-solver row, writes the user's hidden garage unlock,
returns `201 Created`, and clears that user's limiter for this endpoint. The
endpoint is rate-limited per authenticated user to 3 submissions per 60 seconds.
Exceeding the limit returns `429 RATE_LIMITED` with `Retry-After` and
`details.retryAfterSeconds`, `details.limit`, and `details.windowSeconds` as
defined in Error Codes. After the first solve exists, all submissions return
`409 CONFLICT`; the garage UI must not allow further password entry.

## Admin

### GET `/api/admin/audit-logs`

Admin only. Reserved for audit-log browsing. Until implemented, auth/admin
checks still run, then the route returns a generic `404 NOT_FOUND`.

### GET `/api/admin/export.csv`

Admin only. Reserved for CSV export and the `admin_csv_export` audit log. Until
implemented, auth/admin checks still run, then the route returns a generic
`404 NOT_FOUND`.

### PATCH `/api/admin/easter-eggs/:eggId`

Admin only. Reserved for enabling/disabling Easter eggs and audit logs. Until
implemented, auth/admin checks still run, then the route returns a generic
`404 NOT_FOUND`.
