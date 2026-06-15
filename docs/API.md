# LabSplit Black Gold API

All API routes live under `/api`.

All request bodies must be validated with Zod. Authenticated routes require a valid `labsplit_session` cookie and a current active user record in D1. Admin routes also require current D1 admin authorization; role and status must not be trusted from stale session claims alone.

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
SPLIT_TOTAL_MISMATCH
INTERNAL_ERROR
NOT_IMPLEMENTED
```

## Auth

Production `/api/*` traffic is served by the Cloudflare Worker route `lab.buy2330.cc/api/*`.
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

The Worker must verify the token with Google before creating a local session. Unknown Google identities are created as active users immediately: the first user in an empty reset database bootstraps as active admin, and later users are active members. Existing pending Google users are activated on their next verified login. Disabled users remain disabled and must not receive a new session.

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
active members, existing pending users are activated on their next verified
login, and disabled users must not receive a new session.

### GET `/api/auth/me`

Returns the current authenticated user.

### POST `/api/auth/logout`

Clears `labsplit_session`.

## Members

### GET `/api/members`

Authenticated. Returns active and historical members visible to the group.

### PATCH `/api/members/:userId`

Admin only. Updates role or status and writes audit logs for role/status changes.

## Expenses

### GET `/api/expenses`

Authenticated. Supports filters:

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
D1. The sum of shares must equal `amount`. The MVP UI creates a
self-paid/self-participated expense for the authenticated user; direct API calls
cannot create expenses on behalf of other users.

Required split methods:

```txt
equal
custom
ratio
```

### GET `/api/expenses/:expenseId`

Authenticated. Returns the expense detail with participant shares.

### PATCH `/api/expenses/:expenseId`

Any authenticated active member may edit default-group expenses. Deleted
expenses cannot be edited.

### DELETE `/api/expenses/:expenseId`

Any authenticated active member may soft-delete default-group expenses by
setting `deleted_at`.

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

Authenticated sender only. Records a pending payment and writes an audit log.
The sender and receiver must be different users.

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
